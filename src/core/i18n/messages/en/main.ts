/** Main process: file dialogs, network errors, importer and updater messages. */
export const main = {
  'main.dialog.openCollection': 'Open a Tiger collection folder',
  'main.dialog.newCollection': 'Choose where to create "{name}"',
  'main.dialog.createHere': 'Create here',
  'main.dialog.cloneTitle': 'Choose where to save the team collection',
  'main.dialog.saveHere': 'Save here',
  'main.dialog.unsavedTitle': 'You have unsaved changes',
  'main.dialog.unsavedDetail': 'Closing now discards edits that are not saved yet.',
  'main.dialog.closeAnyway': 'Close Anyway',
  'main.dialog.keepEditing': 'Keep Editing',
  'main.import.postman': 'Postman collection',
  'main.import.insomnia': 'Insomnia export',
  'main.import.wsdl': 'WSDL document',
  'main.import.openapi': 'OpenAPI / Swagger document',
  'main.import.brunoFolder': 'Import a Bruno collection folder',
  'main.import.failed': 'This file could not be imported: {reason}',
  'main.export.title': 'Export',
  'main.http.certRead': 'Could not read certificate file: {reason}',
  'main.http.tokenStatus': 'Token endpoint returned {status}',
  'main.http.tokenMissing': 'Token response had no access_token'
} as const
