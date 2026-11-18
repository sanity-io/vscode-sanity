import {resolveImport} from './resolve-import'
import {tokenize, type Token} from './tokenize'
import type {ExtractedQuery, FragmentHost} from './types'

interface ImportBinding {
  specifier: string
  /** The exported name it binds, or `default`. */
  imported: string
}

interface Module {
  file: string
  tokens: Array<Token>
  /** Top-level `const x = ` declarations: the index of the first token after the `=`. */
  declarations: Map<string, number>
  imports: Map<string, ImportBinding>
  /** `export {local as exported}` */
  exportAliases: Map<string, string>
  /** `export {imported as exported} from 'specifier'` */
  reexports: Map<string, ImportBinding>
  /** `export * from 'specifier'` */
  exportAll: Array<string>
}

interface Context {
  host: FragmentHost
  modules: Map<string, Promise<Module | undefined>>
  /** Names being resolved right now, so fragments that refer to each other cannot loop. */
  active: Set<string>
}

interface Evaluated {
  value: string | undefined
  /** Index of the first token the expression did not consume. */
  next: number
}

const isPunct = (token: Token | undefined, value: string) =>
  token?.kind === 'punct' && token.value === value
const isIdent = (token: Token | undefined, value?: string) =>
  token?.kind === 'ident' && (value === undefined || token.value === value)

function readSpecifierList(tokens: Array<Token>, open: number) {
  const items: Array<{name: string; alias: string}> = []
  let i = open + 1
  while (i < tokens.length && !isPunct(tokens[i], '}')) {
    const first = tokens[i]
    if (
      first.kind === 'ident' &&
      first.value === 'type' &&
      tokens[i + 1]?.kind === 'ident' &&
      !isIdent(tokens[i + 1], 'as')
    ) {
      i++
    }
    const name = tokens[i]
    if (name?.kind === 'ident' || name?.kind === 'string') {
      const alias = isIdent(tokens[i + 1], 'as') ? tokens[i + 2] : undefined
      items.push({name: name.value, alias: alias && 'value' in alias ? alias.value : name.value})
      i += alias ? 3 : 1
    } else {
      i++
    }
  }
  return {items, end: i}
}

function parseImport(module: Module, i: number): number {
  const {tokens} = module
  let j = i + 1
  if (
    isIdent(tokens[j], 'type') &&
    !isIdent(tokens[j + 1], 'from') &&
    !isPunct(tokens[j + 1], ',')
  ) {
    j++
  }
  const bindings: Array<{local: string; imported: string}> = []
  if (isIdent(tokens[j]) && !isIdent(tokens[j], 'from')) {
    bindings.push({local: (tokens[j] as {value: string}).value, imported: 'default'})
    j++
    if (isPunct(tokens[j], ',')) {
      j++
    }
  }
  if (isPunct(tokens[j], '{')) {
    const {items, end} = readSpecifierList(tokens, j)
    bindings.push(...items.map((item) => ({local: item.alias, imported: item.name})))
    j = end + 1
  } else if (isPunct(tokens[j], '*')) {
    j += 3
  }
  const specifier = tokens[j + 1]
  if (isIdent(tokens[j], 'from') && specifier?.kind === 'string') {
    for (const {local, imported} of bindings) {
      module.imports.set(local, {specifier: specifier.value, imported})
    }
    return j + 1
  }
  return i
}

function parseExport(module: Module, i: number): number {
  const {tokens} = module
  const next = tokens[i + 1]
  if (isIdent(next, 'default')) {
    module.declarations.set('default', i + 2)
    return i + 1
  }
  if (isPunct(next, '*')) {
    const from = isIdent(tokens[i + 2], 'from') ? tokens[i + 3] : undefined
    if (from?.kind === 'string') {
      module.exportAll.push(from.value)
    }
    return i + 1
  }
  if (isIdent(next, 'type') && isPunct(tokens[i + 2], '{')) {
    return i + 1
  }
  if (isPunct(next, '{')) {
    const {items, end} = readSpecifierList(tokens, i + 1)
    const from = isIdent(tokens[end + 1], 'from') ? tokens[end + 2] : undefined
    for (const {name, alias} of items) {
      if (from?.kind === 'string') {
        module.reexports.set(alias, {specifier: from.value, imported: name})
      } else {
        module.exportAliases.set(alias, name)
      }
    }
    return end
  }
  return i
}

