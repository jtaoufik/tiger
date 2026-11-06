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
  'main.import.postman': 'Postman संग्रह',
  'main.import.insomnia': 'Insomnia निर्यात',
  'main.import.wsdl': 'WSDL दस्तावेज़',
  'main.import.openapi': 'OpenAPI / Swagger दस्तावेज़',
  'main.import.brunoFolder': 'Bruno संग्रह फ़ोल्डर आयात करें',
  'main.import.failed': 'यह फ़ाइल आयात नहीं की जा सकी: {reason}',
  'main.export.title': 'निर्यात',
  'main.http.certRead': 'प्रमाणपत्र फ़ाइल पढ़ी नहीं जा सकी: {reason}',
  'main.http.tokenStatus': 'टोकन एंडपॉइंट ने {status} लौटाया',
  'main.http.tokenMissing': 'टोकन प्रतिसाद में access_token नहीं था',
  'main.realtime.badUrl': 'यह पता इस कनेक्शन के लिए इस्तेमाल नहीं हो सकता: {url}',
  'main.realtime.refused': '{url} पर कुछ भी नहीं सुन रहा है',
  'main.realtime.proxyTimeout': 'प्रॉक्सी ने समय पर जवाब नहीं दिया',
  'main.realtime.proxyRefused': 'प्रॉक्सी ने कनेक्शन अस्वीकार किया (स्थिति {status})',
  'main.realtime.handshakeStatus': 'सर्वर ने WebSocket खोलने के बजाय {status} जवाब दिया',
  'main.realtime.sseStatus': 'सर्वर ने इवेंट स्ट्रीम के बजाय {status} जवाब दिया',
  'main.realtime.sseType': 'सर्वर ने text/event-stream के बजाय {type} भेजा'
}
