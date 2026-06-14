// room.js — Room management (Phase 2)
//
// Load order: ui.js → websocket.js → ... → room.js  (last)
//
// Registers window.messageHandlers entries for all room and signaling messages.
// Sets window.onWsConnect / window.onWsDisconnect lifecycle hooks.
// Uses window.ui.* for all DOM updates — no direct DOM access here.

// ── Room state ────────────────────────────────────────────────────────────────
let roomId   = null;   // active room ID, e.g. "AB12CD"
let roomRole = null;   // "host" | "guest" | null

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetRoom() {
  roomId   = null;
  roomRole = null;
  window.ui.setRoomBadge("idle", "No Room");
  window.ui.showRoomActions();
  window.ui.setRoomActionsEnabled(true);
}

// ── Create room ───────────────────────────────────────────────────────────────

function createRoom() {
  window.sendToServer({ type: "create_room" });
  window.logToConsole("Requesting new room from server...", "system");
  window.ui.setRoomActionsEnabled(false);
}

// ── Join room ─────────────────────────────────────────────────────────────────

function joinRoom() {
  const id = window.ui.getRoomInput().trim().toUpperCase();

  if (id.length === 0) {
    window.logToConsole("Please enter a Room ID.", "error");
    return;
  }
  if (id.length !== 6) {
    window.logToConsole("Room ID must be exactly 6 characters.", "error");
    return;
  }

  window.sendToServer({ type: "join_room", room_id: id });
  window.logToConsole(`Joining room ${id}...`, "system");
  window.ui.setRoomActionsEnabled(false);
}

// ── Incoming message handlers ─────────────────────────────────────────────────

window.messageHandlers["room_created"] = function (data) {
  roomId   = data.room_id;
  roomRole = "host";

  window.ui.setRoomBadge("waiting", "Waiting for Peer");
  window.ui.showRoomInfo(roomId, "Waiting for peer to join...");
  window.logToConsole(`Room Created: ${roomId}`, "success");
  window.logToConsole("Share this Room ID with your peer.", "info");
};

window.messageHandlers["joined_room"] = function (data) {
  roomId   = data.room_id;
  roomRole = "guest";

  window.ui.setRoomBadge("in-room", "In Room");
  window.ui.showRoomInfo(roomId, "Joined — waiting for host offer...");
  window.logToConsole(`Joined Room: ${roomId}`, "success");
};

window.messageHandlers["peer_joined"] = function (_data) {
  window.ui.setRoomBadge("in-room", "Peer Joined");
  window.ui.setRoomInfoMsg("Peer joined — initiating WebRTC...");
  window.logToConsole("Peer Joined", "success");

  // Phase 3 will fill this in — no-op stub in Phase 2
  window.webrtc.startAsHost(roomId).catch((err) => {
    window.logToConsole(`WebRTC host error: ${err.message}`, "error");
  });
};

window.messageHandlers["offer"] = function (data) {
  // Phase 3 will fill this in — no-op stub in Phase 2
  window.webrtc.startAsGuest(roomId, data.offer).catch((err) => {
    window.logToConsole(`WebRTC guest error: ${err.message}`, "error");
  });
};

window.messageHandlers["answer"] = function (data) {
  window.webrtc.handleAnswer(data.answer).catch((err) => {
    window.logToConsole(`Answer error: ${err.message}`, "error");
  });
};

window.messageHandlers["ice_candidate"] = function (data) {
  window.webrtc.handleIceCandidate(data.candidate).catch((err) => {
    window.logToConsole(`ICE error: ${err.message}`, "error");
  });
};

window.messageHandlers["peer_disconnected"] = function (data) {
  window.webrtc.cleanup();
  window.ui.setRoomBadge("waiting", "Waiting for Peer");
  window.ui.setRoomInfoMsg("Peer disconnected — waiting for new peer...");
  window.logToConsole(`Peer Disconnected: ${data.message || "Peer left the room."}`, "error");
};

window.messageHandlers["room_closed"] = function (data) {
  window.webrtc.cleanup();
  window.logToConsole(`Room Closed: ${data.message || "Host closed the room."}`, "error");
  resetRoom();
  window.ui.setRoomBadge("closed", "Room Closed");
};

window.messageHandlers["error"] = function (data) {
  window.logToConsole(`Error: ${data.message}`, "error");
  window.ui.setRoomActionsEnabled(true);
};

// ── WebSocket lifecycle hooks ─────────────────────────────────────────────────

window.onWsConnect = function () {
  window.ui.showSection("room-section");
  resetRoom();
  window.logToConsole("Ready — create or join a room.", "system");
};

window.onWsDisconnect = function () {
  window.webrtc.cleanup();
  window.ui.hideSection("room-section");
  window.ui.hideSection("webrtc-section");
  window.ui.hideTransferSection();
  window.ui.hideSection("progress-section");
  window.ui.hideSection("verification-section");
  window.ui.hideSection("security-section");
  resetRoom();
};

// ── Button and input listeners ────────────────────────────────────────────────

window.ui.DOM.createRoomBtn.addEventListener("click", createRoom);
window.ui.DOM.joinRoomBtn.addEventListener("click", joinRoom);

window.ui.DOM.roomIdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinRoom();
});

// Auto-uppercase while typing — keeps cursor position intact
window.ui.DOM.roomIdInput.addEventListener("input", () => {
  const input  = window.ui.DOM.roomIdInput;
  const cursor = input.selectionStart;
  input.value  = input.value.toUpperCase();
  input.setSelectionRange(cursor, cursor);
});
