import sanityClient from '@sanity/client'

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

  return sanityClient({projectId, dataset, useCdn, token}).fetch(groq, parsedParams, {
    filterResponse: false,
  })
}
