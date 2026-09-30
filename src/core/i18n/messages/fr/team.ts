import type { NamespaceCatalog } from '../../translator'
import type { team as en } from '../en/team'

export const team: NamespaceCatalog<typeof en> = {
  'team.git.err.authRequired':
    "Authentification requise. Configurez un gestionnaire d'identifiants Git, ou utilisez une URL SSH avec une clé dans votre agent.",
  'team.git.err.sshKey':
    "Clé SSH refusée. Ajoutez la bonne clé à votre agent SSH (par ex. ssh-add ~/.ssh/id_ed25519).",
  'team.git.err.authFailed':
    "Échec de l'authentification. Vérifiez votre nom d'utilisateur et votre jeton d'accès personnel.",
  'team.git.err.notFound':
    "Dépôt introuvable. Vérifiez l'URL, ou que votre compte y a accès.",
  'team.git.err.network':
    "Impossible de joindre l'hôte. Vérifiez votre réseau ou l'URL du dépôt.",
  'team.git.err.identity':
    'Git a besoin de votre nom et de votre e-mail avant de pouvoir enregistrer une version.',
  'team.git.err.rejected':
    "Le dépôt de l'équipe contient des modifications que vous n'avez pas encore. Synchronisez d'abord pour les combiner.",
  'team.git.err.noCommits': "Aucune version enregistrée pour l'instant. Enregistrez d'abord une version.",
  'team.git.prefix.save': "Impossible d'enregistrer vos modifications : {detail}",
  'team.git.prefix.get': "Impossible de récupérer les modifications de l'équipe : {detail}",
  'team.git.prefix.share': 'Impossible de partager vos modifications : {detail}',
  'team.git.prefix.combine': 'Impossible de combiner les modifications : {detail}',
  'team.git.prefix.restore': 'Impossible de récupérer les modifications : {detail}',
  'team.git.noRemote': 'Aucun dépôt distant configuré',
  'team.git.refreshed': 'Actualisé depuis le dépôt distant',
  'team.git.fetchFailed': "Échec de l'actualisation",
  'team.git.addFailed': 'Échec de git add',
  'team.git.committed': 'Version enregistrée',
  'team.git.nothingToCommit': 'Rien à enregistrer',
  'team.git.identityInvalid': 'Saisissez votre nom et une adresse e-mail valide',
  'team.git.identitySaved': 'Les versions seront enregistrées au nom de {name}',
  'team.git.saveNameFailed': "Impossible d'enregistrer votre nom",
  'team.git.upToDate': 'À jour',
  'team.git.pullFailed': 'Échec de la récupération',
  'team.git.pushed': 'Partagé',
  'team.git.pushFailed': 'Échec du partage',
  'team.git.trackingOn': 'Le suivi des versions est activé',
  'team.git.initFailed': 'Échec de git init',
  'team.git.notSetUp': "Ce dossier n'est pas encore configuré pour la synchronisation",
  'team.git.savedLocalOnly':
    'Enregistré sur cet ordinateur (aucun dépôt partagé connecté pour l\'instant)',
  'team.git.publishFailed': 'échec de la publication',
  'team.git.sharedNow': "Partagé : votre collection est maintenant sur le dépôt de l'équipe",
  'team.git.conflictSame': "Un coéquipier et vous avez modifié la même chose.",
  'team.git.pullFailedLower': 'échec de la récupération',
  'team.git.inSync': "Tout est synchronisé avec votre équipe",
  'team.git.mergeFailed': 'échec de la fusion',
  'team.git.doneChoices': "Terminé : vos choix ont été appliqués et partagés avec l'équipe.",
  'team.git.doneMine': 'Terminé : là où les modifications se chevauchaient, votre version a prévalu.',
  'team.git.doneTheirs':
    "Terminé : là où les modifications se chevauchaient, la version de l'équipe a prévalu.",
  'team.git.notRepoUrl': "Cela ne ressemble pas à une URL de dépôt",
  'team.git.addRemoteFailed': "Impossible d'ajouter le dépôt distant",
  'team.git.cannotReach': 'Impossible de joindre le dépôt',
  'team.git.connected': 'Connecté au dépôt partagé',
  'team.git.createdBranch': 'Branche {branch} créée et activée',
  'team.git.switchedBranch': 'Passage à {branch}',
  'team.git.saveOrDiscard': 'Enregistrez ou abandonnez vos modifications avant de changer de branche.',
  'team.git.checkoutFailed': 'Échec du changement de branche',
  'team.git.noVersionBack':
    "Aucune version enregistrée à laquelle revenir pour l'instant. Enregistrez d'abord une version.",
  'team.git.discardFailed': "Impossible d'abandonner les modifications",
  'team.git.nothingToDiscard': 'Rien à abandonner',
  'team.git.discarded': 'Modifications non enregistrées abandonnées',
  'team.git.nothingToUndo': 'Rien à annuler',
  'team.git.applyFailed': "échec de l'application",
  'team.git.restored': 'Modifications restaurées',
  'team.git.cloned': 'Cloné dans {dir}',
  'team.git.cloneFailed': 'Échec du clonage',

  'team.ux.checking.label': 'Vérification…',
  'team.ux.checking.short': 'Vérification',
  'team.ux.checking.detail': 'Vérification du suivi des versions.',
  'team.ux.untracked.label': 'Non suivi',
  'team.ux.untracked.detail':
    "Activez le suivi des versions pour garder l'historique des modifications et partager cette collection avec votre équipe.",
  'team.ux.conflict.label': 'Conflit : une décision est nécessaire',
  'team.ux.conflict.short': 'Conflit',
  'team.ux.conflict.detail':
    'Un coéquipier et vous avez modifié la même requête. Choisissez la version à garder.',
  'team.ux.updates.label': {
    one: '{count} mise à jour de l\'équipe',
    other: "{count} mises à jour de l'équipe"
  },
  'team.ux.updates.detailBoth':
    "Votre équipe a fait des modifications, vous aussi. La synchronisation combine les deux.",
  'team.ux.updates.detailTeam':
    "Votre équipe a fait des modifications que vous n'avez pas encore. Synchronisez pour les récupérer.",
  'team.ux.localChanges.label': {
    one: '{count} modification locale',
    other: '{count} modifications locales'
  },
  'team.ux.localChanges.detailShared':
    'Enregistrées sur cet ordinateur, pas encore partagées. Synchronisez pour les partager avec votre équipe.',
  'team.ux.localChanges.detailLocal':
    "Enregistrées sur cet ordinateur. Enregistrez une version pour les garder dans l'historique.",
  'team.ux.toShare.label': { one: '{count} version à partager', other: '{count} versions à partager' },
  'team.ux.toShare.detail':
    'Enregistrées comme versions, pas encore partagées. Synchronisez pour les partager avec votre équipe.',
  'team.ux.localOnly.label': 'Uniquement sur cet ordinateur',
  'team.ux.localOnly.detail':
    'Les versions sont conservées sur cet ordinateur. Connectez un dépôt partagé pour travailler avec votre équipe.',
  'team.ux.unpublished.label': 'Pas encore partagé',
  'team.ux.unpublished.detail':
    'Connecté à un dépôt partagé. Synchronisez une fois pour y publier cette collection.',
  'team.ux.upToDate.label': 'À jour',
  'team.ux.upToDate.detail': 'Tout est synchronisé avec votre équipe.',

  'team.ux.name.collection': 'Paramètres de la collection',
  'team.ux.name.folder': 'Paramètres du dossier {folder}',
  'team.ux.name.folderFallback': 'Dossier',
  'team.ux.name.environment': 'Environnement {name}',
  'team.ux.note.update': 'mise à jour de {items}',
  'team.ux.note.add': 'ajout de {items}',
  'team.ux.note.remove': 'suppression de {items}',
  'team.ux.note.separator': ', ',
  'team.ux.note.pair': '{a} et {b}',
  'team.ux.note.more': '{a}, {b} et {count} autres',
  'team.ux.note.requests': { one: '{count} requête', other: '{count} requêtes' },

  'team.ux.url.noSpaces': "Une adresse de dépôt ne contient pas d'espaces.",
  'team.ux.url.addHttps': 'Ajoutez https:// au début.',
  'team.ux.url.paste':
    "Collez l'adresse du bouton Code sur GitHub ou du bouton Clone sur GitLab. Elle commence par https:// ou git@.",
  'team.ux.url.incomplete':
    "Cette adresse n'est pas complète. Copiez-la à nouveau depuis la page de votre dépôt.",
  'team.ux.url.accountPage':
    "C'est une page de compte. Ouvrez le dépôt et copiez son adresse.",
  'team.ux.url.repoPage':
    "C'est une page à l'intérieur du dépôt. Utilisez plutôt l'adresse du dépôt.",
  'team.ux.url.addPath': "Ajoutez le chemin du dépôt après le nom du serveur.",

  'team.ux.link.gcm': 'Installer Git Credential Manager',
  'team.ux.link.githubToken': "GitHub : créer un jeton d'accès personnel",
  'team.ux.link.gitlabToken': "GitLab : créer un jeton d'accès personnel",
  'team.ux.link.githubSsh': 'GitHub : se connecter avec une clé SSH',
  'team.ux.link.gitForWindows': 'Télécharger Git pour Windows',
  'team.ux.help.authRequired.title': 'Connexion requise pour accéder à ce dépôt',
  'team.ux.help.authRequired.winStep1':
    'Git pour Windows inclut Git Credential Manager. Réessayez : une fenêtre de connexion devrait s\'ouvrir.',
  'team.ux.help.authRequired.winStep2':
    'Pas de fenêtre ? Réinstallez Git pour Windows en gardant « Git Credential Manager » coché.',
  'team.ux.help.authRequired.sshStep':
    "Ou utilisez l'adresse SSH (git@…) si vous avez déjà une clé SSH.",
  'team.ux.help.authRequired.step1':
    "Installez Git Credential Manager, puis réessayez et connectez-vous dans la fenêtre du navigateur qui s'ouvre.",
  'team.ux.help.authRequired.step2':
    "Ou connectez-vous une fois depuis un terminal : lancez git clone avec cette adresse et collez un jeton d'accès personnel comme mot de passe.",
  'team.ux.help.authFailed.title': 'Votre connexion a été refusée',
  'team.ux.help.authFailed.step1':
    "GitHub et GitLab n'acceptent pas les mots de passe de compte ici : utilisez un jeton d'accès personnel comme mot de passe.",
  'team.ux.help.authFailed.win':
    "Un mauvais mot de passe est peut-être enregistré : supprimez-le dans le Gestionnaire d'identifiants Windows, puis réessayez.",
  'team.ux.help.authFailed.mac':
    "Un mauvais mot de passe est peut-être enregistré : supprimez-le dans Trousseau d'accès (cherchez le nom du serveur), puis réessayez.",
  'team.ux.help.authFailed.other':
    "Un mauvais mot de passe est peut-être enregistré par votre gestionnaire d'identifiants : supprimez-le, puis réessayez.",
  'team.ux.help.sshKey.title': "Votre clé SSH n'a pas été acceptée",
  'team.ux.help.sshKey.step1':
    'Vérifiez que votre clé publique est ajoutée à votre compte GitHub ou GitLab.',
  'team.ux.help.sshKey.win':
    'Démarrez le service « OpenSSH Authentication Agent », puis lancez ssh-add dans un terminal.',
  'team.ux.help.sshKey.other': 'Chargez votre clé dans un terminal : ssh-add ~/.ssh/id_ed25519',
  'team.ux.help.sshKey.step3': "Ou utilisez plutôt l'adresse https://.",
  'team.ux.help.notFound.title': 'Dépôt introuvable',
  'team.ux.help.notFound.step1':
    "Vérifiez l'adresse : copiez-la depuis le bouton Code sur GitHub ou le bouton Clone sur GitLab.",
  'team.ux.help.notFound.step2':
    "Dépôt privé ? Demandez à son propriétaire de donner accès à votre compte.",
  'team.ux.help.notFound.step3':
    'Connecté avec un autre compte ? Le dépôt est peut-être masqué pour ce compte.',
  'team.ux.help.network.title': 'Impossible de joindre le serveur',
  'team.ux.help.network.step1':
    'Vérifiez votre connexion Internet, votre VPN ou votre proxy, puis réessayez.',
  'team.ux.help.network.step2': "Vérifiez le nom du serveur dans l'adresse.",
  'team.ux.help.rejected.title': "Votre équipe a partagé des modifications avant vous",
  'team.ux.help.rejected.step1':
    'Synchronisez pour récupérer leurs modifications ; les vôtres sont partagées juste après.',
  'team.ux.help.noCommits.title': 'Rien d\'enregistré pour l\'instant',
  'team.ux.help.noCommits.step1': "Enregistrez d'abord une version, puis réessayez.",

  'team.ux.progress.saving': 'Enregistrement de vos modifications comme version…',
  'team.ux.progress.receiving': "Récupération des modifications de l'équipe…",
  'team.ux.progress.sending': 'Partage de vos modifications…',
  'team.ux.progress.default': 'Synchronisation…',
  'team.ux.synced.upToDate': 'Synchronisé : déjà à jour avec votre équipe.',
  'team.ux.synced.updates': { one: '{count} mise à jour', other: '{count} mises à jour' },
  'team.ux.synced.received': {
    one: 'Synchronisé : {count} mise à jour reçue.',
    other: 'Synchronisé : {count} mises à jour reçues.'
  },
  'team.ux.synced.sent': {
    one: 'Synchronisé : {count} mise à jour envoyée.',
    other: 'Synchronisé : {count} mises à jour envoyées.'
  },
  'team.ux.synced.both': 'Synchronisé : {received} reçues, {sent} envoyées.',

  'team.error.title': "Cela n'a pas fonctionné",
  'team.dismiss': 'Ignorer',
  'team.identity.announce':
    'Tiger a besoin de votre nom et de votre e-mail avant de pouvoir enregistrer une version.',
  'team.identity.title': 'Dites à Tiger qui vous êtes',
  'team.identity.explain':
    "Chaque version enregistre un nom et un e-mail pour que vos coéquipiers sachent qui a modifié quoi. Enregistrés pour cette collection uniquement.",
  'team.identity.name': 'Votre nom',
  'team.identity.email': 'E-mail professionnel',
  'team.identity.save': 'Enregistrer et réessayer',
  'team.url.hint':
    'Copiez-la depuis le bouton {code} sur GitHub ou {clone} sur GitLab. Exemples : {https} ou {ssh}',
  'team.url.codeButton': 'Code',
  'team.url.cloneButton': 'Clone',
  'team.url.use': 'Utiliser {url}',
  'team.setup.title': 'Partager cette collection avec votre équipe',
  'team.setup.step1.title': 'Activer le suivi des versions',
  'team.setup.step2.title': 'Connecter un dépôt partagé',
  'team.setup.step3.title': 'La partager avec votre équipe',
  'team.setup.done': ' (terminée)',
  'team.setup.current': ' (étape en cours)',
  'team.setup.todo': ' (à faire)',
  'team.setup.step1.text':
    "Tiger garde l'historique de chaque modification dans ce dossier, pour voir qui a modifié quoi et revenir en arrière. Rien ne quitte encore votre ordinateur.",
  'team.setup.step1.button': 'Activer le suivi des versions',
  'team.setup.step1.progress': 'Activation du suivi des versions…',
  'team.setup.step2.text':
    "Créez un dépôt vide sur GitHub, GitLab ou le serveur de votre entreprise (un développeur de votre équipe peut le faire en une minute), puis collez son adresse ici.",
  'team.setup.step2.label': 'Adresse du dépôt',
  'team.setup.step2.connect': 'Connecter',
  'team.setup.step2.progress': "Vérification de l'accès au dépôt…",
  'team.setup.step3.hasContent':
    'Le dépôt contient déjà du contenu : la première synchronisation le combine avec cette collection.',
  'team.setup.step3.empty':
    'Tiger enregistre une première version et l\'envoie. Vos coéquipiers utilisent ensuite « Rejoindre une collection d\'équipe » pour la récupérer.',
  'team.setup.step3.button': 'Partager maintenant',
  'team.setup.commitNote': "Partage de la collection avec l'équipe",
  'team.changes.added': 'Ajoutées',
  'team.changes.changed': 'Modifiées',
  'team.changes.removed': 'Supprimées',
  'team.changes.discardOne': 'Abandonner les modifications de {name}',
  'team.changes.in': 'Modifications dans {name}',
  'team.changes.noLines': 'Aucune ligne modifiée (renommage ou permissions uniquement).',
  'team.discard.kindAdded': 'nouvelle, sera supprimée',
  'team.discard.kindRemoved': 'supprimée, sera restaurée',
  'team.discard.kindEdited': 'les modifications seront perdues',
  'team.discard.titleOne': 'Abandonner les modifications de {name} ?',
  'team.discard.titleMany': 'Abandonner {count} modifications ?',
  'team.discard.description':
    'Ces requêtes reviennent à la dernière version enregistrée. Vous pourrez annuler juste après.',
  'team.discard.one': 'Abandonner',
  'team.discard.many': 'Abandonner {count} modifications',
  'team.conflict.deleted': 'Supprimé dans cette version',
  'team.conflict.title': {
    one: 'Un coéquipier et vous avez modifié la même requête',
    other: 'Un coéquipier et vous avez modifié les mêmes requêtes'
  },
  'team.conflict.explain':
    "Pour chaque requête, gardez votre version ou celle de l'équipe. Seules les lignes que vous avez toutes deux modifiées suivent votre choix ; toutes les autres modifications, de vous ou de l'équipe, sont conservées. L'historique garde les deux versions.",
  'team.conflict.loading': 'Chargement des deux versions…',
  'team.conflict.yours': 'Votre version',
  'team.conflict.theirs': "Version de l'équipe",
  'team.conflict.which': 'Quelle version de {name} garder',
  'team.conflict.keepMine': 'Garder la mienne',
  'team.conflict.keepTheirs': 'Garder la leur',
  'team.conflict.finish': 'Terminer la synchronisation',
  'team.conflict.keepAllMine': 'Tout garder de moi',
  'team.conflict.keepAllTheirs': "Tout garder d'eux",
  'team.conflict.keepMyVersion': 'Garder ma version',
  'team.conflict.useTeams': "Utiliser la version de l'équipe",
  'team.conflict.later': 'Décider plus tard',
  'team.conflict.chooseEach': 'Choisissez une version pour chaque requête pour terminer la synchronisation.',
  'team.conflict.announce':
    'Conflit : un coéquipier et vous avez modifié la même requête. Choisissez la version à garder.',
  'team.join.desktopOnly':
    "Rejoindre une collection d'équipe nécessite l'application de bureau Tiger.",
  'team.join.downloading': "Téléchargement de la collection d'équipe…",
  'team.join.description':
    "Obtenez une copie d'une collection que votre équipe partage dans un dépôt git. Vous pourrez ensuite synchroniser pour récupérer leurs modifications et partager les vôtres.",
  'team.join.downloadingButton': 'Téléchargement…',
  'team.join.choose': 'Choisir un dossier et rejoindre',
  'team.join.step1': '1. Adresse du dépôt',
  'team.join.step2': '2. Choisissez où la garder sur cet ordinateur.',
  'team.join.step2b': 'Tiger y crée un dossier nommé d\'après le dépôt.',
  'team.join.step3': "3. Elle s'ouvre ici",
  'team.join.step3b': 'dans la barre latérale, prête à être utilisée.',

  'team.modal.checking': 'Vérification du suivi des versions…',
  'team.modal.browserTitle': "La synchronisation d'équipe se trouve dans l'application de bureau",
  'team.modal.browserText':
    "Ouvrez cette collection dans l'application de bureau Tiger pour la partager et recevoir les mises à jour de l'équipe.",
  'team.modal.noGitTitle': "Git n'est pas installé",
  'team.modal.noGitText':
    "Tiger utilise le Git que vous avez déjà pour synchroniser les collections, ce qui conserve vos clés SSH et vos identifiants. Installez-le une fois puis revenez, sans redémarrage.",
  'team.modal.noGitMac': 'Sur macOS, vous pouvez aussi lancer {command} dans le Terminal.',
  'team.modal.downloadGit': 'Télécharger Git',
  'team.modal.checkAgain': 'Vérifier à nouveau',
  'team.modal.syncTerm': "récupère les modifications de l'équipe, puis partage les vôtres · git pull + push",
  'team.modal.checkUpdates': "Rechercher les mises à jour de l'équipe",
  'team.modal.checkingUpdates': "Recherche des mises à jour de l'équipe…",
  'team.modal.savingVersion': "Enregistrement d'une version…",
  'team.modal.discarding': 'Abandon en cours…',
  'team.modal.discardedOne': 'Modifications de {name} abandonnées.',
  'team.modal.discardedMany': '{count} modifications abandonnées.',
  'team.modal.restoring': 'Restauration de vos modifications…',
  'team.modal.combining': 'Combinaison des modifications et partage…',
  'team.modal.undo': 'Annuler',
  'team.modal.yourChanges': 'Vos modifications',
  'team.modal.discardAll': 'Tout abandonner…',
  'team.modal.describe': 'Décrire cette version',
  'team.modal.suggested': 'Suggéré à partir de vos modifications. Modifiez-le si vous le souhaitez.',
  'team.modal.shownInHistory': "Affiché dans l'historique à côté de votre nom.",
  'team.modal.saveTitle': 'Garder une version sur cet ordinateur sans la partager',
  'team.modal.saveTerm': 'la garde ici, ne partage rien · git commit',
  'team.modal.recent': 'Versions récentes',
  'team.modal.advanced': 'Avancé',
  'team.modal.forGitUsers': 'pour les utilisateurs de git',
  'team.modal.versionLine': 'Ligne de versions',
  'team.modal.versionLineHelp':
    "Une ligne de versions distincte, pour essayer des modifications sans toucher à la ligne principale de l'équipe. Vos coéquipiers la voient après votre partage.",
  'team.modal.current': 'Actuelle',
  'team.modal.switching': 'Passage à {branch}…',
  'team.modal.newLineLabel': 'Nom de la nouvelle ligne de versions',
  'team.modal.newLinePlaceholder': 'nouvelle ligne, par ex. feature/refunds',
  'team.modal.creating': 'Création de {branch}…',
  'team.modal.createSwitch': 'Créer et basculer',
  'team.modal.oneStep': 'Une étape à la fois',
  'team.modal.fastForward': 'Avance rapide uniquement',
  'team.modal.shareOnceFirst': "Partagez d'abord une fois",
  'team.modal.getOnly': "Récupérer uniquement les modifications de l'équipe",
  'team.modal.gettingTeam': "Récupération des modifications de l'équipe…",
  'team.modal.shareOnly': 'Partager uniquement les versions',
  'team.modal.sharingVersions': 'Partage de vos versions…',
  'team.modal.allUnsaved': 'Toutes les modifications non enregistrées',
  'team.modal.allUnsavedDiff': 'Toutes les modifications non enregistrées sous forme de diff'
}
