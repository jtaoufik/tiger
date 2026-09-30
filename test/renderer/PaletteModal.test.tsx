import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { setLocale } from '../../src/renderer/src/i18n'
import { PaletteModal } from '../../src/renderer/src/components/PaletteModal'

const items = [
  { id: 'a', name: 'List users', collection: 'Demo', method: 'get' },
  { id: 'b', name: 'Create user', collection: 'Demo', method: 'post' },
  { id: 'c', name: 'Delete post', collection: 'Blog', method: 'delete' }
]

describe('PaletteModal combobox', () => {
  it('is a combobox wired to a listbox with the first option active', () => {
    render(<PaletteModal items={items} onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Go to request' })).toBeInTheDocument()
    const input = screen.getByRole('combobox', { name: 'Go to request' })
    expect(input).toHaveFocus()
    const list = screen.getByRole('listbox')
    expect(input).toHaveAttribute('aria-controls', list.id)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('moves the active option with arrows (wrapping) and opens it with Enter', () => {
    const onPick = vi.fn()
    render(<PaletteModal items={items} onPick={onPick} onClose={() => {}} />)
    const input = screen.getByRole('combobox')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    let options = screen.getAllByRole('option')
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    options = screen.getAllByRole('option')
    expect(input).toHaveAttribute('aria-activedescendant', options[2].id)
    expect(options[2]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(input, { key: 'Enter' })
    const expected = items.find((it) => options[2].textContent?.includes(it.name))!.id
    expect(onPick).toHaveBeenCalledWith(expected)
  })

  it('announces the result count and handles no results', () => {
    render(<PaletteModal items={items} onPick={() => {}} onClose={() => {}} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'user' } })
    expect(screen.getByRole('status')).toHaveTextContent('2 matching requests')
    fireEvent.change(input, { target: { value: 'zzzz' } })
    expect(screen.getByRole('status')).toHaveTextContent('No matching requests')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('closes on Esc', () => {
    const onClose = vi.fn()
    render(<PaletteModal items={items} onPick={() => {}} onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  afterEach(async () => {
    await act(() => setLocale('en'))
  })

  it('renders in French and Arabic', async () => {
    await act(() => setLocale('fr'))
    const { unmount } = render(<PaletteModal items={items} onPick={() => {}} onCommand={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Palette de commandes' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Rechercher des requêtes et des commandes…')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('3 requêtes et 6 commandes')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz' } })
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument()
    unmount()
    await act(() => setLocale('ar'))
    render(<PaletteModal items={items} onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'الانتقال إلى طلب' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('3 طلبات')
  })
})
