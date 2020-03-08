import webpack from 'webpack'
import fs from 'fs'
import { Script } from '../types'

/**
 * Prepares boot loader for server scripts
 *
 * @param bs
 * @constructor
 */
function BootLoader (outputPath: string, ss: Array<Script>): string {
  // Destination for boot loader & entry point for bundler (webpack)
  const dst = `${outputPath}/server-scripts.src.js`
  const entry = fs.createWriteStream(dst)

  // Find and merge scripts (in scripts array we have static data
  // with processed, expanded props like security, triggers etc.
  entry.write(`const m = new Map();`)

  // Load each script and map it to the list
  ss.forEach((s) => {
    entry.write(`m.set('${s.src}', require('${s.src}').default);\n`)
  })

  entry.write('export default m;\n')

  entry.close()

  return dst
}

/**
 * Bundles server scripts w/ webpack
 *
 * @param {string} entry
 * @param {string} context
 * @param {string} outputPath
 *
 * @constructor
 */
function Pack (entry, context, outputPath): Promise<string> {
  return new Promise((resolve) => {
    const type = 'server-scripts'
    const cfg: webpack.Configuration = {
      // mode: 'production',
      mode: 'development',
      target: 'node',
      entry,
      context,
      output: {
        filename: `${type}.js`,
        libraryTarget: 'commonjs',
        path: outputPath,
      },
    }

    webpack(cfg).run((err: Error) => {
      if (err) return console.error(err)
      resolve(`${outputPath}/${type}.js`)
    })
  })
}

function Load (path): Map<string, Partial<Script>> {
  return require(path).default
}

export default {
  BootLoader,
  Pack,
  Load,
}
