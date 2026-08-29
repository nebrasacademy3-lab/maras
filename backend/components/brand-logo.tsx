/* eslint-disable @next/next/no-img-element -- theme-specific uploaded logos are already optimized assets */
import Link from "next/link";

export function BrandLogo({ href = "/", compact = false, markOnly = false }: { href?: string; compact?: boolean; markOnly?: boolean }) {
  return (
    <Link
      href={href}
      className={`brand-logo${compact ? " brand-logo-compact" : ""}${markOnly ? " brand-logo-mark-only" : ""}`}
      aria-label="مراس العلم — الرئيسية"
    >
      {markOnly ? <img src="/brand/mark-square.png" alt="علامة مراس العلم" width={1024} height={1024} /> : <>
        <img src="/brand/logo-light-hq.png" alt="مراس العلم" width={1984} height={1156} className="brand-logo-light" />
        <img src="/brand/logo-dark-hq.png" alt="" aria-hidden="true" width={1984} height={1156} className="brand-logo-dark" />
      </>}
    </Link>
  );
}
