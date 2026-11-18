import {createClient, type SanityClient} from '@sanity/client'
import {resolveApiVersion} from './apiVersion'

export interface QueryClientOptions {
  projectId: string
  dataset: string
  useCdn: boolean
  apiVersion?: string
  token?: string
}

export function createQueryClient(options: QueryClientOptions): SanityClient {
  const {apiVersion} = resolveApiVersion(options.apiVersion)
  return createClient({...options, apiVersion})
}
