/* global Module, Log, MusicAssistantControllerCore, MusicAssistantConnection */
"use strict";

Module.register("MMM-MusicAssistant-Controller", {
  defaults: {
    serverUrl: "http://music-assistant.local:8095",
    tokenFile: "",
    playerId: "",
    volumeStep: 5,
    playlists: [],
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 30000
  },

  getScripts() {
    return ["lib/core.js", "lib/connection.js"];
  },

  getStyles() {
    return ["MMM-MusicAssistant-Controller.css", "font-awesome.css"];
  },

  start() {
    this.players = {};
    this.queues = {};
    this.selectedPlayerId = this.config.playerId || this.loadStoredPlayer();
    this.connectionState = "disconnected";
    this.errorMessage = "";
    this.focusIndex = 0;
    this.focusActive = false;
    this.playerMenuOpen = false;
    this.requestId = `${this.identifier}-${Date.now()}`;
    this.domReady = false;
    this.progressTimer = null;
    this.connection = null;
    if (!this.config.tokenFile) {
      this.setStatus("error", "Configure an absolute tokenFile path");
      return;
    }
    this.sendSocketNotification("MA_LOAD_TOKEN", {
      requestId: this.requestId,
      tokenFile: this.config.tokenFile
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MA_TOKEN_RESULT" || !payload || payload.requestId !== this.requestId) return;
    if (payload.error) {
      this.setStatus("error", payload.error);
      return;
    }
    this.connect(payload.token);
  },

  connect(token) {
    const wsUrl = this.config.serverUrl.replace(/\/$/, "")
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:") + "/ws";
    this.connection = new MusicAssistantConnection({
      url: wsUrl,
      token,
      baseDelay: this.config.reconnectBaseDelay,
      maxDelay: this.config.reconnectMaxDelay,
      onState: (state, detail) => {
        this.setStatus(state, detail);
        if (state === "connected") this.synchronize();
      },
      onEvent: (message) => this.handleEvent(message)
    });
    this.connection.start();
  },

  async synchronize() {
    try {
      const results = await Promise.all([
        this.connection.send("players/all"),
        this.connection.send("player_queues/all")
      ]);
      this.players = this.indexBy(results[0], "player_id");
      this.queues = this.indexBy(results[1], "queue_id");
      this.resolveSelectedPlayer();
      this.setStatus("connected");
    } catch (error) {
      this.setStatus("error", error.message);
    }
  },

  indexBy(items, key) {
    return (Array.isArray(items) ? items : []).reduce((result, item) => {
      if (item && item[key]) result[item[key]] = item;
      return result;
    }, {});
  },

  handleEvent(message) {
    const next = MusicAssistantControllerCore.applyEvent(
      { players: this.players, queues: this.queues },
      message
    );
    this.players = next.players;
    this.queues = next.queues;
    this.resolveSelectedPlayer();
    this.renderState();
  },

  resolveSelectedPlayer() {
    const player = MusicAssistantControllerCore.resolvePlayer(
      this.players,
      this.config.playerId,
      this.selectedPlayerId
    );
    if (player && player.player_id !== this.selectedPlayerId) this.selectPlayer(player.player_id);
  },

  selectPlayer(playerId) {
    this.selectedPlayerId = playerId;
    try {
      localStorage.setItem(`${this.name}:${this.identifier}:playerId`, playerId);
    } catch (_) {}
    this.playerMenuOpen = false;
    this.renderState();
  },

  loadStoredPlayer() {
    try {
      return localStorage.getItem(`${this.name}:${this.identifier}:playerId`) || "";
    } catch (_) {
      return "";
    }
  },

  selectedQueue() {
    const player = this.players[this.selectedPlayerId];
    if (!player) return {};
    return this.queues[player.active_source] || this.queues[player.player_id] || {};
  },

  getDom() {
    const root = document.createElement("section");
    root.className = "mac";
    root.setAttribute("aria-label", "Music Assistant controller");
    root.innerHTML = `
      <div class="mac-status" role="status"></div>
      <button class="mac-player mac-focusable" type="button" aria-haspopup="listbox">
        <i class="fa fa-volume-up" aria-hidden="true"></i><span>Select a player</span>
        <i class="fa fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="mac-player-list" role="listbox" hidden></div>
      <div class="mac-now">
        <div class="mac-art-wrap"><img class="mac-art" alt="" hidden><i class="fa fa-music mac-art-placeholder" aria-hidden="true"></i></div>
        <div class="mac-meta">
          <div class="mac-title">Nothing playing</div>
          <div class="mac-artist"></div>
          <div class="mac-progress-row"><span class="mac-elapsed">0:00</span><progress class="mac-progress" max="1" value="0"></progress><span class="mac-duration">0:00</span></div>
        </div>
      </div>
      <div class="mac-controls" aria-label="Playback controls"></div>
      <div class="mac-playlists" aria-label="Playlists"></div>`;
    this.root = root;
    this.statusEl = root.querySelector(".mac-status");
    this.playerButton = root.querySelector(".mac-player");
    this.playerList = root.querySelector(".mac-player-list");
    this.playerButton.addEventListener("click", () => this.togglePlayerMenu());
    const controls = [
      ["previous", "fa-step-backward", "Previous"],
      ["volumeDown", "fa-volume-down", "Volume down"],
      ["playPause", "fa-play", "Play or pause"],
      ["volumeUp", "fa-volume-up", "Volume up"],
      ["next", "fa-step-forward", "Next"]
    ];
    for (const [action, icon, label] of controls) {
      const button = this.makeButton(label, icon);
      button.dataset.action = action;
      button.addEventListener("click", () => this.runAction(action));
      root.querySelector(".mac-controls").appendChild(button);
    }
    for (const tile of this.config.playlists) {
      const button = this.makeTile(tile);
      root.querySelector(".mac-playlists").appendChild(button);
    }
    root.addEventListener("keydown", (event) => this.handleKey(event));
    this.domReady = true;
    this.renderState();
    clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => this.renderProgress(), 1000);
    return root;
  },

  makeButton(label, icon) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mac-control mac-focusable";
    button.setAttribute("aria-label", label);
    const glyph = document.createElement("i");
    glyph.className = `fa ${icon}`;
    glyph.setAttribute("aria-hidden", "true");
    button.appendChild(glyph);
    return button;
  },

  makeTile(tile) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mac-tile mac-focusable";
    button.setAttribute("aria-label", `Play ${tile.label || "playlist"}`);
    if (tile.cover) {
      const image = document.createElement("img");
      image.src = tile.cover;
      image.alt = "";
      button.appendChild(image);
    } else {
      const icon = document.createElement("i");
      icon.className = `fa fa-${tile.icon || "music"}`;
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);
    }
    const label = document.createElement("span");
    label.textContent = tile.label || "Playlist";
    button.appendChild(label);
    button.addEventListener("click", () => this.playPlaylist(tile.uri));
    return button;
  },

  togglePlayerMenu(force) {
    this.playerMenuOpen = typeof force === "boolean" ? force : !this.playerMenuOpen;
    this.renderPlayerList();
  },

  renderPlayerList() {
    if (!this.domReady) return;
    const available = Object.values(this.players).filter((player) =>
      player.available !== false && player.enabled !== false
    );
    this.playerList.replaceChildren();
    for (const player of available) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mac-player-option mac-focusable";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(player.player_id === this.selectedPlayerId));
      button.textContent = player.display_name || player.name || player.player_id;
      button.addEventListener("click", () => this.selectPlayer(player.player_id));
      this.playerList.appendChild(button);
    }
    this.playerList.hidden = !this.playerMenuOpen;
    this.playerButton.setAttribute("aria-expanded", String(this.playerMenuOpen));
    if (this.focusActive) this.refreshFocus();
  },

  renderState() {
    if (!this.domReady) return;
    const player = this.players[this.selectedPlayerId] || {};
    const state = MusicAssistantControllerCore.normalizeState(
      player,
      this.selectedQueue(),
      this.config.serverUrl
    );
    this.root.dataset.connection = this.connectionState;
    this.statusEl.textContent = this.statusText();
    this.playerButton.querySelector("span").textContent = state.playerName || "Select a player";
    this.root.querySelector(".mac-title").textContent = state.title;
    this.root.querySelector(".mac-artist").textContent = state.artist || state.state;
    const art = this.root.querySelector(".mac-art");
    const placeholder = this.root.querySelector(".mac-art-placeholder");
    if (state.artwork) {
      art.src = state.artwork;
      art.hidden = false;
      placeholder.hidden = true;
    } else {
      art.removeAttribute("src");
      art.hidden = true;
      placeholder.hidden = false;
    }
    const playIcon = this.root.querySelector('[data-action="playPause"] i');
    playIcon.className = `fa fa-${state.state === "playing" ? "pause" : "play"}`;
    this.currentState = state;
    this.renderProgress();
    this.renderPlayerList();
  },

  renderProgress() {
    if (!this.domReady || !this.currentState) return;
    let elapsed = this.currentState.elapsed;
    if (this.currentState.state === "playing") elapsed += 1;
    this.currentState.elapsed = Math.min(elapsed, this.currentState.duration || elapsed);
    this.root.querySelector(".mac-elapsed").textContent = this.formatTime(this.currentState.elapsed);
    this.root.querySelector(".mac-duration").textContent = this.formatTime(this.currentState.duration);
    const progress = this.root.querySelector(".mac-progress");
    progress.max = this.currentState.duration || 1;
    progress.value = this.currentState.elapsed;
  },

  formatTime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  },

  setStatus(state, detail) {
    this.connectionState = state;
    this.errorMessage = detail || "";
    this.renderState();
  },

  statusText() {
    if (this.connectionState === "connected") {
      return this.selectedPlayerId ? "" : "Connected · no players available";
    }
    if (this.connectionState === "connecting") return "Connecting to Music Assistant…";
    if (this.connectionState === "reconnecting") return "Connection lost · reconnecting…";
    if (this.connectionState === "error") return this.errorMessage || "Music Assistant error";
    return "Disconnected";
  },

  async sendBuilt(command) {
    if (!this.connection || this.connectionState !== "connected" || !this.selectedPlayerId) return;
    try {
      await this.connection.send(command.command, command.args);
    } catch (error) {
      this.setStatus("error", error.message);
      setTimeout(() => {
        if (this.connection && this.connection.authenticated) this.setStatus("connected");
      }, 4000);
    }
  },

  runAction(action) {
    const Core = MusicAssistantControllerCore;
    const player = this.players[this.selectedPlayerId];
    if (!player) return;
    if (action === "playPause") return this.sendBuilt(Core.COMMANDS.playPause(player.player_id));
    if (action === "next") return this.sendBuilt(Core.COMMANDS.next(player.player_id));
    if (action === "previous") return this.sendBuilt(Core.COMMANDS.previous(player.player_id));
    if (action === "volumeUp" || action === "volumeDown") {
      const direction = action === "volumeUp" ? 1 : -1;
      const level = (player.group_volume ?? player.volume_level ?? 0) + direction * this.config.volumeStep;
      return this.sendBuilt(Core.COMMANDS.volume(player.player_id, level));
    }
  },

  playPlaylist(uri) {
    if (!uri || !this.selectedPlayerId) return;
    return this.sendBuilt(MusicAssistantControllerCore.COMMANDS.playlist(this.selectedPlayerId, uri));
  },

  notificationReceived(notification) {
    const action = MusicAssistantControllerCore.notificationAction(notification);
    if (!action) return;
    if (["playPause", "next", "previous", "volumeUp", "volumeDown"].includes(action)) this.runAction(action);
    else if (action === "focusNext") this.moveFocus(1);
    else if (action === "focusPrevious") this.moveFocus(-1);
    else if (action === "activate") this.activateFocus();
    else if (action === "back") this.back();
  },

  handleKey(event) {
    if (["ArrowRight", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      this.moveFocus(1);
    } else if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      this.moveFocus(-1);
    } else if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      this.activateFocus();
    } else if (event.key === "Escape") {
      this.back();
    }
  },

  focusables() {
    return this.domReady
      ? Array.from(this.root.querySelectorAll(".mac-focusable:not([hidden])"))
        .filter((element) => element.offsetParent !== null)
      : [];
  },

  moveFocus(delta) {
    const items = this.focusables();
    if (!items.length) return;
    this.focusActive = true;
    this.focusIndex = (this.focusIndex + delta + items.length) % items.length;
    this.refreshFocus();
  },

  refreshFocus() {
    const items = this.focusables();
    if (!items.length) return;
    this.focusIndex = Math.min(this.focusIndex, items.length - 1);
    items.forEach((element, index) => element.classList.toggle("mac-encoder-focus", index === this.focusIndex));
    items[this.focusIndex].focus({ preventScroll: true });
  },

  activateFocus() {
    const items = this.focusables();
    if (items[this.focusIndex]) items[this.focusIndex].click();
  },

  back() {
    if (this.playerMenuOpen) {
      this.togglePlayerMenu(false);
      this.focusIndex = 0;
      this.refreshFocus();
    } else {
      this.focusActive = false;
      if (this.root && this.root.contains(document.activeElement)) document.activeElement.blur();
      this.root?.querySelectorAll(".mac-encoder-focus").forEach((element) =>
        element.classList.remove("mac-encoder-focus")
      );
    }
  },

  suspend() {
    clearInterval(this.progressTimer);
  },

  resume() {
    clearInterval(this.progressTimer);
    this.progressTimer = setInterval(() => this.renderProgress(), 1000);
  }
});
