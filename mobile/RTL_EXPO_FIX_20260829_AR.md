# إصلاح RTL/LTR و Expo Doctor — 2026-08-29

## الاتجاه واللغة
- العربية تُفرض RTL من جذر التطبيق وتمتد إلى SafeAreaView وScrollView وKeyboardAvoidingView والنوافذ المنبثقة.
- الإنجليزية LTR تلقائيًا عند اختيارها من إعدادات المظهر.
- النصوص كلها تمر عبر ScaledText: العربية يمين/RTL والإنجليزية يسار/LTR، مع الحفاظ على النصوص المركزية.
- الحقول تمر عبر ScaledTextInput: الحقول الطبيعية تتبع لغة الواجهة، بينما البريد والجوال وكلمة المرور والروابط تبقى LTR لمحتواها التقني فقط.
- تسجيل الدخول وإنشاء الحساب والهيدر والقوائم والـTabs والـPickers والمشغل والدعم أصبحت direction-aware.
- عناوين الـTabs تُترجم أيضًا، لأنها لا تمر عبر ScaledText تلقائيًا.
- النوافذ الأصلية Alert المهمة في الدعم والإدارة تتبع اللغة المختارة.

## expo doctor
تمت إضافة الاعتماد المباشر المطلوب لـ expo-audio:

`expo-asset: ~57.0.15`

وتم تحديث package-lock.json لنسخة 57.0.15 المتوافقة مع Expo SDK 57.

بعد فك الضغط على جهازك:

```powershell
npm ci
npx expo-doctor
```

ثم للبناء:

```powershell
npx eas-cli@latest build --platform android --profile preview
```
