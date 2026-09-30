/**
 * The lazily loaded surfaces (see lazy.tsx). Import these instead of the
 * component modules so the modules stay out of the startup chunk.
 */
import { lazySurface } from './lazy'

export const SettingsView = lazySurface(
  () => import('./components/SettingsView').then((m) => m.SettingsView),
  'settings'
)
export const RunnerModal = lazySurface(
  () => import('./components/RunnerModal').then((m) => m.RunnerModal),
  'the collection runner',
  true
)
export const GitModal = lazySurface(
  () => import('./components/GitModal').then((m) => m.GitModal),
  'team sync',
  true
)
export const ImportExportModal = lazySurface(
  () => import('./components/ImportExportModal').then((m) => m.ImportExportModal),
  'import and export',
  true
)
export const HistoryModal = lazySurface(
  () => import('./components/HistoryModal').then((m) => m.HistoryModal),
  'history',
  true
)
export const ShortcutsModal = lazySurface(
  () => import('./components/ShortcutsModal').then((m) => m.ShortcutsModal),
  'keyboard shortcuts',
  true
)
export const EnvironmentsModal = lazySurface(
  () => import('./components/EnvironmentsModal').then((m) => m.EnvironmentsModal),
  'environments',
  true
)
export const PerfPane = lazySurface(
  () => import('./components/PerfPane').then((m) => m.PerfPane),
  'the load test'
)
export const CodePane = lazySurface(
  () => import('./components/CodePane').then((m) => m.CodePane),
  'the code snippet'
)
