import type { LocaleCatalog } from '../../translator'
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

const es: LocaleCatalog = {
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
}

export default es

export const NAMESPACES = {
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
}
