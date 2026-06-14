// websocket.js — WebSocket connection and message dispatch
//
// Load order: ui.js → websocket.js → ...
//
// Provides:
//   window.sendToServer(data)    — JSON-encodes + sends to server
//   window.messageHandlers       — { type: fn } dispatch table (populated by room.js)
//   window.onWsConnect()         — lifecycle hook (overridden by room.js)
//   window.onWsDisconnect()      — lifecycle hook (overridden by room.js)
//
// Uses window.ui and window.logToConsole (both defined by ui.js, which loads first).

const WS_URL = "ws://localhost:8000/ws";

let socket = null;

// ── Public globals ────────────────────────────────────────────────────────────
window.messageHandlers = {};
window.onWsConnect     = () => {};   // room.js overrides this
window.onWsDisconnect  = () => {};   // room.js overrides this

window.sendToServer = function (data) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    window.logToConsole("Cannot send — not connected to server.", "error");
    return;
  }
  socket.send(JSON.stringify(data));
};

// ── Connect ───────────────────────────────────────────────────────────────────
function connect() {
  if (socket && socket.readyState === WebSocket.OPEN) return;

  window.ui.setConnectionStatus("connecting", "Connecting to server...");
  window.ui.setConnectButtons(false, false);   // both disabled while connecting
  window.logToConsole(`Connecting to ${WS_URL}…`, "system");

  socket = new WebSocket(WS_URL);

  // ── open ──────────────────────────────────────────────────────────────────
  socket.addEventListener("open", () => {
    window.ui.setConnectionStatus("connected", "Connected to signaling server");
    window.ui.setConnectButtons(false, true);  // only Disconnect enabled
    window.logToConsole("WebSocket connection established.", "success");
    window.onWsConnect();
  });

  // ── message ───────────────────────────────────────────────────────────────
  socket.addEventListener("message", ({ data: raw }) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      window.logToConsole(`Server (raw): ${raw}`, "info");
      return;
    }

    // welcome is handled here; all other types dispatched to room.js
    if (msg.type === "welcome") {
      window.logToConsole(`Server: ${msg.message}`, "success");
      return;
    }

    const handler = window.messageHandlers[msg.type];
    if (typeof handler === "function") {
      handler(msg);
    } else {
      window.logToConsole(`[${msg.type}] ${JSON.stringify(msg)}`, "info");
    }
  });

  // ── close ─────────────────────────────────────────────────────────────────
  socket.addEventListener("close", (e) => {
    window.ui.setConnectionStatus("disconnected", "Disconnected from server");
    window.ui.setConnectButtons(true, false);  // only Connect enabled
    window.logToConsole(`Disconnected (code ${e.code})`, "system");
    socket = null;
    window.onWsDisconnect();
  });

  // ── error ─────────────────────────────────────────────────────────────────
  socket.addEventListener("error", () => {
    window.ui.setConnectionStatus("error", "Connection error");
    window.ui.setConnectButtons(true, false);
    window.logToConsole("Connection error — is the backend running on port 8000?", "error");
  });
}

// ── Disconnect ────────────────────────────────────────────────────────────────
function disconnect() {
  if (!socket) return;
  window.logToConsole("Disconnecting…", "system");
  socket.close(1000, "User disconnected");
}

// ── Button listeners ──────────────────────────────────────────────────────────
window.ui.DOM.connectBtn.addEventListener("click", connect);
window.ui.DOM.disconnectBtn.addEventListener("click", disconnect);
