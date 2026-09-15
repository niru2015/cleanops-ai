import type { SVGProps } from "react";
import type { NavigationIcon } from "@/config/navigation";

type IconProps = SVGProps<SVGSVGElement>;

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="currentColor" />
      <path d="M7.5 23.5 23.8 7.2" fill="none" stroke="#082238" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M10.4 25.2 25.4 10.2" fill="none" stroke="#d8fbff" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="M5 7h14M5 12h14M5 17h14" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function NavigationGlyph({ name, ...props }: IconProps & { name: NavigationIcon }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props} {...common}>
      {name === "home" && <><path d="m4 10 8-6.5 8 6.5v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z" /></>}
      {name === "pin" && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.4" /></>}
      {name === "document" && <><rect x="5" y="3" width="14" height="18" rx="1.8" /><path d="M9 8h6M9 12h6M9 16h4" /></>}
      {name === "alert" && <><path d="M10.4 4.3 2.8 18a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L13.6 4.3a1.8 1.8 0 0 0-3.2 0Z" /><path d="M12 9v4M12 17h.01" /></>}
      {name === "chart" && <><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20" /></>}
    </svg>
  );
}

export function EmptyDocumentIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 156 156" aria-hidden="true" {...props}>
      <path d="M115 31a48 48 0 1 1-75 10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="7 9" strokeLinecap="round" />
      <path d="M52 40h35l19 19v54a6 6 0 0 1-6 6H52a6 6 0 0 1-6-6V46a6 6 0 0 1 6-6Z" fill="white" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      <path d="M87 40v19h19M61 72h29M61 85h29M61 98h21" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m126 44 2.3 6.2 6.2 2.3-6.2 2.3-2.3 6.2-2.3-6.2-6.2-2.3 6.2-2.3Z" fill="#36c9d6" stroke="none" />
    </svg>
  );
}
