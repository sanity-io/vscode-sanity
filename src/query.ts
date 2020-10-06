import sanityClient from '@sanity/client'

export async function executeGroq(projectId: string, dataset: string, groq: string): Promise<any> {
  const client = sanityClient({
    projectId: projectId,
    dataset: dataset,
    useCdn: false,
  })
  return await client.fetch(groq)
}
