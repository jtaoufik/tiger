import type { NamespaceCatalog } from '../../translator'
import type { imports as en } from '../en/imports'

export const imports: NamespaceCatalog<typeof en> = {
  'imports.dynamicVars':
    'Utilise des variables dynamiques que Tiger ne génère pas : {names}. Définissez-les dans un environnement ou remplacez-les.',
  'imports.preScriptCalls':
    'Le script de pré-requête utilise des appels que Tiger ne peut pas exécuter : {calls}. Le script est conservé ; vérifiez-le.',
  'imports.testScriptCalls':
    'Le script de test utilise des appels que Tiger ne peut pas exécuter : {calls}. Le script est conservé ; vérifiez-le.',
  'imports.formFileMissing':
    'Le champ de formulaire « {field} » est un envoi de fichier, mais aucun fichier n’est enregistré dans l’export. Choisissez le fichier dans l’onglet Corps.',
  'imports.formFileNone':
    'Le champ de formulaire « {field} » est un envoi de fichier sans fichier choisi. Choisissez le fichier dans l’onglet Corps.',
  'imports.formFileUpload':
    'Le champ de formulaire « {field} » envoie {files}. Vérifiez que le fichier existe sur cet ordinateur.',
  'imports.formFileUploadFirstOnly':
    'Le champ de formulaire « {field} » envoie {files}. Vérifiez que le fichier existe sur cet ordinateur. Seul le premier fichier a été conservé.',
  'imports.binaryBody':
    'Envoie un corps de fichier binaire, que Tiger ne prend pas encore en charge. Le corps a été laissé vide.',
  'imports.oauthBodyCreds':
    'Dans Postman, OAuth 2.0 envoie les identifiants du client dans le corps ; Tiger les envoie dans un en-tête Basic. Vérifiez que la requête de jeton fonctionne.',
  'imports.oauthUnsupportedToken':
    'OAuth 2.0 « {grant} » n’est pas pris en charge. Le jeton d’accès enregistré a été importé comme jeton Bearer ; il expirera.',
  'imports.oauthUnsupportedNone':
    'OAuth 2.0 « {grant} » n’est pas pris en charge. L’authentification a été réglée sur aucune ; obtenez un jeton et utilisez l’authentification Bearer.',
  'imports.authUnsupported':
    'L’authentification {auth} n’est pas prise en charge. Elle a été réglée sur aucune ; configurez-la à nouveau.',
  'imports.methodUnsupported': 'La méthode {method} n’est pas prise en charge, cette requête a donc été ignorée.',
  'imports.pathVariables': {
    one: 'La variable de chemin {names} n’avait pas de valeur et est devenue {values}. Définissez-la dans un environnement.',
    other:
      'Les variables de chemin {names} n’avaient pas de valeur et sont devenues {values}. Définissez-les dans un environnement.'
  },
  'imports.scriptsCopiedPre': {
    one: '{owner} contient des scripts de pré-requête. Tiger exécute les scripts par requête : ils ont été copiés dans sa {count} requête. Modifiez-les là.',
    other:
      '{owner} contient des scripts de pré-requête. Tiger exécute les scripts par requête : ils ont été copiés dans ses {count} requêtes. Modifiez-les là.'
  },
  'imports.scriptsCopiedPost': {
    one: '{owner} contient des scripts de test. Tiger exécute les scripts par requête : ils ont été copiés dans sa {count} requête. Modifiez-les là.',
    other:
      '{owner} contient des scripts de test. Tiger exécute les scripts par requête : ils ont été copiés dans ses {count} requêtes. Modifiez-les là.'
  },
  'imports.scriptsCopiedBoth': {
    one: '{owner} contient des scripts de pré-requête et de test. Tiger exécute les scripts par requête : ils ont été copiés dans sa {count} requête. Modifiez-les là.',
    other:
      '{owner} contient des scripts de pré-requête et de test. Tiger exécute les scripts par requête : ils ont été copiés dans ses {count} requêtes. Modifiez-les là.'
  },
  'imports.postmanGlobals':
    'Les variables globales Postman ont été ajoutées à chaque environnement importé. Quand un environnement définit la même variable, sa propre valeur l’emporte.',
  'imports.globalsEnv':
    'Les variables globales Postman sont devenues l’environnement « {name} ». Il est sélectionné pour vous.',
  'imports.secretsNotExported': 'Postman n’exporte pas les valeurs secrètes : {names}. Renseignez-les.',
  'imports.postmanV1':
    'Il s’agit d’une collection Postman v1. Exportez-la à nouveau depuis Postman au format Collection v2.1, puis importez ce fichier.',
  'imports.securityUnmapped':
    'L’API utilise un schéma de sécurité que Tiger ne peut pas convertir (clé d’API par cookie ou similaire). Configurez l’authentification à la main.',
  'imports.cookieParams':
    'Les paramètres de cookie ({names}) n’ont pas été ajoutés. Ajoutez un en-tête Cookie si nécessaire.',
  'imports.securityPlaceholders':
    'L’authentification a été configurée à partir du schéma de sécurité de l’API, avec des variables de substitution comme {token}. Définissez-les dans un environnement.',
  'imports.baseUrlUnknown':
    'L’API n’indique aucun hôte de serveur. Renseignez baseUrl dans l’environnement « {name} » avec un hôte comme https://api.example.com avant d’envoyer.',
  'imports.brunoDotenvMissing':
    'Bruno lit {names} dans le fichier .env de la collection, introuvable ou qui ne les définit pas. Renseignez-les dans l’environnement.',
  'imports.prodNotSelected':
    'Tiger n’a pas sélectionné « {name} » pour vous, pour que rien ne parte en production par surprise. Choisissez-le dans le menu des environnements quand vous le voulez.',
  'imports.apiKeyCookie':
    'Dans Insomnia, la clé d’API est envoyée dans un cookie ; Tiger l’envoie dans un en-tête. Vérifiez que le serveur l’accepte.',
  'imports.bearerPrefix':
    'L’authentification Bearer utilise le préfixe "{prefix}". Tiger envoie toujours "Bearer" ; ajoutez plutôt un en-tête Authorization si le serveur exige "{prefix}".',
  'imports.folderVariables':
    'Les variables de dossier ne sont pas prises en charge : {names}. Ajoutez-les à un environnement.',
  'imports.folderScripts':
    'Les scripts du dossier ont été copiés dans chaque requête de ce dossier. Modifiez-les là.',
  'imports.templateTags': 'Utilise des balises de modèle que Tiger ne peut pas exécuter : {tags}.',
  'imports.templateTagsKept':
    'Utilise des balises de modèle que Tiger ne peut pas exécuter : {tags}. Elles ont été conservées comme texte.',
  'imports.envTemplateTags':
    'Les valeurs de l’environnement utilisent des balises de modèle que Tiger ne peut pas exécuter : {tags}.',
  'imports.templateFilters': 'Utilise des filtres de modèle que Tiger n’applique pas : {filters}. La variable est utilisée telle quelle.',
  'imports.skippedRequests': {
    one: '{count} requête {kind} a été ignorée : Tiger n’envoie que des requêtes HTTP.',
    other: '{count} requêtes {kind} ont été ignorées : Tiger n’envoie que des requêtes HTTP.'
  },
  'imports.requestVariables':
    'Les variables de requête ({kind}) ne sont pas prises en charge : {names}. Définissez-les dans un environnement ou un script.',
  'imports.assertionsSkipped':
    'Assertions non converties en tests : {items}. Ajoutez-les comme tests.',
  'imports.brunoSecrets':
    'Bruno n’enregistre jamais les valeurs secrètes sur le disque : {names}. Ajoutez-les à l’environnement « {env} ».',
  'imports.couldNotRead': 'Lecture impossible : {error}',
  'imports.folderCopiedHeaders':
    '{label} contient des en-têtes. Tiger les conserve par requête : ils ont été copiés dans chaque requête en dessous. Modifiez-les là.',
  'imports.folderCopiedScripts':
    '{label} contient des scripts. Tiger les conserve par requête : ils ont été copiés dans chaque requête en dessous. Modifiez-les là.',
  'imports.folderCopiedBoth':
    '{label} contient des en-têtes et des scripts. Tiger les conserve par requête : ils ont été copiés dans chaque requête en dessous. Modifiez-les là.',
  'imports.collectionVarsEnv':
    'Les variables de collection sont devenues l’environnement « {name} ». Il est sélectionné pour vous.',
  'imports.collectionVarsLayered':
    'Tiger n’a qu’une seule portée de variables : les variables de collection ({names}) ont donc été ajoutées à chaque environnement. Les valeurs définies dans un environnement l’emportent.',
  'imports.folderRenamed':
    'Deux dossiers portent ici le nom « {name} ». Tiger distingue les dossiers par leur nom : celui-ci s’appelle donc désormais « {renamed} », avec ses propres requêtes et réglages.',
  'imports.securityPartial':
    'L’API exige aussi {schemes} ici, que Tiger ne peut pas configurer. Ajoutez-le à la requête à la main.',
  'imports.variablesRenamed':
    'Une autre collection importée avec celle-ci utilise aussi {names}. Chacune garde ses propres valeurs : celle-ci utilise donc désormais {renamed}.',

  'imports.report.title': '{name} importé',
  'imports.report.statsLabel': 'Importé',
  'imports.report.requests': { one: 'requête', other: 'requêtes' },
  'imports.report.folders': { one: 'dossier', other: 'dossiers' },
  'imports.report.environments': { one: 'environnement', other: 'environnements' },
  'imports.report.descEnvironmentsTarget':
    'Les environnements ont été ajoutés à {target}. Choisissez-en un dans le menu des environnements.',
  'imports.report.descSelectedEnvironment':
    '{name} est ouvert dans la barre latérale, avec l’environnement « {environment} » sélectionné.',
  'imports.report.descOpen': '{name} est ouvert dans la barre latérale.',
  'imports.report.savedTo': 'Enregistrée dans {path}, elle sera là au prochain lancement.',
  'imports.report.clean': 'Tout a été converti sans problème. Rien à vérifier.',
  'imports.report.checkOne': 'À vérifier',
  'imports.report.checkMany': '{count} éléments à vérifier',
  'imports.report.hint':
    'Ces éléments ne sont passés qu’en partie. Tout est conservé, vous pouvez donc les corriger sur place.',
  'imports.report.in': 'dans',
  'imports.report.sentenceClean':
    'Importé : {requests}, {folders}, {environments} depuis {name}. Tout a été converti sans problème.',
  'imports.report.sentenceCheck': 'Importé : {requests}, {folders}, {environments} depuis {name}. {items} à vérifier.',
  'imports.report.requestsCount': { one: '{count} requête', other: '{count} requêtes' },
  'imports.report.foldersCount': { one: '{count} dossier', other: '{count} dossiers' },
  'imports.report.environmentsCount': { one: '{count} environnement', other: '{count} environnements' },
  'imports.report.itemsCount': { one: '{count} élément', other: '{count} éléments' }
}
