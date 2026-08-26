# تطبيق مراس العلم — Android وiOS

تطبيق React Native/Expo عربي RTL متصل مباشرة بمنصة مراس العلم. يستخدم الحسابات والجامعات والتخصصات والمواد والصلاحيات والتقدم والطلبات والدعم نفسها الموجودة في الخادم، مع تصميم فاتح وليلي متجاوب للهواتف والأجهزة اللوحية.

## ما هو جاهز

- أيقونة خارجية مربعة 1024×1024: علامة **M** فقط، مكتملة وواضحة فوق خلفية بيضاء.
- Splash وشعار متكيف للوضعين الفاتح والليلي، وأيقونة إشعارات Android أحادية اللون.
- تسجيل ودخول فعليان، تخزين رمز الجلسة في SecureStore، إكمال ملف الجامعة والتخصص، وإرشادات أول دخول.
- تصفح الجامعات والكليات والتخصصات والمواد، توصيات الملف الأكاديمي، المفضلة، ومواد الطالب.
- مشغل مراس مخصص: تحكم كامل، سرعة، تقديم/رجوع، ملء الشاشة، حفظ تقدم، ملاحظات، رابط بث قصير العمر، منع التقاط الشاشة حيث يدعمه النظام، وإخفاء المحتوى عند مغادرة التطبيق.
- طلب مادة مع رفع حتى 5 ملفات، متابعة الحالات، إشعارات داخلية وPush، وتذاكر دعم وردود وواتساب وروابط التواصل.
- سجل الطلبات والفواتير وحذف الحساب من داخل التطبيق.
- مساعد مراس السياقي مع تحويل روابط إجاباته إلى صفحات التطبيق الأصلية.
- مساحة مشرف: طابور الطلبات، تحديث الحالات، إنشاء الوحدات والدروس، ورفع فيديو خاص ضمن نطاق الإشراف فقط.
- لوحة إدارة: الحسابات والأدوار، نطاقات المشرفين، الجهات والشعارات، التخصصات والمواد، الطلبات والدعم، منح الوصول، الكوبونات، المبيعات، التقييمات، الإشعارات، ووسائل التواصل.
- وضع `reader` للإصدار المنشور في المتاجر، ووضع `external` لنسخة الاختبار الداخلية.

## المتطلبات

- Node.js 22.13 أو أحدث.
- خادم مراس منشور عبر HTTPS، على Railway أو Sites.
- حساب Expo لبناء النسخ الموقعة.
- حساب Apple Developer لإصدار App Store، وحساب Google Play Console لإصدار Google Play.

## التشغيل محليًا

```bash
npm ci
cp .env.example .env
npm start
```

اضبط رابط الخادم في `.env`:

```dotenv
EXPO_PUBLIC_API_URL=https://your-railway-domain.example
EXPO_PUBLIC_STORE_MODE=reader
EXPO_PUBLIC_EAS_PROJECT_ID=your-expo-project-id
```

استخدم هاتفًا فعليًا لاختبار Push ومنع التقاط الشاشة وملء الشاشة. بعض هذه الميزات لا تعمل بالكامل داخل المحاكي أو Expo Go.

## فحوص المشروع

```bash
npm run typecheck
npm run lint
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npx expo export --platform android --output-dir dist-android
EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 npx expo export --platform ios --output-dir dist-ios
```

تم اجتياز TypeScript وESLint وتجميع Metro لكل من Android وiOS في 22 أغسطس 2026.

## إنشاء APK/AAB وIPA

هيئ مشروع EAS أول مرة:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

نسخة Android داخلية بصيغة APK:

```bash
npx eas-cli@latest build --platform android --profile preview
```

نسخ المتاجر الموقعة:

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

ثم الإرسال بعد ضبط حسابات المتاجر:

```bash
npx eas-cli@latest submit --platform android --profile production
npx eas-cli@latest submit --platform ios --profile production
```

ملفا `app.config.ts` و`eas.json` جاهزان، ومعرّفا الحزمة هما:

- Android: `sa.merasalelm.app`
- iOS: `sa.merasalelm.app`

لا يمكن إنشاء ملف متجر **موقع** أو إرساله دون ملكية حسابات Apple وGoogle وشهاداتها؛ مصدر التطبيق وتجميعه البرمجي جاهزان لهذه الخطوة.

## سياسة الشراء داخل المتاجر

- `reader`: لا يعرض زر شراء المحتوى الرقمي داخل التطبيق. تظهر المواد التي فُعّلت للحساب من المنصة، وهو الإعداد الافتراضي للإنتاج.
- `external`: يعرض رابط الاشتراك عبر موقع مراس لنسخ الاختبار الداخلية فقط.

راجع دائمًا السياسات الأحدث قبل الإرسال:

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments Policy: https://support.google.com/googleplay/android-developer/answer/9858738

## حماية الفيديو

التطبيق لا يضع رابط تنزيل، ويستخدم بثًا خاصًا موقّعًا قصير العمر، علامة مائية متحركة، حماية Screen Capture، وإيقافًا وإخفاءً عند مغادرة التطبيق. مع ذلك لا يوجد تطبيق يستطيع منع تصوير الشاشة بكاميرا خارجية أو استخراج المحتوى بنسبة 100%. للمحتوى عالي القيمة استخدم DRM فعليًا مثل Widevine وFairPlay عبر مزود فيديو متخصص.

## البنية

- `app/`: الشاشات والمسارات الأصلية.
- `src/providers/`: الجلسة والمظهر والاستعلامات.
- `src/components/`: نظام الواجهة والبطاقات والعلامة.
- `src/lib/api.ts`: عميل الخادم والـBearer token.
- `assets/`: الأيقونة والشعار وSplash.
- `app.config.ts`: إعداد Android وiOS.
- `eas.json`: ملفات بناء الاختبار والإنتاج.

لا ترفع `.env` أو أي مفاتيح خاصة إلى Git. مفاتيح Tap وGemini وتوقيع الفيديو تبقى في الخادم فقط ولا تدخل حزمة التطبيق.
