# مراس العلم

منصة تعليم جامعي عربية تعمل بواجهة ويب وتطبيق Expo/React Native، وتشترك جميع القنوات في حسابات المستخدمين والكتالوج والصلاحيات والطلبات والدعم والإشعارات والتقدم الدراسي.

## البنية

| المجلد | المحتوى |
|---|---|
| `backend/` | تطبيق Next.js، واجهات API، المصادقة، PostgreSQL عبر Drizzle، الدفع، المساعد، الفيديو، ولوحات الطالب والمشرف والإدارة. |
| `mobile/` | تطبيق Expo/React Native لنظامي Android وiOS ونسخة الويب، مرتبط بواجهات `/api/mobile/*`. |

## تشغيل الخادم محليًا

يتطلب Node.js 22 أو أحدث وPostgreSQL 14 أو أحدث.

```bash
cd backend
npm ci
cp .env.example .env
# عدّل DATABASE_URL وبقية المتغيرات السرية
npm run db:migrate
npm run dev
```

يفتح الخادم عادة على `http://localhost:3000`. عند غياب قاعدة البيانات أثناء `npm run build` تستخدم الصفحات العامة بيانات العرض المضمنة، بينما تعيد واجهة `/api/health` حالة واضحة حتى تضبط `DATABASE_URL`.

## تشغيل التطبيق

```bash
cd mobile
npm ci
cp .env.example .env
npm start
```

اضبط `EXPO_PUBLIC_API_URL` على عنوان Railway النهائي، مثل `https://your-service.up.railway.app`. لا تضع أي مفتاح Tap أو Gemini أو سر جلسات داخل التطبيق.

## النشر على Railway

النشر المقصود هو مجلد `backend`؛ يحتوي على `Dockerfile` و`start-railway.sh`. أنشئ خدمة Railway من هذا المجلد، أضف خدمة PostgreSQL أو اربط قاعدة PostgreSQL الموجودة، ثم أضف متغيرات `.env.example` إلى Variables. يجب أن تكون `DATABASE_URL` هي قيمة اتصال PostgreSQL التي يوفرها Railway.

أضف Volume دائمًا واربطه بالمسار `/data` حتى تبقى الفيديوهات والمرفقات والشعارات محفوظة. يبدأ الخادم عبر `start-railway.sh`، يطبق `drizzle-kit migrate` تلقائيًا، ثم يشغل Next.js على `0.0.0.0:$PORT`. استخدم `/api/health` كمسار فحص الصحة.

## الخدمات الاختيارية

يعمل المساعد بقاعدة معرفة محلية عندما لا يوجد مفتاح مزود خارجي، ويمكن تفعيله سياقيًا عبر Gemini بوضع `ASSISTANT_PROVIDER=gemini` و`GEMINI_API_KEY`. الدفع يحتاج مفاتيح Tap الحقيقية، وإرسال استعادة كلمة المرور يحتاج Resend. جميع الأسرار تبقى في الخادم.

## التحقق قبل النشر

```bash
cd backend
npm run lint
npm run build
npm test

cd ../mobile
npm run typecheck
npx expo export --platform web --output-dir dist-web
```

لا ترفع ملفات `.env` أو مجلدات `node_modules` و`.next` و`dist-web` إلى المستودع. بعد أول نشر أنشئ حساب الإدارة باستخدام واجهة `POST /api/admin/staff` الموثقة داخل `backend/README.md`، ثم اختبر التسجيل والدخول وتفعيل المادة والرفع والدعم من بيئة Railway نفسها.
