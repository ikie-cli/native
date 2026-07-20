import type { ArgValue, Library, OsRule } from './mojang-types'

export interface RuleContext {
  osName: 'windows' | 'linux' | 'osx'
  osArch: 'x64' | 'arm64' | 'x86'
  osVersion?: string
  features: Record<string, boolean>
}

/** Mojang rule arch strings: 'x86' means 32-bit; 'x64'/'arm64' as expected. */
function archMatches(ruleArch: string, ctx: RuleContext): boolean {
  return ruleArch === ctx.osArch
}

function ruleMatches(rule: OsRule, ctx: RuleContext): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== ctx.osName) return false
    if (rule.os.arch && !archMatches(rule.os.arch, ctx)) return false
    if (rule.os.version && ctx.osVersion && !new RegExp(rule.os.version).test(ctx.osVersion)) {
      return false
    }
  }
  if (rule.features) {
    for (const [feat, want] of Object.entries(rule.features)) {
      if ((ctx.features[feat] ?? false) !== want) return false
    }
  }
  return true
}

/** Evaluate a rule list: default deny when rules exist; last matching rule wins. */
export function rulesAllow(rules: OsRule[] | undefined, ctx: RuleContext): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (ruleMatches(rule, ctx)) allowed = rule.action === 'allow'
  }
  return allowed
}

export function libraryApplies(lib: Library, ctx: RuleContext): boolean {
  return rulesAllow(lib.rules, ctx)
}

/** Flatten modern `arguments` arrays applying rules. */
export function resolveArgs(args: ArgValue[] | undefined, ctx: RuleContext): string[] {
  if (!args) return []
  const out: string[] = []
  for (const a of args) {
    if (typeof a === 'string') {
      out.push(a)
    } else if (rulesAllow(a.rules, ctx)) {
      if (Array.isArray(a.value)) out.push(...a.value)
      else out.push(a.value)
    }
  }
  return out
}

/** `${var}` template substitution; unknown vars resolve to empty string. */
export function substitute(args: string[], vars: Record<string, string>): string[] {
  return args.map((a) =>
    a.replace(/\$\{([^}]+)\}/g, (_, key: string) => vars[key] ?? '')
  )
}

/**
 * Maven coordinate → repo-relative path.
 * `group:artifact:version[:classifier][@ext]` → group/artifact/version/artifact-version[-classifier].ext
 */
export function mavenToPath(coord: string): string {
  let ext = 'jar'
  let rest = coord
  const atIdx = coord.lastIndexOf('@')
  if (atIdx > -1) {
    ext = coord.slice(atIdx + 1)
    rest = coord.slice(0, atIdx)
  }
  const parts = rest.split(':')
  if (parts.length < 3) throw new Error(`bad maven coordinate: ${coord}`)
  const [group, artifact, version, classifier] = parts
  const file = classifier
    ? `${artifact}-${version}-${classifier}.${ext}`
    : `${artifact}-${version}.${ext}`
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${file}`
}
