import { describe, expect, it } from 'vitest'
import {
  lastSegment,
  movedRequestPath,
  renamedFolderPath,
  uniqueCopyName
} from '../../src/core/treeMove'

describe('movedRequestPath', () => {
  it('moves a file into a nested target folder', () => {
    expect(movedRequestPath('/c', '/c/posts/get.tiger', ['users', 'admin'])).toBe(
      '/c/users/admin/get.tiger'
    )
  })

  it('moves a file to the collection root', () => {
    expect(movedRequestPath('/c', '/c/posts/get.tiger', [])).toBe('/c/get.tiger')
  })

  it('handles windows-style separators in the source path', () => {
    expect(lastSegment('C:\\col\\posts\\get.tiger')).toBe('get.tiger')
  })
})

describe('renamedFolderPath', () => {
  it('renames the segment for entries inside the folder', () => {
    expect(renamedFolderPath(['posts'], ['posts'], 'articles')).toEqual(['articles'])
    expect(renamedFolderPath(['posts', 'drafts'], ['posts'], 'articles')).toEqual([
      'articles',
      'drafts'
    ])
  })

  it('returns null for entries outside the folder', () => {
    expect(renamedFolderPath(['users'], ['posts'], 'articles')).toBeNull()
    expect(renamedFolderPath([], ['posts'], 'articles')).toBeNull()
  })

  it('only renames the exact subtree, not name prefixes', () => {
    expect(renamedFolderPath(['posts-old'], ['posts'], 'articles')).toBeNull()
  })

  it('renames nested folders at the right depth', () => {
    expect(renamedFolderPath(['api', 'posts', 'x'], ['api', 'posts'], 'articles')).toEqual([
      'api',
      'articles',
      'x'
    ])
  })
})

describe('uniqueCopyName', () => {
  it('appends copy, then numbers, avoiding existing names', () => {
    expect(uniqueCopyName('Posts', ['Users'])).toBe('Posts copy')
    expect(uniqueCopyName('Posts', ['Posts copy'])).toBe('Posts copy 2')
    expect(uniqueCopyName('Posts', ['Posts copy', 'Posts copy 2'])).toBe('Posts copy 3')
  })
})
