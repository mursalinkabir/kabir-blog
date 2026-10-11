// @ts-check
import { defineEcConfig } from 'astro-expressive-code';

// Own file because the <Code> component (used for Lexical code blocks) reads the config from here.
export default defineEcConfig({
  themes: ['github-light'],
  defaultProps: { wrap: false },
  styleOverrides: {
    borderRadius: '8px',
    borderColor: '#e9ebef',
    codeFontFamily: "'JetBrains Mono', ui-monospace, monospace",
    codeFontSize: '0.875rem',
    uiFontFamily: "'Mulish', system-ui, 'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', Meiryo, sans-serif",
  },
});
