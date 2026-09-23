# نقل مراس إلى DigitalOcean App Platform

هذا المجلد يجهز **مواصفة إنتاج للمراجعة** ولا ينشئ موارد سحابية. الملف `app.yaml.template` يحتوي علامات `__...__` و`REPLACE_SECRET_...`، ولا يجوز رفعه إلى App Platform كما هو. المستودع يحتوي كود المنصة، لكنه **لا يمثل نسخة من قاعدة بيانات الإنتاج أو ملفات الطلاب والفيديوهات**. حسب قرار النشر الحالي، تبدأ DigitalOcean بقاعدة جديدة فارغة؛ ستُعاد إضافة الحسابات والمحتوى ورفع الفيديوهات يدويًا. لا تظهر السجلات المالية القديمة في القاعدة الجديدة.

## مسار التنفيذ دون رمز API

موصل DigitalOcean المتاح لهذه المهمة يدير Droplets فقط. إذا لم يُستخدم رمز API، أنشئ من لوحة DigitalOcean قاعدة PostgreSQL مُدارة وSpace خاصًا وVPC، واربط GitHub بالمشروع. احفظ أسماء الموارد والمنطقة والـVPC، وأضف مفاتيح Spaces وأسرار الخدمات إلى إعدادات التطبيق المشفرة داخل اللوحة؛ لا تشاركها في المحادثة أو GitHub. يمكن بعدها ملء نسخة خاصة من المواصفة أدناه في محرر App Spec في لوحة App Platform. القالب المنشور في GitHub للتجهيز فقط، ولا ينشئ الخدمات وحده.

## البنية المقترحة

| المكوّن | التشغيل | سبب الفصل |
| --- | --- | --- |
| `web` | Next.js على منفذ 3000؛ نسختان إلى ست نسخ مع توسع CPU | معالجة طلبات الويب وواجهات تطبيق الهاتف، وفحص `/api/health` |
| `scanner` | خدمة داخلية على 3001 بلا route عام | فحص ClamAV الإلزامي قبل إتاحة المرفقات |
| `video-worker` | عامل FFmpeg مستقل | عزل حمل تحويل الفيديو عن الطلبات |
| `ai-worker` | عامل ملفات الذكاء | ضبط الحمل والطلبات على Gemini |
| `file-scan-worker` | استهلاك طابور الفحص | إعادة محاولة الملفات المعلقة |
| `cleanup-worker` | حذف الملفات المنتهية بأمان | عدم ترك حذف دائم معتمدًا على نسخ الويب |
| `migrate` | وظيفة `PRE_DEPLOY` مرة لكل نشر | تنفيذ ترحيلات Drizzle قبل استقبال الكود الجديد للزيارات |
| `pg` + Spaces | PostgreSQL مُدار + Space خاص | بيانات وملفات دائمة مشتركة بين النسخ |

