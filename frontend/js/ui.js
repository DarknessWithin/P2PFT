// ui.js — Central DOM management module
//
// Load order: ui.js FIRST — all other scripts depend on window.ui and window.logToConsole
//
// RULE: No other JS file may call document.getElementById or mutate the DOM directly.
//       All DOM access goes through window.ui.* functions defined here.

// ── DOM element references (resolved once at parse time) ──────────────────────
const DOM = {
  // Server section
  statusDot:        document.getElementById("status-dot"),
  statusText:       document.getElementById("status-text"),
  connectionBadge:  document.getElementById("connection-badge"),
  connectBtn:       document.getElementById("connect-btn"),
  disconnectBtn:    document.getElementById("disconnect-btn"),

  // Room section
  roomSection:      document.getElementById("room-section"),
  roomBadge:        document.getElementById("room-badge"),
  roomIdDisplay:    document.getElementById("room-id-display"),
  roomActions:      document.getElementById("room-actions"),
  createRoomBtn:    document.getElementById("create-room-btn"),
  roomIdInput:      document.getElementById("room-id-input"),
  joinRoomBtn:      document.getElementById("join-room-btn"),
  roomInfo:         document.getElementById("room-info"),
  roomInfoCode:     document.getElementById("room-info-code"),
  roomInfoMsg:      document.getElementById("room-info-msg"),

  // WebRTC section
  webrtcSection:    document.getElementById("webrtc-section"),
  webrtcRole:       document.getElementById("webrtc-role"),
  webrtcSignaling:  document.getElementById("webrtc-signaling"),
  webrtcIce:        document.getElementById("webrtc-ice"),
  webrtcConn:       document.getElementById("webrtc-conn"),
  webrtcBadge:      document.getElementById("webrtc-badge"),

  // Transfer section
  transferSection:  document.getElementById("transfer-section"),
  senderPanel:      document.getElementById("sender-panel"),
  receiverPanel:    document.getElementById("receiver-panel"),
  dropZone:         document.getElementById("drop-zone"),
  fileInput:        document.getElementById("file-input"),
  fileInfoRow:      document.getElementById("file-info-row"),
  fileNameDisplay:  document.getElementById("file-name-display"),
  fileSizeDisplay:  document.getElementById("file-size-display"),
  clearFileBtn:     document.getElementById("clear-file-btn"),
  sendFileBtn:      document.getElementById("send-file-btn"),
  senderStatus:     document.getElementById("sender-status"),
  receiverHeading:  document.getElementById("receiver-heading"),
  receiverStatus:   document.getElementById("receiver-status"),

  // Progress section
  progressSection:  document.getElementById("progress-section"),
  progressFill:     document.getElementById("progress-fill"),
  progressPercent:  document.getElementById("progress-percent"),
  statBytes:        document.getElementById("stat-bytes"),
  statSpeed:        document.getElementById("stat-speed"),
  statRemaining:    document.getElementById("stat-remaining"),
  statEta:          document.getElementById("stat-eta"),

  // Verification section
  verificationSection: document.getElementById("verification-section"),
  verificationResult:  document.getElementById("verification-result"),
  hashDisplay:         document.getElementById("hash-display"),
  hashSent:            document.getElementById("hash-sent"),
  hashReceived:        document.getElementById("hash-received"),

  // Security section
  securitySection:  document.getElementById("security-section"),
  encryptionBadge:  document.getElementById("encryption-badge"),

  // Console
  consoleOutput:    document.getElementById("console-output"),
  clearConsoleBtn:  document.getElementById("clear-console-btn"),
};

// ── Console ───────────────────────────────────────────────────────────────────
// type: "success" | "error" | "system" | "info" | ""

function addLog(text, type = "info") {
  const ts   = new Date().toLocaleTimeString("en-US", { hour12: false });
  const line = document.createElement("div");
  line.className = `console-line ${type}`;
  line.innerHTML = `<span class="console-time">[${ts}]</span> ${text}`;

  const placeholder = DOM.consoleOutput.querySelector(".console-placeholder");
  if (placeholder) placeholder.remove();

  DOM.consoleOutput.appendChild(line);
  DOM.consoleOutput.scrollTop = DOM.consoleOutput.scrollHeight;
}

