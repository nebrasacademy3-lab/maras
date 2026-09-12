# مراس العلم — نسخة موحدة للنشر والبناء

ابدأ بـ [تقرير التسليم والتحقق الحالي](verification/README_AR.md) و[دليل التشغيل والاستعادة](docs/run-and-recovery-ar.md). هذه النسخة تتضمن الترحيلات حتى `0029`؛ طبّقها بعد نسخة احتياطية وتهيئة ClamAV. ملف `RELEASE_MANIFEST.json` داخل حزمة التسليم يسرد بصمات المصدر الحالي. تقارير سبتمبر الأقدم المرفقة هي مراجع تاريخية فقط.

التسليم يشمل المصدر وإعدادات الاختبار؛ لم يُنشر الإنتاج أو المتاجر في هذه المرحلة.

هذه النسخة مصممة بحيث **جذر المجلد نفسه هو مشروع Railway**. لا تدخل إلى مجلد فرعي عند النشر.

## 1) نشر الويب والباك إند على Railway
من جذر المشروع (حيث `Dockerfile` و`railway.json`):

```powershell
npx @railway/cli@latest login
npx @railway/cli@latest link
npx @railway/cli@latest status
npx @railway/cli@latest up
```

اربط خدمة Railway الحالية بالنطاق `https://marasalelm.com`، وتأكد أن PostgreSQL مرتبط وأن `DATABASE_URL` يشير لخدمة Postgres.

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

يجب أن يظهر `apiUrl: 'https://marasalelm.com'`.

## متغيرات Railway الأساسية
انسخ `RAILWAY_VARIABLES.example` إلى Variables مع الاحتفاظ بقيم أسرارك الحقيقية. إذا كان اسم خدمة قاعدة البيانات ليس `Postgres`، غيّر مرجع `${{Postgres.DATABASE_URL}}` ليطابق اسم الخدمة.

## التخزين
إذا تستخدم الفيديوهات والملفات على Railway Volume، اربطه بالخدمة على `/data` وأبقِ `RAILWAY_RUN_UID=0`.

## إصلاح اتصال Android - 2026-08-30
تم إصلاح سبب كان يمنع React Native/Android من إرسال الطلب قبل وصوله إلى Railway: اسم الجهاز كان يوضع مباشرة في `x-meras-device-label` ويحتوي رمز `·` أو أحرف عربية/Unicode. أصبح الاسم يرمز إلى ASCII-safe قبل الإرسال ثم يفك ترميزه في الباك إند. كما أن طلبات Android/iOS Native لم تعد تعتمد على فحص Origin الخاص بالمتصفح، والمصادقة Native تستخدم Bearer Token بدون cookie credentials.

بعد رفع الجذر إلى Railway، ابنِ APK جديدًا من هذا الملف بالأمر:

```powershell
.\BUILD_ANDROID.ps1
```

نسخة التطبيق أصبحت 1.0.1 وPreview يستخدم `autoIncrement` لمسح الالتباس مع APK قديم.
