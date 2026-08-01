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

test("hides player selection for a configured player or one available player", () => {
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
    }
  });

  const onePlayer = {
    config: { playerId: "" },
    players: { p1: { player_id: "p1", available: true, enabled: true } },
    availablePlayers: definition.availablePlayers
  };
  assert.equal(definition.hidesPlayerSelector.call(onePlayer), true);

  const twoPlayers = {
    config: { playerId: "" },
    players: {
      p1: { player_id: "p1", available: true, enabled: true },
      p2: { player_id: "p2", available: true, enabled: true }
    },
    availablePlayers: definition.availablePlayers
  };
  assert.equal(definition.hidesPlayerSelector.call(twoPlayers), false);
  twoPlayers.config.playerId = "p1";
  assert.equal(definition.hidesPlayerSelector.call(twoPlayers), true);
});

test("configured player resolution never falls back to another player", () => {
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
    }
  });
  const instance = {
    config: { playerId: "fixed" },
    selectedPlayerId: "other",
    playerMenuOpen: true
  };

  definition.resolveSelectedPlayer.call(instance);

  assert.equal(instance.selectedPlayerId, "fixed");
  assert.equal(instance.playerMenuOpen, false);
});

test("omits player selector markup when playerId is configured", () => {
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
    }
  });

  const fixedMarkup = definition.playerSelectorMarkup.call({
    config: { playerId: "fixed-player" }
  });
  const selectableMarkup = definition.playerSelectorMarkup.call({
    config: { playerId: "" }
  });

  assert.equal(fixedMarkup, "");
  assert.match(selectableMarkup, /mac-player/);
  assert.match(selectableMarkup, /mac-player-list/);
});

test("compact mode adds an opt-in root class without changing the default", () => {
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
    }
  });

  assert.equal(definition.rootClassName.call({ config: { compact: false } }), "mac");
  assert.equal(definition.rootClassName.call({ config: { compact: true } }), "mac mac-compact");
});
