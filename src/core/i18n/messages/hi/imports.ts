import type { NamespaceCatalog } from '../../translator'
import type { imports as en } from '../en/imports'

export const imports: NamespaceCatalog<typeof en> = {
  'imports.dynamicVars':
    'ऐसे डायनामिक वेरिएबल इस्तेमाल हुए हैं जिन्हें Tiger नहीं बनाता: {names}। उन्हें परिवेश में सेट करें या बदल दें।',
  'imports.preScriptCalls':
    'प्री-रिक्वेस्ट स्क्रिप्ट ऐसे कॉल इस्तेमाल करती है जिन्हें Tiger नहीं चला सकता: {calls}। स्क्रिप्ट रखी गई है; उसे जाँच लें।',
  'imports.testScriptCalls':
    'टेस्ट स्क्रिप्ट ऐसे कॉल इस्तेमाल करती है जिन्हें Tiger नहीं चला सकता: {calls}। स्क्रिप्ट रखी गई है; उसे जाँच लें।',
  'imports.formFileMissing':
    'फ़ॉर्म फ़ील्ड "{field}" फ़ाइल अपलोड है, पर निर्यात में कोई फ़ाइल सहेजी नहीं गई। बॉडी टैब में फ़ाइल चुनें।',
  'imports.formFileNone':
    'फ़ॉर्म फ़ील्ड "{field}" फ़ाइल अपलोड है, पर कोई फ़ाइल चुनी नहीं गई। बॉडी टैब में फ़ाइल चुनें।',
  'imports.formFileUpload':
    'फ़ॉर्म फ़ील्ड "{field}" {files} अपलोड करता है। जाँचें कि फ़ाइल इस कंप्यूटर पर मौजूद है।',
  'imports.formFileUploadFirstOnly':
    'फ़ॉर्म फ़ील्ड "{field}" {files} अपलोड करता है। जाँचें कि फ़ाइल इस कंप्यूटर पर मौजूद है। केवल पहली फ़ाइल रखी गई।',
  'imports.binaryBody':
    'बाइनरी फ़ाइल बॉडी भेजता है, जिसे Tiger अभी सपोर्ट नहीं करता। बॉडी खाली छोड़ दी गई।',
  'imports.oauthBodyCreds':
    'Postman में OAuth 2.0 क्लाइंट क्रेडेंशियल बॉडी में भेजता है; Tiger उन्हें Basic हेडर में भेजता है। जाँचें कि टोकन अनुरोध काम करता है।',
  'imports.oauthUnsupportedToken':
    'OAuth 2.0 "{grant}" समर्थित नहीं है। सहेजा गया एक्सेस टोकन Bearer टोकन के रूप में आयात किया गया; वह समाप्त हो जाएगा।',
  'imports.oauthUnsupportedNone':
    'OAuth 2.0 "{grant}" समर्थित नहीं है। प्रमाणीकरण "कोई नहीं" पर सेट किया गया; टोकन लें और Bearer प्रमाणीकरण इस्तेमाल करें।',
  'imports.authUnsupported':
    '{auth} प्रमाणीकरण समर्थित नहीं है। प्रमाणीकरण "कोई नहीं" पर सेट किया गया; इसे दोबारा सेट करें।',
  'imports.methodUnsupported': '{method} मेथड समर्थित नहीं है, इसलिए यह अनुरोध छोड़ दिया गया।',
  'imports.pathVariables': {
    one: 'पाथ वेरिएबल {names} का कोई मान नहीं था और वह {values} बन गया। इसे परिवेश में सेट करें।',
    other: 'पाथ वेरिएबल {names} के कोई मान नहीं थे और वे {values} बन गए। उन्हें परिवेश में सेट करें।'
  },
  'imports.scriptsCopiedPre': {
    one: '{owner} में प्री-रिक्वेस्ट स्क्रिप्ट हैं। Tiger स्क्रिप्ट हर अनुरोध के हिसाब से चलाता है, इसलिए उन्हें इसके {count} अनुरोध में कॉपी किया गया। उन्हें वहीं संपादित करें।',
    other:
      '{owner} में प्री-रिक्वेस्ट स्क्रिप्ट हैं। Tiger स्क्रिप्ट हर अनुरोध के हिसाब से चलाता है, इसलिए उन्हें इसके {count} अनुरोधों में कॉपी किया गया। उन्हें वहीं संपादित करें।'
  },
  'imports.scriptsCopiedPost': {
    one: '{owner} में टेस्ट स्क्रिप्ट हैं। Tiger स्क्रिप्ट हर अनुरोध के हिसाब से चलाता है, इसलिए उन्हें इसके {count} अनुरोध में कॉपी किया गया। उन्हें वहीं संपादित करें।',
    other:
      '{owner} में टेस्ट स्क्रिप्ट हैं। Tiger स्क्रिप्ट हर अनुरोध के हिसाब से चलाता है, इसलिए उन्हें इसके {count} अनुरोधों में कॉपी किया गया। उन्हें वहीं संपादित करें।'
  },
  'imports.scriptsCopiedBoth': {
    one: '{owner} में प्री-रिक्वेस्ट और टेस्ट स्क्रिप्ट हैं। Tiger स्क्रिप्ट हर अनुरोध के हिसाब से चलाता है, इसलिए उन्हें इसके {count} अनुरोध में कॉपी किया गया। उन्हें वहीं संपादित करें।',
    other:
      '{owner} में प्री-रिक्वेस्ट और टेस्ट स्क्रिप्ट हैं। Tiger स्क्रिप्ट हर अनुरोध के हिसाब से चलाता है, इसलिए उन्हें इसके {count} अनुरोधों में कॉपी किया गया। उन्हें वहीं संपादित करें।'
  },
  'imports.postmanGlobals':
    'Postman के ग्लोबल वेरिएबल हर आयात किए गए परिवेश में जोड़ दिए गए। अगर किसी परिवेश में वही वेरिएबल है, तो उसका अपना मान रहता है।',
  'imports.globalsEnv':
    'Postman के ग्लोबल वेरिएबल परिवेश "{name}" बन गए। यह आपके लिए चुना गया है।',
  'imports.secretsNotExported': 'Postman गुप्त मान निर्यात नहीं करता: {names}। उन्हें भरें।',
  'imports.postmanV1':
    'यह Postman v1 संग्रह है। इसे Postman से Collection v2.1 के रूप में दोबारा निर्यात करें और वह फ़ाइल आयात करें।',
  'imports.securityUnmapped':
    'API ऐसी सुरक्षा योजना इस्तेमाल करती है जिसे Tiger मैप नहीं कर सकता (कुकी API कुंजी या उसके जैसी)। प्रमाणीकरण हाथ से सेट करें।',
  'imports.cookieParams': 'कुकी पैरामीटर ({names}) नहीं जोड़े गए। ज़रूरत हो तो Cookie हेडर जोड़ें।',
  'imports.securityPlaceholders':
    'प्रमाणीकरण API की सुरक्षा योजना से सेट किया गया, जिसमें {token} जैसे प्लेसहोल्डर वेरिएबल हैं। उन्हें परिवेश में सेट करें।',
  'imports.baseUrlUnknown':
    'API किसी सर्वर होस्ट का नाम नहीं देता। भेजने से पहले परिवेश "{name}" में baseUrl को https://api.example.com जैसे होस्ट पर सेट करें।',
  'imports.brunoDotenvMissing':
    'Bruno {names} को संग्रह की .env फ़ाइल से पढ़ता है, जो नहीं मिली या उसमें ये मान नहीं हैं। इन्हें परिवेश में भरें।',
  'imports.prodNotSelected':
    'Tiger ने "{name}" को अपने आप नहीं चुना, ताकि अनजाने में कुछ भी प्रोडक्शन पर न जाए। जब आप चाहें, इसे परिवेश मेनू में चुनें।',
  'imports.apiKeyCookie':
    'Insomnia में API कुंजी कुकी के रूप में भेजी जाती है; Tiger उसे हेडर के रूप में भेजता है। जाँचें कि सर्वर इसे स्वीकार करता है।',
  'imports.bearerPrefix':
    'Bearer प्रमाणीकरण में उपसर्ग "{prefix}" है। Tiger हमेशा "Bearer" भेजता है; अगर सर्वर को "{prefix}" चाहिए तो उसकी जगह Authorization हेडर जोड़ें।',
  'imports.folderVariables': 'फ़ोल्डर वेरिएबल समर्थित नहीं हैं: {names}। उन्हें परिवेश में जोड़ें।',
  'imports.folderScripts':
    'फ़ोल्डर की स्क्रिप्ट इस फ़ोल्डर के हर अनुरोध में कॉपी की गईं। उन्हें वहीं संपादित करें।',
  'imports.templateTags': 'ऐसे टेम्पलेट टैग इस्तेमाल हुए हैं जिन्हें Tiger नहीं चला सकता: {tags}।',
  'imports.templateTagsKept':
    'ऐसे टेम्पलेट टैग इस्तेमाल हुए हैं जिन्हें Tiger नहीं चला सकता: {tags}। उन्हें टेक्स्ट के रूप में रखा गया।',
  'imports.envTemplateTags':
    'परिवेश के मान ऐसे टेम्पलेट टैग इस्तेमाल करते हैं जिन्हें Tiger नहीं चला सकता: {tags}।',
  'imports.skippedRequests': {
    one: '{count} {kind} अनुरोध छोड़ दिया गया: Tiger केवल HTTP अनुरोध भेजता है।',
    other: '{count} {kind} अनुरोध छोड़ दिए गए: Tiger केवल HTTP अनुरोध भेजता है।'
  },
  'imports.requestVariables':
    'अनुरोध वेरिएबल ({kind}) समर्थित नहीं हैं: {names}। उन्हें परिवेश या स्क्रिप्ट में सेट करें।',
  'imports.assertionsSkipped': 'ये असर्शन टेस्ट में नहीं बदले गए: {items}। उन्हें टेस्ट के रूप में जोड़ें।',
  'imports.brunoSecrets':
    'Bruno गुप्त मान कभी डिस्क पर सहेजता नहीं: {names}। उन्हें "{env}" परिवेश में जोड़ें।',
  'imports.couldNotRead': 'पढ़ा नहीं जा सका: {error}',
  'imports.folderCopiedHeaders':
    '{label} में हेडर हैं। Tiger इन्हें हर अनुरोध के हिसाब से रखता है, इसलिए इन्हें इसके नीचे के हर अनुरोध में कॉपी किया गया। उन्हें वहीं संपादित करें।',
  'imports.folderCopiedScripts':
    '{label} में स्क्रिप्ट हैं। Tiger इन्हें हर अनुरोध के हिसाब से रखता है, इसलिए इन्हें इसके नीचे के हर अनुरोध में कॉपी किया गया। उन्हें वहीं संपादित करें।',
  'imports.folderCopiedBoth':
    '{label} में हेडर और स्क्रिप्ट हैं। Tiger इन्हें हर अनुरोध के हिसाब से रखता है, इसलिए इन्हें इसके नीचे के हर अनुरोध में कॉपी किया गया। उन्हें वहीं संपादित करें।',
  'imports.collectionVarsEnv':
    'संग्रह के वेरिएबल "{name}" परिवेश बन गए। वह आपके लिए चुना गया है।',
  'imports.collectionVarsLayered':
    'Tiger में वेरिएबल का एक ही दायरा है, इसलिए संग्रह के वेरिएबल ({names}) हर परिवेश में जोड़े गए। परिवेश में सेट किए गए मान प्राथमिकता पाते हैं।',

  'imports.report.title': '{name} आयात हुआ',
  'imports.report.statsLabel': 'आयात किया गया',
  'imports.report.requests': { one: 'अनुरोध', other: 'अनुरोध' },
  'imports.report.folders': { one: 'फ़ोल्डर', other: 'फ़ोल्डर' },
  'imports.report.environments': { one: 'परिवेश', other: 'परिवेश' },
  'imports.report.descEnvironmentsTarget':
    'परिवेश {target} में जोड़े गए। परिवेश मेन्यू से एक चुनें।',
  'imports.report.descSelectedEnvironment':
    '{name} साइडबार में खुला है, और "{environment}" परिवेश चुना गया है।',
  'imports.report.descOpen': '{name} साइडबार में खुला है।',
  'imports.report.savedTo': '{path} में सहेजा गया, ताकि यह अगली बार भी मिले।',
  'imports.report.clean': 'सब कुछ ठीक से बदल गया। जाँचने को कुछ नहीं।',
  'imports.report.checkOne': 'इसे जाँचें',
  'imports.report.checkMany': 'इन {count} को जाँचें',
  'imports.report.hint':
    'ये केवल आंशिक रूप से आए। सब कुछ रखा गया है, इसलिए आप इन्हें वहीं ठीक कर सकते हैं।',
  'imports.report.in': 'में',
  'imports.report.sentenceClean':
    '{name} से आयात हुआ: {requests}, {folders}, {environments}। सब कुछ ठीक से बदल गया।',
  'imports.report.sentenceCheck': '{name} से आयात हुआ: {requests}, {folders}, {environments}। {items} जाँचने हैं।',
  'imports.report.requestsCount': { one: '{count} अनुरोध', other: '{count} अनुरोध' },
  'imports.report.foldersCount': { one: '{count} फ़ोल्डर', other: '{count} फ़ोल्डर' },
  'imports.report.environmentsCount': { one: '{count} परिवेश', other: '{count} परिवेश' },
  'imports.report.itemsCount': { one: '{count} आइटम', other: '{count} आइटम' }
}
