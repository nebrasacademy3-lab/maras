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
| `NEXT_PUBLIC_SITE_URL` | العنوان العام المستخدم في SEO وsitemap. |
| `APP_URL` | العنوان العام المستخدم في عمليات الدفع والعودة. |
| `UPLOAD_DIR` | مجلد الفيديوهات والمرفقات والشعارات؛ في Railway يفضل `/data/uploads`. |
| `RUN_DB_MIGRATIONS` | افتراضيًا `true` لتطبيق الهجرات عند بدء الخدمة. |
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

يفحص السكربت وجود `DATABASE_URL`، ينشئ مجلد التخزين، يطبق هجرات PostgreSQL، ثم يشغل Next.js على `0.0.0.0:$PORT`. لا يحتاج التشغيل إلى Wrangler أو Workerd أو D1.

بعد إنشاء النطاق العام، اضبط القيم التالية على عنوان HTTPS نفسه:

```text
NEXT_PUBLIC_SITE_URL=https://your-service.up.railway.app
APP_URL=https://your-service.up.railway.app
UPLOAD_DIR=/data/uploads
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

## الملفات الخاصة

يستخدم الخادم تخزينًا محليًا آمنًا تحت `UPLOAD_DIR` مع منع traversal، وصلاحيات ملفات مقيدة، وبث Range للفيديو. تبقى مفاتيح الملفات خارج المتصفح، وتتحقق جلسة الفيديو من المستخدم وصلاحية المادة قبل البث. Volume الدائم مطلوب في Railway حتى لا تفقد الملفات بعد إعادة التشغيل.

## الاختبارات

```bash
npm run lint
npm run build
npm test
```

يختبر `npm test` البناء وتشغيل خادم الإنتاج ومسار صفحة الدخول ومسار الصحة عند غياب قاعدة البيانات. لا يعتبر نجاح البناء بديلًا عن اختبار اتصال PostgreSQL الفعلي داخل بيئة Railway.

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
