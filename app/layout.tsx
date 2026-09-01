import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./checkout.css";
import "./additions.css";
import "./direction-polish.css";
import "./home-premium.css";
import "./campaigns.css";
import "./brand-premium.css";
import "./admin-premium.css";
import { ThemeProvider } from "@/components/theme-provider";
import { DeferredEnhancements } from "@/components/deferred-enhancements";
import { AnnouncementCampaign } from "@/components/announcement-campaign";
import { RealtimeSync } from "@/components/realtime-sync";
import { PlatformAnalytics } from "@/components/platform-analytics";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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
  icons: { icon: [{ url: "/brand/app-icon.png", type: "image/png", sizes: "1024x1024" }], shortcut: "/brand/app-icon.png", apple: "/brand/app-icon.png" },
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

const themeScript = `(function(){try{var t=localStorage.getItem('meras-theme');var p=localStorage.getItem('meras-palette');var s=localStorage.getItem('meras-font-scale');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.palette=['official','violet','rose','teal'].indexOf(p)>=0?p:'official';document.documentElement.dataset.fontScale=['0.9','1','1.1','1.2'].indexOf(s)>=0?s:'1'}catch(e){}})()`;
const homeIntroScript = `(function(){try{var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;var seen=sessionStorage.getItem('meras-home-intro-seen')==='1';document.documentElement.dataset.homeIntro=!reduced&&!seen?'show':'skip'}catch(e){document.documentElement.dataset.homeIntro='skip'}})()`;
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "مراس العلم", url: siteUrl, logo: `${siteUrl}/brand/mark-official.png`, email: "hello@meras.sa" },
    { "@type": "WebSite", name: "مراس العلم", url: siteUrl, inLanguage: "ar-SA", potentialAction: { "@type": "SearchAction", target: `${siteUrl}/courses?q={search_term_string}`, "query-input": "required name=search_term_string" } },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /><script dangerouslySetInnerHTML={{ __html: homeIntroScript }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /></head>
      <body><ThemeProvider><RealtimeSync><PlatformAnalytics /><AnnouncementCampaign />{children}<DeferredEnhancements /></RealtimeSync></ThemeProvider></body>
    </html>
  );
}
