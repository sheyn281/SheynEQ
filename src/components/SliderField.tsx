import type { InputHTMLAttributes } from 'react';

interface SliderFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  valueLabel: string;
}

export function SliderField({ label, valueLabel, ...inputProps }: SliderFieldProps) {
  return (
    <label className="field">
      <span className="field__row">
        <span className="field__label">{label}</span>
        <span className="field__value">{valueLabel}</span>
      </span>
      <input className="slider" type="range" {...inputProps} />
    </label>
  );
}
