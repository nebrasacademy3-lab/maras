# إصلاح اتصال تطبيق Android بخدمة مراس

## السبب الذي تم إصلاحه
كان التطبيق يرسل `x-meras-device-label` وفيه رمز `·` وقد يحتوي اسم الجهاز على العربية/Emoji. Android OkHttp يرفض قيم HTTP Header غير ASCII قبل إرسال الطلب، فتظهر رسالة Network request failed رغم أن Railway يعمل.

## الإصلاح
- ترميز اسم الجهاز بـ percent-encoding قبل وضعه في Header.
- فك الترميز في الباك إند قبل حفظ اسم الجهاز.
- عدم تطبيق فحص same-origin الخاص بالمتصفح على Android/iOS Native، مع الإبقاء عليه لـ Expo Web.
- تحسين رسالة الخطأ لتُظهر HTTP status أو رسالة Network الحقيقية.
- رفع نسخة التطبيق إلى 1.0.1 وتفعيل autoIncrement في preview حتى لا يبقى APK قديم مثبتًا بالخطأ.

## بعد رفع Railway
ابنِ APK جديدًا من `mobile` بملف preview، ويفضل `--clear-cache`.
