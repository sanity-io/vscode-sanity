import vscode from 'vscode'
import {createQueryClient} from './client'
import type {QueryParams} from './queryParams'

export async function executeGroq(options: {
  projectId: string
  dataset: string
  query: string
  params: QueryParams
  useCdn: boolean
  apiVersion?: string
  token?: string
}) {
  const {query, params, ...clientOptions} = options
  const {token: _token, ...noTokenClientOptions} = clientOptions
  return createQueryClient(clientOptions)
    .fetch(query, params, {filterResponse: false})
    .catch((error) => {
      if (error.statusCode === 401) {
        vscode.window.showInformationMessage(error.message + '. Falling back to public dataset.')
        return createQueryClient(noTokenClientOptions).fetch(query, params, {filterResponse: false})
      }

      throw error
    })
}
