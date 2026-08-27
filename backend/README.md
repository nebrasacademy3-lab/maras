# خادم مراس العلم

هذا المجلد هو حزمة الإنتاج لمنصة مراس العلم. يعمل الخادم على **Node.js 22 + Next.js + Drizzle ORM + PostgreSQL**، ويقدم واجهة الويب وواجهات API التي يستخدمها تطبيق Expo.

## التشغيل المحلي

```bash
npm ci
cp .env.example .env
# اضبط DATABASE_URL على قاعدة PostgreSQL المحلية
npm run db:migrate
npm run dev
```

لإنشاء هجرة بعد تعديل `db/schema.ts`:

```bash
npm run db:generate
npm run db:migrate
```

## متغيرات البيئة

| المتغير | الاستخدام |
|---|---|
| `DATABASE_URL` | رابط PostgreSQL الإلزامي. |
| `DATABASE_SSL` | `true` إذا كانت قاعدة البيانات تتطلب TLS. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | اتركه `true` في الشهادات الموثوقة؛ استخدم `false` فقط إذا فرض مزود قاعدة البيانات شهادة غير موثقة. |
| `DATABASE_POOL_MAX` | الحد الأعلى لاتصالات PostgreSQL لكل نسخة خادم؛ الافتراضي 10. |
| `NEXT_PUBLIC_SITE_URL` | العنوان العام المستخدم في SEO وsitemap. |
| `APP_URL` | العنوان العام المستخدم في عمليات الدفع والعودة. |
| `UPLOAD_DIR` | مجلد الفيديوهات والمرفقات والشعارات؛ في Railway يفضل `/data/uploads`. |
| `RUN_DB_MIGRATIONS` | افتراضيًا `true` لتطبيق الهجرات عند بدء الخدمة. |
| `AUTO_SEED_CATALOG` | افتراضيًا `true` لتهيئة الجهات والتخصصات والمواد الأساسية بعد الهجرات. |
| `CATALOG_SEED_MODE` | استخدم `core` للإنتاج السريع، أو `full` لتوليد قوالب موسعة كثيرة. |
| `VIDEO_SIGNING_SECRET` | سر عشوائي طويل لتوقيع جلسات مشاهدة الفيديو. |
| `ADMIN_API_TOKEN` و`ADMIN_UPLOAD_TOKEN` | حماية واجهات الإدارة والرفع. |
| `TAP_SECRET_KEY` و`TAP_PUBLIC_KEY` و`TAP_MERCHANT_ID` | إعداد الدفع عند تفعيل Tap. |
| `OPENAI_API_KEY` و`OPENAI_API_URL` و`ASSISTANT_MODEL` | المساعد العام السياقي الاختياري؛ بدونها يعمل محرك المعرفة العربي المحلي المتجدد. |
| `RESEND_API_KEY` و`EMAIL_FROM` | رسائل استعادة كلمة المرور الاختيارية. |

لا تضع أسرار الخادم داخل تطبيق الهاتف أو داخل المستودع. عند ضبط `OPENAI_API_KEY` و`ASSISTANT_MODEL` يستطيع المساعد الإجابة عن الأسئلة العامة مع سياق المنصة والحساب، وعند غيابها يبقى محرك المعرفة العربي المحلي متاحًا بإجابات المنصة وروابطها الحية.

## النشر على Railway

أنشئ خدمة Railway من مجلد `backend`. سيكتشف Railway ملف `Dockerfile`. أضف PostgreSQL من مشروع Railway أو استخدم قاعدة PostgreSQL متوافقة، ثم انسخ `DATABASE_URL` إلى Variables. أضف Volume واربطه بـ `/data`، لأن التخزين المحلي للفيديوهات والمرفقات والشعارات يعتمد على هذا المسار.

أمر بدء الخدمة هو:

```bash
bash scripts/start-railway.sh
```

يفحص السكربت وجود `DATABASE_URL`، ينشئ مجلد التخزين، يطبق هجرات PostgreSQL، ثم يشغل Next.js على `0.0.0.0:$PORT`.

بعد الهجرات يشغّل `scripts/bootstrap-catalog.ts` داخل PostgreSQL advisory lock، لذلك لا تكرر نسخ Railway المتزامنة عملية التهيئة. يضيف وضع `core` 85 جهة و3,009 روابط تخصص والمواد الأساسية مع الوحدات والدروس، ويحافظ على أي وحدات أو دروس سبق أن عدلتها الإدارة.


بعد إنشاء النطاق العام، اضبط القيم التالية على عنوان HTTPS نفسه:

```text
NEXT_PUBLIC_SITE_URL=https://your-service.up.railway.app
APP_URL=https://your-service.up.railway.app
UPLOAD_DIR=/data/uploads
AUTO_SEED_CATALOG=true
CATALOG_SEED_MODE=core
```

