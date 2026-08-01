/* global Module, Log, MusicAssistantControllerCore, MusicAssistantConnection */
"use strict";

Module.register("MMM-MusicAssistant-Controller", {
  defaults: {
    serverUrl: "http://music-assistant.local:8095",
    tokenFile: "",
    playerId: "",
    compact: false,
    volumeStep: 5,
    playlists: [],
    reconnectBaseDelay: 1000,
    reconnectMaxDelay: 30000
  },

  getScripts() {
    return [
      this.file("lib/core.js"),
      this.file("lib/connection.js")
    ];
  },

  getStyles() {
    return ["MMM-MusicAssistant-Controller.css", "font-awesome.css"];
  },

  getTranslations() {
    return {
      en: "translations/en.json",
      bg: "translations/bg.json",
      da: "translations/da.json",
      de: "translations/de.json",
      es: "translations/es.json",
      fr: "translations/fr.json",
      hu: "translations/hu.json",
      nl: "translations/nl.json",
      ru: "translations/ru.json",
      th: "translations/th.json"
    };
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
    this.lastBroadcastState = "";
    this.lastConnectionBroadcast = "";
    this.boundFitViewport = () => this.fitViewport();
    if (!this.config.tokenFile) {
      this.setStatus("error", this.translate("CONFIGURE_TOKEN_FILE"));
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
      this.setStatus("error", this.translate("TOKEN_FILE_ERROR", { error: payload.error }));
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
    if (this.config.playerId) {
      this.selectedPlayerId = this.config.playerId;
      this.playerMenuOpen = false;
      return;
    }
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

  availablePlayers() {
    return Object.values(this.players).filter((player) =>
      player && player.player_id && player.available !== false && player.enabled !== false
    );
  },

  hidesPlayerSelector() {
    return Boolean(this.config.playerId) || this.availablePlayers().length <= 1;
  },

  playerSelectorMarkup() {
    if (this.config.playerId) return "";
    return `
      <button class="mac-player mac-focusable" type="button" aria-haspopup="listbox">
        <i class="fa fa-volume-up" aria-hidden="true"></i><span>${this.translate("SELECT_PLAYER")}</span>
        <i class="fa fa-chevron-down" aria-hidden="true"></i>
      </button>
      <div class="mac-player-list" role="listbox" hidden></div>`;
  },

  rootClassName() {
    return `mac${this.config.compact ? " mac-compact" : ""}`;
  },

  getDom() {
    const root = document.createElement("section");
    root.className = this.rootClassName();
    root.setAttribute("aria-label", this.translate("CONTROLLER_LABEL"));
    root.innerHTML = `
      <div class="mac-status" role="status"></div>
      ${this.playerSelectorMarkup()}
      <div class="mac-now">
        <div class="mac-art-wrap"><img class="mac-art" alt="" hidden><i class="fa fa-music mac-art-placeholder" aria-hidden="true"></i></div>
        <div class="mac-meta">
          <div class="mac-title">${this.translate("NOTHING_PLAYING")}</div>
          <div class="mac-artist"></div>
          <div class="mac-progress-row"><span class="mac-elapsed">0:00</span><progress class="mac-progress" max="1" value="0"></progress><span class="mac-duration">0:00</span></div>
        </div>
      </div>
      <div class="mac-controls" aria-label="${this.translate("PLAYBACK_CONTROLS")}"></div>
      <div class="mac-playlists" aria-label="${this.translate("PLAYLISTS")}"></div>`;
    this.root = root;
    this.statusEl = root.querySelector(".mac-status");
    this.playerButton = root.querySelector(".mac-player");
    this.playerList = root.querySelector(".mac-player-list");
    if (this.playerButton) {
      this.playerButton.addEventListener("click", () => this.togglePlayerMenu());
    }
    const controls = [
      ["previous", "fa-step-backward", this.translate("PREVIOUS")],
      ["volumeDown", "fa-volume-down", this.translate("VOLUME_DOWN")],
      ["playPause", "fa-play", this.translate("PLAY_PAUSE")],
      ["volumeUp", "fa-volume-up", this.translate("VOLUME_UP")],
      ["next", "fa-step-forward", this.translate("NEXT")]
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
    requestAnimationFrame(() => {
      this.fitViewport();
      window.addEventListener("resize", this.boundFitViewport);
    });
    return root;
  },

  fitViewport() {
    if (!this.root || !this.root.isConnected) return;
    this.root.style.maxWidth = "";
    const left = Math.max(0, this.root.getBoundingClientRect().left);
    const available = Math.max(280, window.innerWidth - left - 12);
    this.root.style.maxWidth = `${Math.floor(available)}px`;
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
    const tileLabel = tile.label || this.translate("PLAYLIST");
    button.setAttribute("aria-label", this.translate("PLAY_PLAYLIST", { playlist: tileLabel }));
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
    label.textContent = tileLabel;
    button.appendChild(label);
    button.addEventListener("click", () => this.playPlaylist(tile.uri));
    return button;
  },

  togglePlayerMenu(force) {
    if (this.hidesPlayerSelector()) return;
    this.playerMenuOpen = typeof force === "boolean" ? force : !this.playerMenuOpen;
    this.renderPlayerList();
  },

  renderPlayerList() {
    if (!this.domReady || !this.playerButton || !this.playerList) return;
    const available = this.availablePlayers();
    const selectorHidden = this.hidesPlayerSelector();
    if (selectorHidden) this.playerMenuOpen = false;
    this.playerButton.hidden = selectorHidden;
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
    this.playerList.hidden = selectorHidden || !this.playerMenuOpen;
    this.playerButton.setAttribute("aria-expanded", String(this.playerMenuOpen));
    if (this.focusActive) this.refreshFocus();
  },

  renderState() {
    if (!this.domReady) return;
    const player = this.players[this.selectedPlayerId] || {};
    const queue = this.selectedQueue();
    const state = MusicAssistantControllerCore.normalizeState(
      player,
      queue,
      this.config.serverUrl
    );
    if (!player.display_name && !player.name) state.playerName = this.translate("PLAYER");
    if (!queue.current_item && !player.current_media?.title) {
      state.title = this.translate("NOTHING_PLAYING");
    }
    this.root.dataset.connection = this.connectionState;
    this.statusEl.textContent = this.statusText();
    if (this.playerButton) {
      this.playerButton.querySelector("span").textContent = state.playerName || this.translate("SELECT_PLAYER");
    }
    this.root.querySelector(".mac-title").textContent = state.title;
    this.root.querySelector(".mac-artist").textContent = state.artist || this.playbackStateText(state.state);
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
    this.broadcastState(state);
  },

  playbackStateText(state) {
    const key = ({
      playing: "STATE_PLAYING",
      paused: "STATE_PAUSED",
      stopped: "STATE_STOPPED",
      idle: "STATE_IDLE"
    })[state] || "STATE_UNKNOWN";
    return this.translate(key);
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
    this.broadcastConnection();
  },

  statusText() {
    if (this.connectionState === "connected") {
      if (!this.selectedPlayerId) return this.translate("CONNECTED_NO_PLAYERS");
      if (!this.players[this.selectedPlayerId]) {
        return this.config.playerId
          ? this.translate("CONFIGURED_PLAYER_UNAVAILABLE")
          : this.translate("SELECTED_PLAYER_UNAVAILABLE");
      }
      return "";
    }
    if (this.connectionState === "connecting") return this.translate("CONNECTING");
    if (this.connectionState === "reconnecting") return this.translate("RECONNECTING");
    if (this.connectionState === "error") return this.errorMessage || this.translate("MUSIC_ASSISTANT_ERROR");
    return this.translate("DISCONNECTED");
  },

  broadcastConnection() {
    if (typeof this.sendNotification !== "function") return;
    const payload = { state: this.connectionState, error: this.errorMessage || "" };
    const signature = JSON.stringify(payload);
    if (signature === this.lastConnectionBroadcast) return;
    this.lastConnectionBroadcast = signature;
    this.sendNotification("MUSIC_CONNECTION_CHANGED", payload);
  },

  broadcastState(state) {
    if (typeof this.sendNotification !== "function" || !state) return;
    const payload = {
      playerId: state.playerId || this.selectedPlayerId || "",
      state: state.state,
      title: state.title,
      artist: state.artist,
      volume: state.volume,
      elapsed: state.elapsed,
      duration: state.duration
    };
    const signature = JSON.stringify(payload);
    if (signature === this.lastBroadcastState) return;
    this.lastBroadcastState = signature;
    this.sendNotification("MUSIC_STATE_CHANGED", payload);
  },

  async sendBuilt(command) {
    if (!this.connection || this.connectionState !== "connected" || !command) return;
    try {
      await this.connection.send(command.command, command.args);
    } catch (error) {
      this.setStatus("error", error.message);
      setTimeout(() => {
        if (this.connection && this.connection.authenticated) this.setStatus("connected");
      }, 4000);
    }
  },

  targetPlayerId(payload) {
    return this.config.playerId || payload?.playerId || this.selectedPlayerId || "";
  },

  runAction(action, payload) {
    const Core = MusicAssistantControllerCore;
    const playerId = this.targetPlayerId(payload);
    if (!playerId) return;
    const player = this.players[playerId] || {};
    if (action === "play") return this.sendBuilt(Core.COMMANDS.play(playerId));
    if (action === "pause") return this.sendBuilt(Core.COMMANDS.pause(playerId));
    if (action === "stop") return this.sendBuilt(Core.COMMANDS.stop(playerId));
    if (action === "playPause") return this.sendBuilt(Core.COMMANDS.playPause(playerId));
    if (action === "next") return this.sendBuilt(Core.COMMANDS.next(playerId));
    if (action === "previous") return this.sendBuilt(Core.COMMANDS.previous(playerId));
    if (action === "volumeUp" || action === "volumeDown") {
      const direction = action === "volumeUp" ? 1 : -1;
      const level = (player.group_volume ?? player.volume_level ?? 0) + direction * this.config.volumeStep;
      return this.sendBuilt(Core.COMMANDS.volume(playerId, level));
    }
  },

  playPlaylist(uri) {
    return this.playUri(uri);
  },

  playUri(payload) {
    const uri = typeof payload === "string" ? payload : payload?.uri;
    const playerId = this.targetPlayerId(typeof payload === "object" ? payload : null);
    if (typeof uri !== "string" || !uri.trim() || !playerId) return;
    return this.sendBuilt(MusicAssistantControllerCore.COMMANDS.playlist(playerId, uri.trim()));
  },

  setVolume(payload) {
    const volume = typeof payload === "object" && payload !== null ? payload.volume : payload;
    const playerId = this.targetPlayerId(typeof payload === "object" ? payload : null);
    if (typeof volume !== "number" || !Number.isFinite(volume) || !playerId) return;
    return this.sendBuilt(MusicAssistantControllerCore.COMMANDS.volume(playerId, volume));
  },

  selectPlayerFromNotification(payload) {
    if (this.config.playerId) return;
    const playerId = typeof payload === "string" ? payload : payload?.playerId;
    if (!playerId || !this.availablePlayers().some((player) => player.player_id === playerId)) return;
    this.selectPlayer(playerId);
  },

  notificationReceived(notification, payload) {
    const action = MusicAssistantControllerCore.notificationAction(notification);
    if (!action) return;
    if (["play", "pause", "stop", "playPause", "next", "previous", "volumeUp", "volumeDown"].includes(action)) {
      this.runAction(action, payload);
    } else if (action === "playUri") this.playUri(payload);
    else if (action === "setVolume") this.setVolume(payload);
    else if (action === "selectPlayer") this.selectPlayerFromNotification(payload);
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
