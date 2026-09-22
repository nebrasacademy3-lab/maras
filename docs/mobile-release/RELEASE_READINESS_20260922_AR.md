# تجهيز تطبيقات مراس العلم — 22 سبتمبر 2026

## نموذج الخدمة
- الإصدار 1.0.2. كل ملفات EAS للهاتف تستخدم reader، بما فيها المعاينة. الشراء والاشتراك من الموقع فقط؛ لا Checkout أو توجيه شراء داخل iOS/Android، ولا RevenueCat أو عميل دفع متجر نشط.
- يستطيع المستخدم تصفح المعاينات والمحتوى العام، ثم تسجيل الدخول للوصول إلى محتواه وخدماته المفعلة. وصف المراجعة يجب أن يشرح الفيديوهات التعليمية والخدمات المساندة بصدق. تصنيف Apple للمنتج، خصوصًا الأدوات الدراسية الإضافية، قرار مراجعة وليس نتيجة نضمنها بمجرد تسمية الوضع reader.
- لا يوجد تبديل سلوك مخصص للمراجعين، ولا فتح شراء بعد قبول النسخة.

## إصلاحات هذا الإصدار
تنزيل الملفات الخاصة يحمل إثبات MFA الإداري ويعيد التحقق مرة واحدة فقط عند طلبه؛ تُرفض استجابات JSON/HTML بدل PDF، والملفات الناقصة أو المفرطة، والتحويلات الخارجية. تُكتب ملفات الهاتف بالتدفق إلى مسارات مؤقتة فريدة وتحذف بعد الحفظ/المشاركة أو الإلغاء. تغيير الحساب يوقف التنزيل ويمنع تسليم بياناته لحساب آخر.

طبقة الاتصال ترفض الردود المتأخرة من جلسة سابقة، وتوقف الطلبات عند تغير الجلسة، وتفصل إلغاء المستخدم عن أخطاء الخادم. تسلسل كتابة Keychain يمنع عودة جلسة من طلب دخول سبق تسجيل الخروج. استجابة user:null تمحو الجلسة المحلية القديمة. لم تُغيّر صلاحيات الخادم بناءً على ترويسات العميل.

تظهر موافقة قبل إرسال الأسئلة/الملفات لمعالجة Google Gemini، منفصلة عن قبول شروط الحساب. تُلغى الموافقة المحلية عند تغيير الحساب، ولا تُرسل البيانات إذا رفض المستخدم. دليل التطبيق لا يعيد عرض تعليمات دفع الموقع؛ أفعال المساعد والروابط تظل مقيدة بمسارات التطبيق المسموحة.

قائمة المواد أصبحت افتراضية العرض بدل تركيب كل البطاقات دفعة واحدة، والبحث مؤجل لتحسين الاستجابة للكتابة. الاستعلامات لا تتكرر على أخطاء الصلاحيات والإلغاء، وتقل تحديثات الخلفية. هذه تغييرات قابلة للقياس وليست إثبات سرعة على جميع الأجهزة أو تحت حمل غير مختبر.

أضيف الإبلاغ عن الإجابات والاختبارات والنتائج من داخل التطبيق، بما في ذلك إجابات المساعد للزائر. البلاغ لا يرسل ملفات أو سجل محادثة كاملًا، ويظهر لفريق الدعم بوسم `ai-content-review` بعد فحص الحدود ومعدل الطلبات. يجب متابعة البلاغات ومعالجة أسبابها فعليًا، ولا تعتبر تذكرة محفوظة وحدها معالجة مكتملة. تعرض صفحة الهدايا في نسخة الهاتف حالة الاستحقاقات فقط، دون مشاركة روابط ترويجية أو قسائم دفع.

## أدلة التحقق المحلية
- اختبارات التطبيق: 141 نجاحًا، صفر فشل أو تخطٍّ في الجولة المسجلة.
- TypeScript وlint للتطبيق ناجحان، وصدرت حزم Android وiOS وWeb.
- بناء الويب ناجح، والاختبارات المستهدفة لصفحة حذف الحساب وملفات ربط التطبيقات ناجحة.
- تعتمد نتيجة البناء الأصلي والمحاكيات على أحدث تشغيل ناجح لسير Native application acceptance. لا تعتبر إعداد ملف سير العمل وحده نجاحًا للبناء أو الاختبار.
- لا توجد شهادة توزيع/مفتاح Play خاص داخل المستودع أو الملفات المرفوعة. أدوات CI لا تحتاج حساب طالب حقيقي ولا تنشئ دفعات أو تغيّر حسابات.

