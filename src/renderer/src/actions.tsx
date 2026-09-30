/**
 * Renderer side of the action registry (src/core/actions.ts): icons, and the
 * helpers that turn a registry entry into a context-menu item or a tooltip.
 * Labels always come from the registry, never from a string literal here,
 * translated with the active language (components call useT(), so they
 * re-render and call these again on a language switch).
 */
import type { ReactNode } from 'react'
import { actionLabel as registryLabel, menuLabel, tooltip, type ActionId } from '@core/actions'
import { currentTranslator } from './i18n'
import type { MenuItem } from './components/ContextMenu'
import { MOD } from './platform'
import {
  BookIcon,
  BugIcon,
  ClockIcon,
  CloseIcon,
  CloudUploadIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  FileIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  GaugeIcon,
  GearIcon,
  GitBranchIcon,
  GlobeIcon,
  KeyboardIcon,
  MonitorIcon,
  MoonIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  SearchIcon,
  SidebarIcon,
  SunIcon,
  UploadIcon,
  UsersIcon
} from './components/Icons'

type IconComp = (props: { size?: number }) => ReactNode

const ICONS: Partial<Record<ActionId, IconComp>> = {
  'new-request': PlusIcon,
  'new-folder': FolderPlusIcon,
  'new-collection': PlusIcon,
  'new-environment': GlobeIcon,
  'open-collection': FolderOpenIcon,
  import: UploadIcon,
  export: DownloadIcon,
  settings: GearIcon,
  'close-tab': CloseIcon,
  send: PlayIcon,
  save: SaveIcon,
  'duplicate-request': CopyIcon,
  'copy-curl': CodeIcon,
  'load-test': GaugeIcon,
  'run-collection': PlayIcon,
  'focus-url': SearchIcon,
  'command-palette': SearchIcon,
  environments: GlobeIcon,
  history: ClockIcon,
  'toggle-sidebar': SidebarIcon,
  'theme-system': MonitorIcon,
  'theme-light': SunIcon,
  'theme-dark': MoonIcon,
  'getting-started': FileIcon,
  shortcuts: KeyboardIcon,
  docs: BookIcon,
  'report-issue': BugIcon,
  'check-update': RefreshIcon,
  'join-team': UsersIcon,
  'team-sync': GitBranchIcon,
  sync: RefreshIcon,
  'save-version': SaveIcon,
  'share-collection': CloudUploadIcon
}

/** The registry icon of an action, or null when it has none. */
export function actionIcon(id: ActionId, size = 14): ReactNode {
  const Icon = ICONS[id]
  return Icon ? <Icon size={size} /> : null
}

/** A context-menu entry for a registry action. */
export function actionItem(
  id: ActionId,
  onClick: () => void,
  opts: { label?: string; danger?: boolean } = {}
): MenuItem {
  return {
    label: opts.label ?? menuLabel(id, currentTranslator()),
    icon: actionIcon(id),
    danger: opts.danger,
    onClick
  }
}

/** Tooltip text with the platform shortcut, e.g. "Send (Cmd+Enter)". */
export function actionTitle(id: ActionId): string {
  return tooltip(id, MOD, currentTranslator())
}

export function actionLabel(id: ActionId): string {
  return registryLabel(id, currentTranslator())
}
