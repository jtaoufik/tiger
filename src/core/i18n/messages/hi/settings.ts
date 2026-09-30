import type { NamespaceCatalog } from '../../translator'
import type { settings as en } from '../en/settings'

export const settings: NamespaceCatalog<typeof en> = {
  'settings.title': 'सेटिंग्स',
  'settings.subtitle': 'प्राथमिकताएँ इसी कंप्यूटर पर स्थानीय रूप से सहेजी जाती हैं।',
  'settings.sectionsLabel': 'सेटिंग्स के अनुभाग',

  'settings.tabs.general.label': 'सामान्य',
  'settings.tabs.general.intro': 'Tiger कैसा दिखता है और सर्वर का कितना इंतज़ार करता है।',
  'settings.tabs.network.label': 'नेटवर्क',
  'settings.tabs.network.intro':
    'रीडायरेक्ट, SSL जाँच, प्रॉक्सी और कुकीज़: अनुरोध आपकी मशीन से कैसे बाहर जाते हैं।',
  'settings.tabs.advanced.label': 'उन्नत',
  'settings.tabs.advanced.intro':
    'कंपनी नेटवर्क और म्यूचुअल TLS के लिए प्रमाणपत्र। ज़्यादातर लोगों को इनकी ज़रूरत नहीं पड़ती।',
  'settings.tabs.mcp.label': 'AI असिस्टेंट (MCP)',
  'settings.tabs.mcp.intro':
    'Claude, Cursor और अन्य AI असिस्टेंट को किसी संग्रह के अनुरोध सूचीबद्ध करने और चलाने दें।',
  'settings.tabs.privacy.label': 'गोपनीयता',
  'settings.tabs.privacy.intro': 'Tiger अपने उपयोग के बारे में क्या भेजता है। आपके अनुरोध कभी नहीं।',
  'settings.tabs.about.label': 'परिचय',
  'settings.tabs.about.intro': 'संस्करण, अपडेट और प्रोजेक्ट की जानकारी।',

  'settings.appearance.label': 'दिखावट',
  'settings.appearance.desc': 'लाइट ग्लास, डार्क ग्लास, या सिस्टम के अनुसार।',
  'settings.theme.light': 'लाइट',
  'settings.theme.dark': 'डार्क',
  'settings.theme.system': 'सिस्टम',

  'settings.language.label': 'भाषा',
  'settings.language.desc': 'मेनू, बटन और संदेशों की भाषा। तुरंत बदल जाती है।',
  'settings.language.system': 'सिस्टम डिफ़ॉल्ट',
  'settings.language.systemCurrent': 'सिस्टम डिफ़ॉल्ट ({language})',

  'settings.timeout.label': 'अनुरोध टाइमआउट',
  'settings.timeout.desc': 'हार मानने से पहले कितनी देर इंतज़ार करना है, मिलीसेकंड में।',
  'settings.timeout.aria': 'अनुरोध टाइमआउट (ms)',
  'settings.fontSize.label': 'एडिटर का फ़ॉन्ट आकार',
  'settings.fontSize.desc': 'एडिटर और प्रतिसाद में मोनोस्पेस टेक्स्ट का आकार।',

  'settings.redirects.label': 'रीडायरेक्ट का पालन करें',
  'settings.redirects.desc': '3xx प्रतिसादों को अपने आप उनके लक्ष्य तक फ़ॉलो करें।',
  'settings.ssl.label': 'SSL प्रमाणपत्र सत्यापित करें',
  'settings.ssl.desc': 'स्व-हस्ताक्षरित प्रमाणपत्रों की अनुमति के लिए बंद करें (केवल डेवलपमेंट के लिए)।',
  'settings.proxy.label': 'प्रॉक्सी इस्तेमाल करें',
  'settings.proxy.desc': 'सभी अनुरोध HTTP/HTTPS या SOCKS प्रॉक्सी से भेजें।',
  'settings.proxy.url.label': 'प्रॉक्सी URL',
  'settings.proxy.url.desc': 'जैसे http://127.0.0.1:8080 या socks5://127.0.0.1:1080',
  'settings.proxy.username.label': 'प्रॉक्सी उपयोगकर्ता नाम',
  'settings.proxy.username.desc':
    'प्रॉक्सी के प्रमाणीकरण माँगने पर भेजा जाता है। न हो तो खाली छोड़ें।',
  'settings.proxy.username.placeholder': 'उपयोगकर्ता नाम',
  'settings.proxy.password.label': 'प्रॉक्सी पासवर्ड',
  'settings.proxy.password.desc': 'इसी कंप्यूटर पर स्थानीय रूप से सहेजा जाता है, कभी सिंक नहीं होता।',
  'settings.proxy.password.placeholder': 'पासवर्ड',
  'settings.cookies.label': 'स्थायी कुकी जार',
  'settings.cookies.desc':
    'भेजने और सत्रों के बीच कुकीज़ सहेजें। कुकीज़ स्थानीय रूप से सहेजी जाती हैं और मेल खाने वाले डोमेन के आगामी अनुरोधों में फिर भेजी जाती हैं।',
  'settings.cookies.clear': 'कुकीज़ साफ़ करें',
  'settings.cookies.cleared': 'साफ़ हो गईं',
  'settings.cookies.announceCleared': 'कुकीज़ साफ़ हो गईं',

  'settings.certExceptions.label': 'प्रमाणपत्र अपवाद',
  'settings.certExceptions.desc':
    'वे होस्टनाम (अल्पविराम से अलग) जहाँ अमान्य या आंतरिक प्रमाणपत्र स्वीकार किए जाते हैं, जैसे intranet.acme.local। सत्यापन को पूरी तरह बंद करने से ज़्यादा सुरक्षित।',
  'settings.certExceptions.placeholder': 'होस्ट1, होस्ट2',
  'settings.maxRedirects.label': 'अधिकतम रीडायरेक्ट',
  'settings.maxRedirects.desc': '3xx प्रतिसादों को फ़ॉलो करते समय ऊपरी सीमा।',
  'settings.certSubject.label': 'क्लाइंट प्रमाणपत्र विषय फ़िल्टर',
  'settings.certSubject.desc':
    'जब सर्वर क्लाइंट प्रमाणपत्र माँगे, तो वह चुनें जिसके विषय में यह टेक्स्ट हो',
  'settings.certSubject.placeholder': 'जैसे CN=alice',
  'settings.certificates.group': 'प्रमाणपत्र',
  'settings.files.notSet': 'सेट नहीं है',
  'settings.files.choose': 'फ़ाइल चुनें',
  'settings.files.chooseAria': 'फ़ाइल चुनें: {label}',
  'settings.files.clear': 'साफ़ करें',
  'settings.files.clearAria': '{label} साफ़ करें',
  'settings.files.ca.label': 'CA बंडल (PEM)',
  'settings.files.ca.desc':
    'भरोसा करने के लिए अतिरिक्त प्रमाणपत्र प्राधिकरण, जैसे आपकी कंपनी का आंतरिक CA।',
  'settings.files.ca.filter': 'PEM प्रमाणपत्र',
  'settings.files.clientCert.label': 'क्लाइंट प्रमाणपत्र (PEM)',
  'settings.files.clientCert.desc':
    'आपका प्रमाणपत्र, उन सर्वरों के लिए जो पूछते हैं कि आप कौन हैं (म्यूचुअल TLS)।',
  'settings.files.clientKey.label': 'क्लाइंट कुंजी (PEM)',
  'settings.files.clientKey.desc': 'क्लाइंट प्रमाणपत्र के साथ जाने वाली निजी कुंजी।',
  'settings.files.clientKey.filter': 'PEM कुंजी',
  'settings.files.pfx.label': 'PFX / P12 बंडल',
  'settings.files.pfx.desc': 'दो PEM फ़ाइलों की जगह एक ही फ़ाइल में प्रमाणपत्र और कुंजी।',
  'settings.files.pfx.filter': 'PFX / P12 बंडल',
  'settings.passphrase.label': 'प्रमाणपत्र पासफ़्रेज़',
  'settings.passphrase.desc': 'ऊपर की कुंजी या बंडल को अनलॉक करता है, अगर उस पर पासवर्ड है।',
  'settings.passphrase.placeholder': 'पासफ़्रेज़',
  'settings.certHint': 'आयात किए गए प्रमाणपत्रों वाले अनुरोध प्रॉक्सी को बायपास करते हैं।',

  'settings.mcp.intro':
    'Tiger में एक बिल्ट-इन MCP सर्वर (Model Context Protocol) है जो आपके संग्रह Claude Desktop और अन्य MCP-संगत क्लाइंट को उपलब्ध कराता है। कनेक्ट करने के लिए नीचे का स्निपेट अपनी {file} में जोड़ें।',
  'settings.mcp.pathPlaceholder': '<आपके संग्रह फ़ोल्डर का पथ>',
  'settings.mcp.note':
    '{placeholder} को उस फ़ोल्डर के पूर्ण पथ से बदलें जिसे आपने Tiger में खोला है। हर संग्रह के लिए एक प्रविष्टि रख सकते हैं।',
  'settings.mcp.copySnippet': 'स्निपेट कॉपी करें',
  'settings.mcp.snippetCopied': 'स्निपेट कॉपी हो गया',
  'settings.mcp.loading': 'लोड हो रहा है…',

  'settings.analytics.label': 'गुमनाम उपयोग विश्लेषण',
  'settings.analytics.desc':
    'डिफ़ॉल्ट रूप से चालू। केवल गुमनाम, समेकित इवेंट भेजता है (URL, हेडर या बॉडी कभी नहीं)। कभी भी बंद करें।',
  'settings.analytics.aria': 'विश्लेषण',

  'settings.autoUpdate.label': 'अपडेट अपने आप इंस्टॉल करें',
  'settings.autoUpdate.desc':
    'नए संस्करण पृष्ठभूमि में डाउनलोड करता है और Tiger को रीस्टार्ट या बंद करने पर इंस्टॉल करता है। बंद होने पर Tiger डाउनलोड से पहले पूछता है। Microsoft Store और Linux .deb इंस्टॉल अपने स्टोर या पैकेज मैनेजर से अपडेट होते हैं।',
  'settings.about.tagline': 'टीमों के लिए लोकल-फ़र्स्ट API क्लाइंट।',
  'settings.about.version': 'संस्करण {version}',

  'settings.update.title': 'सॉफ़्टवेयर अपडेट',
  'settings.update.later': 'बाद में',
  'settings.update.download': 'डाउनलोड करें',
  'settings.update.restartNow': 'अभी रीस्टार्ट करें',
  'settings.update.releaseNotes': 'रिलीज़ नोट्स',
  'settings.update.releaseNotesFor': '{version} के रिलीज़ नोट्स',
  'settings.update.hide': 'छिपाएँ',
  'settings.update.hideProgress': 'अपडेट की प्रगति छिपाएँ',
  'settings.update.manualTitle': 'अपडेट उपलब्ध है · v{version}',
  'settings.update.manualDesc': 'आप v{current} पर हैं। संस्करण {latest} डाउनलोड के लिए तैयार है।',
  'settings.update.downloadUpdate': 'अपडेट डाउनलोड करें',
  'settings.update.whatChanged': 'क्या बदला',
  'settings.update.downloadFromWebsite': 'वेबसाइट से डाउनलोड करें',
  'settings.update.continueInBackground': 'पृष्ठभूमि में जारी रखें',
  'settings.update.downloadingAria': 'अपडेट {version} डाउनलोड हो रहा है',
  'settings.update.laterHint': 'अगली बार Tiger बंद करने पर इंस्टॉल करने के लिए “बाद में” चुनें।',
  'settings.update.upToDateVersion': 'Tiger {version} नवीनतम संस्करण है।',
  'settings.update.status.checking': 'अपडेट की जाँच हो रही है…',
  'settings.update.status.upToDate': 'आप नवीनतम संस्करण पर हैं।',
  'settings.update.status.available': 'Tiger {version} उपलब्ध है।',
  'settings.update.status.downloading': 'अपडेट {version} डाउनलोड हो रहा है… {percent}%',
  'settings.update.status.downloaded': 'Tiger {version} तैयार है। अपडेट के लिए रीस्टार्ट करें।',
  'settings.update.announceDownloading': 'Tiger {version} पृष्ठभूमि में डाउनलोड हो रहा है।',
  'settings.update.error.offline':
    'अपडेट सर्वर तक नहीं पहुँच सका। अपना कनेक्शन जाँचें और फिर कोशिश करें।',
  'settings.update.error.notPublished': 'इस प्लेटफ़ॉर्म के लिए अभी कोई अपडेट प्रकाशित नहीं हुआ है।',
  'settings.update.error.verification':
    'डाउनलोड किया गया अपडेट सत्यापन में विफल रहा और इंस्टॉल नहीं किया गया।',
  'settings.update.error.failedDetail': 'अपडेट विफल: {detail}',
  'settings.update.error.failed': 'अपडेट विफल।'
}
