import type { NamespaceCatalog } from '../../translator'
import type { main as en } from '../en/main'

export const main: NamespaceCatalog<typeof en> = {
  'main.dialog.openCollection': 'Tiger संग्रह फ़ोल्डर खोलें',
  'main.dialog.newCollection': 'चुनें कि "{name}" कहाँ बनाना है',
  'main.dialog.createHere': 'यहाँ बनाएँ',
  'main.dialog.cloneTitle': 'चुनें कि टीम संग्रह कहाँ सहेजना है',
  'main.dialog.saveHere': 'यहाँ सहेजें',
  'main.dialog.unsavedTitle': 'आपके बदलाव सहेजे नहीं गए हैं',
  'main.dialog.unsavedDetail': 'अभी बंद करने पर वे बदलाव हट जाएँगे जो अब तक सहेजे नहीं गए हैं।',
  'main.dialog.closeAnyway': 'फिर भी बंद करें',
  'main.dialog.updateUnsavedDetail': 'अपडेट के लिए अभी रीस्टार्ट करने पर वे बदलाव हट जाएँगे जो अब तक सहेजे नहीं गए हैं।',
  'main.dialog.restartAnyway': 'फिर भी रीस्टार्ट करें',
  'main.dialog.keepEditing': 'संपादन जारी रखें',
  'main.dialog.saveResponse': 'प्रतिसाद की बॉडी सहेजें',
  'main.dialog.crashLoopTitle': 'Tiger बार-बार रुक रहा है',
  'main.dialog.crashLoopDetail': 'विंडो ने लगातार कई बार काम करना बंद कर दिया। {path} पर मौजूद लॉग इसका कारण बताता है।',
  'main.dialog.unresponsiveTitle': 'Tiger जवाब नहीं दे रहा है',
  'main.dialog.unresponsiveDetail': 'आप इसके पूरा होने का इंतज़ार कर सकते हैं या विंडो फिर से लोड कर सकते हैं। फिर से लोड करने पर बिना सहेजे बदलाव खो जाते हैं।',
  'main.dialog.wait': 'इंतज़ार करें',
  'main.dialog.reload': 'फिर से लोड करें',
  'main.dialog.quit': 'बंद करें',
  'main.import.postman': 'Postman संग्रह',
  'main.import.insomnia': 'Insomnia निर्यात',
  'main.import.wsdl': 'WSDL दस्तावेज़',
  'main.import.openapi': 'OpenAPI / Swagger दस्तावेज़',
  'main.import.brunoFolder': 'Bruno संग्रह फ़ोल्डर आयात करें',
  'main.import.failed': 'यह फ़ाइल आयात नहीं की जा सकी: {reason}',
  'main.export.title': 'निर्यात',
  'main.http.certRead': 'प्रमाणपत्र फ़ाइल पढ़ी नहीं जा सकी: {reason}',
  'main.http.tokenStatus': 'टोकन एंडपॉइंट ने {status} लौटाया',
  'main.http.tokenMissing': 'टोकन प्रतिसाद में access_token नहीं था'
}
