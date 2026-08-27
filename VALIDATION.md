# تقرير التحقق

تم التحقق من الخادم بعد التحويل إلى Node.js وPostgreSQL عبر إعادة تثبيت نظيفة وتشغيل:

```text
backend: npm run lint — passed
backend: npm test — passed
backend: next build — passed
backend: production smoke test — passed
```

اختبار smoke شغّل خادم Next الإنتاجي وتحقق من صفحة `/login` ومسار `/api/health` عند غياب قاعدة البيانات. في الحالة الحقيقية على Railway يجب أن يعيد `/api/health` حالة `database: ready` بعد إضافة `DATABASE_URL` وتشغيل الهجرة.

تم التحقق من التطبيق بعد إعادة تثبيت نظيفة وتشغيل:

```text
mobile: npm run doctor — 21/21 checks passed
mobile: npm run typecheck — passed
mobile: npm run lint — passed
mobile: npx expo export --platform web — passed
```

لم يتم تشغيل Docker داخل بيئة الفحص الحالية لعدم توفر Docker daemon. ملف `backend/Dockerfile` و`backend/railway.json` جاهزان لبناء Railway. لم يتم اختبار Tap أو Resend أو Gemini أو حساب الإدارة ببيانات حقيقية لأنها أسرار تخص مالك الخدمة ويجب إدخالها في Railway Variables.
