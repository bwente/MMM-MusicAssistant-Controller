"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("token example contains only the documented placeholder", () => {
  const example = require("../token.example");
  assert.deepEqual(example, {
    token: "YOUR_MUSIC_ASSISTANT_LONG_LIVED_TOKEN"
  });
});

test("common private token filenames are ignored", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  const patterns = gitignore.split(/\r?\n/);
  for (const pattern of [
    "music-assistant-token.js",
    "music-assistant-token.*.js",
    "*-token.js",
    "*.token.js",
    "token.js",
    "token.local.js",
    ".env",
    ".env.*"
  ]) {
    assert.ok(patterns.includes(pattern), `missing .gitignore pattern: ${pattern}`);
  }
  assert.ok(patterns.includes("!token.example.js"));
});
