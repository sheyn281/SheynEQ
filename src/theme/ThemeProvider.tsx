import { type CSSProperties, type PropsWithChildren, useEffect } from 'react';
import type { SheynFxTheme } from '../features/integration/types';
import { theme } from './theme';

interface ThemeProviderProps {
  theme?: SheynFxTheme;
}

export function ThemeProvider({ children, theme: selectedTheme = 'dark' }: PropsWithChildren<ThemeProviderProps>) {
  useEffect(() => {
    document.documentElement.dataset.theme = selectedTheme;
    document.documentElement.style.colorScheme = selectedTheme;
  }, [selectedTheme]);

  return <div style={{ '--accent-color': theme.colors.cyan } as CSSProperties}>{children}</div>;
}
