import core from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts'] },
  ...core,
  ...ts,
  {
    // RTL rule: physical left/right utilities are forbidden; use logical ones (start/end, ms/me, ps/pe).
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "Literal[value=/(^|\\s)(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|border-l|border-r)-/]",
        message: 'Use logical utilities (ms/me/ps/pe/start/end) for RTL.',
      }],
    },
  },
];
export default config;
