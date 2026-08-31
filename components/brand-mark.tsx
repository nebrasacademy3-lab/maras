/* eslint-disable @next/next/no-img-element -- theme-specific brand assets are already optimized */
export function BrandMark({ className = "" }: { className?: string }) {
  return <span className={`brand-mark ${className}`} aria-hidden="true">
    <img src="/brand/mark-light.png" alt="" width={512} height={256} className="brand-mark-light" />
    <img src="/brand/mark-dark.png" alt="" width={512} height={256} className="brand-mark-dark" />
  </span>;
}