App Platform لا يدعم volumes، ويضيع قرص الحاوية عند الاستبدال؛ لذلك **Spaces شرط تشغيل وليس تحسينًا اختياريًا**. يحتفظ عامل الفحص بتواقيع ClamAV في قرص مؤقت ويعيد تنزيلها عند استبدال الحاوية؛ راقب `/ready` وزمن النشر الأول، وقد يحتاج الفاحص إلى أسلوب حفظ تواقيع خارجي إذا لم تكن إعادة التنزيل موثوقة. لا تعرّض `scanner` أو Space الخاص للعامة. [حدود App Platform](https://docs.digitalocean.com/products/app-platform/details/limits/)، [الخدمات الداخلية](https://docs.digitalocean.com/products/app-platform/how-to/manage-internal-routing/).

## تهيئة الموارد قبل النشر

1. اختر منطقة App Platform، ثم VPC وقاعدة PostgreSQL المُدارة في مركز بياناتها المتوافق. أضف التطبيق إلى trusted sources للقاعدة. فعّل النسخ الاحتياطي التلقائي واختبر الاستعادة بعد التهيئة، ولا تنفذ ترحيلات لاحقة قبل حفظ نسخة يمكن الرجوع إليها. يتطلب القالب اسم cluster واسم قاعدة ومستخدمًا موجودين، ولا ينشئ قاعدة إنتاج من تلقاء نفسه. [ربط VPC](https://docs.digitalocean.com/products/app-platform/how-to/enable-vpc/)، [مواصفة قاعدة الإنتاج](https://docs.digitalocean.com/products/app-platform/reference/app-spec/).
2. أنشئ Space **خاصًا** في المنطقة المختارة، مع مفتاح وصول محدود لهذا الـbucket فقط. بعد تشغيل المنصة، ارفع الفيديوهات والمرفقات من نسخك الخاصة، ثم تحقق من عينات تشغيل وتنزيل مصرح بها. اضبط CORS على نطاق الإنتاج المحدد فقط إن تم تفعيل الرفع المباشر لاحقًا. يبقى `S3_DIRECT_UPLOAD_CONDITIONAL_WRITES_VERIFIED=false` حتى تنجح اختبارات الكتابة المشروطة وCORS؛ الرفع عبر الخادم يعمل مستقلًا عنه. [مفاتيح Spaces المحدودة](https://docs.digitalocean.com/products/spaces/how-to/manage-access/)، [CORS](https://docs.digitalocean.com/products/spaces/how-to/configure-cors/).
3. القاعدة الجديدة **فارغة**. طبّق ترحيلات Drizzle، ثم أنشئ المدير الأول مرة واحدة باستخدام `npm run admin:bootstrap -- --password-stdin` مع `BOOTSTRAP_ADMIN_EMAIL` و`BOOTSTRAP_ADMIN_NAME` وكلمة مرور قوية عبر الإدخال القياسي الآمن. لا تضف كلمة المرور إلى المواصفة أو سجلات النشر. حسابات الطلاب والدروس والطلبات والمدفوعات السابقة غير موجودة في هذه القاعدة، ولا تُنشئ أرصدة أو اشتراكات افتراضية للتعويض.
4. تأكد من ربط GitHub الخاص `nebrasacademy3-lab/maras` بحساب DigitalOcean بصلاحية الوصول اللازمة. القالب يستخدم `main` و`deploy_on_push: false` حتى يكتمل فحص أول نشر؛ فعّل النشر التلقائي بعد التحقق. [نشر GitHub](https://docs.digitalocean.com/products/app-platform/how-to/create-apps/).

## متغيرات البيئة والأسرار

استبدل العلامات في **نسخة خاصة خارج المستودع**. لا تلصق أسرار Tap أو Gemini أو البريد أو قاعدة البيانات في Git أو المحادثة أو سجلات التحقق. `REPLACE_SECRET_*` في القالب أسماء مواضع فقط، ويجب استبدال كل واحد بقيمة مستقلة حقيقية من DigitalOcean Encrypted Environment Variables. استخدم القيمة **نفسها** لـ`MALWARE_SCAN_TOKEN` في `web` و`scanner` و`file-scan-worker`، ونفس مفتاح Spaces حيث يتشارك المكوّنان الـbucket. ولّد مفاتيح قوية مستقلة للإنتاج الجديد، واحفظ نسخة آمنة منها؛ ثباتها مطلوب لقراءة البيانات التي ستُنشأ لاحقًا.

| الصنف | المفاتيح | الإجراء |
| --- | --- | --- |
| عامة وقت البناء | `NEXT_PUBLIC_SITE_URL` | عنوان HTTPS النهائي؛ Dockerfile يستخدمه عبر `ARG` وقت `next build`. تغييره يتطلب build جديدًا. |
| عامة وقت التشغيل | `APP_URL`, `HOSTING_PLATFORM`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_POOL_MAX`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | `HOSTING_PLATFORM=digitalocean-app-platform` لتفعيل حارس جاهزية DO؛ لا تعطّل التحقق من شهادة PostgreSQL. |
| ربط قاعدة البيانات | `DATABASE_URL=${pg.DATABASE_PRIVATE_URL}`, `DATABASE_CA_CERT=${pg.CA_CERT}` | اتصال خاص عبر VPC وشهادة CA من القاعدة المُدارة. يستخدم job الترحيل الاتصال المباشر. |
| أسرار الويب | `SESSION_SECRET`, `ADMIN_API_TOKEN`, `ADMIN_UPLOAD_TOKEN`, `VIDEO_SIGNING_SECRET`, `ADMIN_MFA_ENCRYPTION_KEY`, `SCHEDULED_TASK_TOKEN`, `REFERRAL_HASH_SALT`, `AI_KEYS_ENCRYPTION_KEY`, `INSTRUCTOR_DATA_ENCRYPTION_KEY`, `OAUTH_TOKEN_ENCRYPTION_KEY` | قيم قوية مستقلة ومشفرة في إعدادات DO؛ احتفظ بها لاستخدامها مع البيانات الجديدة مستقبلًا. |
| تخزين وفحص | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `MALWARE_SCAN_TOKEN`, `MALWARE_SCAN_URL` | رابط الفاحص الداخلي هو `http://scanner:3001/scan` فقط؛ لا يوجد منفذ عام للفاحص. |
| الدفع عبر Tap | `TAP_SECRET_KEY` في `web` | انسخ مفتاح الحساب الصحيح إلى موضعه المشفر واختبر الدفع والاسترداد والـwebhook والمطابقة. لا تفعّل `TAP_TABBY_ENABLED` أو `TAP_TAMARA_ENABLED` إلا بعد اعتماد الوسيلة في حساب Tap. |
| الذكاء عبر Gemini | `GEMINI_FREE_API_KEYS` بالقيمة نفسها في `web` و`ai-worker` | ضع مفتاحًا أو قائمة مفاتيح لمشروعات مجانية ثبتت هويتها وحدودها في قاعدة البيانات؛ وجود المفتاح وحده لا يجيز الإرسال. أبقِ المفاتيح المدفوعة خارج هذا الموضع. |
| البريد عبر Resend | `RESEND_API_KEY` في `web` | اضبط أيضًا `EMAIL_FROM` كمتغير عام بعنوان مرسل موثق لدى Resend؛ بدونه تبقى قدرة البريد في `/api/health` معطلة. |

متغيرات `REVENUECAT_*` و`TAP_WEBHOOK_SECRET` القديمة غير مستخدمة في التكامل الحالي، فلا تنقلها. تسجيل الدخول Google/Apple يحتاج إعدادًا منفصلًا (`GOOGLE_CLIENT_ID` مع `GOOGLE_CLIENT_SECRET`، أو `APPLE_CLIENT_ID` و`APPLE_TEAM_ID` و`APPLE_KEY_ID` مع `APPLE_PRIVATE_KEY`) وربط callback بالنطاق النهائي؛ القالب لا يشغّل تلك المزودات تلقائيًا. الدفع الحقيقي والبريد وGemini لا يمكن التحقق منها دون حسابات ومفاتيح حقيقية واختبارات قبول على DigitalOcean.

يجب إبقاء `DATABASE_SSL_REJECT_UNAUTHORIZED=true`. شهادة CA متاحة كمتغير ربط `${pg.CA_CERT}`، ويحتاج كود الاتصال قراءتها. في PostgreSQL Standard Edition، لا يكفي `sslmode=require` للتحقق من هوية الخادم؛ الشهادة مطلوبة لوضع تحقق قوي. **لا تستخدم** `DATABASE_SSL_REJECT_UNAUTHORIZED=false` كحل للنشر. [متغيرات الربط](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/)، [TLS في PostgreSQL](https://docs.digitalocean.com/products/databases/postgresql/how-to/connect/).

القالب يستخدم الاتصال المباشر الخاص في `DATABASE_URL` لأن جدولة دورة الحياة تستخدم `pg_advisory_lock` مرتبطًا بالجلسة. يمكن إنشاء PgBouncer بنمط **session** بعد اختبار التحميل واستبدال رابط الويب والعمال برابط pool؛ نمط **transaction** غير مناسب لهذا القفل. احسب مجموع `DATABASE_POOL_MAX × عدد حاويات الويب والعمال` مع هامش للترحيلات والإدارة قبل زيادة `max_instance_count`. **ست نسخ ليست إثباتًا لتحمل مئات الآلاف**؛ لا توسع إلا بنتائج حمل حقيقية وزمن استجابة واستهلاك اتصالات واضحين. [أنماط pool](https://docs.digitalocean.com/products/databases/postgresql/how-to/manage-connection-pools/)، [توسع App Platform](https://docs.digitalocean.com/products/app-platform/how-to/scale-app/).

## التطبيق والتحقق

1. خذ نسخة خاصة من `app.yaml.template`، واملأ المنطقة، VPC، اسم cluster، اسم قاعدة البيانات ومستخدمها، النطاق، منطقة Space والـbucket، والأسرار. لا تحتفظ بالنسخة المملوءة داخل المستودع. قبل إرسالها، تأكد أن البحث عن `__` و`REPLACE_SECRET_` لا يعيد شيئًا.
2. شغّل `doctl apps spec validate <private-spec.yaml>`؛ إن لم تتوفر صلاحية API يمكنك تنفيذ `doctl apps spec validate --schema-only <private-spec.yaml>` لفحص البنية فقط، ثم افحص صلاحية الموارد من لوحة DO. قد تتطلب صيغة ربط `DATABASE_CA_CERT` المشفرة تجربة تحقق spec في حساب DO. [أمر التحقق الرسمي](https://docs.digitalocean.com/reference/doctl/reference/apps/spec/validate/).
3. أنشئ التطبيق من المواصفة فقط بعد تجهيز القاعدة وSpace والمفاتيح. نفّذ اختبار `GET /api/health` وتأكد من `status=ready`، ثم `GET /ready` للفاحص من داخل التطبيق، ثم رفع ملف آمن وفحصه وتنزيله، وتشغيل فيديو محمي، وتوليد PDF، وتسجيل الدخول حسب الأدوار، وتجربة دفع Tap الاختباري ومطابقة webhook والفاتورة، ثم البريد والذكاء. شغّل فحص تدفق التطبيق المحمول على عنوان API الجديد. لا تتجاوز فشلًا بوضع رابط فحص شكلي أو تعطيل التحقق الأمني.
4. بعد نجاح التدفقات، حدّث DNS للنطاق وراجع شهادة HTTPS و`APP_URL` وروابط OAuth/Tap. أعد بناء تطبيقات Expo ونشرها إن تغيّر عنوان API المضمّن فيها؛ نقل الويب لا يغيّر النسخ المثبتة على الهواتف. عندها فقط غيّر `SEO_INDEXING_ENABLED` إلى `true` وفعل `deploy_on_push` إن رغبت.

**المعطيات غير المتوفرة من الكود وحده:** رقم VPC والمنطقة الفعلية، اسم PostgreSQL cluster، Space ومفاتيحه، أسرار المزودين، وربط GitHub/DNS في حساب DigitalOcean. لا يمكن إثبات تشغيل إنتاجي من دونها؛ القاعدة الجديدة لا تستعيد محتوى الإنتاج القديم. كذلك يحتاج الفاحص اختبار cold start لأن App Platform لا يقدم له قرص تواقيع دائمًا.

مرجع المواصفة: [App Spec](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)، [Dockerfile build args](https://docs.digitalocean.com/products/app-platform/reference/dockerfile/)، [متغيرات البيئة المشفرة](https://docs.digitalocean.com/products/app-platform/how-to/use-environment-variables/).
