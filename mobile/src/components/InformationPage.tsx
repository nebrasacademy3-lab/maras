import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { AppHeader } from "@/src/components/AppHeader";
import { ScaledText as Text } from "@/src/components/ScaledText";
import { AppButton, Card, Screen } from "@/src/components/ui";
import { useTheme } from "@/src/providers/ThemeProvider";

export type InformationKind = "terms" | "privacy" | "content-policy" | "refund-policy" | "how-it-works" | "accessibility";

type InformationSection = {
  title: string;
  body: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};

type InformationContent = {
  title: string;
  intro: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  sections: InformationSection[];
};

const INFORMATION_CONTENT: Readonly<Record<InformationKind, InformationContent>> = {
  terms: {
    title: "الشروط والأحكام",
    intro: "تنظم هذه الشروط استخدام منصة مراس العلم وشراء المحتوى التعليمي والوصول إليه.",
    icon: "document-text-outline",
    sections: [
      { title: "استخدام الحساب", body: "يلتزم المستخدم بتقديم بيانات صحيحة، والحفاظ على سرية كلمة المرور، وعدم مشاركة الحساب أو جلسات المشاهدة مع الغير.", icon: "person-circle-outline" },
      { title: "شراء المواد", body: "يظهر السعر ومدة الوصول ومحتويات المادة قبل الدفع. لا تُمنح صلاحية المادة إلا بعد تأكيد عملية الدفع فعليًا من مزود الخدمة عبر الخادم.", icon: "card-outline" },
      { title: "حقوق المحتوى", body: "جميع الفيديوهات والملفات التعليمية مخصصة للاستخدام الشخصي داخل الحساب، ويُمنع نسخها أو إعادة نشرها أو بيعها أو محاولة تجاوز وسائل الحماية.", icon: "shield-checkmark-outline" },
      { title: "التحديثات والتوفر", body: "قد نضيف دروسًا أو نعيد ترتيب الوحدات لتحسين التجربة. نعمل على إبقاء الخدمة متاحة، وقد تحدث فترات صيانة معلنة عند الحاجة.", icon: "refresh-circle-outline" },
    ],
  },
  privacy: {
    title: "سياسة الخصوصية",
    intro: "توضح هذه السياسة البيانات التي تحتاجها مراس لتقديم الخدمة وكيفية حمايتها واستخدامها.",
    icon: "lock-closed-outline",
    sections: [
      { title: "البيانات التي نجمعها", body: "نجمع بيانات الحساب والتواصل والجامعة والتخصص، إضافة إلى سجل الطلبات والتقدم والجلسات اللازمة لتشغيل المنصة وحماية المحتوى.", icon: "server-outline" },
      { title: "كيف نستخدم البيانات", body: "نستخدم البيانات لتخصيص المقترحات، تفعيل المشتريات، حفظ التقدم، تقديم الدعم، منع إساءة الاستخدام، وتحسين جودة المحتوى.", icon: "options-outline" },
      { title: "الدفع", body: "لا تخزن مراس بيانات البطاقة الكاملة. تتم معالجة الدفع لدى Tap، ونحتفظ فقط بالمراجع والحالة والمبلغ اللازمين للفواتير والدعم المالي.", icon: "card-outline" },
      { title: "حقوق المستخدم", body: "يمكنك طلب نسخة من بياناتك أو تحديثها أو طلب حذف الحساب وفق المتطلبات النظامية والالتزامات المالية وحفظ السجلات.", icon: "person-outline" },
    ],
  },
  "content-policy": {
    title: "حقوق وسياسة المحتوى",
    intro: "توضح هذه السياسة ملكية المحتوى التعليمي، وضوابط استخدامه، وآلية التعامل مع البلاغات.",
    icon: "library-outline",
    sections: [
      { title: "ملكية المواد", body: "الفيديوهات والملفات الأصلية مملوكة لمراس أو للمدرّسين والجهات المرخِّصة لها، ولا يعني الاشتراك انتقال الملكية للمستخدم.", icon: "ribbon-outline" },
      { title: "الاستخدام المسموح", body: "يُسمح بالمشاهدة الشخصية داخل الحساب خلال مدة الصلاحية، وباستخدام الأجهزة والجلسات المسموح بها فقط.", icon: "checkmark-circle-outline" },
      { title: "الاستخدام المحظور", body: "يُمنع التسجيل أو النسخ أو إعادة البث أو المشاركة أو محاولة استخراج الروابط أو تجاوز العلامات المائية والقيود التقنية.", icon: "ban-outline" },
      { title: "بلاغات الحقوق", body: "نراجع بلاغات الملكية الفكرية بسرعة. أرسل اسم العمل والرابط وما يثبت الصفة النظامية عبر الدعم، وسنقيّد المادة أثناء التحقق عند الحاجة.", icon: "flag-outline" },
    ],
  },
  "refund-policy": {
    title: "سياسة الاسترداد",
    intro: "نراجع طلبات الاسترداد بعدالة مع مراعاة طبيعة المحتوى الرقمي وحالة استخدام المادة.",
    icon: "return-down-back-outline",
    sections: [
      { title: "الأهلية", body: "يمكن تقديم طلب الاسترداد خلال المدة الموضحة وقت الشراء إذا لم يُستهلك جزء جوهري من المحتوى ولم توجد مخالفة لشروط الاستخدام.", icon: "checkbox-outline" },
      { title: "الحالات التقنية", body: "إذا تعذر الوصول للمادة بسبب خلل من المنصة ولم نتمكن من إصلاحه خلال مدة معقولة، يحق للطالب طلب الاسترداد أو التعويض بمدة إضافية.", icon: "construct-outline" },
      { title: "طريقة الطلب", body: "يُفتح طلب الاسترداد من تذكرة الدعم مع رقم الطلب والسبب. يراجع فريق المالية سجل الدفع والمشاهدة ثم يرسل القرار داخل الحساب.", icon: "chatbox-ellipses-outline" },
      { title: "مدة المعالجة", body: "بعد الموافقة، يُرسل الاسترداد عبر Tap إلى وسيلة الدفع الأصلية، وقد تستغرق مدة الظهور بحسب البنك أو وسيلة الدفع.", icon: "time-outline" },
    ],
  },
  "how-it-works": {
    title: "كيف تعمل مراس؟",
    intro: "رحلة واضحة تبدأ بالبحث عن المادة وتجربتها، وتنتهي بتعلّم محفوظ على أجهزتك.",
    icon: "sparkles-outline",
    sections: [
      { title: "١. ابحث عن جامعتك ومادتك", body: "استخدم البحث الموحد أو ابدأ من صفحة جامعتك، ثم اختر التخصص والمادة المطلوبة.", icon: "search-outline" },
      { title: "٢. شاهد درسًا مجانيًا", body: "اختبر جودة الصوت وطريقة الشرح والمشغل قبل أن تدفع أي مبلغ.", icon: "play-circle-outline" },
      { title: "٣. ادفع عبر Tap", body: "ينشئ الخادم طلبًا بالقيمة الصحيحة، وينقلك إلى صفحة Tap لإتمام الدفع بأمان.", icon: "card-outline" },
      { title: "٤. تظهر المادة في حسابك", body: "بعد تأكيد Tap للعملية من الخادم، تُمنح الصلاحية وتظهر المادة داخل «موادي».", icon: "checkmark-done-circle-outline" },
      { title: "٥. تعلّم من أي جهاز", body: "تابع من آخر ثانية، أكمل الوحدات، واحفظ تقدمك وملاحظاتك حتى نهاية الصلاحية.", icon: "school-outline" },
    ],
  },
  accessibility: {
    title: "إمكانية الوصول",
    intro: "نعمل لتكون مراس قابلة للاستخدام مع تقنيات المساعدة وفي مختلف أحجام الأجهزة.",
    icon: "accessibility-outline",
    sections: [
      { title: "التصفح والوضوح", body: "يدعم التطبيق اتجاه العربية، وتسميات عناصر التحكم، والتكبير دون فقد الوظائف الأساسية.", icon: "navigate-circle-outline" },
      { title: "الألوان والمظهر", body: "يتوفر وضع فاتح وليلي مع تباين واضح، ولا نعتمد على اللون وحده لإيصال الحالات المهمة.", icon: "contrast-outline" },
      { title: "الفيديو", body: "يتضمن المشغل سرعة تشغيل، مستوى صوت، ملء الشاشة، وواجهة مهيأة لإضافة النصوص المصاحبة.", icon: "videocam-outline" },
      { title: "أخبرنا بعائق", body: "إذا واجهت صعوبة، أرسل وصف الجهاز والخطوة المتأثرة إلى الدعم لنراجعها ضمن أولوية الوصول.", icon: "headset-outline" },
    ],
  },
};

