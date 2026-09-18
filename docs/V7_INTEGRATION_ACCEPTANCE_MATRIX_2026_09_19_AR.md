# مصفوفة قبول تكامل v7 — 19 سبتمبر 2026

## المرجع والنطاق

- فرع التكامل: `integration/v7-on-main-20260919`.
- نقطة البداية: `main` عند `969741822168f7b04604612f573825a0487de566`.
- مصدر v7: PR #3 / `implement/plan-v7-20260916` عند `3fcabe1e6d36ee2b597355b7725f3c8efc18fbe2`.
- تحقق النقل: من أصل 200 ملف غيّرها PR #3، هناك 194 ملفًا مطابقًا حرفيًا بعد النقل. الملفات الستة المختلفة موثقة لأنها مدمجة مع تحسينات أحدث: `.github/workflows/quality.yml`, `.github/workflows/mobile-release-validation.yml`, `app/llms.txt/route.ts`, `components/staff-manager.module.css`, `scripts/qa-platform-browser.mjs`, `scripts/qa-study-ci.mjs`.
- قائمة الحالات المرقمة الأصلية ذات **192 حالة** غير موجودة كملف أو Issue في المستودع الحالي. لذلك هذه المصفوفة تغطي كل متطلبات v7 القابلة للاسترداد من كود PR #3 وتقاريره واختباراته. لا تُخترع أرقام حالات غير موجودة.

## الحالات

