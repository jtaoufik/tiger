import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import {
  ImportReportModal,
  importReportSentence
} from '../../src/renderer/src/components/ImportReportModal'
import { ImportDropZone } from '../../src/renderer/src/components/ImportDropZone'
import { WelcomeView } from '../../src/renderer/src/components/WelcomeView'
import type { ImportSummary } from '../../src/core/import'
import { setLocale } from '../../src/renderer/src/i18n'

const summary: ImportSummary = {
  name: 'Shop API',
  requests: 12,
  folders: 4,
  environments: 1,
  items: [
    { request: 'Create order', path: ['Checkout'], messages: ['Uses pm.sendRequest.', 'Uses {{$randomFirstName}}.'] },
    { request: 'Legacy SOAP ping', path: [], messages: ['Digest auth is not supported.'] }
  ]
}

describe('ImportReportModal', () => {
  afterEach(async () => {
    await act(() => setLocale('en'))
  })

  it('renders in French, translating warnings that carry a key', async () => {
    await act(() => setLocale('fr'))
    const fr = {
      ...summary,
      items: [
        {
          request: 'Legacy SOAP ping',
          path: [],
          messages: ['Digest auth is not supported. Auth was set to none; set it up again.'],
          i18n: [{ key: 'imports.authUnsupported' as const, vars: { auth: 'Digest' } }]
        }
      ]
    }
    render(<ImportReportModal summary={fr} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Shop API importé' })
    expect(within(dialog).getByRole('heading', { name: 'À vérifier' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('L’authentification Digest n’est pas prise en charge.')
    expect(importReportSentence(fr)).toBe(
      'Importé : 12 requêtes, 4 dossiers, 1 environnement depuis Shop API. 1 élément à vérifier.'
    )
  })

  it('is a labelled dialog with the three counts and the items to check', () => {
    render(<ImportReportModal summary={summary} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Imported Shop API' })
    expect(dialog).toHaveAccessibleDescription('Shop API is open in the sidebar.')
    const stats = within(dialog).getByLabelText('Imported')
    expect(stats).toHaveTextContent('requests12')
    expect(stats).toHaveTextContent('folders4')
    expect(stats).toHaveTextContent('environment1')
    expect(within(dialog).getByRole('heading', { name: 'Check these 2' })).toBeInTheDocument()
    const items = within(dialog).getAllByRole('listitem').filter((li) => li.className === 'import-report-item')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Create order')
    expect(items[0]).toHaveTextContent('in Checkout')
    expect(items[0]).toHaveTextContent('Uses pm.sendRequest.')
    // Focus lands on Done.
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus()
  })

  it('says everything mapped when there is nothing to check, and closes on Done', () => {
    const onClose = vi.fn()
    render(<ImportReportModal summary={{ ...summary, items: [] }} onClose={onClose} />)
    expect(screen.getByText(/Everything mapped cleanly/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('explains where environments went for an environment-only import', () => {
    render(
      <ImportReportModal
        summary={{ ...summary, requests: 0, folders: 0, items: [] }}
        environmentsTarget="Demo"
        onClose={() => {}}
      />
    )
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'The environments were added to Demo. Pick one from the environment menu.'
    )
  })

  it('builds a one-line announcement', () => {
    expect(importReportSentence(summary)).toBe(
      'Imported 12 requests, 4 folders, 1 environment from Shop API. 2 items to check.'
    )
  })
})

describe('WelcomeView switcher cards', () => {
  const noop = () => {}
  const props = {
    version: '0.7.0',
    onOpenCollection: noop,
    onNewCollection: noop,
    onClone: noop,
    onImportExport: noop,
    onNewRequest: noop,
    onPalette: noop,
    onHistory: noop,
    onEnvironments: noop,
    onSettings: noop,
    onGit: noop
  }

  it('offers Import from Postman / Insomnia / Bruno next to Open and New', () => {
    render(<WelcomeView {...props} />)
    const tiles = screen.getAllByRole('button').filter((b) => b.classList.contains('primary'))
    const names = tiles.map((b) => b.querySelector('.t')?.textContent)
    expect(names.indexOf('Import from Postman / Insomnia / Bruno')).toBeGreaterThan(names.indexOf('Open a collection'))
    expect(names).toContain('New collection')
  })

  it('shows per-tool cards with export hints when onImport is given', () => {
    const onImport = vi.fn()
    render(<WelcomeView {...props} onImport={onImport} />)
    const postman = screen.getByRole('button', { name: 'Import from Postman' })
    expect(postman).toHaveAccessibleDescription(/Where to find it: open the \.\.\. menu next to the collection/)
    expect(screen.getByRole('button', { name: 'Import from Bruno' })).toHaveAccessibleDescription(/bruno\.json/)
    fireEvent.click(screen.getByRole('button', { name: 'Import from Insomnia' }))
    expect(onImport).toHaveBeenCalledWith('insomnia')
  })

  it('shows no cards when the app does not offer them (a real collection is open)', () => {
    render(<WelcomeView {...props} hasCollection />)
    expect(screen.queryByRole('button', { name: 'Import from Postman' })).toBeNull()
  })
})

function dragEvent(type: string, files: File[] = []): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { types: files.length || type !== 'drop' ? ['Files'] : [], files, dropEffect: 'none' }
  })
  return event
}

describe('ImportDropZone', () => {
  it('shows an overlay while files are dragged and imports the dropped paths', () => {
    const onDrop = vi.fn()
    const file = new File(['{}'], 'shop.postman_collection.json')
    render(<ImportDropZone onDropPaths={onDrop} pathForFile={(f) => `/tmp/${f.name}`} />)
    act(() => {
      window.dispatchEvent(dragEvent('dragenter'))
    })
    expect(screen.getByText('Drop to import')).toBeInTheDocument()
    const drop = dragEvent('drop', [file])
    act(() => {
      window.dispatchEvent(drop)
    })
    expect(drop.defaultPrevented).toBe(true)
    expect(onDrop).toHaveBeenCalledWith(['/tmp/shop.postman_collection.json'])
    expect(screen.queryByText('Drop to import')).toBeNull()
  })

  it('ignores drags without files (the sidebar tree) and swallows drops while disabled', () => {
    const onDrop = vi.fn()
    render(<ImportDropZone onDropPaths={onDrop} pathForFile={(f) => f.name} enabled={false} />)
    const internal = new Event('dragenter', { bubbles: true, cancelable: true })
    Object.defineProperty(internal, 'dataTransfer', { value: { types: ['application/x-tiger-request'] } })
    act(() => {
      window.dispatchEvent(internal)
    })
    expect(internal.defaultPrevented).toBe(false)
    const drop = dragEvent('drop', [new File(['x'], 'a.json')])
    act(() => {
      window.dispatchEvent(drop)
    })
    // Prevented (so the window never navigates to the file) but not imported.
    expect(drop.defaultPrevented).toBe(true)
    expect(onDrop).not.toHaveBeenCalled()
  })
})
