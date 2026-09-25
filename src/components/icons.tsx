import type { SVGProps } from "react";
import type { NavigationIcon } from "@/config/navigation";

type IconProps = SVGProps<SVGSVGElement>;

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
      {name === "mobile" && <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M10.5 5h3M11 18.5h2" /></>}
      {name === "document" && <><rect x="5" y="3" width="14" height="18" rx="1.8" /><path d="M9 8h6M9 12h6M9 16h4" /></>}
      {name === "ledger" && <><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h4" /><path d="M16.5 15.5v2.5M15.25 16.75h2.5" /></>}
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
