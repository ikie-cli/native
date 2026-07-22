#!/usr/bin/env node

const [repo = 'ikie-cli/native-releases', tag] = process.argv.slice(2)
if (!tag) throw new Error('Usage: node scripts/verify-release.mjs <owner/repo> <tag>')

const version = tag.replace(/^v/, '')
const channel = version.includes('-nightly.') ? 'nightly' : version.includes('-beta.') ? 'beta' : 'latest'
if (version.includes('-') && channel === 'latest') {
  throw new Error(`Unsupported prerelease channel in ${tag}; expected -beta.N or -nightly.N`)
}

const api = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`
const response = await fetch(api, { headers: { accept: 'application/vnd.github+json' } })
if (!response.ok) throw new Error(`Release API returned HTTP ${response.status}`)
const release = await response.json()
if (release.draft) throw new Error('Release is still a draft')

const assets = new Map(release.assets.map((asset) => [asset.name, asset]))
const names = [...assets.keys()]
const required = [
  new RegExp(`^Native-Setup-${escape(version)}-x64\\.exe$`),
  new RegExp(`^Native-Setup-${escape(version)}-arm64\\.exe$`),
  new RegExp(`^Native-Setup-${escape(version)}-x64\\.exe\\.blockmap$`),
  new RegExp(`^Native-Setup-${escape(version)}-arm64\\.exe\\.blockmap$`),
  new RegExp(`^Native-${escape(version)}-x86_64\\.AppImage$`),
  new RegExp(`^Native-${escape(version)}-arm64\\.AppImage$`),
  new RegExp(`^Native-${escape(version)}-x64\\.dmg$`),
  new RegExp(`^Native-${escape(version)}-arm64\\.dmg$`),
  new RegExp(`^Native-${escape(version)}-x64\\.zip$`),
  new RegExp(`^Native-${escape(version)}-arm64\\.zip$`),
  new RegExp(`^Native-${escape(version)}-x64\\.zip\\.blockmap$`),
  new RegExp(`^Native-${escape(version)}-arm64\\.zip\\.blockmap$`),
  new RegExp(`^${channel}\\.yml$`),
  new RegExp(`^${channel}-linux\\.yml$`),
  new RegExp(`^${channel}-linux-arm64\\.yml$`),
  new RegExp(`^${channel}-mac\\.yml$`)
]
for (const pattern of required) {
  if (!names.some((name) => pattern.test(name))) {
    throw new Error(`Missing release asset matching ${pattern}`)
  }
}

const expectedFeeds = {
  [`${channel}.yml`]: [/-x64\.exe$/i, /-arm64\.exe$/i],
  [`${channel}-linux.yml`]: [/-x86_64\.AppImage$/],
  [`${channel}-linux-arm64.yml`]: [/-arm64\.AppImage$/],
  [`${channel}-mac.yml`]: [/-x64\.zip$/i, /-arm64\.zip$/i]
}

for (const [name, patterns] of Object.entries(expectedFeeds)) {
  const asset = assets.get(name)
  const feedResponse = await fetch(asset.browser_download_url)
  if (!feedResponse.ok) throw new Error(`Cannot download ${name}: HTTP ${feedResponse.status}`)
  const text = await feedResponse.text()
  if (!new RegExp(`^version:\\s*['\"]?${escape(version)}['\"]?\\s*$`, 'm').test(text)) {
    throw new Error(`${name} does not describe version ${version}`)
  }
  const entries = parseFeedEntries(text)
  for (const pattern of patterns) {
    if (!entries.some((entry) => pattern.test(entry.url))) {
      throw new Error(`${name} is missing update payload matching ${pattern}`)
    }
  }
  for (const entry of entries) {
    if (!entry.sha512 || !entry.size) throw new Error(`${name} has incomplete metadata for ${entry.url}`)
    const target = fileName(entry.url)
    if (!assets.has(target)) throw new Error(`${name} references unpublished asset ${target}`)
  }
}

for (const asset of release.assets) {
  if (!asset.size) throw new Error(`Empty release asset: ${asset.name}`)
  const head = await fetch(asset.browser_download_url, { method: 'HEAD', redirect: 'manual' })
  if (head.status !== 302 && !head.ok) {
    throw new Error(`Anonymous download failed for ${asset.name}: HTTP ${head.status}`)
  }
}

console.log(`Verified ${release.assets.length} public assets and all update feeds for ${repo}@${tag}`)

function parseFeedEntries(text) {
  const entries = []
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const url = /^\s*-\s+url:\s*['\"]?(.+?)['\"]?\s*$/.exec(line)
    if (url) {
      current = { url: url[1], sha512: '', size: 0 }
      entries.push(current)
      continue
    }
    if (!current) continue
    const sha = /^\s+sha512:\s*['\"]?(.+?)['\"]?\s*$/.exec(line)
    if (sha) current.sha512 = sha[1]
    const size = /^\s+size:\s*(\d+)\s*$/.exec(line)
    if (size) current.size = Number(size[1])
  }
  return entries
}

function fileName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop())
  } catch {
    return decodeURIComponent(url.split('/').pop())
  }
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