اختبر:

```bash
curl https://your-service.up.railway.app/api/health
```

تعيد الواجهة `{ "ok": true, "database": "ready" }` عندما يكون PostgreSQL متاحًا.

## المصادقة

المسارات العامة هي `/login` و`/register`. ينشئ التسجيل حساب طالب بكلمة مرور PBKDF2 وجلسة HttpOnly، ويعيد الدخول المستخدم إلى `/onboarding` أو `/dashboard` حسب اكتمال ملفه. تطبيق الهاتف يستخدم نفس قاعدة المستخدمين والجلسات عبر Bearer token من مسارات `/api/mobile/auth/login` و`/api/mobile/auth/register`.

يوجد زر **الرئيسية** ظاهر في واجهتي الدخول والتسجيل، كما أن شاشة التطبيق تستخدم زرًا صريحًا للرئيسية بدل الاعتماد على وجود سجل رجوع في التنقل.

لإنشاء حساب إدارة أو مشرف، استخدم الرمز الإداري من الخادم فقط:

```bash
curl -X POST https://your-service.up.railway.app/api/admin/staff \
  -H "Authorization: Bearer YOUR_ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","phone":"0500000000","fullName":"مدير المنصة","password":"Strong!Pass123","role":"admin","universitySlug":"ksu","specialty":"إدارة الأعمال"}'
```

استخدم `role: "supervisor"` للمشرف. لا توجد مسارات تجريبية تكشف لوحات الإدارة، وجميع عمليات الإدارة محمية بالدور أو الرمز الإداري.

## التزامن دون تحديث الصفحات

تتضمن الهجرة `0010_military_zzzax.sql` جدول مراجعات وقواعد triggers و`pg_notify`. يستقبل `/api/sync/stream` الأحداث عبر SSE، ويقصر القنوات حسب دور المستخدم ونطاقه، ويعيد الويب جلب الجزء المتأثر فقط. عند انقطاع SSE يوجد polling احتياطي، بينما يحدّث Expo استعلاماته كل خمس ثوانٍ عندما يكون التطبيق في المقدمة فقط. تعمل إشعارات PostgreSQL بين جميع نسخ الخادم، فلا تعتمد المزامنة على ذاكرة نسخة واحدة.

## الملفات الخاصة

يستخدم الخادم تخزينًا محليًا آمنًا تحت `UPLOAD_DIR` مع منع traversal، وصلاحيات ملفات مقيدة، وبث Range للفيديو. تبقى مفاتيح الملفات خارج المتصفح، وتتحقق جلسة الفيديو من المستخدم وصلاحية المادة قبل البث. تُبث المرفقات والفيديوهات أثناء الرفع إلى ملفات مؤقتة ذرية، وتُفحص magic bytes قبل اعتمادها وتُنظف تلقائيًا عند فشل التحقق أو معاملة قاعدة البيانات. يدعم طلب المادة حتى 100 ملف بإجمالي 100MB، بينما يحدد الدعم عددًا وحجمًا أصغر. Volume الدائم مطلوب في Railway حتى لا تفقد الملفات بعد إعادة التشغيل.

لا يسمح checkout أو cart بشراء قالب مادة غير مكتمل. يجب أن تكون جميع دروس المادة المنشورة مرتبطة بفيديوهات حالتها `ready` وأن يتوفر درس تجريبي جاهز؛ بعدها تتغير قابلية الشراء تلقائيًا في الكتالوج.

## الاختبارات

```bash
npm run lint
npm run build
npm test
```

يختبر `npm test` البناء وعقود الوظائف وتشغيل خادم الإنتاج ومسار صفحة الدخول ومسار الصحة عند غياب قاعدة البيانات. نجحت في حزمة التسليم 37/37 من اختبارات العقود، ونجح lint وTypeScript وNext production build و`drizzle-kit check`. اختبار PostgreSQL وTap الفعليين يبقى مطلوبًا داخل بيئة Railway لأن الحزمة لا تحتوي أسرار إنتاج أو قاعدة بيانات المستخدم.

## المسارات الأساسية

| المسار | الوظيفة |
|---|---|
| `/` | الصفحة الرئيسية. |
| `/universities` و`/courses` | الكتالوج. |
| `/login` و`/register` | الدخول والتسجيل. |
| `/dashboard` | لوحة الطالب. |
| `/supervisor` و`/admin` | لوحات الموظفين المحمية. |
| `/api/health` | فحص الخدمة وقاعدة البيانات. |
| `/api/assistant` | مساعد مراس المتجدد: يقرأ بيانات PostgreSQL والإعدادات الحية، ويستخدم مزودًا OpenAI-compatible اختياريًا مع fallback محلي. |
| `/api/webhooks/tap` | Webhook الدفع عند تفعيل Tap. |
