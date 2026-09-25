export type FlowStep = {
  label: string;
  description: string;
  href?: string;
  tone?: "neutral" | "info" | "pending" | "success" | "ai" | "danger";
};

export function FlowSteps({ steps, ariaLabel }: { steps: FlowStep[]; ariaLabel: string }) {
  return (
    <div className="ui-flowSteps" role="list" aria-label={ariaLabel}>
      {steps.map((step, index) => (
        <div className="ui-flowStep-wrap" key={step.label}>
          <div className="ui-flowStep" role="listitem">
            <div className={`ui-flowStep-marker ui-flowStep-marker-${step.tone ?? "neutral"}`}>{index + 1}</div>
            <div className="ui-flowStep-body">
              {step.href ? <a className="ui-flowStep-label" href={step.href}>{step.label}</a> : <span className="ui-flowStep-label">{step.label}</span>}
              <p className="ui-flowStep-description">{step.description}</p>
            </div>
          </div>
          {index < steps.length - 1 ? <span className="ui-flowStep-arrow" aria-hidden="true">→</span> : null}
        </div>
      ))}
    </div>
  );
}