export function InformationPage({ kind }: { kind: InformationKind }) {
  const { colors } = useTheme();
  const content = INFORMATION_CONTENT[kind];
  return <Screen>
    <AppHeader title={content.title} subtitle="معلومات واضحة داخل تطبيق مراس" back />
    <View style={[styles.hero, { backgroundColor: colors.primary }]}>
      <View style={styles.heroIcon}><Ionicons name={content.icon} size={30} color="#FFFFFF" /></View>
      <Text style={styles.heroTitle}>{content.title}</Text>
      <Text style={styles.heroCopy}>{content.intro}</Text>
    </View>
    <View style={styles.sections}>{content.sections.map((section) => <Card key={section.title} style={styles.card}>
      <View style={[styles.sectionIcon, { backgroundColor: colors.surfaceAlt }]}><Ionicons name={section.icon} size={22} color={colors.primary} /></View>
      <View style={styles.sectionCopy}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
        <Text style={[styles.sectionBody, { color: colors.textSoft }]}>{section.body}</Text>
      </View>
    </Card>)}</View>
    {kind === "how-it-works" ? <AppButton title="استكشف المواد الآن" icon="search-outline" onPress={() => router.push("/(tabs)/courses")} /> : <AppButton title="تواصل مع الدعم" icon="headset-outline" variant="soft" onPress={() => router.push("/support")} />}
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 26, padding: 22, alignItems: "flex-end", overflow: "hidden" },
  heroIcon: { width: 56, height: 56, borderRadius: 19, backgroundColor: "rgba(255,255,255,.15)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  heroTitle: { color: "#FFFFFF", fontSize: 24, lineHeight: 34, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  heroCopy: { color: "rgba(255,255,255,.84)", fontSize: 12, lineHeight: 22, textAlign: "right", writingDirection: "rtl", marginTop: 7 },
  sections: { gap: 10, marginVertical: 18 },
  card: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
  sectionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sectionCopy: { flex: 1, alignItems: "flex-end" },
  sectionTitle: { fontSize: 14, fontWeight: "900", textAlign: "right", writingDirection: "rtl" },
  sectionBody: { fontSize: 11, lineHeight: 21, textAlign: "right", writingDirection: "rtl", marginTop: 5 },
});
