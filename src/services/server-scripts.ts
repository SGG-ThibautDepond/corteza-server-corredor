import MakeFilterFn from './shared/filter'
import { corredor as exec } from '@cortezaproject/corteza-js'
import * as config from '../config'
import { BaseLogger } from 'pino'
import watch from 'node-watch'
import { debounce } from 'lodash'
import { Script } from '../types'
import GetLastUpdated from './shared/get-last-updated'
import Loader, { CommonPath } from '../loader'
import { serverScripts as serverScriptsBundler } from '../bundler'

interface ListFilter {
    query?: string;
    resourceType?: string;
    eventTypes?: string[];
}

interface CtorArgs {
  logger: BaseLogger;
  config: exec.Config;
  loader?: Loader;
}

/**
 *
 */
export default class ServerScripts {
  protected scripts: Script[] = [];
  protected readonly config: exec.Config;
  protected readonly log: BaseLogger;
  protected readonly loader?: Loader;

  /**
   * Service constructor
   */
  constructor ({ logger, config, loader }: CtorArgs) {
    this.config = config
    this.loader = loader
    this.log = logger.child({ name: 'services.server-scripts' })
    this.log.debug('initializing')
  }

  // Returns date of the most recently updated script from the set
  get lastUpdated (): Date {
    return GetLastUpdated(this.scripts)
  }

  /**
   * Loads scripts
   */
  update (set: Script[]): void {
    // Scripts loaded, replace set
    this.scripts = set
  }

  /**
   * Finds and executes the script using current configuration, passed arguments and logger
   *
   * @param name Name of the script
   * @param args Arguments for the script
   * @param log Exec logger to capture and proxy all log.* and console.* calls
   */
  async exec (name: string, args: exec.BaseArgs, log: BaseLogger): Promise<object> {
    const script: Script|undefined = this.scripts.find((s) => s.name === name)

    if (script === undefined) {
      return Promise.reject(new Error('script not found'))
    }

    if (script.errors && script.errors.length > 0) {
      return Promise.reject(new Error('can not run script with initialization errors'))
    }

    if (!script.exec || !(script.exec as exec.ScriptExecFn)) {
      return Promise.reject(new Error('can not run uninitialized script'))
    }

    return exec.Exec(script as exec.ExecutableScript, args, new exec.Ctx(args, log, { config: this.config }))
  }

  /**
   * Returns list of scripts
   */
  list (f: ListFilter = {}): Script[] {
    return this.scripts.filter(MakeFilterFn(f))
  }

  /**
   * Processes server scripts from loader
   *
   * Note: NOOP when client scripts are disabled
   *
   * Function calls script loader and loads all available server scripts
   * It logs (warn) all errors on all scripts and (debug) valid scripts
   *
   * Server scripts service is then updated with the new list of scripts.
   */
  async process (): Promise<void> {
    if (!this.loader) {
      this.log.debug('no loader: processing disabled')
    }

    this.log.info({ searchPaths: this.loader.searchPaths }, 'reloading server scripts')
    const isValid = (s: Script): boolean => s.errors.length === 0

    this.loader.scripts()
      .then(scripts => {
        this.update(scripts)

        // Log errors on all invalid scripts
        scripts
          .filter(s => !isValid(s))
          .forEach(({ src, errors }) => {
            errors.forEach(error => {
              this.log.warn({ src }, 'script error: %s', error)
            })
          })

        return scripts.filter(isValid)
      })
      // bundle all valid scripts
      .then(scripts => {
        // Let developer know about valid scripts loaded
        scripts
          .forEach(({ src }) => this.log.debug({ src }, 'script ready'))


        return serverScriptsBundler.Pack(
          serverScriptsBundler.BootLoader(config.bundler.outputPath, scripts),
          CommonPath(scripts.map(s => s.src)),
          config.bundler.outputPath,
        )
      })
      .then(bundle => {
        // Update scripts on the service with
        // props (just exec() fn in most cases) from the bundled scripts
        const m = serverScriptsBundler.Load(bundle)
        for (let s = 0; s < this.scripts.length; s++) {
          const { src } = this.scripts[s]
          if (m.has(src)) {
            this.scripts[s] = { ...m.get(src), ...this.scripts[s] }
          }
        }
      })
      .finally(() => {
        this.log.info({
          valid: this.scripts.filter(isValid).length,
          total: this.scripts.length,
        }, 'processed')
      })
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
      debounce(() => {
        this.log.debug('change detected')
        this.process()
      }, 500),
    ).close)
  }
}
