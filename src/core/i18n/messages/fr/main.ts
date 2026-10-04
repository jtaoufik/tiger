import type { NamespaceCatalog } from '../../translator'
import type { main as en } from '../en/main'

export const main: NamespaceCatalog<typeof en> = {
  'main.dialog.openCollection': 'Ouvrir un dossier de collection Tiger',
  'main.dialog.newCollection': 'Choisissez où créer « {name} »',
  'main.dialog.createHere': 'Créer ici',
  'main.dialog.cloneTitle': 'Choisissez où enregistrer la collection d’équipe',
  'main.dialog.saveHere': 'Enregistrer ici',
  'main.dialog.unsavedTitle': 'Vous avez des modifications non enregistrées',
  'main.dialog.unsavedDetail': 'Fermer maintenant supprime les modifications pas encore enregistrées.',
  'main.dialog.closeAnyway': 'Fermer quand même',
  'main.dialog.updateUnsavedDetail': 'Redémarrer pour mettre à jour supprime les modifications pas encore enregistrées.',
  'main.dialog.restartAnyway': 'Redémarrer quand même',
  'main.dialog.keepEditing': 'Continuer à modifier',
  'main.dialog.saveResponse': 'Enregistrer le corps de la réponse',
  'main.import.postman': 'Collection Postman',
  'main.import.insomnia': 'Export Insomnia',
  'main.import.wsdl': 'Document WSDL',
  'main.import.openapi': 'Document OpenAPI / Swagger',
  'main.import.brunoFolder': 'Importer un dossier de collection Bruno',
  'main.import.failed': 'Ce fichier n’a pas pu être importé : {reason}',
  'main.export.title': 'Exporter',
  'main.http.certRead': 'Impossible de lire le fichier de certificat : {reason}',
  'main.http.tokenStatus': 'Le point de terminaison du jeton a renvoyé {status}',
  'main.http.tokenMissing': 'La réponse du jeton ne contenait pas d’access_token',
  'main.realtime.badUrl': 'Cette adresse ne convient pas à cette connexion : {url}',
  'main.realtime.refused': 'Rien n’écoute à l’adresse {url}',
  'main.realtime.proxyTimeout': 'Le proxy n’a pas répondu à temps',
  'main.realtime.proxyRefused': 'Le proxy a refusé la connexion (statut {status})',
  'main.realtime.handshakeStatus': 'Le serveur a répondu {status} au lieu d’ouvrir le WebSocket',
  'main.realtime.sseStatus': 'Le serveur a répondu {status} au lieu d’un flux d’événements',
  'main.realtime.sseType': 'Le serveur a envoyé {type} au lieu de text/event-stream'
}
