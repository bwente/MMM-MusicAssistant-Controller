"use strict";

const js = require("@eslint/js");

module.exports = [
  {
    ...js.configs.recommended,
    files: ["**/*.js"],
  },
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["MMM-MusicAssistant-Controller.js", "lib/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        Module: "readonly",
        Log: "readonly",
        MusicAssistantControllerCore: "readonly",
        MusicAssistantConnection: "readonly",
        WebSocket: "readonly",
        URL: "readonly",
        module: "readonly",
        require: "readonly",
        self: "readonly",
        document: "readonly",
        window: "readonly",
        localStorage: "readonly",
        requestAnimationFrame: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
  {
    files: ["node_helper.js", "test/**/*.js", "token.example.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        Buffer: "readonly",
        module: "readonly",
        process: "readonly",
        require: "readonly",
        setImmediate: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
  {
    rules: {
      "eqeqeq": ["error", "always"],
      "no-constant-binary-expression": "error",
      "no-dupe-else-if": "error",
      "no-promise-executor-return": "error",
      "no-unreachable-loop": "error",
      "no-unsafe-optional-chaining": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
  },
];
