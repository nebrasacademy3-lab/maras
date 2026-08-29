# مراس العلم — نسخة Railway بعد إصلاح الإشعارات والدعم

هذا المجلد هو خدمة الويب + API + الإدارة + PostgreSQL migrations، وهو المجلد المطلوب رفعه/ربطه بخدمة Railway.

## إعداد Railway

1. استخدم `Dockerfile` الموجود في جذر هذا المجلد.
2. اربط PostgreSQL بالخدمة.
3. أضف Railway Volume إلى خدمة مراس واجعل Mount Path:

```text
/data
```

4. لأن الصورة تعمل افتراضيًا كمستخدم غير root بينما Railway Volumes تُركب كـroot، أضف:

```text
RAILWAY_RUN_UID=0
```

5. الصق المتغيرات من `RAILWAY_VARIABLES.example` في Variables بعد استبدال قيم الأسرار بالقيم الحالية في مشروعك أو بقيم عشوائية قوية جديدة.
6. اجعل `RUN_DB_MIGRATIONS=true`. عند بدء الخدمة سيطبق migrations غير المطبقة تلقائيًا، ومنها `0013_support_chat_thread.sql` و`0014_device_limits_ads_requests.sql`.
7. لا تحذف الـVolume الحالي إن كان يحتوي فيديوهات/مرفقات إنتاجية.

## ما تغير في قاعدة البيانات

Migration `0013_support_chat_thread` تضيف:

- `reply_to_id` لرسائل الدعم للرد على رسالة بعينها.
- Foreign key آمن مع `ON DELETE SET NULL`.
- index للردود.
- مزامنة realtime لتغيّر حالة قراءة الإشعارات حتى تختفي الأعداد من الهيدر مباشرة.

## ما تم إصلاحه في الخادم/الويب

- Mark one / Mark all للإشعارات مع حفظ القراءة في PostgreSQL.
- مزامنة عداد الإشعارات في الويب بدون Refresh.
- دعم Push devices وإرسال Expo Push.
- إعادة بناء دعم الطالب والإدارة؛ كل إرسال أصبح رسالة واحدة تضم النص والمرفقات بدل فصل الملف عن الرسالة.
- ترتيب الرسائل من الأقدم للأحدث.
- Reply-to-message.
- صور inline، صوت، ملفات، تنزيل منفرد وتحميل الكل.
- تحققات نوع/حجم/توقيع الملفات وصلاحيات الوصول للمرفقات.
- بقاء حذف التذاكر/المرفقات محميًا لصلاحيات الإدارة.

## تحقق تم على هذه النسخة

- 38/38 من اختبارات العقود التي لا تحتاج خادم Production نجحت.
- `scripts/start-railway.sh` اجتاز فحص bash syntax.
- `railway.json` وDrizzle journal صالحان JSON.
- اختبار Smoke الإنتاجي لم يُشغل في بيئة التجهيز لأن `node_modules` و`.next` غير موجودين فيها؛ Railway سيشغل `npm ci` ثم `npm run build` داخل Docker أثناء النشر.


## إصلاح الفيديو الأخير

راجع `VIDEO_FIXES_20260829_AR.md` لتفاصيل إصلاح القص، Signed Stream، Range Requests، وتشغيل التطبيق.
