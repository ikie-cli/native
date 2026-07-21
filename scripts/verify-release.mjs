#!/usr/bin/env node

const [repo = 'ikie-cli/native-releases', tag] = process.argv.slice(2)
if (!tag) throw new Error('Usage: node scripts/verify-release.mjs <owner/repo> <tag>')

const api = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`
const response = await fetch(api, { headers: { accept: 'application/vnd.github+json' } })
if (!response.ok) throw new Error(`Release API returned HTTP ${response.status}`)
const release = await response.json()
if (release.draft) throw new Error('Release is still a draft')

const names = new Set(release.assets.map((asset) => asset.name))
const required = [
  /^Native-Setup-.*-x64\.exe$/,
  /^Native-Setup-.*-arm64\.exe$/,
  /^Native-.*-x86_64\.AppImage$/,
  /^Native-.*-arm64\.AppImage$/,
  /^Native-.*-x64\.dmg$/,
  /^Native-.*-arm64\.dmg$/,
  /^latest\.yml$/,
  /^latest-linux.*\.yml$/,
  /^latest-mac\.yml$/
]
for (const pattern of required) {
  if (![...names].some((name) => pattern.test(name))) {
    throw new Error(`Missing release asset matching ${pattern}`)
  }
}

for (const asset of release.assets) {
  if (!asset.size) throw new Error(`Empty release asset: ${asset.name}`)
  const head = await fetch(asset.browser_download_url, { method: 'HEAD', redirect: 'manual' })
  if (head.status !== 302 && !head.ok) {
    throw new Error(`Anonymous download failed for ${asset.name}: HTTP ${head.status}`)
  }
}

console.log(`Verified ${release.assets.length} public assets for ${repo}@${tag}`)
