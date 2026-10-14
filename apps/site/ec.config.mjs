// @ts-check
import { defineEcConfig } from 'astro-expressive-code';

// Own file because the <Code> component (used for Lexical code blocks) reads the config from here.
export default defineEcConfig({
  // Light first (the base styles); dark applies for data-theme="dark" and, with no choice made, the system setting.
  themes: ['github-light', 'github-dark'],
  useDarkModeMediaQuery: true,
  themeCssSelector: (theme) => (theme.type === 'dark' ? "[data-theme='dark']" : "[data-theme='light']"),
  defaultProps: { wrap: false },
  styleOverrides: {
    borderRadius: '14px',
    borderColor: ({ theme }) => (theme.type === 'dark' ? '#232d39' : '#e4e7ec'),
    codeFontFamily: "'JetBrains Mono', ui-monospace, monospace",
    codeFontSize: '0.875rem',
    uiFontFamily: "'Mulish', system-ui, 'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', Meiryo, sans-serif",
  },
});
