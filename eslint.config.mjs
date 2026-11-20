import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/server/**/*.ts"],
    ignores: ["src/server/clock.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Read time from clock.now() (src/server/clock.ts), not Date.now().",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "Read time from clock.now() (src/server/clock.ts), not new Date().",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/log.ts", "src/**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      "no-console": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "public/**",
    "reference/**",
    "supabase/**",
    "assets/**",
    "next-env.d.ts",
  ]),
]);
