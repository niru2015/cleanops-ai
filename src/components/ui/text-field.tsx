import { useId, type InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  help?: string;
  error?: string;
};

export function TextField({ label, help, error, id, className, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label className="ui-field" htmlFor={inputId}>
      <span className="ui-field-label">{label}</span>
      <input
        id={inputId}
        className={["ui-field-input", error ? "ui-field-input-error" : "", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : help ? `${inputId}-help` : undefined}
        {...props}
      />
      {error ? (
        <span className="ui-field-error" id={`${inputId}-error`}>
          {error}
        </span>
      ) : help ? (
        <span className="ui-field-help" id={`${inputId}-help`}>
          {help}
        </span>
      ) : null}
    </label>
  );
}
