/**
 * The English catalog: source language, fallback for every other locale, and
 * the type every key is checked against. Statically imported (it is in the
 * startup chunk); the other locales are loaded on demand (../../load.ts).
 */
import { common } from './common'
import { actions } from './actions'
import { menu } from './menu'
import { app } from './app'
import { sidebar } from './sidebar'
import { request } from './request'
import { response } from './response'
import { team } from './team'
import { settings } from './settings'
import { modals } from './modals'
import { views } from './views'
import { imports } from './imports'
import { main } from './main'

export const en = {
  ...common,
  ...actions,
  ...menu,
  ...app,
  ...sidebar,
  ...request,
  ...response,
  ...team,
  ...settings,
  ...modals,
  ...views,
  ...imports,
  ...main
} as const

/** Namespace name -> its English keys, for the completeness tests. */
export const EN_NAMESPACES = {
  common,
  actions,
  menu,
  app,
  sidebar,
  request,
  response,
  team,
  settings,
  modals,
  views,
  imports,
  main
} as const
