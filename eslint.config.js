import tseslint from "typescript-eslint";

const browserGlobals = Object.fromEntries(
  [
    "window",
    "document",
    "navigator",
    "localStorage",
    "sessionStorage",
    "fetch",
    "Headers",
    "FormData",
    "WebSocket",
    "URL",
    "URLSearchParams",
    "Option",
    "Event",
    "setTimeout",
    "clearTimeout",
    "console",
    "confirm",
    "prompt",
    "FileReader",
    "Blob",
    "File",
    "alert",
  ].map((name) => [name, "readonly"]),
);

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
    },
  },
  {
    files: ["public/js/**/*.js"],
    languageOptions: { globals: browserGlobals },
  },
);
