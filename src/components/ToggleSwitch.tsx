import type { InputHTMLAttributes } from 'react';

interface ToggleSwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export function ToggleSwitch({ label, ...inputProps }: ToggleSwitchProps) {
  return (
    <label className="toggle">
      <input type="checkbox" {...inputProps} />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__label">{label}</span>
    </label>
  );
}
