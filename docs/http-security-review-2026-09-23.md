# مراجعة حماية HTTP والمتصفح — 23 سبتمبر 2026

وصف بند التدقيق بأنه «غير مصنّف» لا يثبت وجود ثغرة أو نجاح الفحص؛ يلزم التحقق من الاستجابة الفعلية وسياق الفحص. هذه المراجعة تخص البنود الأربعة المطلوبة، ولا تعد نتيجة تدقيق شامل لكل بنود إتاحة الوصول في المرفق.

| البند | النتيجة والتعديل |
| --- | --- |
| HTTP → HTTPS | أضيف تحويل 308 في الإنتاج للمضيفين العامين المحددين صراحة في `APP_URL` و`NEXT_PUBLIC_SITE_URL` إذا أكد البروكسي الموثوق أن الاتصال HTTP. الوجهة من الإعدادات فقط؛ لا تؤخذ من `Host` أو `X-Forwarded-Host`. يحتفظ التحويل بالمسار والاستعلام، و308 يحفظ طريقة الطلب وجسم POST. |
| COOP | القيمة القائمة `same-origin` صحيحة وتبقى للإنتاج. دخول Google/Apple في الويب يستعمل انتقالًا في النافذة نفسها، والدفع انتقال إلى Tap؛ لا يوجد اعتماد على `window.opener` يستلزم تخفيف السياسة. استثناء QA المعزول يبقى مقيدًا بأعلام CI/GitHub Actions وغياب Railway. |
| منع clickjacking | `X-Frame-Options: SAMEORIGIN` موجود لجميع المسارات، ويتوافق مع `frame-ancestors 'self'` الذي تحفظه سياسة CSP. يسمح بتضمين نفس الأصل ويمنع المواقع الأخرى؛ لا يتعارض مع فتح صفحة Tap أو تضمين إطار Tap في المنصة. |
| HSTS / غياب preload | ليست إضافة `preload` إصلاحًا تلقائيًا. حُفظت السياسة القائمة `max-age=31536000; includeSubDomains` للاستجابات التي يؤكد البروكسي أنها HTTPS في الإنتاج، وأزيلت عن HTTP والتطوير وQA المحلي. لم نفعّل preload أو نرسل طلب تسجيل النطاق في قائمته. |

## شروط النشر

- اضبط `APP_URL` و`NEXT_PUBLIC_SITE_URL` على أصول HTTPS المملوكة للمنصة، دون مسار أو استعلام أو بيانات اعتماد. لا يُقبل localhost أو IP أو اسم داخلي لهذه التحويلات. لا نفترض مضيفًا إضافيًا مثل `www`؛ أضفه إلى إعداد المنصة المناسب فقط إذا كان مستخدمًا وله شهادة صحيحة.
- تُقرأ هذه القواعد عند إعداد وبناء Next؛ تغيير متغيرات الأصل يستلزم إعادة البناء والنشر.
- يجب أن يحوّل البروكسي الموثوق HTTP إلى HTTPS عند الحافة، وأن ينهي TLS ويستبدل `X-Forwarded-Proto` بقيمة `https` أو `http` الصحيحة. قاعدة التطبيق دفاع إضافي عند وجود `http` الصريحة؛ غياب الترويسة لا يُفسَّر بأنه HTTP لتجنب تحويل HTTPS إلى نفسه في حلقة. امنع الوصول العام المباشر إلى منفذ Node خلفه. ثقة التطبيق في ترويسة يترك البروكسي للمستخدم تزويرها ليست بديلًا عن ضبط الحافة.
- توثّق Railway شهادات SSL التلقائية، لكن ذلك وحده لا يثبت إعداد النطاق المنشور أو سلوك التحويل عليه. يلزم فحص HTTP وHTTPS على النطاق الفعلي بعد النشر، وبالأخص callbacks المسجلة لـ OAuth وTap.
- `includeSubDomains` سياسة كانت موجودة قبل هذه التغييرات. يجب تدقيق HTTPS لكل النطاقات الفرعية قبل توسيعها أو التفكير في preload. موقع قائمة HSTS نفسه يوصي بعدم تفعيل preload افتراضيًا، ويشرح أن التراجع عنه قد يستغرق أشهرًا.

## دليل الاختبار

- `node --test tests/transport-security.test.mjs`: **8/8 ناجحة** عبر أداة Next الفعلية `unstable_getResponseFromNextConfig`، التي تستعمل قواعد المطابقة وبناء الوجهة واختيار رمز التحويل في الإطار. شملت المضيف المزور، اختلاف نقاط اسم النطاق، الاستعلامات الخاصة بالدفع/OAuth، عدم دوران HTTPS أو غياب ترويسة البروكسي، رفض الأصول غير الصالحة، المعاينة، وعدم قدرة أعلام QA على تعطيل الحماية في Railway.
- استجابتان HTTP فعليتان من `127.0.0.1:3100/brand/mark-light.png` بوسم البروكسي `http` ثم `https`: كلتاهما 200، بلا تحويل وبلا HSTS في التطوير، مع `X-Frame-Options: SAMEORIGIN` و`COOP: same-origin`. الدليل المحلي `.data/transport-security-local-http.json`.
- أثبت طلب فعلي إلى النسخة الإنتاجية المحلية أن Host `maras-qa.example` مع `X-Forwarded-Proto: http` يعيد 308 إلى `https://maras-qa.example/login?from=a`، وأن ترويسة `https` تعيد HSTS. التفاصيل الشاملة في [تقرير تدقيق الويب](web-audit-security-2026-09-23.md).
- هذه الاختبارات لا تثبت DNS أو شهادات النطاق المنشور؛ يلزم إعادة فحص النطاق الفعلي بعد النشر.

## المصادر الرسمية

- [Next.js: التحويلات والمحافظة على طريقة الطلب والاستعلام](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects).
- [MDN: HSTS، إرساله عبر HTTPS وحده وحدود النطاقات الفرعية](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security).
- [HSTS Preload: التوصيات الحالية وشروط الاختيار والتراجع](https://hstspreload.org/).
- [MDN: COOP وتكاملات OAuth والدفع التي تعتمد على النوافذ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy).
- [MDN: X-Frame-Options وSAMEORIGIN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Frame-Options).
- [Railway: الشبكات العامة وشهادات SSL](https://docs.railway.com/networking/public-networking).
