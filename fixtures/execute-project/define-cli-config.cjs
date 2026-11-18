'use strict'
// Shaped like `sanity/cli` in Sanity v3: minified CommonJS with getter exports, which Node's ES module
// loader cannot see as named exports.
Object.defineProperty(exports, '__esModule', {value: !0})
const cli = {defineCliConfig: (config) => config}
Object.defineProperty(exports, 'defineCliConfig', {
  enumerable: !0,
  get: function () {
    return cli.defineCliConfig
  },
})
