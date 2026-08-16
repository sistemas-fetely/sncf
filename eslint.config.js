import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "src/integrations/**"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // ===== ERRO CEGO — proibe o idioma que produz "[object Object]" =====
      // ===== SISTEMA VISUAL Fetely — guardiao das regras de cor/peso/largura =====
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ConditionalExpression > BinaryExpression.test[operator='instanceof'][right.name='Error']",
          message:
            "ERRO CEGO: 'e instanceof Error ? e.message : String(e)' produz \"[object Object]\" para erros do Supabase. Use formatError(e) de @/lib/format-error.",
        },
        {
          selector:
            "CallExpression[callee.name='String'][arguments.length=1] > Identifier.arguments[name=/^(e|err|error|ex|erro)$/]",
          message:
            "ERRO CEGO: String(erro) produz \"[object Object]\". Use formatError(e) de @/lib/format-error.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\b(text|bg|border|ring|divide|from|via|to|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|[1-9]00|950)\\b/]",
          message:
            "SISTEMA VISUAL §2: cor crua do Tailwind e proibida. Use token semantico (success, warning, destructive, info, muted, primary, gold). Cor crua quebra o modo escuro e compete com o dourado da marca.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\bfont-(semibold|bold|extrabold|black)\\b/]",
          message:
            "SISTEMA VISUAL §5: so existem dois pesos, 400 (font-normal) e 500 (font-medium).",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)(container|max-w-(4xl|5xl|6xl|7xl))(\\s|$)/]",
          message:
            "SISTEMA VISUAL §7: pagina nao declara largura propria. Use <PageShell variant='dados'|'leitura'|'foco'>.",
        },
      ],
    },
  },
  {
    // Purga concluida em 16/08/2026: a regra vale em todo o src, menos os
    // primitivos do shadcn e o codigo gerado. O que foi limpo nao suja de novo.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "src/integrations/**"],
    rules: {
      "no-restricted-syntax": "error",
    },
  },
);
