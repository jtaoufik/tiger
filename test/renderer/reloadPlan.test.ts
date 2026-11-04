import { describe, expect, it } from 'vitest'
import { planReload } from '../../src/renderer/src/reloadPlan'

describe('planReload (cache invalidation after a git operation)', () => {
  it('drops clean requests and keeps the ones with unsaved edits', () => {
    const dirty = new Set(['b'])
    const plan = planReload(['a', 'b', 'c'], (id) => dirty.has(id))
    expect(plan.drop).toEqual(['a', 'c'])
    expect(plan.kept).toEqual(['b'])
  })

  it('drops everything when nothing is dirty', () => {
    expect(planReload(['a', 'b'], () => false)).toEqual({ drop: ['a', 'b'], kept: [] })
  })

  it('handles an empty collection', () => {
    expect(planReload([], () => true)).toEqual({ drop: [], kept: [] })
  })
})
