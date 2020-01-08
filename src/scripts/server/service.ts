/* eslint-disable @typescript-eslint/ban-ts-ignore */

import MakeFilterFn from '../filter'
import * as exec from '../exec'
import { BaseLogger } from 'pino'

interface ListFilter {
    query?: string;
    resource?: string;
    events?: string[];
}

interface Script {
  name: string;
  // triggers: unknown[];
  errors: string[];
  exec: unknown;
}

/**
 *
 */
export class Service {
    private scripts: Script[] = [];
    private readonly config: exec.Config;

    /**
     * Service constructor
     */
    constructor (config: exec.Config) {
      this.config = config
    }

    /**
     * Loads scripts
     *
     * @return {void}
     */
    Update (set): void {
      // Scripts loaded, replace set
      this.scripts = set
    }

    /**
     * Finds and executes the script using current configuration, passed arguments and logger
     *
     * @param {string} name Name of the script
     * @param {exec.BaseArgs} args Arguments for the script
     * @param {BaseLogger} log Exec logger to capture and proxy all log.* and console.* calls
     * @returns Promise<object>
     */
    async Exec (name: string, args: exec.BaseArgs, log: BaseLogger): Promise<object> {
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

      if (script.exec as exec.ScriptExecFn) {
        return exec.Exec(script.exec as exec.ScriptExecFn, args, log, this.config)
      }
    }

    /**
     * Returns list of scripts
     */
    List (f: ListFilter = {}): Script[] {
      return this.scripts.filter(MakeFilterFn(f))
    }
}
