"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../lib/core");

test("constructs documented player commands without leaking unrelated data", () => {
  assert.deepEqual(Core.COMMANDS.play("kitchen"), {
    command: "players/cmd/play",
    args: { player_id: "kitchen" }
  });
  assert.deepEqual(Core.COMMANDS.pause("kitchen"), {
    command: "players/cmd/pause",
    args: { player_id: "kitchen" }
  });
  assert.deepEqual(Core.COMMANDS.stop("kitchen"), {
    command: "players/cmd/stop",
    args: { player_id: "kitchen" }
  });
  assert.deepEqual(Core.COMMANDS.playPause("kitchen"), {
    command: "players/cmd/play_pause",
    args: { player_id: "kitchen" }
  });
  assert.deepEqual(Core.COMMANDS.volume("kitchen", 107), {
    command: "players/cmd/volume_set",
    args: { player_id: "kitchen", volume_level: 100 }
  });
  assert.deepEqual(Core.COMMANDS.playlist("kitchen", "library://playlist/8"), {
    command: "player_queues/play_media",
    args: { queue_id: "kitchen", media: "library://playlist/8", option: "replace" }
  });
});

test("resolves explicit, remembered, and fallback players in that order", () => {
  const players = [
    { player_id: "first", available: true },
    { player_id: "saved", available: true },
    { player_id: "explicit", available: true }
  ];
  assert.equal(Core.resolvePlayer(players, "explicit", "saved").player_id, "explicit");
  assert.equal(Core.resolvePlayer(players, "missing", "saved").player_id, "saved");
  assert.equal(Core.resolvePlayer(players, "missing", "also-missing").player_id, "first");
  assert.equal(Core.resolvePlayer([{ player_id: "offline", available: false }]), null);
});

test("normalizes queue metadata, progress, volume, and artwork", () => {
  const result = Core.normalizeState(
    { player_id: "p1", name: "Kitchen", volume_level: 42 },
    {
      state: "playing",
      elapsed_time: 15,
      current_item: {
        duration: 180,
        media_item: {
          name: "Example Song",
          artists: [{ name: "Example Artist" }],
          image: { path: "provider/image.jpg", provider: "example" }
        }
      }
    },
    "http://ma.invalid:8095"
  );
  assert.equal(result.title, "Example Song");
  assert.equal(result.artist, "Example Artist");
  assert.equal(result.duration, 180);
  assert.equal(result.volume, 42);
  assert.match(result.artwork, /^http:\/\/ma\.invalid:8095\/imageproxy\?/);
  assert.match(result.artwork, /provider=example/);
});

test("uses canonical proxy IDs when supplied by newer schemas", () => {
  const result = Core.normalizeState({}, {
    current_item: { image: { path: "ignored", provider: "x", proxy_id: "opaque-id" } }
  }, "http://ma.invalid:8095/");
  assert.equal(result.artwork, "http://ma.invalid:8095/imageproxy/opaque-id?size=256");
});

test("applies player, queue, time, and removal events immutably", () => {
  const initial = {
    players: { p1: { player_id: "p1", name: "Old", volume_level: 10 } },
    queues: { p1: { queue_id: "p1", elapsed_time: 2 } }
  };
  let state = Core.applyEvent(initial, {
    event: "player_updated",
    object_id: "p1",
    data: { player_id: "p1", volume_level: 20 }
  });
  assert.equal(state.players.p1.name, "Old");
  assert.equal(state.players.p1.volume_level, 20);
  state = Core.applyEvent(state, { event: "queue_time_updated", object_id: "p1", data: 44 });
  assert.equal(state.queues.p1.elapsed_time, 44);
  state = Core.applyEvent(state, { event: "player_removed", object_id: "p1" });
  assert.equal(state.players.p1, undefined);
  assert.ok(initial.players.p1);
});

test("reconnect delay is capped and includes deterministic jitter", () => {
  assert.equal(Core.nextReconnectDelay(0, 1000, 30000, () => 0.5), 1000);
  assert.equal(Core.nextReconnectDelay(20, 1000, 30000, () => 0.5), 30000);
});

test("maps every generic notification", () => {
  const names = [
    "MUSIC_CONTROL_UP", "MUSIC_CONTROL_DOWN", "MUSIC_CONTROL_LEFT",
    "MUSIC_CONTROL_RIGHT", "MUSIC_CONTROL_SELECT", "MUSIC_CONTROL_BACK",
    "MUSIC_PLAY_PAUSE", "MUSIC_NEXT", "MUSIC_PREVIOUS",
    "MUSIC_VOLUME_UP", "MUSIC_VOLUME_DOWN", "MUSIC_PLAY", "MUSIC_PAUSE",
    "MUSIC_STOP", "MUSIC_PLAY_URI", "MUSIC_SET_VOLUME", "MUSIC_SELECT_PLAYER"
  ];
  for (const name of names) assert.ok(Core.notificationAction(name), name);
  assert.equal(Core.notificationAction("SOME_OTHER_NOTIFICATION"), null);
});