function clearLog() {
  DOM.consoleOutput.innerHTML = '<p class="console-placeholder">Console cleared.</p>';
}

DOM.clearConsoleBtn.addEventListener("click", clearLog);

// ── Connection status ─────────────────────────────────────────────────────────
// state: "disconnected" | "connecting" | "connected" | "error"

function setConnectionStatus(state, text) {
  DOM.statusDot.className   = `status-dot ${state}`;
  DOM.statusText.textContent = text;

  const labels = {
    disconnected: "● Disconnected",
    connecting:   "◌ Connecting...",
    connected:    "● Connected",
    error:        "● Error",
  };
  DOM.connectionBadge.textContent = labels[state] ?? text;
  DOM.connectionBadge.className   = `conn-badge ${state}`;
}

// ── Connect / Disconnect button states ────────────────────────────────────────
// connectEnabled:    true = Connect button is clickable
// disconnectEnabled: true = Disconnect button is clickable

function setConnectButtons(connectEnabled, disconnectEnabled) {
  DOM.connectBtn.disabled    = !connectEnabled;
  DOM.disconnectBtn.disabled = !disconnectEnabled;
}

// ── Generic section show / hide ───────────────────────────────────────────────

function showSection(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

function hideSection(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

// ── Room ──────────────────────────────────────────────────────────────────────
// state: "idle" | "waiting" | "in-room" | "closed"

function setRoomBadge(state, text) {
  DOM.roomBadge.className   = `room-badge ${state}`;
  DOM.roomBadge.textContent = text;
}

function setRoomIdDisplay(id) {
  DOM.roomIdDisplay.textContent = id;
}

function showRoomActions() {
  DOM.roomActions.hidden        = false;
  DOM.roomInfo.hidden           = true;
  DOM.roomIdDisplay.textContent = "";
}

function showRoomInfo(id, msg) {
  DOM.roomActions.hidden         = true;
  DOM.roomInfo.hidden            = false;
  DOM.roomInfoCode.textContent   = id;
  DOM.roomInfoMsg.textContent    = msg;
  DOM.roomIdDisplay.textContent  = id;
}

function setRoomInfoMsg(msg) {
  DOM.roomInfoMsg.textContent = msg;
}

function setRoomActionsEnabled(enabled) {
  DOM.createRoomBtn.disabled = !enabled;
  DOM.joinRoomBtn.disabled   = !enabled;
  DOM.roomIdInput.disabled   = !enabled;
}

function getRoomInput() {
  return DOM.roomIdInput.value;
}

function clearRoomInput() {
  DOM.roomIdInput.value = "";
}

// ── WebRTC ────────────────────────────────────────────────────────────────────
// state: "not-connected" | "connecting" | "connected"

function setWebRTCBadge(state, text) {
  DOM.webrtcBadge.className   = `webrtc-badge ${state}`;
  DOM.webrtcBadge.textContent = text;
}

function updateWebRTCStats(role, signaling, ice, conn) {
  if (role      !== null) DOM.webrtcRole.textContent      = role;
  if (signaling !== null) DOM.webrtcSignaling.textContent = signaling;
  if (ice       !== null) DOM.webrtcIce.textContent       = ice;
  if (conn      !== null) DOM.webrtcConn.textContent      = conn;
}

// ── Transfer ──────────────────────────────────────────────────────────────────

function showSenderPanel() {
  DOM.transferSection.hidden = false;
  DOM.senderPanel.hidden     = false;
  DOM.receiverPanel.hidden   = true;
}

function showReceiverPanel() {
  DOM.transferSection.hidden = false;
  DOM.senderPanel.hidden     = true;
  DOM.receiverPanel.hidden   = false;
}

function hideTransferSection() {
  DOM.transferSection.hidden = true;
  DOM.senderPanel.hidden     = true;
  DOM.receiverPanel.hidden   = true;
}

function updateFileInfo(name, size) {
  DOM.fileNameDisplay.textContent = name;
  DOM.fileSizeDisplay.textContent = size;
  DOM.fileInfoRow.hidden          = false;
  DOM.dropZone.classList.add("has-file");
}

function clearFileInfo() {
  DOM.fileInfoRow.hidden          = true;
  DOM.fileNameDisplay.textContent = "";
  DOM.fileSizeDisplay.textContent = "";
  DOM.sendFileBtn.disabled        = true;
  DOM.dropZone.classList.remove("has-file");
}

function setSendBtnEnabled(enabled) {
  DOM.sendFileBtn.disabled = !enabled;
}

function setSenderStatus(text, type = "") {
  DOM.senderStatus.textContent = text;
  DOM.senderStatus.className   = `sender-status ${type}`;
  DOM.senderStatus.hidden      = !text;
}

function setReceiverStatus(heading, status) {
  if (heading !== null) DOM.receiverHeading.textContent = heading;
  if (status  !== null) DOM.receiverStatus.textContent  = status;
}

function resetSenderUI() {
  clearFileInfo();
  setSenderStatus("", "");
  DOM.fileInput.value = "";
}

// ── Progress ──────────────────────────────────────────────────────────────────

function showProgressSection() {
  DOM.progressSection.hidden = false;
}

function hideProgressSection() {
  DOM.progressSection.hidden = true;
}

function updateProgress(percent, speed, eta, bytesSent, remaining) {
  const pct = Math.min(100, Math.max(0, percent));
  DOM.progressFill.style.width    = `${pct}%`;
  DOM.progressPercent.textContent = `${Math.round(pct)}%`;
  DOM.statSpeed.textContent       = speed     ?? "—";
  DOM.statEta.textContent         = eta       ?? "—";
  DOM.statBytes.textContent       = bytesSent ?? "—";
  DOM.statRemaining.textContent   = remaining ?? "—";

  if (pct > 0 && pct < 100) {
    DOM.progressFill.classList.add("active");
  } else {
    DOM.progressFill.classList.remove("active");
  }
}

function resetProgress() {
  updateProgress(0, "—", "—", "—", "—");
}

// ── Verification ──────────────────────────────────────────────────────────────

function showVerification(verified, sentHash, receivedHash) {
  DOM.verificationSection.hidden = false;

  if (verified) {
    DOM.verificationResult.className = "verification-result verified";
    DOM.verificationResult.innerHTML = "✅ <strong>File Verified Successfully</strong> — SHA-256 hash matches";
  } else {
    DOM.verificationResult.className = "verification-result corrupted";
    DOM.verificationResult.innerHTML = "❌ <strong>File Corrupted</strong> — SHA-256 hash mismatch";
  }

  if (sentHash && receivedHash) {
    DOM.hashDisplay.hidden       = false;
    DOM.hashSent.textContent     = sentHash;
    DOM.hashReceived.textContent = receivedHash;
  }
}

function hideVerification() {
  DOM.verificationSection.hidden = true;
  DOM.hashDisplay.hidden         = true;
}

// ── Encryption badge ──────────────────────────────────────────────────────────

function showEncryptionBadge() {
  DOM.securitySection.hidden = false;
}

function hideEncryptionBadge() {
  DOM.securitySection.hidden = true;
}

// ── Expose public API ─────────────────────────────────────────────────────────
window.ui = {
  // Console
  addLog,
  clearLog,

  // Connection
  setConnectionStatus,
  setConnectButtons,

  // Generic section
  showSection,
  hideSection,

  // Room
  setRoomBadge,
  setRoomIdDisplay,
  showRoomActions,
  showRoomInfo,
  setRoomInfoMsg,
  setRoomActionsEnabled,
  getRoomInput,
  clearRoomInput,

  // WebRTC
  setWebRTCBadge,
  updateWebRTCStats,

  // Transfer
  showSenderPanel,
  showReceiverPanel,
  hideTransferSection,
  updateFileInfo,
  clearFileInfo,
  setSendBtnEnabled,
  setSenderStatus,
  setReceiverStatus,
  resetSenderUI,

  // Progress
  showProgressSection,
  hideProgressSection,
  updateProgress,
  resetProgress,

  // Verification
  showVerification,
  hideVerification,

  // Encryption
  showEncryptionBadge,
  hideEncryptionBadge,

  // Direct DOM access (for event listeners in other modules)
  DOM,
};

// window.logToConsole — used everywhere as a global shorthand
window.logToConsole = addLog;
