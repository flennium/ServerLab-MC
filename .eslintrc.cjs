/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  settings: {
    react: { version: "detect" },
  },
  rules: {
    // Allow unused vars prefixed with _ (common for destructuring)
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    // React 17+ JSX transform — no need to import React in scope
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
  },
  env: {
    node: true,
    browser: true,
    es2020: true,
  },
  ignorePatterns: ["dist/", "out/", "build/", "node_modules/"],
};
