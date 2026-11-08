import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "prototype-ui/**",
      "dist/**",
      ".wrangler/**",
      "migrations/**",
      "src/routeTree.gen.ts",
      // Copied from shadcn as generated source.
      "src/components/ui/**",
      "src/hooks/use-mobile.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
