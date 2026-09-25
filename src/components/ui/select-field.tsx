import { useId, type SelectHTMLAttributes } from "react";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  help?: string;
};

export function SelectField({ label, help, id, className, children, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <label className="ui-field" htmlFor={selectId}>
      <span className="ui-field-label">{label}</span>
      <select
        id={selectId}
        className={["ui-field-input", "ui-field-select", className].filter(Boolean).join(" ")}
        aria-describedby={help ? `${selectId}-help` : undefined}
        {...props}
      >
        {children}
      </select>
      {help ? (
        <span className="ui-field-help" id={`${selectId}-help`}>
          {help}
        </span>
      ) : null}
    </label>
  );
}
