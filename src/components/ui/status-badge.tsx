import type { ReactNode } from "react";

type StatusTone = "success" | "pending" | "ai" | "danger" | "neutral" | "info";

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  const classes = ["ui-statusBadge", `ui-statusBadge-${tone}`, className].filter(Boolean).join(" ");
  return <span className={classes}>{children}</span>;
}

export function PlannedBadge({ children }: { children: ReactNode }) {
  return <span className="ui-statusBadge ui-statusBadge-planned">{children}</span>;
}
