/**
 * The lazily loaded surfaces (see lazy.tsx). Import these instead of the
 * component modules so the modules stay out of the startup chunk.
 */
import { lazySurface } from './lazy'

export const SettingsView = lazySurface(
  () => import('./components/SettingsView').then((m) => m.SettingsView),
  'sidebar.lazy.settings'
)
export const RunnerModal = lazySurface(
  () => import('./components/RunnerModal').then((m) => m.RunnerModal),
  'sidebar.lazy.runner',
  true
)
export const GitModal = lazySurface(
  () => import('./components/GitModal').then((m) => m.GitModal),
  'sidebar.lazy.teamSync',
  true
)
export const ImportExportModal = lazySurface(
  () => import('./components/ImportExportModal').then((m) => m.ImportExportModal),
  'sidebar.lazy.importExport',
  true
)
export const HistoryModal = lazySurface(
  () => import('./components/HistoryModal').then((m) => m.HistoryModal),
  'sidebar.lazy.history',
  true
)
export const ShortcutsModal = lazySurface(
  () => import('./components/ShortcutsModal').then((m) => m.ShortcutsModal),
  'sidebar.lazy.shortcuts',
  true
)
export const EnvironmentsModal = lazySurface(
  () => import('./components/EnvironmentsModal').then((m) => m.EnvironmentsModal),
  'sidebar.lazy.environments',
  true
)
export const PerfPane = lazySurface(
  () => import('./components/PerfPane').then((m) => m.PerfPane),
  'sidebar.lazy.loadTest'
)
export const CodePane = lazySurface(
  () => import('./components/CodePane').then((m) => m.CodePane),
  'sidebar.lazy.codeSnippet'
)
