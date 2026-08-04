"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const MusicAssistantConnection = require("../lib/connection");

class FakeWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  receive(value) { this.onmessage({ data: JSON.stringify(value) }); }
}

test("authenticates after server info and never places token in the URL", async () => {
  FakeWebSocket.instances = [];
  const states = [];
  const connection = new MusicAssistantConnection({
    url: "ws://ma.invalid/ws",
    token: "private-token",
    WebSocket: FakeWebSocket,
    onState: (state) => states.push(state)
  });
  connection.start();
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, "ws://ma.invalid/ws");
  assert.doesNotMatch(socket.url, /private-token/);
  socket.receive({ server_id: "server", server_version: "2.9.0" });
  assert.deepEqual(socket.sent[0], {
    message_id: "1",
    command: "auth",
    args: { token: "private-token", device_name: "MagicMirror" }
  });
  socket.receive({ message_id: "1", result: { user: { name: "Test" } } });
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.equal(states.at(-1), "connected");
  connection.stop();
});

test("resolves commands and forwards events", async () => {
  FakeWebSocket.instances = [];
  let event;
  const connection = new MusicAssistantConnection({
    url: "ws://ma.invalid/ws",
    token: "token",
    WebSocket: FakeWebSocket,
    onEvent: (message) => { event = message; }
  });
  connection.start();
  const socket = FakeWebSocket.instances[0];
  const pending = connection.send("players/all");
  socket.receive({ message_id: "1", result: [{ player_id: "p1" }] });
  assert.deepEqual(await pending, [{ player_id: "p1" }]);
  socket.receive({ event: "player_updated", object_id: "p1", data: { player_id: "p1" } });
  assert.equal(event.event, "player_updated");
  connection.stop();
});

test("rejects pending commands when a connection closes", async () => {
  FakeWebSocket.instances = [];
  const connection = new MusicAssistantConnection({
    url: "ws://ma.invalid/ws",
    token: "token",
    WebSocket: FakeWebSocket
  });
  connection.start();
  const pending = connection.send("players/all");
  FakeWebSocket.instances[0].onclose();
  await assert.rejects(pending, /Connection closed/);
  connection.stop();
});

test("automatically creates a new socket after an unexpected close", async () => {
  FakeWebSocket.instances = [];
  const connection = new MusicAssistantConnection({
    url: "ws://ma.invalid/ws",
    token: "token",
    WebSocket: FakeWebSocket,
    baseDelay: 1,
    maxDelay: 2
  });
  connection.start();
  FakeWebSocket.instances[0].onclose();
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  assert.equal(FakeWebSocket.instances.length, 2);
  connection.stop();
});
