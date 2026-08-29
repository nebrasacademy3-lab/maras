# مراس العلم — نسخة موحدة للنشر والبناء

هذه النسخة مصممة بحيث **جذر المجلد نفسه هو مشروع Railway**. لا تدخل إلى مجلد فرعي عند النشر.

## 1) نشر الويب والباك إند على Railway
من جذر المشروع (حيث `Dockerfile` و`railway.json`):

```powershell
npx @railway/cli@latest login
npx @railway/cli@latest link
npx @railway/cli@latest status
npx @railway/cli@latest up
```

اربط الخدمة الحالية الخاصة بـ `https://marase.up.railway.app`، وتأكد أن PostgreSQL مرتبط وأن `DATABASE_URL` يشير لخدمة Postgres.

اختبر بعد النشر:

```powershell
.\CHECK_BACKEND.ps1
```

- `/api/ping` يثبت أن Next.js نفسه يعمل ولا يعتمد على قاعدة البيانات.
- `/api/health` يثبت أن Next.js + PostgreSQL يعملان معًا.

## 2) بناء التطبيق
التطبيق موجود داخل `mobile/`:

```powershell
cd mobile
npm ci
npx expo-doctor
npx expo config --type public
npx eas-cli@latest build --platform android --profile preview
```

يجب أن يظهر `apiUrl: 'https://marase.up.railway.app'`.

## متغيرات Railway الأساسية
انسخ `RAILWAY_VARIABLES.example` إلى Variables مع الاحتفاظ بقيم أسرارك الحقيقية. إذا كان اسم خدمة قاعدة البيانات ليس `Postgres`، غيّر مرجع `${{Postgres.DATABASE_URL}}` ليطابق اسم الخدمة.

## التخزين
إذا تستخدم الفيديوهات والملفات على Railway Volume، اربطه بالخدمة على `/data` وأبقِ `RAILWAY_RUN_UID=0`.
