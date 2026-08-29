/* eslint-disable @next/next/no-img-element -- official uploaded artwork is served without runtime transforms */
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  compact?: boolean;
  markOnly?: boolean;
};

export function BrandLogo({ href = "/", compact = false, markOnly = false }: BrandLogoProps) {
  const classes = [
    "brand-logo",
    compact && "brand-logo-compact",
    markOnly ? "brand-logo-mark-only" : "brand-logo-wordmark",
  ].filter(Boolean).join(" ");

  return (
    <Link href={href} className={classes} aria-label="مراس العلم — الانتقال إلى الرئيسية">
      {markOnly ? (
        <>
          <img
            src="/brand/mark-light.png"
            alt="مراس العلم"
            width={1024}
            height={1024}
            className="brand-mark-light"
            decoding="async"
          />
          <img
            src="/brand/mark-dark.png"
            alt=""
            aria-hidden="true"
            width={1024}
            height={1024}
            className="brand-mark-dark"
            decoding="async"
          />
        </>
      ) : (
        <>
          <img
            src="/brand/logo-light-hq.png"
            alt="مراس العلم"
            width={1984}
            height={1156}
            className="brand-logo-light"
            decoding="async"
          />
          <img
            src="/brand/logo-dark-hq.png"
            alt=""
            aria-hidden="true"
            width={1984}
            height={1156}
            className="brand-logo-dark"
            decoding="async"
          />
        </>
      )}
    </Link>
  );
}
