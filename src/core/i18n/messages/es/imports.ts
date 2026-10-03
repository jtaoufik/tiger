import type { NamespaceCatalog } from '../../translator'
import type { imports as en } from '../en/imports'

export const imports: NamespaceCatalog<typeof en> = {
  'imports.dynamicVars':
    'Usa variables dinámicas que Tiger no genera: {names}. Defínelas en un entorno o sustitúyelas.',
  'imports.preScriptCalls':
    'El script previo a la solicitud usa llamadas que Tiger no puede ejecutar: {calls}. El script se conserva; revísalo.',
  'imports.testScriptCalls':
    'El script de prueba usa llamadas que Tiger no puede ejecutar: {calls}. El script se conserva; revísalo.',
  'imports.formFileMissing':
    'El campo de formulario "{field}" es una subida de archivo, pero la exportación no incluye ningún archivo. Elige el archivo en la pestaña Cuerpo.',
  'imports.formFileNone':
    'El campo de formulario "{field}" es una subida de archivo sin archivo elegido. Elige el archivo en la pestaña Cuerpo.',
  'imports.formFileUpload':
    'El campo de formulario "{field}" sube {files}. Comprueba que el archivo existe en este equipo.',
  'imports.formFileUploadFirstOnly':
    'El campo de formulario "{field}" sube {files}. Comprueba que el archivo existe en este equipo. Solo se conservó el primer archivo.',
  'imports.binaryBody':
    'Envía un cuerpo de archivo binario, que Tiger aún no admite. El cuerpo se dejó vacío.',
  'imports.oauthBodyCreds':
    'En Postman, OAuth 2.0 envía las credenciales del cliente en el cuerpo; Tiger las envía en un encabezado Basic. Comprueba que la solicitud del token funciona.',
  'imports.oauthUnsupportedToken':
    'OAuth 2.0 "{grant}" no es compatible. El token de acceso guardado se importó como token Bearer; caducará.',
  'imports.oauthUnsupportedNone':
    'OAuth 2.0 "{grant}" no es compatible. La autenticación se dejó en ninguna; obtén un token y usa autenticación Bearer.',
  'imports.authUnsupported':
    'La autenticación {auth} no es compatible. Se dejó en ninguna; vuelve a configurarla.',
  'imports.methodUnsupported': 'El método {method} no es compatible, así que se omitió esta solicitud.',
  'imports.pathVariables': {
    one: 'La variable de ruta {names} no tenía valor y pasó a ser {values}. Defínela en un entorno.',
    other: 'Las variables de ruta {names} no tenían valor y pasaron a ser {values}. Defínelas en un entorno.'
  },
  'imports.scriptsCopiedPre': {
    one: '{owner} tiene scripts previos a la solicitud. Tiger ejecuta los scripts por solicitud, así que se copiaron en su {count} solicitud. Edítalos allí.',
    other:
      '{owner} tiene scripts previos a la solicitud. Tiger ejecuta los scripts por solicitud, así que se copiaron en sus {count} solicitudes. Edítalos allí.'
  },
  'imports.scriptsCopiedPost': {
    one: '{owner} tiene scripts de prueba. Tiger ejecuta los scripts por solicitud, así que se copiaron en su {count} solicitud. Edítalos allí.',
    other:
      '{owner} tiene scripts de prueba. Tiger ejecuta los scripts por solicitud, así que se copiaron en sus {count} solicitudes. Edítalos allí.'
  },
  'imports.scriptsCopiedBoth': {
    one: '{owner} tiene scripts previos a la solicitud y de prueba. Tiger ejecuta los scripts por solicitud, así que se copiaron en su {count} solicitud. Edítalos allí.',
    other:
      '{owner} tiene scripts previos a la solicitud y de prueba. Tiger ejecuta los scripts por solicitud, así que se copiaron en sus {count} solicitudes. Edítalos allí.'
  },
  'imports.postmanGlobals':
    'Las variables globales de Postman se añadieron a cada entorno importado. Si un entorno define la misma variable, se usa su propio valor.',
  'imports.globalsEnv':
    'Las variables globales de Postman se convirtieron en el entorno "{name}". Ya está seleccionado.',
  'imports.secretsNotExported': 'Postman no exporta los valores secretos: {names}. Rellénalos.',
  'imports.postmanV1':
    'Esta es una colección de Postman v1. Vuelve a exportarla desde Postman como Collection v2.1 e importa ese archivo.',
  'imports.securityUnmapped':
    'La API usa un esquema de seguridad que Tiger no puede convertir (clave de API en cookie o similar). Configura la autenticación a mano.',
  'imports.cookieParams':
    'No se añadieron los parámetros de cookie ({names}). Añade un encabezado Cookie si hace falta.',
  'imports.securityPlaceholders':
    'La autenticación se configuró a partir del esquema de seguridad de la API, con variables de marcador como {token}. Defínelas en un entorno.',
  'imports.baseUrlUnknown':
    'La API no indica ningún host de servidor. Define baseUrl en el entorno "{name}" con un host como https://api.example.com antes de enviar.',
  'imports.brunoDotenvMissing':
    'Bruno lee {names} del archivo .env de la colección, que no se encontró o no las define. Complétalas en el entorno.',
  'imports.prodNotSelected':
    'Tiger no seleccionó "{name}" por ti, para que nada vaya a producción por sorpresa. Elígelo en el menú de entornos cuando lo quieras usar.',
  'imports.apiKeyCookie':
    'En Insomnia la clave de API se envía en una cookie; Tiger la envía en un encabezado. Comprueba que el servidor lo acepta.',
  'imports.bearerPrefix':
    'La autenticación Bearer usa el prefijo "{prefix}". Tiger siempre envía "Bearer"; añade en su lugar un encabezado Authorization si el servidor necesita "{prefix}".',
  'imports.folderVariables':
    'Las variables de carpeta no son compatibles: {names}. Añádelas a un entorno.',
  'imports.folderScripts':
    'Los scripts de la carpeta se copiaron en cada solicitud de esta carpeta. Edítalos allí.',
  'imports.templateTags': 'Usa etiquetas de plantilla que Tiger no puede ejecutar: {tags}.',
  'imports.templateTagsKept':
    'Usa etiquetas de plantilla que Tiger no puede ejecutar: {tags}. Se conservaron como texto.',
  'imports.envTemplateTags':
    'Los valores del entorno usan etiquetas de plantilla que Tiger no puede ejecutar: {tags}.',
  'imports.skippedRequests': {
    one: 'Se omitió {count} solicitud {kind}: Tiger solo envía solicitudes HTTP.',
    other: 'Se omitieron {count} solicitudes {kind}: Tiger solo envía solicitudes HTTP.'
  },
  'imports.requestVariables':
    'Las variables de solicitud ({kind}) no son compatibles: {names}. Defínelas en un entorno o en un script.',
  'imports.assertionsSkipped':
    'Aserciones no convertidas en pruebas: {items}. Añádelas como pruebas.',
  'imports.brunoSecrets':
    'Bruno nunca guarda los valores secretos en el disco: {names}. Añádelos al entorno "{env}".',
  'imports.couldNotRead': 'No se pudo leer: {error}',
  'imports.folderCopiedHeaders':
    '{label} tiene encabezados. Tiger los guarda por solicitud, así que se copiaron en cada solicitud de su interior. Edítalos allí.',
  'imports.folderCopiedScripts':
    '{label} tiene scripts. Tiger los guarda por solicitud, así que se copiaron en cada solicitud de su interior. Edítalos allí.',
  'imports.folderCopiedBoth':
    '{label} tiene encabezados y scripts. Tiger los guarda por solicitud, así que se copiaron en cada solicitud de su interior. Edítalos allí.',
  'imports.collectionVarsEnv':
    'Las variables de la colección pasaron a ser el entorno "{name}". Ya está seleccionado.',
  'imports.collectionVarsLayered':
    'Tiger tiene un único ámbito de variables, así que las variables de la colección ({names}) se añadieron a cada entorno. Los valores definidos en un entorno tienen prioridad.',

  'imports.report.title': '{name} importado',
  'imports.report.statsLabel': 'Importado',
  'imports.report.requests': { one: 'solicitud', other: 'solicitudes' },
  'imports.report.folders': { one: 'carpeta', other: 'carpetas' },
  'imports.report.environments': { one: 'entorno', other: 'entornos' },
  'imports.report.descEnvironmentsTarget':
    'Los entornos se añadieron a {target}. Elige uno en el menú de entornos.',
  'imports.report.descSelectedEnvironment':
    '{name} está abierto en la barra lateral, con el entorno "{environment}" seleccionado.',
  'imports.report.descOpen': '{name} está abierto en la barra lateral.',
  'imports.report.clean': 'Todo se convirtió sin problemas. Nada que revisar.',
  'imports.report.checkOne': 'Revisa este',
  'imports.report.checkMany': 'Revisa estos {count}',
  'imports.report.hint':
    'Estos elementos solo llegaron en parte. Todo se conserva, así que puedes corregirlo directamente.',
  'imports.report.in': 'en',
  'imports.report.sentenceClean':
    'Importado: {requests}, {folders}, {environments} desde {name}. Todo se convirtió sin problemas.',
  'imports.report.sentenceCheck': 'Importado: {requests}, {folders}, {environments} desde {name}. {items} por revisar.',
  'imports.report.requestsCount': { one: '{count} solicitud', other: '{count} solicitudes' },
  'imports.report.foldersCount': { one: '{count} carpeta', other: '{count} carpetas' },
  'imports.report.environmentsCount': { one: '{count} entorno', other: '{count} entornos' },
  'imports.report.itemsCount': { one: '{count} elemento', other: '{count} elementos' }
}
