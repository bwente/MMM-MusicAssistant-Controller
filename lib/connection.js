(function (root, factory) {
  const api = factory(root.MusicAssistantControllerCore ||
    (typeof require === "function" ? require("./core") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MusicAssistantConnection = api;
})(typeof self !== "undefined" ? self : this, function (Core) {
  "use strict";

  class MusicAssistantConnection {
    constructor(options) {
      this.url = options.url;
      this.token = options.token;
      this.WebSocket = options.WebSocket || WebSocket;
      this.onState = options.onState || function () {};
      this.onEvent = options.onEvent || function () {};
      this.baseDelay = options.baseDelay || 1000;
      this.maxDelay = options.maxDelay || 30000;
      this.timer = null;
      this.socket = null;
      this.pending = new Map();
      this.sequence = 0;
      this.attempt = 0;
      this.stopped = true;
      this.authenticated = false;
    }

    start() {
      this.stopped = false;
      this.connect();
    }

    connect() {
      if (this.stopped) return;
      this.onState(this.attempt ? "reconnecting" : "connecting");
      try {
        this.socket = new this.WebSocket(this.url);
      } catch (error) {
        this.scheduleReconnect(error);
        return;
      }
      this.socket.onmessage = (event) => this.handleMessage(event.data);
      this.socket.onerror = () => {};
      this.socket.onclose = () => this.handleClose();
    }

    handleMessage(raw) {
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        this.onState("error", "Music Assistant sent an invalid response");
        return;
      }
      if (message.server_id && message.server_version && !this.authenticated) {
        this.send("auth", { token: this.token, device_name: "MagicMirror" })
          .then(() => {
            this.authenticated = true;
            this.attempt = 0;
            this.onState("connected");
          })
          .catch((error) => {
            this.onState("error", error.message || "Authentication failed");
            this.stop();
          });
        return;
      }
      if (message.event) {
        this.onEvent(message);
        return;
      }
      const pending = this.pending.get(String(message.message_id));
      if (!pending) return;
      if (message.partial) {
        pending.parts.push(...(Array.isArray(message.result) ? message.result : [message.result]));
        return;
      }
      this.pending.delete(String(message.message_id));
      clearTimeout(pending.timer);
      if ("error_code" in message || message.error) {
        pending.reject(new Error(message.details || message.error || "Music Assistant command failed"));
      } else {
        const result = pending.parts.length
          ? pending.parts.concat(Array.isArray(message.result) ? message.result : [])
          : message.result;
        pending.resolve(result);
      }
    }

    send(command, args) {
      if (!this.socket || this.socket.readyState !== 1) {
        return Promise.reject(new Error("Music Assistant is disconnected"));
      }
      const messageId = String(++this.sequence);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(messageId);
          reject(new Error("Music Assistant command timed out"));
        }, 15000);
        this.pending.set(messageId, { resolve, reject, timer, parts: [] });
        this.socket.send(JSON.stringify({ message_id: messageId, command, args: args || {} }));
      });
    }

    handleClose() {
      this.authenticated = false;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Connection closed"));
      }
      this.pending.clear();
      if (!this.stopped) this.scheduleReconnect();
    }

    scheduleReconnect() {
      if (this.stopped || this.timer) return;
      this.onState("reconnecting");
      const delay = Core.nextReconnectDelay(this.attempt++, this.baseDelay, this.maxDelay);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.connect();
      }, delay);
    }

    stop() {
      this.stopped = true;
      clearTimeout(this.timer);
      this.timer = null;
      if (this.socket) this.socket.close();
      this.socket = null;
    }
  }

  return MusicAssistantConnection;
});
