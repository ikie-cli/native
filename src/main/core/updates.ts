/**
 * Pure update-selection logic for installed content files.
 * Kept dependency-free so it unit-tests like rules/args.
 */

export interface UpdateCandidate {
  id: string
  datePublished: string
}

/**
 * Given the installed version id and the project's version list already
 * filtered for the instance (mc version + loader), return the version to
 * update to, or null when the install is current.
 *
 * The list is sorted here (newest first) rather than trusting API order.
 * An installed version that is absent from the compatible list (e.g. the
 * instance moved to a newer Minecraft version) offers the newest compatible
 * build — that is the update the user can actually run.
 */
export function pickUpdate<T extends UpdateCandidate>(
  installedVersionId: string | null,
  versions: T[]
): T | null {
  if (!installedVersionId || versions.length === 0) return null
  const sorted = [...versions].sort(
    (a, b) => Date.parse(b.datePublished) - Date.parse(a.datePublished)
  )
  const newest = sorted[0]
  if (newest.id === installedVersionId) return null
  const installed = sorted.find((v) => v.id === installedVersionId)
  if (!installed) return newest
  return Date.parse(newest.datePublished) > Date.parse(installed.datePublished) ? newest : null
}