| المجال | المتطلب القابل للتحقق | الحالة الحالية | التنفيذ/القرار | دليل الاختبار أو سبب الحالة |
|---|---|---|---|---|
| نطاقات المشرفين | المشرف بلا نطاق لا يرى جميع البيانات ضمنيًا | منجز | نُقلت سياسات `supervisor-data-scope` و`supervisor-scope` | `scripts/qa-supervisor-data-scope.ts`, `tests/supervisor-data-scope.test.mjs` |
| نطاقات المشرفين | `data.all` منحة مستقلة ولا تمنح الأفعال وحدها | منجز | نُقلت عقود الصلاحيات للويب والموبايل | `tests/supervisor-scope-contract.test.mjs` |
| نطاقات المشرفين | ترشيح SQL قبل pagination/count للطلاب والطلبات والدعم | منجز | نُقلت سياسات ومسارات PR #3 حرفيًا | تكامل النطاقات يزرع سجلات خارج النطاق ويقارن الأعداد |
| نطاقات المشرفين | الطلب المختلط لا يظهر لصاحب نطاق جزئي | منجز | نُقلت سياسة السجل المختلط | `qa-supervisor-data-scope.ts` |
| نطاقات المشرفين | تعديل السجل يفحص المعرّف الحالي والوجهة الجديدة | منجز | نُقلت حماية course/student/resource mutations | محاولات التعديل خارج النطاق ضمن تكامل النطاقات |
| نطاقات المشرفين | المواد المشتركة على الجامعة لا تُكشف لنطاق تخصص واحد | منجز | نُقلت قواعد `supervisor-data-scope` | تكامل PostgreSQL للنطاقات |
| نطاقات المشرفين | إسناد الطلب المتزامن لا يستبدل المسؤول بصمت | منجز | قفل معاملة عند الإسناد | اختبار concurrency في `qa-supervisor-data-scope.ts` |
| نطاقات المشرفين | تغيير نطاق المشرف يحتاج MFA ويبطل جلساته المتأثرة | منجز | نُقل منطق الإدارة والتدقيق | تكامل النطاقات + Browser QA |
| نطاقات المشرفين | المراكز العامة غير القابلة للتقسيم تتطلب `data.all` | منجز | نُقلت سياسات console/finance/AI/operations | اختبارات العقود والتنقل |
| واجهة الإدارة | تنقل موحد بثماني مجموعات دون sidebar قديم | منجز | `AdminShell` يحل محل `AdminCenterNav` | Browser QA المدمج يفحص desktop/mobile والبحث |
| واجهة الإدارة | المداخل غير المسموحة مخفية في الويب والتطبيق | منجز | عقود navigation مشتركة | `qa-admin-navigation-security.ts`, mobile tests |
| خصوصية الدعم | الملاحظة الداخلية لا تظهر في إشعار الطالب | منجز | نُقلت معالجة console والدعم | تكامل النطاقات واختبارات الخدمات |
| الملفات | ملفات الطلبات والدعم تُرفض قبل قراءة التخزين خارج النطاق | منجز | نُقلت مسارات download/support | `tests/direct-upload-authorization.test.mjs` + تكامل النطاقات |
| الملفات | توقيع الرفع المباشر محكوم بالنطاق | منجز | نُقلت مسارات direct upload/resources/covers | اختبارات التفويض |
| ownership | إضافة `orders.user_id` ثابت ومنع إعادة الإسناد/الحذف الصلب | منجز | migration 0036 + schema | `qa-order-ownership-migration.mjs` |
| ownership | backfill محافظ ولا يخمن الملكية عند الغموض | منجز | `order_ownership_reviews` للحالات غير المثبتة | migration acceptance |
| ownership | checkout يعيد التحقق من الجلسة داخل القفل قبل إنشاء الطلب | منجز | نُقل route checkout | `qa-order-ownership.ts` |
| ownership | قراءة الطلبات والفواتير تعتمد userId لا البريد التاريخي | منجز | نُقلت ownership helpers/routes | `tests/order-ownership-behavior.test.mjs` |
| ownership | الدفع المتأخر والاسترداد لا يعيدان تفعيل ملكية خاطئة | منجز | locking وتحقق الحالة | `qa-order-ownership.ts` |
| ownership | الكوبون والإحالة يتبعان المعرّف الثابت | منجز | نُقلت coupons/referrals | تكامل ownership |
| ownership | UI المالية يمنع التفعيل عندما الملكية غير مثبتة ويُبقي الاسترداد | منجز | `finance-center` + Browser QA المدمج | screenshot وفحص dialog |
| الإشعارات | `target_user_id` يمنع سقوط الرسالة الخاصة إلى بث عام | منجز | migration 0036 + visibility helper | `tests/order-ownership-behavior.test.mjs` |
| الإشعارات | المرسل المجدول يستخدم المستلم المحفوظ ولا يعيد حل البريد | منجز | notifications/push ported | تكامل ownership |
| الهوية | تغيير البريد transactional ويمنع سباق الإلغاء/الإرسال | منجز | migration 0035 + `email-change.ts` | `qa-email-change.mjs` |
| الهوية | تغيير البريد يبطل الجلسات/reset/MFA/OAuth challenges ويحافظ على device trust | منجز | نُقلت آلية الإبطال | تكامل البريد |
| الهوية | بيانات الشراء التاريخية لا يعاد كتابتها عند تغيير البريد | منجز | invoice snapshot/ownership | اختبارات invoice/email |
| الهوية | تغيير البريد يبقى مغلقًا افتراضيًا لحين اكتمال بقية الملكيات | منجز | `EMAIL_CHANGE_ENABLED=false` في إعدادات v7 | قرار أمان موثق في تقارير v7 |
| الأجهزة | سياسة عودة الجهاز واعتماد التسجيل متطابقة ويب/موبايل | منجز | migration 0033 + device policy مشتركة | `qa-device-return.ts`, mobile device tests |
| الفيديو | رمز الفيديو يرفض الصيغة والحقول غير الصالحة | منجز | `video-token.ts` ported | video lifecycle tests |
| الفيديو | HEAD يغلق stream غير المستخدم | منجز | video routes ported | `tests/video-stream-lifecycle.test.mjs` |
| الفيديو | إعدادات السرعة/الجودة قابلة للوصول | منجز | player CSS/TSX ported | accessibility test |
| الفيديو | معالجة MP4 اصطناعي إلى HLS وتشغيله مع range/access revocation | منجز | `qa-protected-video.ts` مدمج في CI | Chromium synthetic playback، لا يدّعي أجهزة فعلية |
| Gemini | منع انكماش pool المجاني وإحياء مفتاح موقوف برد متأخر | منجز | `gemini.ts` وpool tests ported | `tests/gemini-pool-safety.test.mjs` |
| Gemini | ميزانية الاحتياط المدفوع وحجزها قبل الإرسال | منجز | migration 0034 + `ai-paid-budget.ts` | AI fallback/provider tests |
| Gemini | سجل مشاريع وفوترة وحصص ذرية مشتركة بين كل الخوادم | ناقص | PR #3 نفسه يصرح بعدم اكتماله | يحتاج مرحلة لاحقة؛ لا يُفعّل paid fallback اعتمادًا على هذه الدفعة |
| الملفات الكبيرة | resumable upload + عزل المعالجة + ST/LF + تعافي المستند الكبير | ناقص | ليست مكتملة في PR #3 | موثق كـgate مفتوحة في V7_AUDIT |
| التكافؤ العلمي | PDF/النطق/الدروس والتكافؤ الكامل ويب/تطبيق | ناقص | ليست مثبتة بهذه الدفعة | تحتاج قبول ST/LF مستقل |
| الأجهزة الفعلية | Android/iPhone فعلي + APK/AAB/IPA موقع | ناقص | Workflow يختبر prebuild/export فقط | لا يُدّعى اختبار جهاز أو متجر |
| التكاملات الحية | Store purchases/Push/OTP/Resend/Tap/Gemini الحية | ناقص | الاختبارات الحالية synthetic/sandboxed | تحتاج staging/credentials مخصصة |
| السعة والأمان | ألف مستخدم متزامن + اختبار اختراق مستقل | ناقص | لا يوجد دليل في PR #3 | يحتاج مرحلة مستقلة |
| الإنتاج | backup/restore/migration/rollback موثق ومجرب | ناقص | لم يكن ضمن PR #3 | يلزم قبل اعتماد ترحيلات v7 للإنتاج |
| ملكية البيانات | تحويل جميع السجلات القديمة إلى userId | ناقص | orders/notifications منجزة فقط؛ بقية access/progress/support/notes/favorites/cart/waitlist ما زالت بريدية في بعض المسارات | موثق في V7_ORDER_OWNERSHIP |
| SEO/هوية | هوية مراس داخل `llms.txt` دون توسيع سطح التسريب | منجز | أُعيدت حقائق الهوية عبر `renderPublicDiscovery` المحدود والمنظف من #6، لا عبر قالب v7 القديم | `tests/seo-discovery.test.mjs` + اختبارات الهوية العامة |
| إدارة قديمة | `AdminCenterNav` القديم | لم يعد مطلوبًا | أزيل لصالح `AdminShell` الموحد | Browser QA يفحص غياب sidebar القديم |

