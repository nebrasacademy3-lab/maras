"use client";

import { Suspense, type ComponentProps } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { navigationIsActive } from "@/lib/dashboard-navigation";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

function PendingHint() {
  const { pending } = useLinkStatus();
  return pending ? <span className="navigation-pending" role="status" aria-label="جارٍ فتح الصفحة" /> : null;
}

function ActiveLink({ href, className = "", children, ...props }: Props) {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = navigationIsActive(href, pathname, search.toString());
  return <Link {...props} href={href} className={`${className}${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{children}<PendingHint /></Link>;
}

export function SiteNavLink(props: Props) {
  return <Suspense fallback={<Link {...props} />}><ActiveLink {...props} /></Suspense>;
}
