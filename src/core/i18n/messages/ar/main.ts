import type { NamespaceCatalog } from '../../translator'
import type { main as en } from '../en/main'

export const main: NamespaceCatalog<typeof en> = {
  'main.dialog.openCollection': 'فتح مجلد مجموعة Tiger',
  'main.dialog.newCollection': 'اختر مكان إنشاء "{name}"',
  'main.dialog.createHere': 'إنشاء هنا',
  'main.dialog.cloneTitle': 'اختر مكان حفظ مجموعة الفريق',
  'main.dialog.saveHere': 'حفظ هنا',
  'main.dialog.unsavedTitle': 'لديك تغييرات غير محفوظة',
  'main.dialog.unsavedDetail': 'سيؤدي الإغلاق الآن إلى تجاهل التعديلات التي لم تُحفظ بعد.',
  'main.dialog.closeAnyway': 'إغلاق على أي حال',
  'main.dialog.keepEditing': 'متابعة التحرير',
  'main.import.postman': 'مجموعة Postman',
  'main.import.insomnia': 'ملف تصدير Insomnia',
  'main.import.wsdl': 'مستند WSDL',
  'main.import.openapi': 'مستند OpenAPI / Swagger',
  'main.import.brunoFolder': 'استيراد مجلد مجموعة Bruno',
  'main.import.failed': 'تعذر استيراد هذا الملف: {reason}',
  'main.export.title': 'تصدير',
  'main.http.certRead': 'تعذرت قراءة ملف الشهادة: {reason}',
  'main.http.tokenStatus': 'أرجعت نقطة نهاية الرمز المميز {status}',
  'main.http.tokenMissing': 'لا تحتوي استجابة الرمز المميز على access_token'
}
