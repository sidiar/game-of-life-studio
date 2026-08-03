// Prettier is the single formatter; eslint-config-prettier disables ESLint's
// stylistic rules so the two never disagree. Keep this minimal — defaults are
// the showcase-legible baseline; only deviations that matter are declared.
/** @type {import('prettier').Config} */
export default {
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  semi: true,
};
