import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "مراس العلم", short_name: "مراس", description: "شرح جامعتك في مكان واحد", start_url: "/", display: "standalone", background_color: "#071127", theme_color: "#155eea", lang: "ar", dir: "rtl", icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }] };
}