function parseModule(file: string, source: string): Module {
  const module: Module = {
    file,
    tokens: tokenize(source),
    declarations: new Map(),
    imports: new Map(),
    exportAliases: new Map(),
    reexports: new Map(),
    exportAll: [],
  }
  const {tokens} = module
  let depth = 0
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.kind === 'punct') {
      if ('{(['.includes(token.value)) {
        depth++
      } else if ('})]'.includes(token.value)) {
        depth--
      }
      continue
    }
    if (token.kind !== 'ident' || depth !== 0 || isPunct(tokens[i - 1], '.')) {
      continue
    }

    if (token.value === 'const' || token.value === 'let' || token.value === 'var') {
      const name = tokens[i + 1]
      if (name?.kind !== 'ident') {
        continue
      }
      let j = i + 2
      if (isPunct(tokens[j], ':')) {
        // A type annotation: skip to the `=`.
        while (
          j < tokens.length &&
          j < i + 40 &&
          !isPunct(tokens[j], '=') &&
          !isPunct(tokens[j], ';')
        ) {
          j++
        }
      }
      if (isPunct(tokens[j], '=')) {
        module.declarations.set(name.value, j + 1)
      }
    } else if (token.value === 'import') {
      i = parseImport(module, i)
    } else if (token.value === 'export') {
      i = parseExport(module, i)
    }
  }
  return module
}

function loadModule(file: string, context: Context): Promise<Module | undefined> {
  let loaded = context.modules.get(file)
  if (!loaded) {
    loaded = context.host
      .readFile(file)
      .then((source) => (source === undefined ? undefined : parseModule(file, source)))
    context.modules.set(file, loaded)
  }
  return loaded
}

async function followImport(
  from: Module,
  binding: ImportBinding,
  context: Context,
): Promise<string | undefined> {
  const file = await resolveImport(from.file, binding.specifier, context.host)
  if (!file) {
    return undefined
  }
  if (file.endsWith('.groq')) {
    return binding.imported === 'default' ? context.host.readFile(file) : undefined
  }
  const target = await loadModule(file, context)
  return target && resolveExport(target, binding.imported, context)
}

async function resolveExport(
  module: Module,
  exported: string,
  context: Context,
): Promise<string | undefined> {
  const key = `${module.file}\0export:${exported}`
  if (context.active.has(key)) {
    return undefined
  }
  context.active.add(key)
  try {
    const local = module.exportAliases.get(exported) ?? exported
    if (module.declarations.has(local) || module.imports.has(local)) {
      return await resolveName(module, local, context)
    }
    const reexport = module.reexports.get(exported)
    if (reexport) {
      return await followImport(module, reexport, context)
    }
    if (exported !== 'default') {
      for (const specifier of module.exportAll) {
        const value = await followImport(module, {specifier, imported: exported}, context)
        if (value !== undefined) {
          return value
        }
      }
    }
    return undefined
  } finally {
    context.active.delete(key)
  }
}

async function resolveName(
  module: Module,
  name: string,
  context: Context,
): Promise<string | undefined> {
  const key = `${module.file}\0${name}`
  if (context.active.has(key)) {
    return undefined
  }
  context.active.add(key)
  try {
    const declaration = module.declarations.get(name)
    if (declaration !== undefined) {
      const {value, next} = await evaluateSum(module, module.tokens, declaration, context)
      const after = module.tokens[next]
      const endsStatement =
        !after || after.kind === 'ident' || (after.kind === 'punct' && ';,)}'.includes(after.value))
      return endsStatement ? value : undefined
    }
    const binding = module.imports.get(name)
    return binding ? await followImport(module, binding, context) : undefined
  } finally {
    context.active.delete(key)
  }
}

