import type { NamespaceCatalog } from '../../translator'
import type { settings as en } from '../en/settings'

export const settings: NamespaceCatalog<typeof en> = {
  'settings.title': 'Paramètres',
  'settings.subtitle': 'Les préférences sont enregistrées localement sur cet ordinateur.',
  'settings.sectionsLabel': 'Sections des paramètres',

  'settings.tabs.general.label': 'Général',
  'settings.tabs.general.intro': "L'apparence de Tiger et le temps d'attente d'un serveur.",
  'settings.tabs.network.label': 'Réseau',
  'settings.tabs.network.intro':
    'Redirections, vérifications SSL, proxy et cookies : comment les requêtes quittent votre machine.',
  'settings.tabs.advanced.label': 'Avancé',
  'settings.tabs.advanced.intro':
    "Certificats pour les réseaux d'entreprise et TLS mutuel. La plupart des gens n'en ont jamais besoin.",
  'settings.tabs.mcp.label': 'Assistants IA (MCP)',
  'settings.tabs.mcp.intro':
    "Permettez à Claude, Cursor et à d'autres assistants IA de lister et d'exécuter les requêtes d'une collection.",
  'settings.tabs.privacy.label': 'Confidentialité',
  'settings.tabs.privacy.intro':
    "Ce que Tiger envoie sur sa propre utilisation. Jamais vos requêtes.",
  'settings.tabs.about.label': 'À propos',
  'settings.tabs.about.intro': 'Version, mises à jour et informations sur le projet.',

  'settings.appearance.label': 'Apparence',
  'settings.appearance.desc': 'Verre clair, verre sombre, ou suivre le système.',
  'settings.theme.light': 'Clair',
  'settings.theme.dark': 'Sombre',
  'settings.theme.system': 'Système',

  'settings.language.label': 'Langue',
  'settings.language.desc':
    'La langue des menus, des boutons et des messages. Le changement est immédiat.',
  'settings.language.system': 'Langue du système',
  'settings.language.systemCurrent': 'Langue du système ({language})',

  'settings.timeout.label': 'Délai d’attente des requêtes',
  'settings.timeout.desc': 'Combien de temps attendre avant d’abandonner, en millisecondes.',
  'settings.timeout.aria': 'Délai d’attente des requêtes (ms)',
  'settings.fontSize.label': 'Taille de police de l’éditeur',
  'settings.fontSize.desc': 'Taille du texte à chasse fixe dans les éditeurs et la réponse.',

  'settings.redirects.label': 'Suivre les redirections',
  'settings.redirects.desc': 'Suivre automatiquement les réponses 3xx jusqu’à leur cible.',
  'settings.ssl.label': 'Vérifier les certificats SSL',
  'settings.ssl.desc':
    'Désactivez pour autoriser les certificats auto-signés (développement uniquement).',
  'settings.proxy.label': 'Utiliser un proxy',
  'settings.proxy.desc': 'Faire passer toutes les requêtes par un proxy HTTP/HTTPS ou SOCKS.',
  'settings.proxy.url.label': 'URL du proxy',
  'settings.proxy.url.desc': 'ex. http://127.0.0.1:8080 ou socks5://127.0.0.1:1080',
  'settings.proxy.username.label': 'Nom d’utilisateur du proxy',
  'settings.proxy.username.desc':
    'Envoyé lorsque le proxy demande une authentification. Laissez vide si aucune.',
  'settings.proxy.username.placeholder': 'nom d’utilisateur',
  'settings.proxy.password.label': 'Mot de passe du proxy',
  'settings.proxy.password.desc': 'Stocké localement sur cet ordinateur, jamais synchronisé.',
  'settings.proxy.password.placeholder': 'mot de passe',
  'settings.cookies.label': 'Jar de cookies persistant',
  'settings.cookies.desc':
    'Conserver les cookies entre les envois et les sessions. Ils sont enregistrés localement et renvoyés avec les requêtes suivantes vers les domaines correspondants.',
  'settings.cookies.clear': 'Effacer les cookies',
  'settings.cookies.cleared': 'Effacés',
  'settings.cookies.announceCleared': 'Cookies effacés',

  'settings.certExceptions.label': 'Exceptions de certificat',
  'settings.certExceptions.desc':
    'Noms d’hôte (séparés par des virgules) pour lesquels les certificats invalides ou internes sont acceptés, par exemple intranet.acme.local. Plus sûr que de désactiver la vérification partout.',
  'settings.certExceptions.placeholder': 'hôte1, hôte2',
  'settings.maxRedirects.label': 'Redirections maximales',
  'settings.maxRedirects.desc': 'Limite supérieure lors du suivi des réponses 3xx.',
  'settings.certSubject.label': 'Filtre sur le sujet du certificat client',
  'settings.certSubject.desc':
    'Lorsqu’un serveur demande un certificat client, choisir celui dont le sujet contient ce texte',
  'settings.certSubject.placeholder': 'ex. CN=alice',
  'settings.certificates.group': 'Certificats',
  'settings.files.notSet': 'Non défini',
  'settings.files.choose': 'Choisir un fichier',
  'settings.files.chooseAria': 'Choisir un fichier : {label}',
  'settings.files.clear': 'Effacer',
  'settings.files.clearAria': 'Effacer {label}',
  'settings.files.ca.label': 'Bundle CA (PEM)',
  'settings.files.ca.desc':
    'Autorités de certification supplémentaires à approuver, par ex. l’AC interne de votre entreprise.',
  'settings.files.ca.filter': 'Certificat PEM',
  'settings.files.clientCert.label': 'Certificat client (PEM)',
  'settings.files.clientCert.desc':
    'Votre certificat, pour les serveurs qui demandent qui vous êtes (TLS mutuel).',
  'settings.files.clientKey.label': 'Clé client (PEM)',
  'settings.files.clientKey.desc': 'La clé privée associée au certificat client.',
  'settings.files.clientKey.filter': 'Clé PEM',
  'settings.files.pfx.label': 'Bundle PFX / P12',
  'settings.files.pfx.desc': 'Certificat et clé dans un seul fichier, à la place des deux fichiers PEM.',
  'settings.files.pfx.filter': 'Bundle PFX / P12',
  'settings.passphrase.label': 'Phrase secrète du certificat',
  'settings.passphrase.desc': 'Déverrouille la clé ou le bundle ci-dessus, s’il a un mot de passe.',
  'settings.passphrase.placeholder': 'phrase secrète',
  'settings.certHint': 'Les requêtes qui utilisent des certificats importés contournent le proxy.',

  'settings.mcp.intro':
    'Tiger inclut un serveur MCP (Model Context Protocol) qui expose vos collections à Claude Desktop et aux autres clients compatibles MCP. Ajoutez l’extrait ci-dessous à votre {file} pour vous connecter.',
  'settings.mcp.pathPlaceholder': '<chemin de votre dossier de collection>',
  'settings.mcp.note':
    'Remplacez {placeholder} par le chemin absolu du dossier que vous avez ouvert dans Tiger. Vous pouvez avoir une entrée par collection.',
  'settings.mcp.copySnippet': 'Copier l’extrait',
  'settings.mcp.snippetCopied': 'Extrait copié',
  'settings.mcp.loading': 'Chargement…',

  'settings.analytics.label': 'Statistiques d’utilisation anonymes',
  'settings.analytics.desc':
    'Activé par défaut. N’envoie que des événements anonymes et agrégés (jamais d’URL, d’en-têtes ni de corps). Désactivable à tout moment.',
  'settings.analytics.aria': 'Statistiques',

  'settings.autoUpdate.label': 'Installer les mises à jour automatiquement',
  'settings.autoUpdate.desc':
    'Télécharge les nouvelles versions en arrière-plan et les installe au redémarrage ou à la fermeture de Tiger. Désactivé, Tiger demande avant de télécharger. Les installations Microsoft Store et Linux .deb se mettent à jour via leur propre boutique ou gestionnaire de paquets.',
  'settings.about.tagline': 'Un client d’API local d’abord, pour les équipes.',
  'settings.about.version': 'Version {version}',

  'settings.update.title': 'Mise à jour du logiciel',
  'settings.update.later': 'Plus tard',
  'settings.update.download': 'Télécharger',
  'settings.update.restartNow': 'Redémarrer maintenant',
  'settings.update.releaseNotes': 'Notes de version',
  'settings.update.releaseNotesFor': 'Notes de version de {version}',
  'settings.update.hide': 'Masquer',
  'settings.update.hideProgress': 'Masquer la progression de la mise à jour',
  'settings.update.manualTitle': 'Mise à jour disponible · v{version}',
  'settings.update.manualDesc':
    'Vous utilisez la v{current}. La version {latest} est prête à être téléchargée.',
  'settings.update.downloadUpdate': 'Télécharger la mise à jour',
  'settings.update.whatChanged': 'Ce qui a changé',
  'settings.update.downloadFromWebsite': 'Télécharger depuis le site',
  'settings.update.continueInBackground': 'Continuer en arrière-plan',
  'settings.update.downloadingAria': 'Téléchargement de la mise à jour {version}',
  'settings.update.laterHint':
    'Choisissez Plus tard pour l’installer à la prochaine fermeture de Tiger.',
  'settings.update.upToDateVersion': 'Tiger {version} est la dernière version.',
  'settings.update.status.checking': 'Recherche de mises à jour…',
  'settings.update.status.upToDate': 'Vous utilisez la dernière version.',
  'settings.update.status.available': 'Tiger {version} est disponible.',
  'settings.update.status.downloading': 'Téléchargement de la mise à jour {version}… {percent} %',
  'settings.update.status.downloaded': 'Tiger {version} est prêt. Redémarrez pour mettre à jour.',
  'settings.update.announceDownloading': 'Téléchargement de Tiger {version} en arrière-plan.',
  'settings.update.error.offline':
    'Impossible de joindre le serveur de mises à jour. Vérifiez votre connexion et réessayez.',
  'settings.update.error.notPublished':
    'Aucune mise à jour n’est encore publiée pour cette plateforme.',
  'settings.update.error.verification':
    'La mise à jour téléchargée a échoué à la vérification et n’a pas été installée.',
  'settings.update.error.failedDetail': 'Échec de la mise à jour : {detail}',
  'settings.update.error.failed': 'Échec de la mise à jour.'
}
