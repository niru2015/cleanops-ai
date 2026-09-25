import { useId, type InputHTMLAttributes } from "react";

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: string;
  help?: string;
};

export function CheckboxField({ label, help, id, className, ...props }: CheckboxFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="ui-checkboxField">
      <label className="ui-checkbox" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          className={["ui-checkbox-input", className].filter(Boolean).join(" ")}
          aria-describedby={help ? `${inputId}-help` : undefined}
          {...props}
        />
        <span className="ui-checkbox-box" aria-hidden="true" />
        <span className="ui-checkbox-label">{label}</span>
      </label>
      {help ? (
        <span className="ui-field-help" id={`${inputId}-help`}>
          {help}
        </span>
      ) : null}
    </div>
  );
}
