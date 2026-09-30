import { useEffect, useRef, useState } from 'react'
import { UploadIcon } from './Icons'
import { useT } from '../i18n'
import './ImportDropZone.css'

interface Props {
  /** Absolute paths of the dropped files and folders. */
  onDropPaths: (paths: string[]) => void
  /** Resolves a dropped File to its disk path (Electron's webUtils). */
  pathForFile?: (file: File) => string
  /** False while a modal is open: drops are ignored then. */
  enabled?: boolean
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/**
 * Window-wide drop target for exports from other tools. Only drags that carry
 * files from the OS react, so the sidebar's own drag and drop is untouched.
 * The overlay is visual only; the Import dialog is the keyboard path.
 */
export function ImportDropZone({ onDropPaths, pathForFile, enabled = true }: Props) {
  const t = useT()
  const [active, setActive] = useState(false)
  const depth = useRef(0)
  const onDropRef = useRef(onDropPaths)
  const enabledRef = useRef(enabled)
  useEffect(() => {
    onDropRef.current = onDropPaths
    enabledRef.current = enabled
    if (!enabled) setActive(false)
  }, [onDropPaths, enabled])

  // Listeners stay installed even while disabled: an unhandled file drop
  // would otherwise make Chromium navigate the window to that file.
  useEffect(() => {
    if (!pathForFile) return
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current++
      if (enabledRef.current) setActive(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = enabledRef.current ? 'copy' : 'none'
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setActive(false)
      if (!enabledRef.current) return
      const paths = Array.from(e.dataTransfer?.files ?? [])
        .map((f) => {
          try {
            return pathForFile(f)
          } catch {
            return ''
          }
        })
        .filter(Boolean)
      if (paths.length) onDropRef.current(paths)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
      depth.current = 0
      setActive(false)
    }
  }, [pathForFile])

  if (!active) return null
  return (
    <div className="import-drop" aria-hidden="true">
      <div className="import-drop-card">
        <UploadIcon size={28} />
        <div className="import-drop-title">{t('modals.dropZone.title')}</div>
        <div className="import-drop-desc">{t('modals.dropZone.desc')}</div>
      </div>
    </div>
  )
}
