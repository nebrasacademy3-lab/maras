/* eslint-disable @next/next/no-img-element -- theme-specific uploaded logos are already optimized assets */
import Link from "next/link";

type BrandArtworkProps = { compact?: boolean; markOnly?: boolean; className?: string };

function BrandArtwork({ markOnly = false }: Pick<BrandArtworkProps, "markOnly">) {
  return <>
    <span className="brand-logo-symbol" aria-hidden="true">
      <img src="/brand/mark-light.png" alt="" width={512} height={256} className="brand-logo-light" />
      <img src="/brand/mark-dark.png" alt="" width={512} height={256} className="brand-logo-dark" />
    </span>
    {!markOnly && <span className="brand-logo-word">مراس العلم</span>}
  </>;
}

export function BrandLockup({ compact = false, markOnly = false, className = "" }: BrandArtworkProps) {
  return <span className={`brand-logo${compact ? " brand-logo-compact" : ""}${markOnly ? " brand-logo-mark-only" : ""}${className ? ` ${className}` : ""}`} role="img" aria-label="مراس العلم">
    <BrandArtwork markOnly={markOnly} />
  </span>;
}

export function BrandLogo({ href = "/", compact = false, markOnly = false }: { href?: string; compact?: boolean; markOnly?: boolean }) {
  return (
    <Link
      href={href}
      className={`brand-logo${compact ? " brand-logo-compact" : ""}${markOnly ? " brand-logo-mark-only" : ""}`}
      aria-label="مراس العلم — الرئيسية"
    >
      <BrandArtwork markOnly={markOnly} />
    </Link>
  );
}
