import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./checkout.css";
import "./additions.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MerasAssistant } from "@/components/meras-assistant";
import { MotionOrchestrator } from "@/components/motion-orchestrator";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://meras-alelm.glossy-sun-8084.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "مراس العلم | شرح جامعتك في مكان واحد", template: "%s | مراس العلم" },
  description: "منصة تعليم جامعي سعودية تجمع شروحات المواد حسب الجامعة والتخصص، مع درس تجريبي مجاني قبل الاشتراك.",
  keywords: ["مراس العلم", "شروحات جامعية", "جامعات السعودية", "شرح مواد الجامعة", "دروس جامعية"],
  openGraph: {
    type: "website",
    locale: "ar_SA",
    url: siteUrl,
    siteName: "مراس العلم",
    title: "مراس العلم | شرح جامعتك في مكان واحد",
    description: "اختر جامعتك وتخصصك، وشاهد شرحًا مجانيًا قبل الاشتراك.",
    images: [{ url: "/og.png", width: 1728, height: 910, alt: "مراس العلم — شرح جامعتك في مكان واحد" }],
  },
  twitter: { card: "summary_large_image", title: "مراس العلم", description: "شرح جامعتك، في مكان واحد.", images: ["/og.png"] },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#071127" },
  ],
};

const themeScript = `(function(){try{var t=localStorage.getItem('meras-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body><ThemeProvider>{children}<MotionOrchestrator /><MerasAssistant /></ThemeProvider></body>
    </html>
  );
}
