import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Next.js 16 ships its ESLint rules as flat config, so they're used directly.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Server pages and layouts render once per request on the server, so reading the clock there is fine
    // (the purity rule protects browser components, which re-render).
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
  {
    // browser tests are plain Node scripts (CommonJS), run with `pnpm test:e2e`
    files: ["tests/e2e/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true, allowShortCircuit: true }],
    },
  },
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
