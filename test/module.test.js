"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("resolves dependency scripts through the MagicMirror module directory", () => {
  let definition;
  const source = fs.readFileSync(
    path.join(__dirname, "..", "MMM-MusicAssistant-Controller.js"),
    "utf8"
  );
  const sandbox = {
    Module: {
      register(name, moduleDefinition) {
        assert.equal(name, "MMM-MusicAssistant-Controller");
        definition = moduleDefinition;
      }
    },
    window: { innerWidth: 1024 }
  };
  vm.runInNewContext(source, sandbox);

  const moduleInstance = {
    file(relativePath) {
      return `/modules/MMM-MusicAssistant-Controller/${relativePath}`;
    }
  };

  assert.deepEqual(
    Array.from(definition.getScripts.call(moduleInstance)),
    [
      "/modules/MMM-MusicAssistant-Controller/lib/core.js",
      "/modules/MMM-MusicAssistant-Controller/lib/connection.js"
    ]
  );
});

test("limits the module to the viewport space remaining at its rendered offset", () => {
  let definition;
  const source = fs.readFileSync(
    path.join(__dirname, "..", "MMM-MusicAssistant-Controller.js"),
    "utf8"
  );
  vm.runInNewContext(source, {
    Module: {
      register(_name, moduleDefinition) {
        definition = moduleDefinition;
      }
    },
    window: { innerWidth: 1024 }
  });
  const root = {
    isConnected: true,
    style: {},
    getBoundingClientRect() {
      return { left: 62 };
    }
  };

  definition.fitViewport.call({ root });

  assert.equal(root.style.maxWidth, "950px");
});
