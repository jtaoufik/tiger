import type { NamespaceCatalog } from '../../translator'
import type { team as en } from '../en/team'

export const team: NamespaceCatalog<typeof en> = {
  'team.git.err.authRequired':
    'Se requiere autenticación. Configura un asistente de credenciales de Git, o usa una URL SSH con una clave en tu agente.',
  'team.git.err.sshKey':
    'Clave SSH no aceptada. Añade la clave correcta a tu agente SSH (p. ej. ssh-add ~/.ssh/id_ed25519).',
  'team.git.err.authFailed':
    'Falló la autenticación. Comprueba tu nombre de usuario y tu token de acceso personal.',
  'team.git.err.notFound':
    'Repositorio no encontrado. Comprueba la URL, o que tu cuenta tenga acceso.',
  'team.git.err.network':
    'No se pudo conectar con el host. Comprueba tu red o la URL del repositorio.',
  'team.git.err.identity': 'Git necesita tu nombre y tu correo antes de poder guardar una versión.',
  'team.git.err.rejected':
    'El repositorio del equipo tiene cambios que aún no tienes. Sincroniza primero para combinarlos.',
  'team.git.err.noCommits': 'Aún no hay ninguna versión guardada. Guarda una versión primero.',
  'team.git.prefix.save': 'No se pudieron guardar tus cambios: {detail}',
  'team.git.prefix.get': 'No se pudieron obtener los cambios del equipo: {detail}',
  'team.git.prefix.share': 'No se pudieron compartir tus cambios: {detail}',
  'team.git.prefix.combine': 'No se pudieron combinar los cambios: {detail}',
  'team.git.prefix.restore': 'No se pudieron recuperar los cambios: {detail}',
  'team.git.noRemote': 'No hay ningún remoto configurado',
  'team.git.refreshed': 'Actualizado desde el remoto',
  'team.git.fetchFailed': 'Falló la actualización',
  'team.git.addFailed': 'Falló git add',
  'team.git.committed': 'Versión guardada',
  'team.git.nothingToCommit': 'Nada que guardar',
  'team.git.identityInvalid': 'Introduce tu nombre y un correo electrónico válido',
  'team.git.identitySaved': 'Las versiones se guardarán como {name}',
  'team.git.saveNameFailed': 'No se pudo guardar tu nombre',
  'team.git.upToDate': 'Al día',
  'team.git.pullFailed': 'Falló la obtención de cambios',
  'team.git.pushed': 'Compartido',
  'team.git.pushFailed': 'Falló al compartir',
  'team.git.trackingOn': 'El seguimiento de versiones está activado',
  'team.git.initFailed': 'Falló git init',
  'team.git.notSetUp': 'Esta carpeta aún no está preparada para sincronizar',
  'team.git.savedLocalOnly':
    'Guardado en este equipo (aún no hay un repositorio compartido conectado)',
  'team.git.publishFailed': 'falló la publicación',
  'team.git.sharedNow': 'Compartido: tu colección ya está en el repositorio del equipo',
  'team.git.conflictSame': 'Un compañero y tú habéis cambiado lo mismo.',
  'team.git.pullFailedLower': 'falló la obtención de cambios',
  'team.git.inSync': 'Todo está sincronizado con tu equipo',
  'team.git.mergeFailed': 'falló la combinación',
  'team.git.doneChoices': 'Listo: tus elecciones se aplicaron y se compartieron con el equipo.',
  'team.git.doneMine': 'Listo: donde los cambios coincidían, ganó tu versión.',
  'team.git.doneTheirs': 'Listo: donde los cambios coincidían, ganó la versión del equipo.',
  'team.git.notRepoUrl': 'Eso no parece una URL de repositorio',
  'team.git.addRemoteFailed': 'No se pudo añadir el remoto',
  'team.git.cannotReach': 'No se pudo conectar con el repositorio',
  'team.git.connected': 'Conectado al repositorio compartido',
  'team.git.createdBranch': 'Rama {branch} creada y activada',
  'team.git.switchedBranch': 'Cambiado a {branch}',
  'team.git.saveOrDiscard': 'Guarda o descarta tus cambios antes de cambiar de rama.',
  'team.git.checkoutFailed': 'Falló el cambio de rama',
  'team.git.noVersionBack':
    'Aún no hay ninguna versión guardada a la que volver. Guarda una versión primero.',
  'team.git.discardFailed': 'No se pudieron descartar los cambios',
  'team.git.nothingToDiscard': 'Nada que descartar',
  'team.git.discarded': 'Cambios sin guardar descartados',
  'team.git.nothingToUndo': 'Nada que deshacer',
  'team.git.applyFailed': 'falló la aplicación',
  'team.git.restored': 'Cambios restaurados',
  'team.git.cloned': 'Clonado en {dir}',
  'team.git.cloneFailed': 'Falló la clonación',

  'team.ux.checking.label': 'Comprobando…',
  'team.ux.checking.short': 'Comprobando',
  'team.ux.checking.detail': 'Comprobando el seguimiento de versiones.',
  'team.ux.untracked.label': 'Sin seguimiento',
  'team.ux.untracked.detail':
    'Activa el seguimiento de versiones para guardar un historial de cambios y compartir esta colección con tu equipo.',
  'team.ux.conflict.label': 'Conflicto: hace falta decidir',
  'team.ux.conflict.short': 'Conflicto',
  'team.ux.conflict.detail':
    'Un compañero y tú habéis cambiado la misma solicitud. Elige qué versión conservar.',
  'team.ux.updates.label': {
    one: '{count} actualización del equipo',
    other: '{count} actualizaciones del equipo'
  },
  'team.ux.updates.detailBoth':
    'Tu equipo ha hecho cambios y tú también. Sincronizar combina ambos.',
  'team.ux.updates.detailTeam':
    'Tu equipo ha hecho cambios que aún no tienes. Sincroniza para obtenerlos.',
  'team.ux.localChanges.label': { one: '{count} cambio local', other: '{count} cambios locales' },
  'team.ux.localChanges.detailShared':
    'Guardados en este equipo, aún sin compartir. Sincroniza para compartirlos con tu equipo.',
  'team.ux.localChanges.detailLocal':
    'Guardados en este equipo. Guarda una versión para conservarlos en el historial.',
  'team.ux.toShare.label': { one: '{count} versión por compartir', other: '{count} versiones por compartir' },
  'team.ux.toShare.detail':
    'Guardadas como versiones, aún sin compartir. Sincroniza para compartirlas con tu equipo.',
  'team.ux.localOnly.label': 'Solo en este equipo',
  'team.ux.localOnly.detail':
    'Las versiones se guardan en este equipo. Conecta un repositorio compartido para trabajar con tu equipo.',
  'team.ux.unpublished.label': 'Aún sin compartir',
  'team.ux.unpublished.detail':
    'Conectado a un repositorio compartido. Sincroniza una vez para publicar esta colección en él.',
  'team.ux.upToDate.label': 'Al día',
  'team.ux.upToDate.detail': 'Todo está sincronizado con tu equipo.',

  'team.ux.name.collection': 'Ajustes de la colección',
  'team.ux.name.folder': 'Ajustes de la carpeta {folder}',
  'team.ux.name.folderFallback': 'Carpeta',
  'team.ux.name.environment': 'Entorno {name}',
  'team.ux.note.update': 'actualizar {items}',
  'team.ux.note.add': 'añadir {items}',
  'team.ux.note.remove': 'eliminar {items}',
  'team.ux.note.separator': ', ',
  'team.ux.note.pair': '{a} y {b}',
  'team.ux.note.more': '{a}, {b} y {count} más',
  'team.ux.note.requests': { one: '{count} solicitud', other: '{count} solicitudes' },

  'team.ux.url.noSpaces': 'Una dirección de repositorio no lleva espacios.',
  'team.ux.url.addHttps': 'Añade https:// al principio.',
  'team.ux.url.paste':
    'Pega la dirección del botón Code de GitHub o del botón Clone de GitLab. Empieza por https:// o git@.',
  'team.ux.url.incomplete':
    'Esa dirección no está completa. Cópiala de nuevo desde la página de tu repositorio.',
  'team.ux.url.accountPage': 'Es una página de cuenta. Abre el repositorio y copia su dirección.',
  'team.ux.url.repoPage':
    'Es una página dentro del repositorio. Usa la dirección del repositorio en su lugar.',
  'team.ux.url.addPath': 'Añade la ruta del repositorio después del nombre del servidor.',

  'team.ux.link.gcm': 'Instalar Git Credential Manager',
  'team.ux.link.githubToken': 'GitHub: crear un token de acceso personal',
  'team.ux.link.gitlabToken': 'GitLab: crear un token de acceso personal',
  'team.ux.link.githubSsh': 'GitHub: conectar con una clave SSH',
  'team.ux.link.gitForWindows': 'Descargar Git para Windows',
  'team.ux.help.authRequired.title': 'Hace falta iniciar sesión para acceder a este repositorio',
  'team.ux.help.authRequired.winStep1':
    'Git para Windows incluye Git Credential Manager. Inténtalo de nuevo: debería abrirse una ventana de inicio de sesión.',
  'team.ux.help.authRequired.winStep2':
    '¿No aparece? Reinstala Git para Windows y deja marcado «Git Credential Manager».',
  'team.ux.help.authRequired.sshStep': 'O usa la dirección SSH (git@…) si ya tienes una clave SSH.',
  'team.ux.help.authRequired.step1':
    'Instala Git Credential Manager, inténtalo de nuevo e inicia sesión en la ventana del navegador que se abre.',
  'team.ux.help.authRequired.step2':
    'O inicia sesión una vez desde una terminal: ejecuta git clone con esta dirección y pega un token de acceso personal como contraseña.',
  'team.ux.help.authFailed.title': 'Se rechazó tu inicio de sesión',
  'team.ux.help.authFailed.step1':
    'GitHub y GitLab no aceptan contraseñas de cuenta aquí: usa un token de acceso personal como contraseña.',
  'team.ux.help.authFailed.win':
    'Puede que se haya guardado una contraseña incorrecta: elimínala en el Administrador de credenciales de Windows y vuelve a intentarlo.',
  'team.ux.help.authFailed.mac':
    'Puede que se haya guardado una contraseña incorrecta: elimínala en Acceso a Llaveros (busca el nombre del servidor) y vuelve a intentarlo.',
  'team.ux.help.authFailed.other':
    'Puede que tu asistente de credenciales haya guardado una contraseña incorrecta: elimínala y vuelve a intentarlo.',
  'team.ux.help.sshKey.title': 'No se aceptó tu clave SSH',
  'team.ux.help.sshKey.step1':
    'Comprueba que tu clave pública esté añadida a tu cuenta de GitHub o GitLab.',
  'team.ux.help.sshKey.win':
    'Inicia el servicio «OpenSSH Authentication Agent» y ejecuta ssh-add en una terminal.',
  'team.ux.help.sshKey.other': 'Carga tu clave en una terminal: ssh-add ~/.ssh/id_ed25519',
  'team.ux.help.sshKey.step3': 'O usa la dirección https:// en su lugar.',
  'team.ux.help.notFound.title': 'Repositorio no encontrado',
  'team.ux.help.notFound.step1':
    'Comprueba la dirección: cópiala del botón Code de GitHub o del botón Clone de GitLab.',
  'team.ux.help.notFound.step2':
    '¿Repositorio privado? Pide a su propietario que dé acceso a tu cuenta.',
  'team.ux.help.notFound.step3':
    '¿Has iniciado sesión con otra cuenta? Puede que el repositorio esté oculto para esa cuenta.',
  'team.ux.help.network.title': 'No se pudo conectar con el servidor',
  'team.ux.help.network.step1':
    'Comprueba tu conexión a Internet, la VPN o el proxy y vuelve a intentarlo.',
  'team.ux.help.network.step2': 'Comprueba el nombre del servidor en la dirección.',
  'team.ux.help.rejected.title': 'Tu equipo compartió cambios antes',
  'team.ux.help.rejected.step1':
    'Sincroniza para obtener sus cambios; los tuyos se comparten justo después.',
  'team.ux.help.noCommits.title': 'Aún no hay nada guardado',
  'team.ux.help.noCommits.step1': 'Guarda una versión primero y vuelve a intentarlo.',

  'team.ux.progress.saving': 'Guardando tus cambios como una versión…',
  'team.ux.progress.receiving': 'Obteniendo los cambios del equipo…',
  'team.ux.progress.sending': 'Compartiendo tus cambios…',
  'team.ux.progress.default': 'Sincronizando…',
  'team.ux.synced.upToDate': 'Sincronizado: ya estás al día con tu equipo.',
  'team.ux.synced.updates': { one: '{count} actualización', other: '{count} actualizaciones' },
  'team.ux.synced.received': {
    one: 'Sincronizado: {count} actualización recibida.',
    other: 'Sincronizado: {count} actualizaciones recibidas.'
  },
  'team.ux.synced.sent': {
    one: 'Sincronizado: {count} actualización enviada.',
    other: 'Sincronizado: {count} actualizaciones enviadas.'
  },
  'team.ux.synced.both': 'Sincronizado: {received} recibidas, {sent} enviadas.',

  'team.error.title': 'Eso no ha funcionado',
  'team.dismiss': 'Descartar',
  'team.identity.announce':
    'Tiger necesita tu nombre y tu correo antes de poder guardar una versión.',
  'team.identity.title': 'Dile a Tiger quién eres',
  'team.identity.explain':
    'Cada versión registra un nombre y un correo para que tus compañeros sepan quién cambió qué. Se guarda solo para esta colección.',
  'team.identity.name': 'Tu nombre',
  'team.identity.email': 'Correo de trabajo',
  'team.identity.save': 'Guardar y reintentar',
  'team.url.hint':
    'Cópiala del botón {code} de GitHub o de {clone} en GitLab. Ejemplos: {https} o {ssh}',
  'team.url.codeButton': 'Code',
  'team.url.cloneButton': 'Clone',
  'team.url.use': 'Usar {url}',
  'team.setup.title': 'Comparte esta colección con tu equipo',
  'team.setup.step1.title': 'Activar el seguimiento de versiones',
  'team.setup.step2.title': 'Conectar un repositorio compartido',
  'team.setup.step3.title': 'Compartirla con tu equipo',
  'team.setup.done': ' (hecho)',
  'team.setup.current': ' (paso actual)',
  'team.setup.todo': ' (pendiente)',
  'team.setup.step1.text':
    'Tiger guarda un historial de cada cambio en esta carpeta, para que veas quién cambió qué y puedas volver atrás. Todavía no sale nada de tu equipo.',
  'team.setup.step1.button': 'Activar el seguimiento de versiones',
  'team.setup.step1.progress': 'Activando el seguimiento de versiones…',
  'team.setup.step2.text':
    'Crea un repositorio vacío en GitHub, GitLab o el servidor de tu empresa (un desarrollador de tu equipo puede hacerlo en un minuto) y pega aquí su dirección.',
  'team.setup.step2.label': 'Dirección del repositorio',
  'team.setup.step2.connect': 'Conectar',
  'team.setup.step2.progress': 'Comprobando el acceso al repositorio…',
  'team.setup.step3.hasContent':
    'El repositorio ya tiene contenido: la primera sincronización lo combina con esta colección.',
  'team.setup.step3.empty':
    'Tiger guarda una primera versión y la sube. Tus compañeros usan después «Unirse a una colección de equipo» para obtenerla.',
  'team.setup.step3.button': 'Compartir ahora',
  'team.setup.commitNote': 'Compartir la colección con el equipo',
  'team.changes.added': 'Añadidas',
  'team.changes.changed': 'Modificadas',
  'team.changes.removed': 'Eliminadas',
  'team.changes.discardOne': 'Descartar los cambios de {name}',
  'team.changes.in': 'Cambios en {name}',
  'team.changes.noLines': 'Sin cambios de líneas (solo renombrado o permisos).',
  'team.discard.kindAdded': 'nueva, se eliminará',
  'team.discard.kindRemoved': 'eliminada, volverá',
  'team.discard.kindEdited': 'se perderán las ediciones',
  'team.discard.titleOne': '¿Descartar los cambios de {name}?',
  'team.discard.titleMany': '¿Descartar {count} cambios?',
  'team.discard.description':
    'Estas solicitudes vuelven a la última versión guardada. Puedes deshacerlo justo después.',
  'team.discard.one': 'Descartar',
  'team.discard.many': 'Descartar {count} cambios',
  'team.conflict.deleted': 'Eliminado en esta versión',
  'team.conflict.title': {
    one: 'Un compañero y tú habéis cambiado la misma solicitud',
    other: 'Un compañero y tú habéis cambiado las mismas solicitudes'
  },
  'team.conflict.explain':
    'Para cada solicitud, conserva tu versión o la del equipo. Solo las líneas que ambos editasteis siguen tu elección; el resto de ediciones, tuyas o del equipo, se conservan. El historial guarda ambas versiones.',
  'team.conflict.loading': 'Cargando las dos versiones…',
  'team.conflict.yours': 'Tu versión',
  'team.conflict.theirs': 'Versión del equipo',
  'team.conflict.which': 'Qué versión de {name} conservar',
  'team.conflict.keepMine': 'Conservar la mía',
  'team.conflict.keepTheirs': 'Conservar la suya',
  'team.conflict.finish': 'Terminar la sincronización',
  'team.conflict.keepAllMine': 'Conservar todo lo mío',
  'team.conflict.keepAllTheirs': 'Conservar todo lo suyo',
  'team.conflict.keepMyVersion': 'Conservar mi versión',
  'team.conflict.useTeams': 'Usar la versión del equipo',
  'team.conflict.later': 'Decidir más tarde',
  'team.conflict.chooseEach': 'Elige una versión para cada solicitud para terminar la sincronización.',
  'team.conflict.announce':
    'Conflicto: un compañero y tú habéis cambiado la misma solicitud. Elige qué versión conservar.',
  'team.join.desktopOnly': 'Unirse a una colección de equipo requiere la aplicación de escritorio de Tiger.',
  'team.join.downloading': 'Descargando la colección del equipo…',
  'team.join.description':
    'Obtén una copia de una colección que tu equipo comparte en un repositorio git. Después podrás sincronizar para recibir sus cambios y compartir los tuyos.',
  'team.join.downloadingButton': 'Descargando…',
  'team.join.choose': 'Elegir carpeta y unirse',
  'team.join.step1': '1. Dirección del repositorio',
  'team.join.step2': '2. Elige dónde guardarla en este equipo.',
  'team.join.step2b': 'Tiger crea allí una carpeta con el nombre del repositorio.',
  'team.join.step3': '3. Se abre aquí',
  'team.join.step3b': 'en la barra lateral, lista para usar.',

  'team.modal.checking': 'Comprobando el seguimiento de versiones…',
  'team.modal.browserTitle': 'La sincronización de equipo está en la aplicación de escritorio',
  'team.modal.browserText':
    'Abre esta colección en la aplicación de escritorio de Tiger para compartirla y recibir las actualizaciones del equipo.',
  'team.modal.noGitTitle': 'Git no está instalado',
  'team.modal.noGitText':
    'Tiger usa el Git que ya tienes para sincronizar colecciones, así tus claves SSH y credenciales siguen funcionando. Instálalo una vez y vuelve, sin reiniciar.',
  'team.modal.noGitMac': 'En macOS también puedes ejecutar {command} en Terminal.',
  'team.modal.downloadGit': 'Descargar Git',
  'team.modal.checkAgain': 'Comprobar de nuevo',
  'team.modal.syncTerm': 'obtiene los cambios del equipo y comparte los tuyos · git pull + push',
  'team.modal.checkUpdates': 'Buscar actualizaciones del equipo',
  'team.modal.checkingUpdates': 'Buscando actualizaciones del equipo…',
  'team.modal.savingVersion': 'Guardando una versión…',
  'team.modal.discarding': 'Descartando…',
  'team.modal.discardedOne': 'Cambios de {name} descartados.',
  'team.modal.discardedMany': '{count} cambios descartados.',
  'team.modal.restoring': 'Recuperando tus cambios…',
  'team.modal.combining': 'Combinando los cambios y compartiendo…',
  'team.modal.undo': 'Deshacer',
  'team.modal.yourChanges': 'Tus cambios',
  'team.modal.discardAll': 'Descartar todo…',
  'team.modal.describe': 'Describe esta versión',
  'team.modal.suggested': 'Sugerido a partir de tus cambios. Edítalo si quieres.',
  'team.modal.shownInHistory': 'Se muestra en el historial junto a tu nombre.',
  'team.modal.saveTitle': 'Guarda una versión en este equipo sin compartirla',
  'team.modal.saveTerm': 'la guarda aquí, no comparte nada · git commit',
  'team.modal.recent': 'Versiones recientes',
  'team.modal.advanced': 'Avanzado',
  'team.modal.forGitUsers': 'para usuarios de git',
  'team.modal.versionLine': 'Línea de versiones',
  'team.modal.versionLineHelp':
    'Una línea de versiones aparte, para probar cambios sin afectar a la principal del equipo. Tus compañeros la ven después de que compartas.',
  'team.modal.current': 'Actual',
  'team.modal.switching': 'Cambiando a {branch}…',
  'team.modal.newLineLabel': 'Nombre de la nueva línea de versiones',
  'team.modal.newLinePlaceholder': 'nueva línea, p. ej. feature/refunds',
  'team.modal.creating': 'Creando {branch}…',
  'team.modal.createSwitch': 'Crear y cambiar',
  'team.modal.oneStep': 'Un paso cada vez',
  'team.modal.fastForward': 'Solo avance rápido',
  'team.modal.shareOnceFirst': 'Comparte una vez primero',
  'team.modal.getOnly': 'Obtener solo los cambios del equipo',
  'team.modal.gettingTeam': 'Obteniendo los cambios del equipo…',
  'team.modal.shareOnly': 'Compartir solo las versiones',
  'team.modal.sharingVersions': 'Compartiendo tus versiones…',
  'team.modal.allUnsaved': 'Todos los cambios sin guardar',
  'team.modal.allUnsavedDiff': 'Todos los cambios sin guardar como diff'
}
