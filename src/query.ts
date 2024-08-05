import {createClient} from '@sanity/client'
import * as vscode from 'vscode'

export async function executeGroq(options: {
  projectId: string
  dataset: string
  query: string
  params: Record<string, unknown>
  useCdn: boolean
  token?: string
}) {
  const {query, params, ...clientOptions} = options
  const {token, ...noTokenClientOptions} = clientOptions
  return createClient(clientOptions)
    .fetch(query, params, {filterResponse: false})
    .catch((err) => {
      if (err.statusCode === 401) {
        vscode.window.showInformationMessage(err.message + '. Falling back to public dataset.')
        return createClient(noTokenClientOptions).fetch(query, params, {filterResponse: false})
      }

      throw err
    })
}
