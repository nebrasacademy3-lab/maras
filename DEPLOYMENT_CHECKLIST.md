# قائمة إطلاق مراس العلم على Railway

## 1. قاعدة البيانات

أنشئ خدمة PostgreSQL أو اربط قاعدة PostgreSQL الموجودة، ثم انسخ `DATABASE_URL` إلى Variables في خدمة `backend`. لا تستخدم رابط SQLite أو أي قاعدة غير PostgreSQL. إذا كانت قاعدة البيانات الحالية تحتوي بيانات مهمة، خذ نسخة احتياطية قبل تشغيل الهجرة الأولى.

## 2. المتغيرات الأساسية

```text
DATABASE_URL=...
NEXT_PUBLIC_SITE_URL=https://your-service.up.railway.app
APP_URL=https://your-service.up.railway.app
DATABASE_SSL=false
DATABASE_SSL_REJECT_UNAUTHORIZED=true
RUN_DB_MIGRATIONS=true
UPLOAD_DIR=/data/uploads
VIDEO_SIGNING_SECRET=<32+ random characters>
ADMIN_API_TOKEN=<long random token; management only>
ADMIN_UPLOAD_TOKEN=<different long random token; video upload only>
TAP_SECRET_KEY=<Tap server secret>
TAP_WEBHOOK_SECRET=<dedicated HMAC secret when provided>
MOBILE_APP_URL=<optional HTTPS Expo Web origin>
```

إذا كانت قاعدة PostgreSQL لا تسمح إلا باتصال TLS، اضبط `DATABASE_SSL=true`. لا تضبط `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## 3. أسرار وحماية

ولّد كل سر من مصدر عشوائي آمن، مثل `openssl rand -base64 48`. لا تستخدم نفس السر للإدارة ورفع الفيديو، ولا تضع أي سر في Expo أو الواجهة أو Git. دوّر الأسرار عند تغيير العاملين أو الاشتباه بتسريب. لا تضبط `NODE_TLS_REJECT_UNAUTHORIZED=0`. طبّق حدًا على مستوى Railway/WAF لعناوين الإدارة وWebhook والرفع، وراقب 401/403/429 وأخطاء الدفع.

راجع `SECURITY.md` قبل الإطلاق، ونفّذ اختبار PostgreSQL وTap Sandbox ورفع الملفات ببيئة اختبار حقيقية. لا تعتبر نجاح lint أو build أو npm audit بديلًا عن اختبار اختراق مستقل.

## 4. التخزين

أضف Volume إلى خدمة الخادم واربطه بـ `/data`. يحتاج التطبيق هذا المسار للفيديوهات والمرفقات والشعارات. التخزين المحلي على Railway ليس بديلًا عن النسخ الاحتياطي؛ احتفظ بنسخة دورية من Volume أو انقل التخزين لاحقًا إلى S3-compatible provider عند التوسع.

## 5. النشر

اجعل Root Directory للخدمة هو `backend`. سيستخدم Railway `Dockerfile` ثم `start-railway.sh`. السكربت يطبق هجرات PostgreSQL ثم يشغل Next.js على المنفذ الذي يوفره Railway.

## 6. التحقق بعد النشر

```bash
curl https://your-service.up.railway.app/api/health
curl -I https://your-service.up.railway.app/login
```

يجب أن يعيد health حالة قاعدة البيانات `ready`، وأن تظهر صفحة الدخول مع زر `الرئيسية`. اختبر إنشاء حساب طالب جديد، تسجيل الدخول بالبريد والجوال، تسجيل الخروج، طلب مادة بمرفق، المساعد، ولوحة الإدارة.

## 7. ربط التطبيق

في مشروع Expo، انسخ `mobile/.env.example` إلى `.env` وعدّل:

```text
EXPO_PUBLIC_API_URL=https://your-service.up.railway.app
# Production builds reject HTTP URLs; use HTTPS only.
```

بعد ذلك نفّذ `npm run typecheck` و`npm run lint` و`npx expo export --platform web`. لبناء Android/iOS استخدم حسابات EAS الخاصة بالمشروع.
