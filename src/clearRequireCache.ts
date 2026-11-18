import * as path from 'path'

const NODE_MODULES = `${path.sep}node_modules${path.sep}`

/**
 * Drops `moduleId` and the local modules it loaded from `require.cache`. Dependencies under
 * `node_modules` stay cached: they are shared with the rest of the extension host.
 *
 * A module that throws is removed from the cache, but local files it had already loaded stay
 * there. Those files still point at the failed module, so they are cleared too.
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

  if (require.cache[moduleId]) {
    clear(moduleId)
    return
  }

  for (const id of Object.keys(require.cache)) {
    if (loadedBy(require.cache[id], moduleId)) clear(id)
  }
}

function loadedBy(mod: NodeJS.Module | undefined, moduleId: string) {
  const seen = new Set<NodeJS.Module>()
  let current = mod?.parent
  while (current && !seen.has(current)) {
    if (current.id === moduleId) return true
    seen.add(current)
    current = current.parent ?? undefined
  }
  return false
}
