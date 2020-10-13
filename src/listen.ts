import sanityClient from '@sanity/client'
import * as vscode from 'vscode'
import {catchError} from 'rxjs/operators'

export function setupListener(options: {
  projectId: string
  dataset: string
  query: string
  params: Record<string, unknown>
  token?: string
}) {
  const {query, params, ...clientOptions} = options
  const {token, ...noTokenClientOptions} = clientOptions
  return sanityClient({...clientOptions, useCdn: false})
    .listen(query, params, {includeResult: true, events: ['mutation', 'welcome']})
    .pipe(
      catchError((err) => {
        if (err.statusCode !== 401) {
          throw err
        }

        vscode.window.showInformationMessage(err.message + '. Falling back to public dataset.')
        return sanityClient({...noTokenClientOptions, useCdn: false}).listen(query, params, {
          includeResult: true,
          events: ['mutation', 'welcome'],
        })
      })
    )
}
