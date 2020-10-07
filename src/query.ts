import sanityClient from '@sanity/client'
import * as vscode from 'vscode'

export async function executeGroq(
  projectId: string,
  dataset: string,
  groq: string,
  params: string,
  useCdn: boolean,
  token?: string
) {
  let parsedParams = {}
  if (params) {
    parsedParams = JSON.parse(params)
  }

  return sanityClient({projectId, dataset, useCdn, token})
    .fetch(groq, parsedParams, {
      filterResponse: false,
    })
    .catch((err) => {
      if (err.statusCode === 401) {
        vscode.window.showInformationMessage(err.message + '. Falling back to public dataset.')
        return sanityClient({projectId, dataset, useCdn}).fetch(groq, parsedParams, {
          filterResponse: false,
        })
      }
      throw err
    })
}
