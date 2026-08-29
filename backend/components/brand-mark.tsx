/* eslint-disable @next/next/no-img-element -- the official square source is already optimized for this small UI surface */
export function BrandMark({ className = "" }: { className?: string }) {
  return <span className={`brand-mark ${className}`} aria-hidden="true">
    <img src="/brand/mark-square.png" alt="" width={1024} height={1024} />
  </span>;
}
