/* eslint-disable @next/next/no-img-element -- the official square source is already optimized for this small UI surface */
export function BrandMark({ className = "" }: { className?: string }) {
  return <span className={`brand-mark ${className}`} aria-hidden="true">
    <img src="/brand/mark-m.png" alt="" width={1920} height={1920} />
  </span>;
}
