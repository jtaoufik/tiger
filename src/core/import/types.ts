import type { MessageKey, Vars } from '../i18n'
import type { KeyValue, TigerAuth, TigerEnvironment, TigerRequest } from '../types'

/** A request plus the folder path it lives under within a collection. */
export interface ImportedRequest {
  path: string[]
  request: TigerRequest
}

export type ImportSource = 'postman' | 'bruno' | 'openapi' | 'insomnia' | 'wsdl'

/** Folder-level settings carried over from the source tool. */
export interface ImportedFolder {
  path: string[]
  /** Default auth the folder's requests inherit (unless they set their own). */
  auth?: TigerAuth
  docs?: string
}

/**
 * Something that came across only partly. `request` names the request (or
 * folder / environment) to look at, `path` is its folder, and `message` says
 * in plain words what to check.
 */
export interface ImportWarning {
  request?: string
  path?: string[]
  /** The English text: what tests and the MCP tools read. */
  message: string
  /** The same warning as a catalog key, so the report can show it in the user's language. */
  i18n?: MessageI18n
}

/** A translatable message: catalog key plus its {placeholders}. */
export interface MessageI18n {
  key: MessageKey
  vars?: Vars
}

export interface ImportResult {
  name: string
  source: ImportSource
  requests: ImportedRequest[]
  environments?: TigerEnvironment[]
  /** Collection-level default auth. */
  auth?: TigerAuth
  /** Collection-level documentation (markdown). */
  docs?: string
  /** Folder-level auth and docs. */
  folders?: ImportedFolder[]
  /**
   * Collection-level variables (Postman collection variables, Bruno
   * `vars:pre-request` in collection.bru). Tiger has one variable scope, so
   * `layerCollectionVariables` folds them into the environments once every
   * dropped or picked file has been read.
   */
  collectionVariables?: KeyValue[]
  /** Everything that was partially mapped and deserves a look. */
  warnings?: ImportWarning[]
}
