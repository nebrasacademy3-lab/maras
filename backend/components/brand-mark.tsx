/* eslint-disable @next/next/no-img-element -- official uploaded artwork is served without runtime transforms */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`.trim()} aria-hidden="true">
      <img src="/brand/mark-light.png" alt="" width={1024} height={1024} className="brand-mark-light" decoding="async" />
      <img src="/brand/mark-dark.png" alt="" width={1024} height={1024} className="brand-mark-dark" decoding="async" />
    </span>
  );
}
