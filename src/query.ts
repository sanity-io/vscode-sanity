import sanityClient from '@sanity/client'
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
  return sanityClient(clientOptions)
    .fetch(query, params, {filterResponse: false})
    .catch((err) => {
      if (err.statusCode === 401) {
        vscode.window.showInformationMessage(err.message + '. Falling back to public dataset.')
        return sanityClient(noTokenClientOptions).fetch(query, params, {filterResponse: false})
      }

      throw err
    })
}
