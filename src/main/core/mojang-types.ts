/** Mojang piston-meta version JSON shapes (fields we consume). */

export interface OsRule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export type ArgValue = string | { rules: OsRule[]; value: string | string[] }

export interface Artifact {
  path?: string
  sha1?: string
  size?: number
  url: string
}

export interface Library {
  name: string
  downloads?: {
    artifact?: Artifact
    classifiers?: Record<string, Artifact>
  }
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  rules?: OsRule[]
  url?: string // maven base (fabric/forge style)
}

export interface VersionJson {
  id: string
  type: string
  inheritsFrom?: string
  mainClass: string
  arguments?: { game?: ArgValue[]; jvm?: ArgValue[] }
  minecraftArguments?: string // legacy (<1.13)
  assetIndex?: { id: string; sha1: string; size: number; totalSize?: number; url: string }
  assets?: string
  javaVersion?: { component: string; majorVersion: number }
  downloads?: { client?: Artifact; server?: Artifact }
  libraries: Library[]
  logging?: {
    client?: { argument: string; file: { id: string; sha1: string; size: number; url: string } }
  }
  releaseTime?: string
  complianceLevel?: number
}

export interface AssetIndexFile {
  map_to_resources?: boolean
  virtual?: boolean
  objects: Record<string, { hash: string; size: number }>
}
