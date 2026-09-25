import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  help,
  variant = "standard",
  unavailable = false,
}: {
  label: string;
  value: ReactNode;
  help?: ReactNode;
  variant?: "standard" | "hero";
  unavailable?: boolean;
}) {
  return (
    <div className={variant === "hero" ? "ui-kpiCard ui-kpiCard-hero" : "ui-kpiCard"}>
      <span className="ui-kpiCard-label">{label}</span>
      <strong className="ui-kpiCard-value">{unavailable ? "—" : value}</strong>
      {help ? <span className="ui-kpiCard-help">{help}</span> : null}
    </div>
  );
}

export function KpiCardGrid({ children }: { children: ReactNode }) {
  return <div className="ui-kpiCardGrid">{children}</div>;
}
