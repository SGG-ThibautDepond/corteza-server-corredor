import { GetLastUpdated, Script } from '../shared'
import MakeFilterFn from '../filter'
import fs from 'fs'
import path from 'path'
import * as config from '../../config'
import * as bundle from '../../bundler/webpack'
import { BaseLogger } from 'pino'
import { CommonPath, Loader } from '../../loader'
import watch from 'node-watch'
import { debounce } from 'lodash'

interface ListFilter {
    query?: string;
    resourceType?: string;
    eventTypes?: string[];
    bundle?: string;
    type?: string;
}

interface CtorArgs {
  logger: BaseLogger;
  config: Config;
  loader: Loader;
}

interface Config {
  bundler: {
    outputPath: string;
  };
}

/**
 *
 */
export class Service {
  private scripts: Script[] = []
  private readonly config: Config
  protected readonly log: BaseLogger;
  protected readonly loader: Loader;

  /**
   * Service constructor
   */
  constructor ({ logger, config, loader }: CtorArgs) {
    this.config = config
    this.loader = loader
    this.log = logger.child({ name: 'scripts.client.service' })
    this.log.debug('initializing')
  }

  // Returns date of the most recently updated script from the set
  get lastUpdated (): Date {
    return GetLastUpdated(this.scripts)
  }

  /**
   * Loads scripts
   *
   * @return {void}
   */
  update (set: Script[]): void {
    // Scripts loaded, replace set
    this.scripts = set
  }

  getBundle (name: string): Buffer {
    return fs.readFileSync(path.join(this.config.bundler.outputPath, name + '.js'))
  }

  /**
   * Returns list of scripts
   */
  list (f: ListFilter = {}): Script[] {
    return this.scripts.filter(MakeFilterFn(f))
  }

  /**
   * Reloads client scripts
   *
   * Note: NOOP when client scripts are disabled
   *
   * Function calls script loader (see loader.ts) and loads all available client scripts
   *
   * Valid scripts (w/o errors) and packed into browser bundles with webpack.
   *
   * It logs (warn) all errors on all scripts and (debug) valid scripts.
   *
   * Client scripts service is then updated with the new list of scripts.
   */
  process (): void {
    this.log.info({ searchPaths: this.loader.searchPaths }, 'reloading client scripts')

    const scripts = this.loader.scripts()
    const isValid = (s: Script): boolean => !!s.name && !!s.exec && s.errors.length === 0
    const vScripts = scripts.filter(isValid)

    // Make bundles out of all valid scripts
    const scriptListPerBundle = vScripts.reduce((bi, s) => {
      // Extract bundle name from path -- expecting to be 1st subdirectory under 'client-scripts'
      const [, bundle] = s.name.split(path.sep, 2)

      if (!bi[bundle]) {
        bi[bundle] = []
      }

      bi[bundle].push(s)

      return bi
    }, {} as { [bundle: string]: Script[] })

    const bootloaderPerBundle = bundle.BootLoader(config.bundler.outputPath, scriptListPerBundle)
    for (const bnd in bootloaderPerBundle) {
      // Find longest common path for all scripts in the bundle
      // @see https://webpack.js.org/configuration/entry-context/#context
      const ctx = CommonPath(scriptListPerBundle[bnd].map(({ src }) => src))

      this.log.debug({ bundle: bnd }, 'bundling client scripts')

      bundle.Pack(bnd, bootloaderPerBundle[bnd], ctx, config.bundler.outputPath)
    }

    // Log errors on all invalid scripts
    scripts
      .filter(s => !isValid(s))
      .forEach(({ src, name, errors }) => {
        errors.forEach(error => {
          this.log.warn({ src, scriptName: name }, 'script error: %s', error)
        })
      })

    // Let developer know about valid scripts loaded
    vScripts
      .forEach(
        ({ name, triggers }) =>
          this.log.debug({ scriptName: name, triggers: triggers.length }, 'script ready'))

    // All scripts (even invalid ones) are given to client scripts service
    // we might want to look at errors
    this.update(scripts)

    // Summarize reloading stats
    this.log.info({ valid: vScripts.length, total: scripts.length }, 'processed')
  }

  watch (): void {
    this.log.info('initializing watcher')
    process.on('SIGINT', watch(
      this.loader.basePaths(),
      {
        persistent: false,
        recursive: true,
        delay: 200,
        filter: /\.js$/,
      },
      debounce(() => this.process(), 500),
    ).close)
  }
}
