import {createClient} from '@sanity/client'
import vscode from 'vscode'
import type {QueryParams} from './queryParams'

export async function executeGroq(options: {
  projectId: string
  dataset: string
  query: string
  params: QueryParams
  useCdn: boolean
  token?: string
}) {
  const {query, params, ...clientOptions} = options
  const {token: _token, ...noTokenClientOptions} = clientOptions
  return createClient(clientOptions)
    .fetch(query, params, {filterResponse: false})
    .catch((error) => {
      if (error.statusCode === 401) {
        vscode.window.showInformationMessage(error.message + '. Falling back to public dataset.')
        return createClient(noTokenClientOptions).fetch(query, params, {filterResponse: false})
      }

      throw error
    })
}
