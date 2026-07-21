import { appendFileSync } from 'node:fs'

const windows = process.env.TARGET_PLATFORM === 'windows'
const certificate = windows ? process.env.WIN_CERTIFICATE : process.env.MAC_CERTIFICATE
const password = windows
  ? process.env.WIN_CERTIFICATE_PASSWORD
  : process.env.MAC_CERTIFICATE_PASSWORD

const values = certificate
  ? {
      CSC_LINK: certificate,
      CSC_KEY_PASSWORD: password ?? '',
      CSC_IDENTITY_AUTO_DISCOVERY: 'true',
      ...(windows
        ? {}
        : {
            APPLE_ID: process.env.NOTARY_APPLE_ID ?? '',
            APPLE_APP_SPECIFIC_PASSWORD: process.env.NOTARY_PASSWORD ?? '',
            APPLE_TEAM_ID: process.env.NOTARY_TEAM_ID ?? ''
          })
    }
  : { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }

appendFileSync(
  process.env.GITHUB_ENV,
  `${Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`
)
