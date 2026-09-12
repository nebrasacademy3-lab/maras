# بيئة اختبار معزولة

تحتاج Docker Compose. من جذر المشروع شغّل:

```text
node scripts/prepare-staging-env.mjs
docker compose --env-file .env.staging -f compose.staging.yml up --build -d
```

ينشئ الأمر الأول .env.staging بمفاتيح عشوائية محلية مستقلة، ويرفض الكتابة فوق ملف موجود. لا تضع هذا الملف في Git أو حزمة التسليم.

تحتوي البيئة على PostgreSQL يدعم العربية، وتخزين مرفقات دائم، وخدمة ClamAV مع تحديث التواقيع، والويب وعمال الخلفية. الويب متاح عبر http://localhost:3000 فقط، ولا تُنشر منافذ قاعدة البيانات أو محرك الفحص. فهرسة محركات البحث متوقفة. قد يتأخر بدء الويب أول مرة حتى اكتمال تنزيل تواقيع ClamAV. إذا غيرت STAGING_PORT، حدّث STAGING_ORIGIN ليستخدم المنفذ نفسه.

## إنشاء المدير الأول

لا تُنشئ الإدارة بواسطة رمز API. استخدم أداة التهيئة من طرفية موثوقة تملك اتصال قاعدة البيئة. الأداة تنشئ حسابًا جديدًا فقط، وتوحّد البريد وتشفّر كلمة المرور وتسجل العملية. ترفض العمل إذا وجد أي مدير، حتى لو كان موقوفًا، أو إذا كان البريد مرتبطًا بحساب قائم. استخدم بريدًا تملكه؛ يُعد مؤكدًا بواسطة مشغّل الخادم. بعد الدخول فعّل المصادقة متعددة العوامل من إعدادات الأمان.

مثال PowerShell 7 لبيئة Docker المحلية؛ إدخال كلمة المرور مخفي، ولا تمررها داخل الأمر أو تحفظها في ملف:

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = Read-Host "بريد المدير"
$env:BOOTSTRAP_ADMIN_NAME = Read-Host "اسم المدير"
$env:BOOTSTRAP_ADMIN_PASSWORD = Read-Host "كلمة المرور" -MaskInput
try {
  docker compose --env-file .env.staging -f compose.staging.yml exec -T -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_NAME -e BOOTSTRAP_ADMIN_PASSWORD web npm run admin:bootstrap
} finally {
  Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:BOOTSTRAP_ADMIN_NAME -ErrorAction SilentlyContinue
}
```

استخدم كلمة مرور مستقلة من 10 إلى 128 حرفًا تحقق متطلبات المنصة. الأداة تقرأ ملف .env من جذر التشغيل إذا وُجد باستخدام Node.js 22؛ تبقى قيم البيئة الموجودة مسبقًا ذات أولوية. في تشغيل محلي دون Docker، اضبط DATABASE_URL وطبّق جميع الترحيلات ثم نفّذ npm run admin:bootstrap مع المتغيرات نفسها. تقبل الأداة أيضًا --password-stdin عند توصيل كلمة المرور عبر إدخال قياسي آمن؛ لا تقبل كلمة المرور كوسيط. للمساعدة: npm run admin:bootstrap -- --help. لا تشغّل أدوات تهيئة الاختبار على قاعدة الإنتاج.

بعد وجود المدير، أنشئ الموظفين من الإدارة مع التحقق الأمني المطلوب. لا تعيد التهيئة لاستعادة مدير سابق؛ استخدم مسار استعادة الحساب. افتح /admin/files لمتابعة الفحص.

## الخدمات الخارجية الاختيارية

ضع مفاتيح الاختبار الخاصة بحسابك فقط في .env.staging. لا يحتوي المثال مفاتيح Gemini أو الدفع أو البريد. لمشتريات التطبيق أضف REVENUECAT_SECRET_API_KEY وREVENUECAT_PROJECT_ID وREVENUECAT_APP_IDS وREVENUECAT_WEBHOOK_SECRET لمشروع اختبار منفصل، واربط المنتجات من إدارة المشتريات. يثبت ملف Compose بيئة RevenueCat على sandbox؛ لا يمنح المعاملات الإنتاجية صلاحية في هذه البيئة.

الخادم المحلي لا يستقبل إشعارات مزود خارجي من الإنترنت؛ اختبار webhook فعلي يحتاج عنوان اختبار HTTPS قابلًا للوصول وإعداد المزود عليه. لم يُنشأ هذا العنوان تلقائيًا. لا تستخدم بيانات طلاب حقيقية في هذه البيئة.

## إيقاف البيئة

```text
docker compose --env-file .env.staging -f compose.staging.yml down
```

تبقى الأقراص والبيانات محفوظة؛ لا تستخدم خيار حذف الأقراص إن أردت الاحتفاظ بها. بيانات الاختبار المحلية التي تستخدم PostgreSQL المدمج تحفظ في .data ولا تدخل حزمة المصدر أو Docker. تم فحص بنية Compose؛ تشغيل الحاويات نفسها يحتاج Docker ولم يُنفذ على جهاز التجهيز.
