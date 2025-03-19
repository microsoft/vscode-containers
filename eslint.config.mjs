import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([{
    extends: compat.extends(
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended",
    ),

    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 6,
        sourceType: "module",

        parserOptions: {
            project: "tsconfig.json",
        },
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "default",
            format: ["camelCase", "PascalCase"],
        }, {
                selector: "variable",
                modifiers: ["const"],
                format: ["camelCase", "PascalCase", "UPPER_CASE"],
            }, {
                selector: "classProperty",
                modifiers: ["private"],
                format: ["camelCase", "PascalCase"],
                leadingUnderscore: "allow",
            }],

        "@typescript-eslint/no-floating-promises": "warn",
        "@typescript-eslint/no-inferrable-types": "off",

        "@typescript-eslint/no-unused-vars": ["warn", {
            args: "none",
        }],

        "@/semi": "warn",
        curly: "warn",
        eqeqeq: "warn",
        "no-extra-boolean-cast": "off",
        "no-throw-literal": "warn",
        semi: "off",
    },
}]);
