/* eslint-disable @next/next/no-img-element -- dedicated transparent theme assets preserve the exact M mark */
export function BrandMark({ className = "" }: { className?: string }) {
  return <span className={`brand-mark ${className}`} aria-hidden="true">
    <img src="/brand/mark-light.png" alt="" className="brand-mark-light" />
    <img src="/brand/mark-dark.png" alt="" className="brand-mark-dark" />
  </span>;
}
