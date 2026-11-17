import * as path from 'path'
import {readdirSync} from 'fs'
import Mocha from 'mocha'

export function run(): Promise<void> {
  const mocha = new Mocha({ui: 'bdd', color: true, timeout: 120_000})
  for (const file of readdirSync(__dirname)) {
    if (file.endsWith('.test.js')) mocha.addFile(path.join(__dirname, file))
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => (failures ? reject(new Error(`${failures} tests failed.`)) : resolve()))
  })
}
