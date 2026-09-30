import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PaletteModal } from '../../src/renderer/src/components/PaletteModal'
import { shortcutGroups, ShortcutsModal } from '../../src/renderer/src/components/ShortcutsModal'
import {
  SHORTCUT_GROUPS,
  actionDescription,
  actionLabel,
  paletteActions,
  type ActionId
} from '../../src/core/actions'
import { englishT as t } from '../../src/core/i18n/english'
import { actionItem } from '../../src/renderer/src/actions'

const items = [{ id: 'a', name: 'List users', collection: 'Demo', method: 'get' }]

describe('shortcuts overlay reads the action registry', () => {
  it('lists every registry shortcut group, labelled as the registry names it', () => {
    expect(shortcutGroups(t).map((g) => g.title)).toEqual(SHORTCUT_GROUPS.map((g) => t(g.titleKey)))
    render(<ShortcutsModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    for (const g of SHORTCUT_GROUPS) {
      for (const id of g.ids) {
        expect(within(dialog).getByText(actionLabel(id, t), { selector: '.shortcut-what' })).toBeInTheDocument()
      }
    }
  })
})

describe('command palette reads the action registry', () => {
  it('offers requests and commands under one name', () => {
    render(<PaletteModal items={items} onPick={() => {}} onCommand={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Requests' })).toBeInTheDocument()
    const commands = screen.getByRole('group', { name: 'Commands' })
    const first = paletteActions()[0]
    expect(within(commands).getByText(actionLabel(first.id as ActionId, t))).toBeInTheDocument()
    expect(within(commands).getByText(actionDescription(first.id as ActionId, t))).toBeInTheDocument()
  })

  it('lists only commands after ">" and runs the picked one by id', () => {
    const onCommand = vi.fn()
    render(<PaletteModal items={items} onPick={() => {}} onCommand={onCommand} onClose={() => {}} />)
    const input = screen.getByRole('combobox', { name: 'Command palette' })
    fireEvent.change(input, { target: { value: '> load test' } })
    expect(screen.queryByRole('group', { name: 'Requests' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Load test')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommand).toHaveBeenCalledWith('load-test')
  })

  it('finds a renamed feature by its old name', () => {
    render(<PaletteModal items={items} onPick={() => {}} onCommand={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'perf' } })
    expect(screen.getByRole('option', { name: /Load test/ })).toBeInTheDocument()
  })
})

describe('context menu items come from the registry', () => {
  it('uses the registry label, with an ellipsis for dialogs', () => {
    const onClick = vi.fn()
    const item = actionItem('copy-curl', onClick)
    expect(item).toMatchObject({ label: 'Copy as curl', onClick })
    expect(actionItem('new-folder', onClick)).toMatchObject({ label: 'New folder…' })
  })
})
