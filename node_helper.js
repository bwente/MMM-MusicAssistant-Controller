"use strict";

const NodeHelper = require("node_helper");
const path = require("path");

module.exports = NodeHelper.create({
  socketNotificationReceived(notification, payload) {
    if (notification !== "MA_LOAD_TOKEN") return;
    const requestId = payload && payload.requestId;
    try {
      if (!payload || typeof payload.tokenFile !== "string" || !path.isAbsolute(payload.tokenFile)) {
        throw new Error("tokenFile must be an absolute path");
      }
      delete require.cache[require.resolve(payload.tokenFile)];
      const loaded = require(payload.tokenFile);
      const token = typeof loaded === "string" ? loaded : loaded && loaded.token;
      if (typeof token !== "string" || !token.trim()) throw new Error("Token file does not export a token");
      this.sendSocketNotification("MA_TOKEN_RESULT", { requestId, token: token.trim() });
    } catch (error) {
      this.sendSocketNotification("MA_TOKEN_RESULT", {
        requestId,
        error: error.message
      });
    }
  }
});