async function evaluateTemplate(
  module: Module,
  template: Extract<Token, {kind: 'template'}>,
  context: Context,
): Promise<string> {
  let text = template.quasis[0]
  for (const [index, expr] of template.exprs.entries()) {
    const {value, next} = await evaluateSum(module, expr.tokens, 0, context)
    // What cannot be resolved stays as written, which is what the query contained before.
    text +=
      (next === expr.tokens.length && value !== undefined ? value : '${' + expr.text + '}') +
      template.quasis[index + 1]
  }
  return text
}

async function evaluatePrimary(
  module: Module,
  tokens: Array<Token>,
  pos: number,
  context: Context,
): Promise<Evaluated> {
  const token = tokens[pos]
  if (!token) {
    return {value: undefined, next: pos}
  }
  switch (token.kind) {
    case 'string':
      return {value: token.value, next: pos + 1}
    case 'template':
      return {value: await evaluateTemplate(module, token, context), next: pos + 1}
    case 'punct': {
      if (token.value === '(') {
        const inner = await evaluateSum(module, tokens, pos + 1, context)
        return isPunct(tokens[inner.next], ')')
          ? {value: inner.value, next: inner.next + 1}
          : {value: undefined, next: inner.next}
      }
      return {value: undefined, next: pos + 1}
    }
    case 'ident': {
      const following = tokens[pos + 1]
      if (token.value === 'groq' && following?.kind === 'template') {
        return {value: await evaluateTemplate(module, following, context), next: pos + 2}
      }
      if (token.value === 'defineQuery' && isPunct(following, '(')) {
        const inner = await evaluateSum(module, tokens, pos + 2, context)
        return isPunct(tokens[inner.next], ')')
          ? {value: inner.value, next: inner.next + 1}
          : {value: undefined, next: inner.next}
      }
      if (isPunct(following, '.') || isPunct(following, '(') || isPunct(following, '[')) {
        return {value: undefined, next: pos + 1}
      }
      return {value: await resolveName(module, token.value, context), next: pos + 1}
    }
    default: {
      const unreachable: never = token
      return unreachable
    }
  }
}

async function evaluateOperand(
  module: Module,
  tokens: Array<Token>,
  pos: number,
  context: Context,
): Promise<Evaluated> {
  const operand = await evaluatePrimary(module, tokens, pos, context)
  let {next} = operand
  // `as const`, `as string` and `satisfies Type` do not change the value.
  while (isIdent(tokens[next], 'as') || isIdent(tokens[next], 'satisfies')) {
    next += isIdent(tokens[next + 1]) ? 2 : 1
  }
  return {value: operand.value, next}
}

async function evaluateSum(
  module: Module,
  tokens: Array<Token>,
  pos: number,
  context: Context,
): Promise<Evaluated> {
  let {value, next} = await evaluateOperand(module, tokens, pos, context)
  while (isPunct(tokens[next], '+')) {
    const right = await evaluateOperand(module, tokens, next + 1, context)
    value = value !== undefined && right.value !== undefined ? value + right.value : undefined
    next = right.next
  }
  return {value, next}
}

/**
 * Finds the `groq` templates and `defineQuery()` calls in a file and resolves the fragments
 * interpolated into them (`${fragment}`) from the same file or from the files it imports.
 * A `${}` that cannot be resolved is left as written.
 */
export async function extractQueries(
  source: string,
  file: string,
  host: FragmentHost,
): Promise<Array<ExtractedQuery>> {
  const context: Context = {host, modules: new Map(), active: new Set()}
  const module = parseModule(file, source)
  context.modules.set(file, Promise.resolve(module))

  const queries: Array<ExtractedQuery> = []
  const {tokens} = module
  for (const [i, token] of tokens.entries()) {
    if (token.kind !== 'ident' || isPunct(tokens[i - 1], '.')) {
      continue
    }
    const following = tokens[i + 1]
    const isTag = token.value === 'groq' && following?.kind === 'template'
    const isCall = token.value === 'defineQuery' && isPunct(following, '(')
    if (!isTag && !isCall) {
      continue
    }
    const {value, next} = await evaluatePrimary(module, tokens, i, context)
    if (value !== undefined && next > i) {
      queries.push({content: value, offset: token.start})
    }
  }
  return queries
}
