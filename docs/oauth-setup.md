# تسجيل الدخول بجوجل وأبل

التنفيذ مشترك بين الويب والتطبيق. تظهر أزرار المزوّد تلقائيًا عندما تكتمل إعداداته على الخادم. لا تحتاج مفاتيح سرية داخل التطبيق، ولا تضع هذه المفاتيح في متغيرات NEXT_PUBLIC أو EXPO_PUBLIC.

## متطلبات النشر

1. شغّل مهاجرة `0027_oauth_email_verification` قبل تشغيل النسخة الجديدة.
2. اضبط `APP_URL` على العنوان العام الصحيح بـ HTTPS، مثل `https://marase.up.railway.app`.
3. اضبط Resend و`EMAIL_FROM` على نطاق إرسال موثّق. يحتاج الحساب الجديد رمز تأكيد بريد مراس مرة واحدة، حتى عندما يكون البريد موثّقًا عند Google أو Apple. لا يُطلب الرمز مجددًا عند الدخول أو الشراء بعد نجاحه.
4. يحتاج التطبيق نسخة جديدة تتضمن مسار `merasalelm://oauth/callback`. Expo Go ليس بديلًا عن اختبار نسخة development/production ذات المخطط المخصص.

## Google

أنشئ OAuth client من نوع Web application في Google Cloud، وأكمل شاشة الموافقة والعلامة التجارية والمستخدمين التجريبيين/حالة النشر.

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

أضف Authorized redirect URI المطابق حرفيًا:

```text
https://marase.up.railway.app/api/auth/oauth/google/callback
```

لا تُستخدم مفاتيح Android/iOS بدل Web client في هذا التدفق؛ التطبيق يفتح متصفح النظام ويستكمل الدخول عبر الخادم. غيّر العنوان السابق إذا كان لديك نطاق مخصص.

## Apple

يلزم حساب Apple Developer وتفعيل Sign in with Apple للتطبيق الأساسي، ثم Services ID مرتبط به ومفتاح Sign in with Apple من نوع .p8.

```env
APPLE_CLIENT_ID=Services-ID
APPLE_TEAM_ID=Team-ID
APPLE_KEY_ID=Key-ID
APPLE_PRIVATE_KEY=
OAUTH_MOBILE_REDIRECT_URI=merasalelm://oauth/callback
```

ضع محتوى .p8 كاملًا في `APPLE_PRIVATE_KEY`. يقبل الحقل الأسطر الحقيقية أو `\n` بين الأسطر. لا تُدخل سر JWT جاهزًا قصير العمر: يوقّع الخادم سرًا جديدًا مدته خمس دقائق عند التبادل.

في إعداد Services ID أضف النطاق العام وReturn URL:

```text
https://marase.up.railway.app/api/auth/oauth/apple/callback
```

تحتاج Apple عنوان HTTPS حقيقيًا؛ أزرارها لا تُفعّل على HTTP المحلي. اسم المستخدم قد لا يعود في تسجيلات Apple اللاحقة؛ نعتمد البريد والهوية الموقّعة ثم يكتب الطالب اسمه الكامل في إكمال الملف.

لتعمل رسائل التحقق للمستخدم الذي يختار «إخفاء بريدي»، سجّل نطاق/عنوان إرسال Resend ضمن Email communication sources في Apple Private Email Relay واضبط SPF/DKIM حسب مزود البريد. دون ذلك قد ترفض Apple توصيل رمز التحقق لبريدها الوسيط.

## الحماية والسلوك

- التحقق من التوقيع باستخدام مفاتيح JWKS الرسمية وتحديد الخوارزمية RS256، والجهة المصدرة والجمهور والصلاحية وnonce. تبادل Google يستخدم PKCE.
- state أحادي الاستخدام، مرتبط بملف HttpOnly في المتصفح. رد Apple POST يتطلب ملف SameSite=None; Secure. لا تُستثنى عملية التحقق هذه عند العودة من التطبيق.
- يستخدم التطبيق تحدي SHA-256 لمحقّق عشوائي. رمز العودة إلى التطبيق عشوائي، أحادي الاستخدام، صالح 60 ثانية ومقيّد بالمحقّق؛ لا تتضمن روابط العودة رمز جلسة أو مزوّد.
- عند تطابق البريد مع حساب سابق غير مربوط بنفس هوية المزوّد، لا يحدث ربط تلقائي. تظهر رسالة لاستخدام طريقة الدخول الأصلية أو استعادة كلمة المرور.
- يتم حفظ الربط حسب المزوّد + معرفه الثابت، ولا يتغيّر بريد الحساب أو توثيقه لمجرد دخول لاحق.
- المستخدم الجديد طالب فقط، ويكمل تأكيد البريد ثم ملفه الدراسي والموافقة على الشروط قبل الشراء. تتبع الإحالة محفوظ للتسجيل الاجتماعي الجديد.
- حدود الأجهزة وحالة الحساب والمصادقة الإضافية للإدارة تبقى مطبقة. أسرار Google/Apple والرموز لا تُسجّل ولا تُرسل للواجهة.

## فحص الإطلاق

الاختبارات المحلية تستخدم مفاتيح JWT مؤقتة ومزوّدًا وقاعدة بيانات معزولين. نجاحها لا يثبت صحة بيانات حساب Google/Apple الفعلية. قبل الإطلاق اختبر على staging بحساب جديد وآخر قديم: موافقة/إلغاء الدخول، إعادة تشغيل رابط قديم، تحقق البريد مرة واحدة، إكمال الملف والشراء، الحساب الموقوف وحد الأجهزة، Apple Private Relay، ونسختي Android/iOS الحقيقيتين. لا توجد حاجة لتعديل الكود عند إدخال مفاتيح النشر الصحيحة.

المراجع الرسمية: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)، [Apple: إعداد صفحة الدخول](https://developer.apple.com/documentation/signinwithapple/configuring-your-webpage-for-sign-in-with-apple)، [Apple: التحقق من المستخدم](https://developer.apple.com/documentation/signinwithapple/verifying-a-user).
