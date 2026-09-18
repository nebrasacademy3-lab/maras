# سجل التكامل النهائي — مراس

تاريخ التثبيت: 18 سبتمبر 2026  
مرجع البداية: `main` عند `f2348e363e71e40f84f4784d8d8c96893db0bd2a`.

## قاعدة التنفيذ
- لا دمج إلى `main` ولا نشر إنتاجي قبل نجاح جميع بوابات الالتزام الجاري.
- لا يُعاد تنفيذ إصلاح موجود أصلًا في فرع آخر؛ عند التداخل تكون الأولوية للنسخة الأحدث ذات الاختبارات الأوسع.
- أي نجاح تاريخي على فرع قديم لا يُعتبر اعتمادًا بعد التكامل؛ يعاد الاختبار على شجرة التكامل نفسها.

## جرد العمل المفتوح

| PR | المجال | موجود في main؟ | تغطية الاختبار الحالية | قرار التكامل |
|---|---|---|---|---|
| #3 `implement/plan-v7-20260916` | نطاقات المشرفين، خصوصية الدعم، الفيديو المحمي، الأجهزة، ملكية الطلبات، migrations 0033–0036، تغييرات ويب وموبايل واسعة | لا | Mobile release ناجح على الرأس الحالي، لكن Quality gates الحالية فاشلة؛ توجد اختبارات متخصصة كثيرة | لا يدمج الآن؛ يُراجع بعد إغلاق #6 ويستوعب على دفعات |
| #4 `audit/runtime-security-20260917` | supervised runtime، readiness bounded، Gemini-only public assistant، تقوية تشغيلية | لا؛ مبني فوق #3 | Quality + Dependency Security + Mobile release ناجحة على الرأس الحالي | يُستوعب بعد #3 لأنه يعتمد عليه |
| #5 `fix/ci-platform-browser-20260918` | ثبات Browser QA لمشرفي الإدارة/MFA | لا | Quality gates فاشلة على رأسه | مكرر وظيفيًا مع #6؛ لا يدمج منفردًا إذا نجح #6 |
| #6 `improve/security-seo-ai-discovery-20260918` | SEO/AI discovery، أمان الترويسات، CI gate، Dependency Security، Production readonly، إصلاحات Browser QA والجوال | لا | Dependency Security وProduction Public ناجحان؛ Quality gates تحتاج إغلاق مشكلة loopback CORP/RSC | الأولوية الحالية؛ لا يدمج حتى تصبح كل البوابات خضراء على SHA واحد |

## ملفات التداخل المعروفة

- #3 ↔ #4: `.env.example`, `.github/workflows/quality.yml`, `RAILWAY_VARIABLES.example`, `components/admin-shell.tsx`, `lib/gemini.ts`, `tests/gemini-pool-safety.test.mjs`.
- #3 ↔ #6: `app/llms.txt/route.ts`, `components/staff-manager.module.css`, `scripts/qa-platform-browser.mjs`, `scripts/qa-study-ci.mjs`.
- #4 ↔ #6: `.github/workflows/dependency-security.yml`.
- #5 ↔ #6: `scripts/qa-platform-browser.mjs`.

## سياسة منع التكرار

1. تغييرات Browser QA في #6 هي المصدر المعتمد بدل #5.
2. تغييرات Dependency Security في #6 تُقارن مع #4 عند استيعابه لاحقًا، ولا يعاد إنشاء workflow ثانٍ.
3. تغييرات `llms.txt` وواجهة المشرفين في #6 تُحفظ كأساس عند استيعاب #3.
4. تغييرات Gemini في #4 تبقى مرتبطة بسلسلة #3 ولا تنقل إلى main قبل إعادة الدمج والاختبار.
5. migrations الموجودة فقط في #3 لا تُطبق أو تُنشر ضمن #6.

## معيار إغلاق المرحلة 1
هذا السجل هو مرجع العمل المفتوح؛ لا توجد PRs أخرى مفتوحة خارج #3–#6 وقت إنشائه، ولا يوجد نشر إنتاجي جديد قبل إغلاق بوابات الجودة.
