import { describe, expect, it } from 'vitest'
import { classifyDiffLine, splitDiff } from '../../src/core/diffView'

describe('classifyDiffLine', () => {
  it('classifies additions and deletions', () => {
    expect(classifyDiffLine('+  url: {{baseUrl}}/posts')).toBe('add')
    expect(classifyDiffLine('-  url: {{old}}/posts')).toBe('del')
  })

  it('does not mistake file headers for changes', () => {
    expect(classifyDiffLine('+++ b/get-user.tiger')).toBe('meta')
    expect(classifyDiffLine('--- a/get-user.tiger')).toBe('meta')
  })

  it('classifies hunk headers and diff headers', () => {
    expect(classifyDiffLine('@@ -1,4 +1,4 @@')).toBe('hunk')
    expect(classifyDiffLine('diff --git a/x b/x')).toBe('meta')
    expect(classifyDiffLine('index 3f1a2b..9c4d5e 100644')).toBe('meta')
  })

  it('leaves context lines plain', () => {
    expect(classifyDiffLine(' meta {')).toBe('ctx')
  })
})

describe('splitDiff', () => {
  it('splits a diff into classified lines', () => {
    const diff = 'diff --git a/x b/x\n@@ -1 +1 @@\n-old\n+new\n ctx'
    expect(splitDiff(diff).map((l) => l.kind)).toEqual(['meta', 'hunk', 'del', 'add', 'ctx'])
  })

  it('handles an empty diff', () => {
    expect(splitDiff('')).toEqual([])
  })
})
