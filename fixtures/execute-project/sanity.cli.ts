import {defineCliConfig} from './define-cli-config.cjs'

// The integration tests point the client at a local server through SANITY_TEST_API_HOST.
const apiHost: string | undefined = process.env.SANITY_TEST_API_HOST

export default defineCliConfig({
  api: {
    // The .env file tests set these through .env files. The other tests use the defaults.
    projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? 'abc123',
    dataset: process.env.SANITY_STUDIO_DATASET ?? 'production',
    ...(apiHost ? {apiHost, useProjectHostname: false} : {}),
  },
})
