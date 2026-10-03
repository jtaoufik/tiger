import type { NamespaceCatalog } from '../../translator'
import type { imports as en } from '../en/imports'

export const imports: NamespaceCatalog<typeof en> = {
  'imports.dynamicVars': 'يستخدم متغيرات ديناميكية لا يولّدها Tiger: {names}. عيّنها في بيئة أو استبدلها.',
  'imports.preScriptCalls':
    'يستخدم البرنامج النصي السابق للطلب استدعاءات لا يستطيع Tiger تشغيلها: {calls}. تم الاحتفاظ بالبرنامج النصي؛ راجعه.',
  'imports.testScriptCalls':
    'يستخدم البرنامج النصي للاختبار استدعاءات لا يستطيع Tiger تشغيلها: {calls}. تم الاحتفاظ بالبرنامج النصي؛ راجعه.',
  'imports.formFileMissing':
    'حقل النموذج "{field}" هو رفع ملف، لكن لا يوجد ملف محفوظ في التصدير. اختر الملف في تبويب المحتوى.',
  'imports.formFileNone': 'حقل النموذج "{field}" هو رفع ملف دون اختيار ملف. اختر الملف في تبويب المحتوى.',
  'imports.formFileUpload': 'حقل النموذج "{field}" يرفع {files}. تحقق من وجود الملف على هذا الجهاز.',
  'imports.formFileUploadFirstOnly':
    'حقل النموذج "{field}" يرفع {files}. تحقق من وجود الملف على هذا الجهاز. تم الاحتفاظ بالملف الأول فقط.',
  'imports.binaryBody': 'يرسل محتوى ملف ثنائي، وهو غير مدعوم في Tiger بعد. تُرك المحتوى فارغًا.',
  'imports.oauthBodyCreds':
    'في Postman يرسل OAuth 2.0 بيانات اعتماد العميل في المحتوى؛ أما Tiger فيرسلها في ترويسة Basic. تحقق من أن طلب الرمز المميز يعمل.',
  'imports.oauthUnsupportedToken':
    'OAuth 2.0 "{grant}" غير مدعوم. تم استيراد رمز الوصول المحفوظ كرمز Bearer؛ وستنتهي صلاحيته.',
  'imports.oauthUnsupportedNone':
    'OAuth 2.0 "{grant}" غير مدعوم. تم ضبط المصادقة على بدون؛ احصل على رمز مميز واستخدم مصادقة Bearer.',
  'imports.authUnsupported': 'مصادقة {auth} غير مدعومة. تم ضبط المصادقة على بدون؛ أعد إعدادها.',
  'imports.methodUnsupported': 'الطريقة {method} غير مدعومة، لذلك تم تخطي هذا الطلب.',
  'imports.pathVariables': {
    zero: 'متغيرات المسار {names} بلا قيم وأصبحت {values}. عيّنها في بيئة.',
    one: 'متغير المسار {names} بلا قيمة وأصبح {values}. عيّنه في بيئة.',
    two: 'متغيرا المسار {names} بلا قيمة وأصبحا {values}. عيّنهما في بيئة.',
    few: 'متغيرات المسار {names} بلا قيم وأصبحت {values}. عيّنها في بيئة.',
    many: 'متغيرات المسار {names} بلا قيم وأصبحت {values}. عيّنها في بيئة.',
    other: 'متغيرات المسار {names} بلا قيم وأصبحت {values}. عيّنها في بيئة.'
  },
  'imports.scriptsCopiedPre': {
    zero: '{owner} يحتوي على برامج نصية سابقة للطلب. لا طلبات لنسخها ({count}).',
    one: '{owner} يحتوي على برامج نصية سابقة للطلب. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلبه الوحيد. عدّلها هناك.',
    two: '{owner} يحتوي على برامج نصية سابقة للطلب. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلبيه. عدّلها هناك.',
    few: '{owner} يحتوي على برامج نصية سابقة للطلب. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.',
    many: '{owner} يحتوي على برامج نصية سابقة للطلب. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.',
    other:
      '{owner} يحتوي على برامج نصية سابقة للطلب. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.'
  },
  'imports.scriptsCopiedPost': {
    zero: '{owner} يحتوي على برامج نصية للاختبار. لا طلبات لنسخها ({count}).',
    one: '{owner} يحتوي على برامج نصية للاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلبه الوحيد. عدّلها هناك.',
    two: '{owner} يحتوي على برامج نصية للاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلبيه. عدّلها هناك.',
    few: '{owner} يحتوي على برامج نصية للاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.',
    many: '{owner} يحتوي على برامج نصية للاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.',
    other:
      '{owner} يحتوي على برامج نصية للاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.'
  },
  'imports.scriptsCopiedBoth': {
    zero: '{owner} يحتوي على برامج نصية سابقة للطلب وللاختبار. لا طلبات لنسخها ({count}).',
    one: '{owner} يحتوي على برامج نصية سابقة للطلب وللاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلبه الوحيد. عدّلها هناك.',
    two: '{owner} يحتوي على برامج نصية سابقة للطلب وللاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلبيه. عدّلها هناك.',
    few: '{owner} يحتوي على برامج نصية سابقة للطلب وللاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.',
    many: '{owner} يحتوي على برامج نصية سابقة للطلب وللاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.',
    other:
      '{owner} يحتوي على برامج نصية سابقة للطلب وللاختبار. يشغّل Tiger البرامج النصية لكل طلب، فنُسخت إلى طلباته الـ {count}. عدّلها هناك.'
  },
  'imports.postmanGlobals':
    'أُضيفت متغيرات Postman العامة إلى كل بيئة مستوردة. إذا عيّنت بيئة المتغير نفسه، تبقى قيمتها هي المستخدمة.',
  'imports.globalsEnv':
    'أصبحت متغيرات Postman العامة البيئة "{name}". وقد تم تحديدها لك.',
  'imports.secretsNotExported': 'لا يصدّر Postman القيم السرية: {names}. أدخلها بنفسك.',
  'imports.postmanV1':
    'هذه مجموعة Postman بالإصدار v1. صدّرها من جديد من Postman بصيغة Collection v2.1 ثم استورد ذلك الملف.',
  'imports.securityUnmapped':
    'تستخدم واجهة API مخطط أمان لا يستطيع Tiger تحويله (مفتاح API في ملف تعريف ارتباط أو ما شابه). أعدّ المصادقة يدويًا.',
  'imports.cookieParams': 'لم تتم إضافة معلمات ملفات تعريف الارتباط ({names}). أضف ترويسة Cookie عند الحاجة.',
  'imports.securityPlaceholders':
    'تم إعداد المصادقة من مخطط أمان واجهة API مع متغيرات نائبة مثل {token}. عيّنها في بيئة.',
  'imports.baseUrlUnknown':
    'لا تحدد واجهة API أي مضيف للخادم. عيّن baseUrl في البيئة "{name}" إلى مضيف مثل https://api.example.com قبل الإرسال.',
  'imports.brunoDotenvMissing':
    'يقرأ Bruno القيم {names} من ملف .env الخاص بالمجموعة، وهو غير موجود أو لا يحددها. املأها في البيئة.',
  'imports.prodNotSelected':
    'لم يحدد Tiger البيئة "{name}" تلقائيًا، حتى لا يذهب أي طلب إلى بيئة الإنتاج دون قصد. اخترها من قائمة البيئات عندما تريد ذلك.',
  'imports.apiKeyCookie':
    'في Insomnia يُرسل مفتاح API في ملف تعريف ارتباط؛ أما Tiger فيرسله في ترويسة. تحقق من أن الخادم يقبل ذلك.',
  'imports.bearerPrefix':
    'تستخدم مصادقة Bearer البادئة "{prefix}". يرسل Tiger دائمًا "Bearer"؛ أضف ترويسة Authorization بدلًا من ذلك إذا كان الخادم يتطلب "{prefix}".',
  'imports.folderVariables': 'متغيرات المجلد غير مدعومة: {names}. أضفها إلى بيئة.',
  'imports.folderScripts': 'نُسخت البرامج النصية للمجلد إلى كل طلب في هذا المجلد. عدّلها هناك.',
  'imports.templateTags': 'يستخدم وسوم قوالب لا يستطيع Tiger تشغيلها: {tags}.',
  'imports.templateTagsKept': 'يستخدم وسوم قوالب لا يستطيع Tiger تشغيلها: {tags}. تم الاحتفاظ بها كنص.',
  'imports.envTemplateTags': 'تستخدم قيم البيئة وسوم قوالب لا يستطيع Tiger تشغيلها: {tags}.',
  'imports.templateFilters': 'يستخدم مرشحات قوالب لا يطبقها Tiger: {filters}. تُستخدم قيمة المتغير كما هي.',
  'imports.skippedRequests': {
    zero: 'لم يتم تخطي أي طلبات {kind}: يرسل Tiger طلبات HTTP فقط.',
    one: 'تم تخطي طلب {kind} واحد: يرسل Tiger طلبات HTTP فقط.',
    two: 'تم تخطي طلبي {kind}: يرسل Tiger طلبات HTTP فقط.',
    few: 'تم تخطي {count} طلبات {kind}: يرسل Tiger طلبات HTTP فقط.',
    many: 'تم تخطي {count} طلبًا من نوع {kind}: يرسل Tiger طلبات HTTP فقط.',
    other: 'تم تخطي {count} طلب {kind}: يرسل Tiger طلبات HTTP فقط.'
  },
  'imports.requestVariables': 'متغيرات الطلب ({kind}) غير مدعومة: {names}. عيّنها في بيئة أو في برنامج نصي.',
  'imports.assertionsSkipped': 'لم يتم تحويل التأكيدات التالية إلى اختبارات: {items}. أضفها كاختبارات.',
  'imports.brunoSecrets': 'لا يحفظ Bruno القيم السرية على القرص أبدًا: {names}. أضفها إلى بيئة "{env}".',
  'imports.couldNotRead': 'تعذرت القراءة: {error}',
  'imports.folderCopiedHeaders':
    '{label} يحتوي على ترويسات. يحتفظ Tiger بها لكل طلب، فنُسخت إلى كل طلب تحته. عدّلها هناك.',
  'imports.folderCopiedScripts':
    '{label} يحتوي على برامج نصية. يحتفظ Tiger بها لكل طلب، فنُسخت إلى كل طلب تحته. عدّلها هناك.',
  'imports.folderCopiedBoth':
    '{label} يحتوي على ترويسات وبرامج نصية. يحتفظ Tiger بها لكل طلب، فنُسخت إلى كل طلب تحته. عدّلها هناك.',
  'imports.collectionVarsEnv': 'أصبحت متغيرات المجموعة البيئة "{name}". وقد تم تحديدها لك.',
  'imports.collectionVarsLayered':
    'لدى Tiger نطاق واحد للمتغيرات، لذلك أُضيفت متغيرات المجموعة ({names}) إلى كل بيئة. والقيم المعيّنة في البيئة لها الأولوية.',

  'imports.report.title': 'تم استيراد {name}',
  'imports.report.statsLabel': 'تم الاستيراد',
  'imports.report.requests': {
    zero: 'طلب',
    one: 'طلب',
    two: 'طلبان',
    few: 'طلبات',
    many: 'طلبًا',
    other: 'طلب'
  },
  'imports.report.folders': {
    zero: 'مجلد',
    one: 'مجلد',
    two: 'مجلدان',
    few: 'مجلدات',
    many: 'مجلدًا',
    other: 'مجلد'
  },
  'imports.report.environments': {
    zero: 'بيئة',
    one: 'بيئة',
    two: 'بيئتان',
    few: 'بيئات',
    many: 'بيئة',
    other: 'بيئة'
  },
  'imports.report.descEnvironmentsTarget': 'أُضيفت البيئات إلى {target}. اختر واحدة من قائمة البيئات.',
  'imports.report.descSelectedEnvironment': '{name} مفتوحة في الشريط الجانبي، مع تحديد البيئة "{environment}".',
  'imports.report.descOpen': '{name} مفتوحة في الشريط الجانبي.',
  'imports.report.savedTo': 'حُفظت في {path}، فستجدها في المرة القادمة.',
  'imports.report.clean': 'تم تحويل كل شيء دون مشاكل. لا شيء لمراجعته.',
  'imports.report.checkOne': 'راجع هذا العنصر',
  'imports.report.checkMany': 'راجع هذه العناصر ({count})',
  'imports.report.hint': 'وصلت هذه العناصر جزئيًا فقط. تم الاحتفاظ بكل شيء، لذا يمكنك إصلاحها في مكانها.',
  'imports.report.in': 'في',
  'imports.report.sentenceClean': 'تم الاستيراد من {name}: {requests}، {folders}، {environments}. تم تحويل كل شيء دون مشاكل.',
  'imports.report.sentenceCheck': 'تم الاستيراد من {name}: {requests}، {folders}، {environments}. {items} للمراجعة.',
  'imports.report.requestsCount': {
    zero: 'لا طلبات',
    one: 'طلب واحد',
    two: 'طلبان',
    few: '{count} طلبات',
    many: '{count} طلبًا',
    other: '{count} طلب'
  },
  'imports.report.foldersCount': {
    zero: 'لا مجلدات',
    one: 'مجلد واحد',
    two: 'مجلدان',
    few: '{count} مجلدات',
    many: '{count} مجلدًا',
    other: '{count} مجلد'
  },
  'imports.report.environmentsCount': {
    zero: 'لا بيئات',
    one: 'بيئة واحدة',
    two: 'بيئتان',
    few: '{count} بيئات',
    many: '{count} بيئة',
    other: '{count} بيئة'
  },
  'imports.report.itemsCount': {
    zero: 'لا عناصر',
    one: 'عنصر واحد',
    two: 'عنصران',
    few: '{count} عناصر',
    many: '{count} عنصرًا',
    other: '{count} عنصر'
  }
}
