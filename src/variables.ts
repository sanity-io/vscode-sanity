import {parse} from 'groq-js'

/** Names of the `$parameters` a GROQ query uses, in order of appearance. */
export function findVariablesInQuery(query: string): Array<string> {
  return findVariables(parse(query), [])
}

function findVariables(node: unknown, found: Array<string>): Array<string> {
  if (Array.isArray(node)) {
    const children: Array<unknown> = node
    return children.reduce<Array<string>>((acc, child) => findVariables(child, acc), found)
  }

  // `null` literals in the query are `{type: 'Value', value: null}` nodes.
  if (typeof node !== 'object' || node === null) {
    return found
  }

  if (
    'type' in node &&
    node.type === 'Parameter' &&
    'name' in node &&
    typeof node.name === 'string'
  ) {
    return found.concat(node.name)
  }

  const values: Array<unknown> = Object.values(node)
  return values.reduce<Array<string>>((acc, child) => findVariables(child, acc), found)
}
