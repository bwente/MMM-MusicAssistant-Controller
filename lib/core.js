(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MusicAssistantControllerCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const COMMANDS = Object.freeze({
    playPause: (playerId) => command("players/cmd/play_pause", { player_id: playerId }),
    next: (playerId) => command("players/cmd/next", { player_id: playerId }),
    previous: (playerId) => command("players/cmd/previous", { player_id: playerId }),
    volume: (playerId, level) => command("players/cmd/volume_set", {
      player_id: playerId,
      volume_level: clamp(Math.round(level), 0, 100)
    }),
    playlist: (playerId, uri) => command("player_queues/play_media", {
      queue_id: playerId,
      media: uri,
      option: "replace"
    })
  });

  function command(name, args) {
    return { command: name, args: args || {} };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    return value && typeof value === "object" ? Object.values(value) : [];
  }

  function resolvePlayer(players, requestedId, storedId) {
    const available = asArray(players).filter((player) =>
      player && player.player_id && player.available !== false && player.enabled !== false
    );
    return available.find((player) => player.player_id === requestedId) ||
      available.find((player) => player.player_id === storedId) ||
      available[0] ||
      null;
  }

  function normalizeState(player, queue, baseUrl) {
    player = player || {};
    queue = queue || {};
    const item = queue.current_item || {};
    const media = item.media_item || {};
    const artists = media.artists || [];
    const elapsed = Number(queue.elapsed_time || player.elapsed_time || 0);
    const duration = Number(item.duration || media.duration || player.current_media?.duration || 0);
    const image = item.image || media.image || media.metadata?.images?.[0];
    const rawImage = typeof image === "string" ? image : image?.path || image?.url || "";
    let artwork = rawImage;
    const cleanBase = String(baseUrl || "").replace(/\/$/, "");
    if (image?.proxy_id && cleanBase) {
      artwork = `${cleanBase}/imageproxy/${encodeURIComponent(image.proxy_id)}?size=256`;
    } else if (rawImage && !/^https?:\/\//i.test(rawImage) && cleanBase) {
      artwork = `${cleanBase}/imageproxy?path=${encodeURIComponent(rawImage)}` +
        `&provider=${encodeURIComponent(image?.provider || "builtin")}&size=256`;
    }
    return {
      playerId: player.player_id || queue.queue_id || "",
      playerName: player.display_name || player.name || "Player",
      state: String(queue.state || player.playback_state || player.state || "idle").toLowerCase(),
      title: media.name || item.name || player.current_media?.title || "Nothing playing",
      artist: artists.map((artist) => artist.name).filter(Boolean).join(", ") ||
        media.artist_str || item.media_item?.artist || player.current_media?.artist || "",
      elapsed: clamp(elapsed, 0, duration || Number.MAX_SAFE_INTEGER),
      duration: Math.max(0, duration),
      volume: clamp(player.group_volume ?? player.volume_level ?? 0, 0, 100),
      artwork
    };
  }

  function applyEvent(state, message) {
    if (!message || !message.event) return state;
    const next = {
      players: Object.assign({}, state.players),
      queues: Object.assign({}, state.queues)
    };
    const data = message.data;
    const id = message.object_id || data?.player_id || data?.queue_id;
    if ((message.event === "player_added" || message.event === "player_updated") && id && data) {
      next.players[id] = Object.assign({}, next.players[id], data);
    }
    if (message.event === "player_removed" && id) delete next.players[id];
    if ((message.event === "queue_added" || message.event === "queue_updated") && id && data) {
      next.queues[id] = Object.assign({}, next.queues[id], data);
    }
    if (message.event === "queue_time_updated" && id) {
      next.queues[id] = Object.assign({}, next.queues[id], { elapsed_time: Number(data) || 0 });
    }
    return next;
  }

  function nextReconnectDelay(attempt, base, maximum, random) {
    const jitter = typeof random === "function" ? random() : Math.random();
    return Math.round(Math.min(maximum, base * (2 ** Math.max(0, attempt))) * (0.8 + jitter * 0.4));
  }

  function notificationAction(notification) {
    return ({
      MUSIC_PLAY_PAUSE: "playPause",
      MUSIC_NEXT: "next",
      MUSIC_PREVIOUS: "previous",
      MUSIC_VOLUME_UP: "volumeUp",
      MUSIC_VOLUME_DOWN: "volumeDown",
      MUSIC_CONTROL_UP: "focusPrevious",
      MUSIC_CONTROL_LEFT: "focusPrevious",
      MUSIC_CONTROL_DOWN: "focusNext",
      MUSIC_CONTROL_RIGHT: "focusNext",
      MUSIC_CONTROL_SELECT: "activate",
      MUSIC_CONTROL_BACK: "back"
    })[notification] || null;
  }

  return {
    COMMANDS,
    applyEvent,
    clamp,
    command,
    nextReconnectDelay,
    normalizeState,
    notificationAction,
    resolvePlayer
  };
});
