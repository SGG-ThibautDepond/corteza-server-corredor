/* eslint-disable @typescript-eslint/ban-ts-ignore */

import grpc from 'grpc'
import { BaseLogger } from 'pino'
import { HandleException } from '../../grpc-server'
import { Script, Service } from './'

interface BundleRequest {
  name: string;
}

interface BundleResponse {
  bundles: Bundle[];
}

interface Bundle {
  name: string;
  type: string;
  code: string;
}

interface ListRequest {
  query?: string;
  resourceType?: string;
  eventTypes?: string[];
  bundle?: string;
}

interface ListResponse {
  scripts: Script[];
}

export function Handlers (h: Service, loggerService: BaseLogger): object {
  return {
    Bundle ({ request }: { request: BundleRequest }, done: grpc.sendUnaryData<BundleResponse|null>): void {
      const { name } = request
      const logger = loggerService.child({ rpc: 'Bundle' })

      logger.debug({ name }, 'serving bundle')

      try {
        const r: BundleResponse = {
          bundles: [
            {
              name: 'dummy',
              type: 'dummy',
              code: '/* bundle content */',
            },
          ],
        }

        done(null, r)
      } catch (e) {
        logger.debug({ stack: e.stack }, e.message)
        HandleException(e, done, grpc.status.INTERNAL)
      }
    },

    List ({ request }: { request: ListRequest }, done: grpc.sendUnaryData<ListResponse|null>): void {
      const { query, resourceType, eventTypes, bundle } = request
      const logger = loggerService.child({ rpc: 'List' })

      const filter = {
        query,
        resourceType,
        eventTypes,
        bundle,
      }

      logger.debug({ filter }, 'returning list of scripts')

      try {
        done(null, { scripts: h.List(filter) })
      } catch (e) {
        logger.debug({ stack: e.stack }, e.message)
        HandleException(e, done, grpc.status.INTERNAL)
      }
    },
  }
}
