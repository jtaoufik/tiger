/**
 * Import warnings produced by the importers (src/core/import) and shown in the
 * import report. The English text is also what the importers put in
 * `warning.message`, so keep it stable: tests and MCP tools read it.
 */
export const imports = {
  'imports.dynamicVars':
    'Uses dynamic variables Tiger does not generate: {names}. Set them in an environment or replace them.',
  'imports.preScriptCalls': 'Pre-request script uses calls Tiger cannot run: {calls}. The script is kept; review it.',
  'imports.testScriptCalls': 'Test script uses calls Tiger cannot run: {calls}. The script is kept; review it.',
  'imports.formFileMissing':
    'Form field "{field}" is a file upload with no file saved in the export. Pick the file in the body tab.',
  'imports.formFileNone': 'Form field "{field}" is a file upload with no file chosen. Pick the file in the body tab.',
  'imports.formFileUpload': 'Form field "{field}" uploads {files}. Check the file exists on this machine.',
  'imports.formFileUploadFirstOnly':
    'Form field "{field}" uploads {files}. Check the file exists on this machine. Only the first file was kept.',
  'imports.binaryBody': 'Sends a binary file body, which Tiger does not support yet. The body was left empty.',
  'imports.oauthBodyCreds':
    'OAuth 2.0 sends the client credentials in the body in Postman; Tiger sends them as a Basic header. Check the token request works.',
  'imports.oauthUnsupportedToken':
    'OAuth 2.0 "{grant}" is not supported. The saved access token was imported as a Bearer token; it will expire.',
  'imports.oauthUnsupportedNone':
    'OAuth 2.0 "{grant}" is not supported. Auth was set to none; get a token and use Bearer auth.',
  'imports.authUnsupported': '{auth} auth is not supported. Auth was set to none; set it up again.',
  'imports.methodUnsupported': 'Method {method} is not supported, so this request was skipped.',
  'imports.pathVariables': {
    one: 'Path variable {names} had no value and became {values}. Set it in an environment.',
    other: 'Path variables {names} had no value and became {values}. Set them in an environment.'
  },
  'imports.scriptsCopiedPre': {
    one: '{owner} has pre-request scripts. Tiger runs scripts per request, so they were copied into its {count} request. Edit them there.',
    other:
      '{owner} has pre-request scripts. Tiger runs scripts per request, so they were copied into its {count} requests. Edit them there.'
  },
  'imports.scriptsCopiedPost': {
    one: '{owner} has test scripts. Tiger runs scripts per request, so they were copied into its {count} request. Edit them there.',
    other:
      '{owner} has test scripts. Tiger runs scripts per request, so they were copied into its {count} requests. Edit them there.'
  },
  'imports.scriptsCopiedBoth': {
    one: '{owner} has pre-request and test scripts. Tiger runs scripts per request, so they were copied into its {count} request. Edit them there.',
    other:
      '{owner} has pre-request and test scripts. Tiger runs scripts per request, so they were copied into its {count} requests. Edit them there.'
  },
  'imports.postmanGlobals':
    'Postman globals were added to every imported environment. Where an environment sets the same variable, its own value wins.',
  'imports.globalsEnv':
    'Postman globals became the environment "{name}". It is selected for you.',
  'imports.secretsNotExported': 'Secret values are not exported by Postman: {names}. Fill them in.',
  'imports.postmanV1':
    'This is a Postman v1 collection. Export it again from Postman as Collection v2.1 and import that file.',
  'imports.securityUnmapped':
    'The API uses a security scheme Tiger cannot map (cookie API key or similar). Set auth up by hand.',
  'imports.cookieParams': 'Cookie parameters ({names}) were not added. Add a Cookie header if needed.',
  'imports.securityPlaceholders':
    'Auth was set up from the API security scheme with placeholder variables such as {token}. Set them in an environment.',
  'imports.baseUrlUnknown':
    'The API names no server host. Set baseUrl in the environment "{name}" to a host such as https://api.example.com before sending.',
  'imports.brunoDotenvMissing':
    'Bruno reads {names} from the collection\'s .env file, which was not found or does not set them. Fill them in the environment.',
  'imports.prodNotSelected':
    'Tiger did not select "{name}" for you, so nothing goes to production by surprise. Pick it in the environment menu when you mean to.',
  'imports.apiKeyCookie':
    'API key is sent as a cookie in Insomnia; Tiger sends it as a header. Check the server accepts that.',
  'imports.bearerPrefix':
    'Bearer auth uses the prefix "{prefix}". Tiger always sends "Bearer"; add an Authorization header instead if the server needs "{prefix}".',
  'imports.folderVariables': 'Folder variables are not supported: {names}. Add them to an environment.',
  'imports.folderScripts': 'Folder scripts were copied into each request in this folder. Edit them there.',
  'imports.templateTags': 'Uses template tags Tiger cannot run: {tags}.',
  'imports.templateTagsKept': 'Uses template tags Tiger cannot run: {tags}. They were kept as text.',
  'imports.envTemplateTags': 'Environment values use template tags Tiger cannot run: {tags}.',
  'imports.templateFilters': 'Uses template filters Tiger does not apply: {filters}. The variable is used as it is.',
  'imports.skippedRequests': {
    one: '{count} {kind} request was skipped: Tiger sends HTTP requests only.',
    other: '{count} {kind} requests were skipped: Tiger sends HTTP requests only.'
  },
  'imports.requestVariables':
    'Request variables ({kind}) are not supported: {names}. Set them in an environment or a script.',
  'imports.assertionsSkipped': 'Assertions not converted to tests: {items}. Add them as tests.',
  'imports.brunoSecrets':
    'Secret values are never saved to disk by Bruno: {names}. Add them to the "{env}" environment.',
  'imports.couldNotRead': 'Could not be read: {error}',
  'imports.folderCopiedHeaders':
    '{label} has headers. Tiger keeps these per request, so they were copied into each request below it. Edit them there.',
  'imports.folderCopiedScripts':
    '{label} has scripts. Tiger keeps these per request, so they were copied into each request below it. Edit them there.',
  'imports.folderCopiedBoth':
    '{label} has headers and scripts. Tiger keeps these per request, so they were copied into each request below it. Edit them there.',
  'imports.collectionVarsEnv': 'Collection variables became the environment "{name}". It is selected for you.',
  'imports.collectionVarsLayered':
    'Tiger has one variable scope, so the collection variables ({names}) were added to each environment. Values set in an environment win.',
  'imports.folderRenamed':
    'Two folders here are named "{name}". Tiger tells folders apart by name, so this one is now "{renamed}", with its own requests and settings.',
  'imports.securityPartial':
    'The API also requires {schemes} here, which Tiger cannot set up. Add it to the request by hand.',
  'imports.variablesRenamed':
    'Another collection imported with this one also uses {names}. Each keeps its own values, so this one now uses {renamed}.',

  // Import report modal
  'imports.report.title': 'Imported {name}',
  'imports.report.statsLabel': 'Imported',
  'imports.report.requests': { one: 'request', other: 'requests' },
  'imports.report.folders': { one: 'folder', other: 'folders' },
  'imports.report.environments': { one: 'environment', other: 'environments' },
  'imports.report.descEnvironmentsTarget':
    'The environments were added to {target}. Pick one from the environment menu.',
  'imports.report.descSelectedEnvironment':
    '{name} is open in the sidebar, with the "{environment}" environment selected.',
  'imports.report.descOpen': '{name} is open in the sidebar.',
  'imports.report.savedTo': 'Saved in {path}, so it is there next time.',
  'imports.report.clean': 'Everything mapped cleanly. Nothing to check.',
  'imports.report.checkOne': 'Check this',
  'imports.report.checkMany': 'Check these {count}',
  'imports.report.hint': 'These came across only partly. Everything is kept, so you can fix it in place.',
  'imports.report.in': 'in',
  'imports.report.sentenceClean': 'Imported {requests}, {folders}, {environments} from {name}. Everything mapped cleanly.',
  'imports.report.sentenceCheck':
    'Imported {requests}, {folders}, {environments} from {name}. {items} to check.',
  'imports.report.requestsCount': { one: '{count} request', other: '{count} requests' },
  'imports.report.foldersCount': { one: '{count} folder', other: '{count} folders' },
  'imports.report.environmentsCount': { one: '{count} environment', other: '{count} environments' },
  'imports.report.itemsCount': { one: '{count} item', other: '{count} items' }
} as const
