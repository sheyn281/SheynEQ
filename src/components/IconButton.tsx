import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: 'primary' | 'ghost';
}

export function IconButton({ icon, label, variant = 'ghost', ...buttonProps }: IconButtonProps) {
  return (
    <button aria-label={label} className={`icon-button icon-button--${variant}`} title={label} type="button" {...buttonProps}>
      {icon}
    </button>
  );
}
