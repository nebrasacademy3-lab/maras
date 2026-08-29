# مراس العلم — بناء Android بعد إصلاح الإشعارات والمساعد والدعم

هذه النسخة مربوطة مسبقًا بمشروع EAS:

- الحساب: `@os1m1/meras-alelm`
- EAS Project ID: `684cf9e9-bf33-40bf-89a7-afba498cf90e`
- Android package: `sa.merasalelm.app`
- API: `https://marase.up.railway.app`
- `preview` ينتج APK للتثبيت المباشر.
- `production` ينتج نسخة المتجر.
- لا تحتاج إلى `eas init`، ولا تستخدم هذه النسخة قنوات `expo-updates`؛ لذلك لن يعود خطأ channel/expo-updates السابق.

## 1) قبل بناء نسخة Push كاملة على Android

الإشعارات داخل التطبيق والعداد ومسح الشارة مبرمجة بالكامل. لكي تصل إشعارات النظام والهاتف عندما يكون التطبيق بالخلفية أو مغلقًا، Android يحتاج Firebase Cloud Messaging (FCM V1) مرتبطًا بحساب EAS.

1. افتح Firebase وأنشئ/استخدم مشروع مراس.
2. أضف Android app بالحزمة: `sa.merasalelm.app`.
3. نزّل `google-services.json` وضعه في **نفس هذا المجلد** بجانب `package.json`.
   - `app.config.ts` يكتشف الملف تلقائيًا ولا يحتاج تعديلًا.
4. من Firebase: Project settings > Service accounts > Generate new private key.
5. لا تضع ملف مفتاح Service Account داخل المشروع ولا ترفعه إلى Git.
6. ارفع مفتاح FCM V1 إلى EAS عبر:

```powershell
npx eas-cli@latest credentials -p android
```

ثم اختر Android / production / Google Service Account / Push Notifications (FCM V1) وارفع مفتاح Service Account الخاص بـFirebase.

> `google-services.json` هو ملف إعداد التطبيق، أما ملف Service Account private key فهو **سر** ويُرفع إلى EAS Credentials ولا يوضع داخل ZIP أو Git.

## 2) بناء APK للاختبار

افتح PowerShell داخل هذا المجلد:

```powershell
npm ci
npx eas-cli@latest project:info
npx eas-cli@latest build --platform android --profile preview
```

عند سؤال Android Keystore، اسمح لـEAS بإدارته إذا لم يكن لديك Keystore سابق للتطبيق.

## 3) بناء نسخة Google Play

```powershell
npx eas-cli@latest build --platform android --profile production
```

## ما تم إصلاحه في هذه النسخة

- تصفير عداد الإشعارات بعد القراءة، ومزامنة العداد مباشرة.
- زر «قراءة الكل» في التطبيق والويب.
- عند فتح صندوق الإشعارات يتم تعليمها كمقروءة ومحو Badge الهاتف.
- تسجيل Expo Push Token على الخادم وإرسال Push عبر Expo/FCM للأجهزة المسجلة.
- معالجة النقر على Push وفتح الوجهة داخل التطبيق.
- إصلاح مساعد مراس: فقاعات محدودة العرض، تمرير صحيح، ظهور الإجابة، وComposer فوق الكيبورد.
- إعادة بناء شات الدعم: ترتيب زمني، نص+مرفقات في نفس الرسالة، رد على رسالة، تسجيل صوت، صور داخل الشات، تنزيل مفرد/تحميل الكل، وتصميم بطاقات أصغر.
- نفس نموذج محادثة الدعم للطالب والإدارة.
- صلاحيات ميكروفون Android مضافة، و`expo-audio` مضاف بالنسخة المناسبة لـSDK 57.

## ملاحظة تحقق

تم فحص ملفات TypeScript المعدلة نحويًا، وتم التحقق من توافق `package.json` و`package-lock.json` مع `npm ci --package-lock-only --offline`. البناء الفعلي على EAS يجب تشغيله من حسابك لأنه يعتمد على Android signing وFCM credentials الخاصة بك.


## إصلاح الفيديو الأخير

راجع `VIDEO_FIXES_20260829_AR.md`. المشغل الآن يعمل داخل التطبيق، يعرض الفيديو كاملًا بـ contain، ويفرّغ الـVideo Surface قبل الرجوع لمنع الشاشة الفارغة.
