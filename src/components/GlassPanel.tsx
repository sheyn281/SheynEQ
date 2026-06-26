import type { PropsWithChildren } from 'react';

interface GlassPanelProps extends PropsWithChildren {
  className?: string;
}

export function GlassPanel({ children, className = '' }: GlassPanelProps) {
  return <section className={`glass-panel ${className}`}>{children}</section>;
}
