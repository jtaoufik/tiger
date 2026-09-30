import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Sidebar } from '../../src/renderer/src/components/Sidebar'
import { RequestTabs, tabAccessibleName } from '../../src/renderer/src/components/RequestTabs'
import { WelcomeView } from '../../src/renderer/src/components/WelcomeView'
import { setLocale } from '../../src/renderer/src/i18n'

afterEach(async () => {
  await act(() => setLocale('en'))
})

const noop = () => {}
const sidebarProps = {
  collections: [
    {
      id: 'c1',
      name: 'Shop API',
      entries: [{ id: 'r1', name: 'List posts', method: 'get' as const, folderPath: [] }]
    }
  ],
  activeId: null,
  syncStates: {},
  onSelect: noop,
  onOpenCollection: noop,
  onNewCollection: noop,
  onClone: noop,
  onImportExport: noop,
  onNewRequest: noop,
  onCloseCollection: noop,
  onDeleteRequest: noop,
  onDuplicateRequest: noop,
  onGit: noop,
  onRequestMenu: noop,
  onCollectionMenu: noop,
  onInspectCollection: noop,
  onInspectFolder: noop,
  onEmptyMenu: noop,
  onRenameRequest: noop,
  onRenameFolder: noop,
  onDuplicateFolder: noop,
  onMoveRequest: noop
}

describe('Sidebar in French', () => {
  it('translates labels and keeps "<METHOD> <name>" tree item names', async () => {
    await act(() => setLocale('fr'))
    render(<Sidebar {...sidebarProps} />)
    expect(screen.getByRole('tree', { name: 'Collections' })).toBeInTheDocument()
    expect(screen.getByRole('treeitem', { name: 'GET List posts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Rechercher des requêtes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dupliquer la requête' })).toBeInTheDocument()
  })

  it('translates the empty state and switches live', async () => {
    render(<Sidebar {...sidebarProps} collections={[]} />)
    expect(screen.getByText('No collections open.')).toBeInTheDocument()
    await act(() => setLocale('ar'))
    expect(screen.getByText('لا توجد مجموعات مفتوحة.')).toBeInTheDocument()
  })
})

describe('RequestTabs in Arabic', () => {
  it('translates the strip label and the tab accessible names', async () => {
    await act(() => setLocale('ar'))
    const tabs = [
      { key: 'a', kind: 'folder' as const, label: 'Orders' },
      { key: 'b', kind: 'request' as const, label: 'Health', method: 'get' as const, dirty: true }
    ]
    render(
      <RequestTabs tabs={tabs} activeKey="a" onSelect={noop} onClose={noop} onTabMenu={noop} onReorder={noop} />
    )
    expect(screen.getByRole('tablist', { name: 'علامات التبويب المفتوحة' })).toBeInTheDocument()
    // Latin runs are wrapped in invisible left-to-right isolates in Arabic.
    const plain = (s: string) => s.replace(/[\u2066-\u2069]/g, '')
    expect(tabAccessibleName(tabs[0])).toBe('المجلد \u2066Orders\u2069')
    expect(
      screen.getByRole('tab', { name: (name) => plain(name) === 'GET Health، تغييرات غير محفوظة' })
    ).toBeInTheDocument()
  })
})

describe('WelcomeView in French', () => {
  it('translates the checklist, cards and footer', async () => {
    await act(() => setLocale('fr'))
    const onImport = vi.fn()
    render(
      <WelcomeView
        version="0.8.0"
        onOpenCollection={noop}
        onNewCollection={noop}
        onClone={noop}
        onImportExport={noop}
        onImport={onImport}
        onNewRequest={noop}
        onPalette={noop}
        onHistory={noop}
        onEnvironments={noop}
        onSettings={noop}
        onGit={noop}
      />
    )
    expect(screen.getByRole('heading', { name: 'Bienvenue dans Tiger' })).toBeInTheDocument()
    expect(screen.getByText('Premiers pas')).toBeInTheDocument()
    expect(screen.getByText('Ouvrir ou créer une collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer depuis Postman' })).toBeInTheDocument()
    expect(screen.getByText('Version 0.8.0')).toBeInTheDocument()
  })
})
