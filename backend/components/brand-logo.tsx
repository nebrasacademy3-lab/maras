/* eslint-disable @next/next/no-img-element -- theme-specific uploaded logos are already optimized assets */
import Link from "next/link";

export function BrandLogo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link
      href={href}
      className={`brand-logo${compact ? " brand-logo-compact" : ""}`}
      aria-label="مراس العلم — الرئيسية"
    >
      <img
        src="/brand/logo-light.png"
        alt="مراس العلم"
        width={496}
        height={289}
        className="brand-logo-light"
      />
      <img
        src="/brand/logo-dark.png"
        alt="مراس العلم"
        width={496}
        height={289}
        className="brand-logo-dark"
      />
    </Link>
  );
}
