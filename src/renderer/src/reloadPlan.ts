/**
 * After a git operation rewrote a collection's files on disk, the in-memory
 * copies must be dropped so they reload. A request with unsaved edits is the
 * exception: those edits exist nowhere else (a sync commits only what is on
 * disk), so it stays in memory and the user is told how many were kept.
 * Pure, so the rule is unit-tested without the app.
 */
export interface ReloadPlan {
  /** Ids whose in-memory copy and saved-text baseline are dropped. */
  drop: string[]
  /** Ids kept because they hold unsaved edits. */
  kept: string[]
}

export function planReload(ids: Iterable<string>, isDirty: (id: string) => boolean): ReloadPlan {
  const plan: ReloadPlan = { drop: [], kept: [] }
  for (const id of ids) (isDirty(id) ? plan.kept : plan.drop).push(id)
  return plan
}
