import {parse, typeEvaluate} from 'groq-js'
import type {ExprNode, SchemaType, TypeNode} from 'groq-js'

export type KnownValue = string | number | boolean

/**
 * Values a query parameter can take, as far as the schema can tell. A parameter only shows up
 * here when every field it is compared to has a closed set of values (document type names for
 * `_type`, a string literal union such as a `list` option, ...). Anything open or unknown is left
 * out, so a plain input stays the right prompt for it.
 */
export type KnownParamValues = Map<string, Array<KnownValue>>

type Comparison = {param: string; subject: ExprNode; scope: ExprNode}

const OPEN = Symbol('open')

function isExpr(value: unknown): value is ExprNode {
  return (
    typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string'
  )
}

function containsNode(node: unknown, types: ReadonlySet<string>): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => containsNode(child, types))
  }
  if (typeof node !== 'object' || node === null) {
    return false
  }
  if (isExpr(node) && types.has(node.type)) {
    return true
  }
  return Object.values(node).some((child) => containsNode(child, types))
}

const UNSCOPED_NODES: ReadonlySet<string> = new Set(['Parameter', 'Parent'])

function collectComparisons(node: unknown, scope: ExprNode | undefined, found: Array<Comparison>) {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectComparisons(child, scope, found)
    }
    return
  }
  if (typeof node !== 'object' || node === null) {
    return
  }

  if (isExpr(node)) {
    if (node.type === 'Filter') {
      collectComparisons(node.base, scope, found)
      collectComparisons(node.expr, node, found)
      return
    }

    if (scope && node.type === 'OpCall' && (node.op === '==' || node.op === '!=')) {
      const {left, right} = node
      const param =
        left.type === 'Parameter' ? left : right.type === 'Parameter' ? right : undefined
      const subject = param === left ? right : param === right ? left : undefined
      if (param && subject && !containsNode(subject, UNSCOPED_NODES)) {
        found.push({param: param.name, subject, scope})
      }
    }

    if (node.type === 'Projection' || node.type === 'Map' || node.type === 'FlatMap') {
      collectComparisons(node.base, scope, found)
      collectComparisons(node.expr, undefined, found)
      return
    }
  }

  for (const child of Object.values(node)) {
    collectComparisons(child, scope, found)
  }
}

function closedValues(type: TypeNode, values: Set<KnownValue>): boolean {
  switch (type.type) {
    case 'union':
      return type.of.every((member) => closedValues(member, values))
    case 'null':
      return true
    case 'string':
    case 'number':
    case 'boolean':
      if (type.value === undefined) {
        return false
      }
      values.add(type.value)
      return true
    case 'array':
    case 'object':
    case 'inline':
    case 'unknown':
      return false
    default: {
      const unhandled: never = type
      throw new Error(`Unhandled type: ${JSON.stringify(unhandled)}`)
    }
  }
}

function evaluateIn(
  documents: ExprNode,
  subject: ExprNode,
  schema: SchemaType,
): Array<KnownValue> | typeof OPEN {
  const mapped: ExprNode = {
    type: 'Map',
    base: {type: 'ArrayCoerce', base: documents},
    expr: subject,
  }

  try {
    const evaluated = typeEvaluate(mapped, schema)
    if (evaluated.type !== 'array') {
      return OPEN
    }
    const values = new Set<KnownValue>()
    if (!closedValues(evaluated.of, values) || values.size === 0) {
      return OPEN
    }
    return [...values]
  } catch {
    return OPEN
  }
}

function valuesOf(
  {subject, scope}: Comparison,
  schema: SchemaType,
): Array<KnownValue> | typeof OPEN {
  // The subject evaluated for every document the filter looks at, narrowed by the rest of the
  // filter (`_type == "post"`, `defined(slug.current)`).
  const narrowed = evaluateIn(scope, subject, schema)
  if (narrowed !== OPEN) {
    return narrowed
  }

  // When the schema says nothing can match the filter there is nothing to narrow to: fall back to
  // the documents before filtering, which is still only ever closed when every one of them is.
  if (scope.type !== 'Filter') {
    return OPEN
  }
  return evaluateIn(scope.base, subject, schema)
}

function countParameters(node: unknown, counts: Map<string, number>) {
  if (Array.isArray(node)) {
    for (const child of node) {
      countParameters(child, counts)
    }
    return
  }
  if (typeof node !== 'object' || node === null) {
    return
  }
  if (isExpr(node) && node.type === 'Parameter') {
    counts.set(node.name, (counts.get(node.name) ?? 0) + 1)
  }
  for (const child of Object.values(node)) {
    countParameters(child, counts)
  }
}

export function findKnownParamValues(query: string, schema: SchemaType): KnownParamValues {
  let ast: ExprNode
  try {
    ast = parse(query)
  } catch {
    return new Map()
  }

  const comparisons: Array<Comparison> = []
  collectComparisons(ast, undefined, comparisons)

  // A parameter that is used anywhere else (a slice bound, compared to another parameter, ...) has
  // values the schema says nothing about.
  const usages = new Map<string, number>()
  countParameters(ast, usages)
  const comparedCounts = new Map<string, number>()
  for (const {param} of comparisons) {
    comparedCounts.set(param, (comparedCounts.get(param) ?? 0) + 1)
  }

  const byParam = new Map<string, Set<KnownValue> | typeof OPEN>()
  for (const comparison of comparisons) {
    if (usages.get(comparison.param) !== comparedCounts.get(comparison.param)) {
      byParam.set(comparison.param, OPEN)
      continue
    }
    const values = valuesOf(comparison, schema)
    const known = byParam.get(comparison.param)
    if (known === OPEN || values === OPEN) {
      byParam.set(comparison.param, OPEN)
    } else {
      byParam.set(comparison.param, new Set([...(known ?? []), ...values]))
    }
  }

  const result: KnownParamValues = new Map()
  for (const [param, values] of byParam) {
    if (values !== OPEN) {
      result.set(param, [...values])
    }
  }
  return result
}
