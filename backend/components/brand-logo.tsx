/* eslint-disable @next/next/no-img-element -- theme-specific uploaded logos are already optimized assets */
import Link from "next/link";

export function BrandLogo({ href = "/", compact = false, markOnly = false }: { href?: string; compact?: boolean; markOnly?: boolean }) {
  return (
    <Link
      href={href}
      className={`brand-logo${compact ? " brand-logo-compact" : ""}${markOnly ? " brand-logo-mark-only" : ""}`}
      aria-label="مراس العلم — الرئيسية"
    >
      <img
        src={markOnly ? "/brand/mark-m.png" : "/brand/logo-light.png"}
        alt={markOnly ? "مراس العلم" : "مراس العلم"}
        width={markOnly ? 1920 : 496}
        height={markOnly ? 1920 : 289}
        className="brand-logo-light"
      />
      <img
        src={markOnly ? "/brand/mark-m.png" : "/brand/logo-dark.png"}
        alt={markOnly ? "مراس العلم" : "مراس العلم"}
        width={markOnly ? 1920 : 496}
        height={markOnly ? 1920 : 289}
        className="brand-logo-dark"
      />
    </Link>
  );
}
