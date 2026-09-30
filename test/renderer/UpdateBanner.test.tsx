import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UpdateBanner } from '../../src/renderer/src/components/UpdateBanner'
import { UpdateModal } from '../../src/renderer/src/components/UpdateModal'
import { updateBanner, type UpdateState } from '../../src/core/updateState'

function banner(state: UpdateState) {
  const handlers = {
    onRestart: vi.fn(),
    onDownload: vi.fn(),
    onLater: vi.fn(),
    onOpenExternal: vi.fn()
  }
  const utils = render(<UpdateBanner kind={updateBanner(state)} state={state} {...handlers} />)
  return { ...utils, ...handlers }
}

describe('UpdateBanner', () => {
  it('renders nothing when there is no banner to show', () => {
    const { container } = banner({ status: 'up-to-date' })
    expect(container).toBeEmptyDOMElement()
    expect(banner({ status: 'error', message: 'offline' }).container).toBeEmptyDOMElement()
  })

  it('downloading: a quiet progress pill, not a live region', () => {
    const { container, onLater } = banner({ status: 'downloading', version: '0.7.1', percent: 42 })
    expect(screen.getByText('Downloading update 0.7.1… 42%')).toBeInTheDocument()
    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(container.querySelector('.update-bar > span')).toHaveStyle({ width: '42%' })
    fireEvent.click(screen.getByRole('button', { name: 'Hide update progress' }))
    expect(onLater).toHaveBeenCalled()
  })

  it('downloaded: Restart now / Later / Release notes', () => {
    const { onRestart, onLater, onOpenExternal } = banner({ status: 'downloaded', version: '0.7.1' })
    expect(screen.getByRole('region', { name: 'Software update' })).toHaveTextContent(
      'Tiger 0.7.1 is ready. Restart to update.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }))
    expect(onRestart).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(onLater).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Release notes' }))
    expect(onOpenExternal).toHaveBeenCalledWith(
      'https://github.com/jtaoufik/tiger/releases/tag/v0.7.1'
    )
  })

  it('available (automatic install off): offers Download', () => {
    const { onDownload } = banner({ status: 'available', version: '0.7.1' })
    expect(screen.getByText('Tiger 0.7.1 is available.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restart now' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(onDownload).toHaveBeenCalled()
  })
})

describe('UpdateModal (in-app updates)', () => {
  function modal(state: UpdateState) {
    const handlers = {
      onRetry: vi.fn(),
      onDownload: vi.fn(),
      onRestart: vi.fn(),
      onOpenExternal: vi.fn(),
      onClose: vi.fn()
    }
    render(<UpdateModal kind="auto" state={state} currentVersion="0.7.0" {...handlers} />)
    return handlers
  }

  it('checking', () => {
    modal({ status: 'checking' })
    expect(screen.getByRole('dialog', { name: 'Software update' })).toHaveAccessibleDescription(
      'Checking for updates…'
    )
  })

  it('up to date', () => {
    const h = modal({ status: 'up-to-date' })
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Tiger 0.7.0 is the latest version.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(h.onClose).toHaveBeenCalled()
  })

  it('downloading shows a progress bar and can continue in the background', () => {
    const h = modal({ status: 'downloading', version: '0.7.1', percent: 42 })
    expect(screen.getByRole('progressbar', { name: 'Downloading update 0.7.1' })).toHaveAttribute(
      'value',
      '42'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue in background' }))
    expect(h.onClose).toHaveBeenCalled()
  })

  it('downloaded offers Restart now', () => {
    const h = modal({ status: 'downloaded', version: '0.7.1' })
    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }))
    expect(h.onRestart).toHaveBeenCalled()
  })

  it('error falls back to the website download and can retry', () => {
    const h = modal({ status: 'error', message: 'No update is published for this platform yet.' })
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'No update is published for this platform yet.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(h.onRetry).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Download from website' }))
    expect(h.onOpenExternal).toHaveBeenCalledWith('https://jtaoufik.github.io/tiger/#download')
  })

  it('manual (website) flow still links the download page', () => {
    const onDownload = vi.fn()
    render(
      <UpdateModal
        kind="manual"
        info={{ latest: '0.7.1', url: 'https://example.com', notes: ['Faster'] }}
        currentVersion="0.7.0"
        onDownload={onDownload}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }))
    expect(onDownload).toHaveBeenCalled()
  })
})
