import * as path from 'path'

const NODE_MODULES = `${path.sep}node_modules${path.sep}`

/**
 * Drops `moduleId` and the local modules it loaded from `require.cache`. Dependencies under
 * `node_modules` stay cached: they are shared with the rest of the extension host.
 */
export function clearRequireCache(moduleId: string) {
  const visited = new Set<string>()

  function clear(id: string) {
    if (visited.has(id) || id.includes(NODE_MODULES)) return
    visited.add(id)
    const mod = require.cache[id]
    if (!mod) return
    for (const child of mod.children.slice()) clear(child.id)
    delete require.cache[id]
  }

  clear(moduleId)
}
