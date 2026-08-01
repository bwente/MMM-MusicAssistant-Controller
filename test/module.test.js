"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Core = require("../lib/core");

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
    config: { playerId: "fixed-player" },
    translate: (key) => key
  });
  const selectableMarkup = definition.playerSelectorMarkup.call({
    config: { playerId: "" },
    translate: (key) => key
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

test("registers every supported MagicMirror translation", () => {
  let definition;
  const source = fs.readFileSync(
    path.join(__dirname, "..", "MMM-MusicAssistant-Controller.js"),
    "utf8"
  );
  vm.runInNewContext(source, {
    Module: { register(_name, moduleDefinition) { definition = moduleDefinition; } }
  });
  const translations = definition.getTranslations();
  assert.deepEqual(
    Object.keys(translations).sort(),
    ["bg", "da", "de", "en", "es", "fr", "hu", "nl", "ru", "th"]
  );
  const englishKeys = Object.keys(JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", translations.en), "utf8"
  ))).sort();
  for (const filename of Object.values(translations)) {
    const keys = Object.keys(JSON.parse(fs.readFileSync(
      path.join(__dirname, "..", filename), "utf8"
    ))).sort();
    assert.deepEqual(keys, englishKeys, filename);
  }
});

test("notification payload commands respect fixed-player scope", () => {
  let definition;
  const source = fs.readFileSync(
    path.join(__dirname, "..", "MMM-MusicAssistant-Controller.js"),
    "utf8"
  );
  vm.runInNewContext(source, {
    Module: { register(_name, moduleDefinition) { definition = moduleDefinition; } },
    MusicAssistantControllerCore: Core
  });
  const sent = [];
  const instance = {
    config: { playerId: "fixed" },
    selectedPlayerId: "selected",
    targetPlayerId: definition.targetPlayerId,
    sendBuilt(command) { sent.push(command); }
  };

  definition.playUri.call(instance, { uri: "library://playlist/7", playerId: "other" });
  definition.setVolume.call(instance, { volume: 37, playerId: "other" });
  definition.setVolume.call(instance, { volume: "37", playerId: "other" });

  assert.equal(sent[0].args.queue_id, "fixed");
  assert.equal(sent[1].args.player_id, "fixed");
  assert.equal(sent[1].args.volume_level, 37);
  assert.equal(sent.length, 2);
});

test("state and connection broadcasts are deduplicated", () => {
  const notifications = [];
  const instance = {
    selectedPlayerId: "p1",
    lastBroadcastState: "",
    lastConnectionBroadcast: "",
    connectionState: "connected",
    errorMessage: "",
    sendNotification(name, payload) { notifications.push([name, payload]); }
  };
  let definition;
  const source = fs.readFileSync(
    path.join(__dirname, "..", "MMM-MusicAssistant-Controller.js"),
    "utf8"
  );
  vm.runInNewContext(source, {
    Module: { register(_name, moduleDefinition) { definition = moduleDefinition; } }
  });
  const state = {
    playerId: "p1", state: "playing", title: "Song", artist: "Artist",
    volume: 25, elapsed: 10, duration: 100
  };

  definition.broadcastState.call(instance, state);
  definition.broadcastState.call(instance, state);
  definition.broadcastConnection.call(instance);
  definition.broadcastConnection.call(instance);

  assert.deepEqual(notifications.map(([name]) => name), [
    "MUSIC_STATE_CHANGED", "MUSIC_CONNECTION_CHANGED"
  ]);
});

test("routes idempotent automation notifications and their payloads", () => {
  let definition;
  const source = fs.readFileSync(
    path.join(__dirname, "..", "MMM-MusicAssistant-Controller.js"),
    "utf8"
  );
  vm.runInNewContext(source, {
    Module: { register(_name, moduleDefinition) { definition = moduleDefinition; } },
    MusicAssistantControllerCore: Core
  });
  const calls = [];
  const instance = {
    runAction(action, payload) { calls.push([action, payload]); },
    playUri(payload) { calls.push(["playUri", payload]); },
    setVolume(payload) { calls.push(["setVolume", payload]); },
    selectPlayerFromNotification(payload) { calls.push(["selectPlayer", payload]); }
  };
  const uri = { uri: "library://playlist/1" };
  definition.notificationReceived.call(instance, "MUSIC_PLAY", { playerId: "p1" });
  definition.notificationReceived.call(instance, "MUSIC_PAUSE");
  definition.notificationReceived.call(instance, "MUSIC_STOP");
  definition.notificationReceived.call(instance, "MUSIC_PLAY_URI", uri);
  definition.notificationReceived.call(instance, "MUSIC_SET_VOLUME", 25);
  definition.notificationReceived.call(instance, "MUSIC_SELECT_PLAYER", "p2");

  assert.deepEqual(calls.map(([action]) => action), [
    "play", "pause", "stop", "playUri", "setVolume", "selectPlayer"
  ]);
  assert.equal(calls[3][1], uri);
});
