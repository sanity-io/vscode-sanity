import sanityClient from '@sanity/client'

function getClient(projectId: string, dataset: string, useCdn: boolean) {
  return sanityClient({
    projectId: projectId,
    dataset: dataset,
    useCdn,
  })
}

export async function executeGroq(projectId: string, dataset: string, groq: string) {
  return getClient(projectId, dataset, false).fetch(groq, {}, {filterResponse: false})
}

export async function executeGroqWithParams(
  projectId: string,
  dataset: string,
  groq: string,
  params: string
) {
  const parsedParams = JSON.parse(params)
  return getClient(projectId, dataset, false).fetch(groq, parsedParams, {
    filterResponse: false,
  })
}
