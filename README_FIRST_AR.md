# مراس العلم — النسخة الكاملة

المجلد يحتوي كل المشروع في ملف واحد:

- `railway/` = الويب + Backend + API + الإدارة + PostgreSQL/Drizzle + الفيديو + الدفع + الإشعارات.
- `mobile/` = تطبيق Expo Android/iOS الجاهز للبناء.

## 1) رفع الويب والباك إند إلى Railway
افتح PowerShell داخل المشروع ثم:

```powershell
cd railway
railway login
railway link
railway up
```

اربطه بخدمة مراس الحالية التي تستخدم `https://marase.up.railway.app`.

بعد نجاح النشر افتح:
`https://marase.up.railway.app/api/health`

يجب أن ترى `ok: true` و`database: ready`.

## 2) بناء Android APK
من جذر المشروع:

```powershell
cd mobile
npm ci
npx expo-doctor
npx expo config --type public
```

في ناتج Expo يجب أن يظهر:
`apiUrl: 'https://marase.up.railway.app'`

ثم:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

## إصلاح الاتصال في هذه النسخة
تم إزالة `localhost:3000` كـfallback من التطبيق. رابط Railway مثبت في:
- `mobile/app.config.ts`
- `mobile/src/lib/api.ts`
- `mobile/eas.json`
- `mobile/.env.example`

لذلك التطبيق سيستخدم Railway حتى لو لم تضبط `EXPO_PUBLIC_API_URL` يدويًا.
