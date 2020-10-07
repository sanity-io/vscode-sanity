import sanityClient from '@sanity/client'

function getClient(projectId: string, dataset: string, useCdn: boolean) {
  return sanityClient({
    projectId: projectId,
    dataset: dataset,
    useCdn,
  })
}

export async function executeGroq(projectId: string, dataset: string, groq: string, useCdn: boolean) {
  return getClient(projectId, dataset, useCdn).fetch(groq, {}, {filterResponse: false})
}

export async function executeGroqWithParams(
  projectId: string,
  dataset: string,
  groq: string,
  params: string,
  useCdn: boolean
) {
  const parsedParams = JSON.parse(params)
  return getClient(projectId, dataset, useCdn).fetch(groq, parsedParams, {
    filterResponse: false,
  })
}
