import {defineCliConfig} from './define-cli-config.cjs'

// The integration tests point the client at a local server through SANITY_TEST_API_HOST.
const apiHost: string | undefined = process.env.SANITY_TEST_API_HOST

export default defineCliConfig({
  api: {
    projectId: 'abc123',
    dataset: 'production',
    ...(apiHost ? {apiHost, useProjectHostname: false} : {}),
  },
})
