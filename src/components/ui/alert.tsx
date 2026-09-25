import type { ReactNode } from "react";

type AlertTone = "info" | "success" | "pending" | "ai" | "danger" | "restricted";

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) {
  const classes = ["ui-alert", `ui-alert-${tone}`, className].filter(Boolean).join(" ");
  const role = tone === "danger" ? "alert" : "status";
  return (
    <div className={classes} role={role}>
      {children}
    </div>
  );
}
