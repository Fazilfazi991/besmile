"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";

export function MobileBackLink({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return <button type="button" className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 md:hidden" onClick={() => {
    if (window.history.length > 1 && document.referrer && new URL(document.referrer).origin === window.location.origin) router.back();
    else router.push(fallback);
  }} aria-label={label}>← <span>{label}</span></button>;
}

export function MobileBackNavigation({ workspace }: { workspace: "admin" | "employee" }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const minimumDepth = workspace === "admin" ? 3 : 3;
  if (parts.length < minimumDepth || pathname.endsWith("/chat")) return null;
  const fallback = `/${parts.slice(0, -1).join("/")}` || `/${workspace}`;
  return <MobileBackLink fallback={fallback} label="Back" />;
}
