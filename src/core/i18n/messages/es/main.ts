import type { NamespaceCatalog } from '../../translator'
import type { main as en } from '../en/main'

export const main: NamespaceCatalog<typeof en> = {
  'main.dialog.openCollection': 'Abrir una carpeta de colección de Tiger',
  'main.dialog.newCollection': 'Elige dónde crear "{name}"',
  'main.dialog.createHere': 'Crear aquí',
  'main.dialog.cloneTitle': 'Elige dónde guardar la colección del equipo',
  'main.dialog.saveHere': 'Guardar aquí',
  'main.dialog.unsavedTitle': 'Tienes cambios sin guardar',
  'main.dialog.unsavedDetail': 'Si cierras ahora, se descartan las ediciones que aún no se han guardado.',
  'main.dialog.closeAnyway': 'Cerrar de todos modos',
  'main.dialog.updateUnsavedDetail': 'Si reinicias para actualizar, se descartan las ediciones que aún no se han guardado.',
  'main.dialog.restartAnyway': 'Reiniciar de todos modos',
  'main.dialog.keepEditing': 'Seguir editando',
  'main.dialog.saveResponse': 'Guardar el cuerpo de la respuesta',
  'main.import.postman': 'Colección de Postman',
  'main.import.insomnia': 'Exportación de Insomnia',
  'main.import.wsdl': 'Documento WSDL',
  'main.import.openapi': 'Documento OpenAPI / Swagger',
  'main.import.brunoFolder': 'Importar una carpeta de colección de Bruno',
  'main.import.failed': 'No se pudo importar este archivo: {reason}',
  'main.export.title': 'Exportar',
  'main.http.certRead': 'No se pudo leer el archivo de certificado: {reason}',
  'main.http.tokenStatus': 'El endpoint del token devolvió {status}',
  'main.http.tokenMissing': 'La respuesta del token no incluía access_token',
  'main.realtime.badUrl': 'Esta dirección no sirve para esta conexión: {url}',
  'main.realtime.refused': 'Nada escucha en {url}',
  'main.realtime.proxyTimeout': 'El proxy no respondió a tiempo',
  'main.realtime.proxyRefused': 'El proxy rechazó la conexión (estado {status})',
  'main.realtime.handshakeStatus': 'El servidor respondió {status} en lugar de abrir el WebSocket',
  'main.realtime.sseStatus': 'El servidor respondió {status} en lugar de un flujo de eventos',
  'main.realtime.sseType': 'El servidor envió {type} en lugar de text/event-stream'
}
