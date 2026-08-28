import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "مراس العلم",
    short_name: "مراس",
    description: "شرح جامعتك في مكان واحد",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#155eea",
    lang: "ar",
    dir: "rtl",
    icons: [
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