## نتيجة التحقق النهائية

على الالتزام `cb5f559d2432d99352fe643c8739655e95d6fb26` نجحت البوابات التالية على فرع التكامل:

- Quality gates: **SUCCESS** — run `35401139762`. يشمل lint/build/contracts، PostgreSQL المعزول، تقارير scopes/devices/email/ownership، معالجة وتشغيل protected video، وChromium/Firefox/WebKit.
- Dependency security: **SUCCESS** — run `35401139769`.
- Production public checks: **SUCCESS** — run `35401139763`.
- Mobile release validation: **SUCCESS** — run `35401139767` لـAndroid وiOS prebuild/export.
- Mobile typecheck/lint/tests داخل Quality: **SUCCESS**.
- توصية Expo المتغيرة لآخر patch تظهر كتحذير فقط؛ `npm ci` من lockfile، typecheck، native prebuild وrelease export تبقى بوابات مانعة.

كل بند موسوم **منجز** في الجدول أعلاه مرتبط بتنفيذ واختبار مرّ في هذه الدورة. البنود الموسومة **ناقص** لم تُرفع حالتها ولم تُعتبر منجزة.

## تعريف نجاح تكامل PR #3

1. نجاح Quality gates على فرع التكامل: lint، build، اختبارات الويب، PostgreSQL، Chromium/Firefox/WebKit.
2. نجاح Mobile typecheck/lint/tests وMobile release validation لـAndroid/iOS export/prebuild.
3. نجاح Dependency security وProduction public checks بدون تخفيف حماية #6.
4. نجاح تقارير v7 المتخصصة: scopes، devices، email change، ownership migration/runtime، protected video.
5. لا يُنقل إلى `main` أي بند موسوم **ناقص** بوصفه مكتملًا؛ يبقى في خطة المراحل التالية.
