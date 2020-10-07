import sanityClient from '@sanity/client'

function getClient(projectId: string, dataset: string, useCDN: boolean) {
  return sanityClient({
    projectId: projectId,
    dataset: dataset,
    useCdn: false,
  })
}

export async function executeGroq(projectId: string, dataset: string, groq: string): Promise<any> {
  return await getClient(projectId, dataset, false).fetch(groq, {}, {filterResponse: false})
}

export async function executeGroqWithParams(projectId: string, dataset: string, groq: string, params: string): Promise<any> {
  const parsedParams = JSON.parse(params)
  return await getClient(projectId, dataset, false).fetch(groq, parsedParams, {filterResponse: false})
}
