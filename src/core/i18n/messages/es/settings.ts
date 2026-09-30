import type { NamespaceCatalog } from '../../translator'
import type { settings as en } from '../en/settings'

export const settings: NamespaceCatalog<typeof en> = {
  'settings.title': 'Configuración',
  'settings.subtitle': 'Las preferencias se guardan localmente en este equipo.',
  'settings.sectionsLabel': 'Secciones de configuración',

  'settings.tabs.general.label': 'General',
  'settings.tabs.general.intro': 'Cómo se ve Tiger y cuánto espera a un servidor.',
  'settings.tabs.network.label': 'Red',
  'settings.tabs.network.intro':
    'Redirecciones, comprobaciones SSL, proxy y cookies: cómo salen las solicitudes de tu equipo.',
  'settings.tabs.advanced.label': 'Avanzado',
  'settings.tabs.advanced.intro':
    'Certificados para redes de empresa y TLS mutuo. La mayoría de la gente nunca los necesita.',
  'settings.tabs.mcp.label': 'Asistentes de IA (MCP)',
  'settings.tabs.mcp.intro':
    'Permite que Claude, Cursor y otros asistentes de IA listen y ejecuten las solicitudes de una colección.',
  'settings.tabs.privacy.label': 'Privacidad',
  'settings.tabs.privacy.intro': 'Lo que Tiger envía sobre su propio uso. Nunca tus solicitudes.',
  'settings.tabs.about.label': 'Acerca de',
  'settings.tabs.about.intro': 'Versión, actualizaciones e información del proyecto.',

  'settings.appearance.label': 'Apariencia',
  'settings.appearance.desc': 'Cristal claro, cristal oscuro o seguir el sistema.',
  'settings.theme.light': 'Claro',
  'settings.theme.dark': 'Oscuro',
  'settings.theme.system': 'Sistema',

  'settings.language.label': 'Idioma',
  'settings.language.desc': 'El idioma de menús, botones y mensajes. Cambia al instante.',
  'settings.language.system': 'Predeterminado del sistema',
  'settings.language.systemCurrent': 'Predeterminado del sistema ({language})',

  'settings.timeout.label': 'Tiempo de espera de solicitudes',
  'settings.timeout.desc': 'Cuánto esperar antes de rendirse, en milisegundos.',
  'settings.timeout.aria': 'Tiempo de espera de solicitudes (ms)',
  'settings.fontSize.label': 'Tamaño de fuente del editor',
  'settings.fontSize.desc': 'Tamaño del texto monoespaciado en los editores y la respuesta.',

  'settings.redirects.label': 'Seguir redirecciones',
  'settings.redirects.desc': 'Seguir automáticamente las respuestas 3xx hasta su destino.',
  'settings.ssl.label': 'Verificar certificados SSL',
  'settings.ssl.desc': 'Desactiva para permitir certificados autofirmados (solo desarrollo).',
  'settings.proxy.label': 'Usar un proxy',
  'settings.proxy.desc': 'Enviar todas las solicitudes a través de un proxy HTTP/HTTPS o SOCKS.',
  'settings.proxy.url.label': 'URL del proxy',
  'settings.proxy.url.desc': 'p. ej. http://127.0.0.1:8080 o socks5://127.0.0.1:1080',
  'settings.proxy.username.label': 'Usuario del proxy',
  'settings.proxy.username.desc':
    'Se envía cuando el proxy pide autenticación. Déjalo vacío si no hay.',
  'settings.proxy.username.placeholder': 'usuario',
  'settings.proxy.password.label': 'Contraseña del proxy',
  'settings.proxy.password.desc': 'Se guarda localmente en este equipo y nunca se sincroniza.',
  'settings.proxy.password.placeholder': 'contraseña',
  'settings.cookies.label': 'Almacén de cookies persistente',
  'settings.cookies.desc':
    'Guardar las cookies entre envíos y sesiones. Se guardan localmente y se reenvían en las solicitudes siguientes a los dominios correspondientes.',
  'settings.cookies.clear': 'Borrar cookies',
  'settings.cookies.cleared': 'Borradas',
  'settings.cookies.announceCleared': 'Cookies borradas',

  'settings.certExceptions.label': 'Excepciones de certificado',
  'settings.certExceptions.desc':
    'Nombres de host (separados por comas) donde se aceptan certificados no válidos o internos, por ejemplo intranet.acme.local. Más seguro que desactivar la verificación globalmente.',
  'settings.certExceptions.placeholder': 'host1, host2',
  'settings.maxRedirects.label': 'Máximo de redirecciones',
  'settings.maxRedirects.desc': 'Límite superior al seguir respuestas 3xx.',
  'settings.certSubject.label': 'Filtro por sujeto del certificado de cliente',
  'settings.certSubject.desc':
    'Cuando un servidor pide un certificado de cliente, elige el que tenga este texto en su sujeto',
  'settings.certSubject.placeholder': 'p. ej. CN=alice',
  'settings.certificates.group': 'Certificados',
  'settings.files.notSet': 'Sin definir',
  'settings.files.choose': 'Elegir archivo',
  'settings.files.chooseAria': 'Elegir archivo: {label}',
  'settings.files.clear': 'Borrar',
  'settings.files.clearAria': 'Borrar {label}',
  'settings.files.ca.label': 'Paquete de CA (PEM)',
  'settings.files.ca.desc':
    'Autoridades de certificación adicionales de confianza, p. ej. la CA interna de tu empresa.',
  'settings.files.ca.filter': 'Certificado PEM',
  'settings.files.clientCert.label': 'Certificado de cliente (PEM)',
  'settings.files.clientCert.desc':
    'Tu certificado, para los servidores que piden saber quién eres (TLS mutuo).',
  'settings.files.clientKey.label': 'Clave de cliente (PEM)',
  'settings.files.clientKey.desc': 'La clave privada que acompaña al certificado de cliente.',
  'settings.files.clientKey.filter': 'Clave PEM',
  'settings.files.pfx.label': 'Paquete PFX / P12',
  'settings.files.pfx.desc': 'Certificado y clave en un solo archivo, en lugar de los dos archivos PEM.',
  'settings.files.pfx.filter': 'Paquete PFX / P12',
  'settings.passphrase.label': 'Frase de contraseña del certificado',
  'settings.passphrase.desc': 'Desbloquea la clave o el paquete anterior, si tiene contraseña.',
  'settings.passphrase.placeholder': 'frase de contraseña',
  'settings.certHint': 'Las solicitudes que usan certificados importados omiten el proxy.',

  'settings.mcp.intro':
    'Tiger incluye un servidor MCP (Model Context Protocol) que expone tus colecciones a Claude Desktop y otros clientes compatibles con MCP. Añade el fragmento siguiente a tu {file} para conectar.',
  'settings.mcp.pathPlaceholder': '<ruta a la carpeta de tu colección>',
  'settings.mcp.note':
    'Sustituye {placeholder} por la ruta absoluta de la carpeta que abriste en Tiger. Puedes tener una entrada por colección.',
  'settings.mcp.copySnippet': 'Copiar fragmento',
  'settings.mcp.snippetCopied': 'Fragmento copiado',
  'settings.mcp.loading': 'Cargando…',

  'settings.analytics.label': 'Analíticas de uso anónimas',
  'settings.analytics.desc':
    'Activadas por defecto. Solo envía eventos anónimos y agregados (nunca URL, encabezados ni cuerpos). Puedes desactivarlas cuando quieras.',
  'settings.analytics.aria': 'Analíticas',

  'settings.autoUpdate.label': 'Instalar actualizaciones automáticamente',
  'settings.autoUpdate.desc':
    'Descarga las versiones nuevas en segundo plano y las instala al reiniciar o cerrar Tiger. Si está desactivado, Tiger pregunta antes de descargar. Las instalaciones de Microsoft Store y Linux .deb se actualizan a través de su tienda o gestor de paquetes.',
  'settings.about.tagline': 'Un cliente de API local primero, para equipos.',
  'settings.about.version': 'Versión {version}',

  'settings.update.title': 'Actualización de software',
  'settings.update.later': 'Más tarde',
  'settings.update.download': 'Descargar',
  'settings.update.restartNow': 'Reiniciar ahora',
  'settings.update.releaseNotes': 'Notas de la versión',
  'settings.update.releaseNotesFor': 'Notas de la versión {version}',
  'settings.update.hide': 'Ocultar',
  'settings.update.hideProgress': 'Ocultar el progreso de la actualización',
  'settings.update.manualTitle': 'Actualización disponible · v{version}',
  'settings.update.manualDesc':
    'Estás en la v{current}. La versión {latest} está lista para descargar.',
  'settings.update.downloadUpdate': 'Descargar actualización',
  'settings.update.whatChanged': 'Qué ha cambiado',
  'settings.update.downloadFromWebsite': 'Descargar desde el sitio web',
  'settings.update.continueInBackground': 'Continuar en segundo plano',
  'settings.update.downloadingAria': 'Descargando la actualización {version}',
  'settings.update.laterHint': 'Elige Más tarde para instalarla la próxima vez que cierres Tiger.',
  'settings.update.upToDateVersion': 'Tiger {version} es la última versión.',
  'settings.update.status.checking': 'Buscando actualizaciones…',
  'settings.update.status.upToDate': 'Tienes la última versión.',
  'settings.update.status.available': 'Tiger {version} está disponible.',
  'settings.update.status.downloading': 'Descargando la actualización {version}… {percent} %',
  'settings.update.status.downloaded': 'Tiger {version} está listo. Reinicia para actualizar.',
  'settings.update.announceDownloading': 'Descargando Tiger {version} en segundo plano.',
  'settings.update.error.offline':
    'No se pudo conectar con el servidor de actualizaciones. Comprueba tu conexión e inténtalo de nuevo.',
  'settings.update.error.notPublished':
    'Todavía no hay ninguna actualización publicada para esta plataforma.',
  'settings.update.error.verification':
    'La actualización descargada no superó la verificación y no se instaló.',
  'settings.update.error.failedDetail': 'Error en la actualización: {detail}',
  'settings.update.error.failed': 'Error en la actualización.'
}