## ما يجب إكماله من حسابات المالك قبل الإرسال
1. ربط EAS بحساب المطور الصحيح ومراجعة ملكية bundle/package `sa.merasalelm.app`، ثم إنشاء شهادات Apple وProvisioning/مفتاح رفع Android من خدمة Credentials. حزمة CI التجريبية أو Simulator ليست ملف متجر موقعًا.
2. Android: رفع ملف إعداد Firebase المطابق للحزمة كمتغير ملف `GOOGLE_SERVICES_JSON` في EAS، ومفتاح FCM V1 في EAS Credentials. لا ترفع ملف service-account إلى GitHub. بناء Android الإنتاجي في EAS يتوقف عند غياب ملف إعداد Firebase بدل إصدار نسخة تدعي دعم Push دون إعداد.
3. iOS: تفعيل Push وإعداد مفتاح APNs بواسطة حساب Apple/EAS، ثم التحقق من وصول إشعار على جهاز فعلي. عدم منح الإشعارات لا يمنع استخدام التطبيق.
4. الروابط الموثقة: ضبط `APPLE_TEAM_ID` الصحيح و`ANDROID_APP_SIGNING_SHA256` في خادم الموقع. استخدم بصمة **App Signing** من Play، لا بصمة مفتاح الرفع. المساران `/.well-known/apple-app-site-association` و`/.well-known/assetlinks.json` يرفضان الإعداد الناقص؛ لا توجد بصمات أو معرفات مخترعة.
5. إعداد حساب/حسابات مراجعة حقيقية مع محتوى تجريبي متاح، وتوفير طريقة إكمال OTP/MFA للمراجعين دون تعطيل المصادقة أو إضافة تجاوز. يمكنهم تصفح المحتوى العام دون حساب. لا تضع بيانات دخول في مستودع عام أو ملاحظات PR عامة.
6. إدخال هوية المنشأة وبيانات المطور والدعم والتصنيف العمري والجمهور المستهدف والبلدان وحقوق المحتوى وبيانات الخصوصية من الواقع. يلزم إكمال أي تحقق/اختبار مغلق يطلبه حساب Play نفسه.
7. تجهيز لقطات حديثة من النسخة النهائية للأجهزة والأحجام المطلوبة. لا تستخدم صور ويب باعتبارها لقطات تطبيق. اختبر العربية/الإنجليزية، الأحجام الصغيرة وiPad، تكبير الخط، انقطاع الشبكة، الفيديو، PDF، الدخول وحذف الحساب وPush على أجهزة فعلية.

## أوامر التسليم بعد اكتمال الحسابات
```sh
cd mobile
npm ci
npm run typecheck
npm run lint
npm test
npx expo install --check
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
# افحص البنيتين الموقعتين في Play internal testing / TestFlight قبل الإرسال.
npx eas-cli@latest submit --platform android --profile production
npx eas-cli@latest submit --platform ios --profile production
```
ملاحظة: autoIncrement يستخدم مصدر النسخ البعيدة في EAS. لا تُرسل إصدارًا برقم أقل أو مكرر. App Store Connect ID وبيانات خدمة Play تُضبط في الحسابات ولا تُخمن.

## روابط موارد المتجر
- الخصوصية: https://marasalelm.com/privacy
- الشروط: https://marasalelm.com/terms
- الدعم: https://marasalelm.com/contact
- حذف الحساب من خارج التطبيق: https://marasalelm.com/account-deletion

## إرشادات المراجعة (يُستكمل بحساب تجريبي خاص)
Meras Al Elm is an educational companion for organized university learning. Users can browse public course previews and sign in to access previously enabled learning content and tools. The iOS and Android applications do not sell subscriptions or contain checkout or external-purchase calls to action. No purchase behavior is remotely enabled after review. Account deletion is available under Account > Security & Privacy, and through the public account-deletion website page. Optional AI processing asks for permission before sending selected questions or source files to Google Gemini. Students, instructors and authorized supervisors have distinct server-enforced access; please use the provided review accounts for each role being reviewed.

## مصادر المتطلبات — تُراجع مجددًا يوم الإرسال
- Apple Review: https://developer.apple.com/app-store/review/guidelines/
- Reader eligibility: https://developer.apple.com/support/reader-apps/
- SDK requirements: https://developer.apple.com/news/upcoming-requirements/
- Google Payments: https://support.google.com/googleplay/android-developer/answer/9858738
- Target API: https://support.google.com/googleplay/android-developer/answer/11926878
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Native page sizes: https://developer.android.com/guide/practices/page-sizes

لا تعني الاختبارات ضمان خلو مطلق من الثغرات، ولا قبولًا مؤكدًا من أول مراجعة. نجاح النشر على Railway ليس نشرًا لتطبيق جديد في المتاجر؛ الملفات الثنائية المثبتة تتطلب تحديثًا منفصلًا.
