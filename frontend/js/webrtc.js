// webrtc.js — WebRTC peer connection and DataChannel (Phase 3)
//
// Load order: ui.js → websocket.js → ... → webrtc.js → transfer.js → room.js
//
// Public API exposed via window.webrtc:
//   startAsHost(roomId)          — called by room.js on "peer_joined"
//   startAsGuest(roomId, offer)  — called by room.js on "offer"
//   handleAnswer(answer)         — called by room.js on "answer"
//   handleIceCandidate(candidate)— called by room.js on "ice_candidate"
//   cleanup()                    — called by room.js on disconnect / room_closed
//
// Uses window.ui.* for all DOM updates. No direct DOM access here.

// ── STUN configuration ────────────────────────────────────────────────────────
const RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ── Internal state ────────────────────────────────────────────────────────────
let peerConnection       = null;
let dataChannel          = null;
let peerRole             = null;   // "host" | "guest" — set before any async work
let remoteDescriptionSet = false;  // gates ICE candidate application
let pendingCandidates    = [];     // ICE candidates buffered before setRemoteDescription
let disconnectTimer      = null;   // setTimeout handle for "disconnected" grace period

// ── RTCPeerConnection factory ─────────────────────────────────────────────────

function createPeerConnection(roomId) {
  const pc = new RTCPeerConnection(RTC_CONFIG);

  // Send our ICE candidates to the peer via the signaling server
  pc.onicecandidate = ({ candidate }) => {
    if (!candidate) return;
    window.sendToServer({ type: "ice_candidate", room_id: roomId, candidate });
    window.logToConsole("ICE Candidate Sent", "info");
  };

  // Update the ICE state display
  pc.onicegatheringstatechange = () => {
    const s = pc.iceGatheringState;
    window.ui.updateWebRTCStats(null, null, s.charAt(0).toUpperCase() + s.slice(1), null);
  };

  pc.oniceconnectionstatechange = () => {
    window.logToConsole(`ICE: ${pc.iceConnectionState}`, "info");
  };

  // Primary UI trigger for connection + transfer section reveal
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    window.ui.updateWebRTCStats(null, null, null, state);

    if (state === "connected") {
      // Cancel any pending disconnect cleanup — connection recovered
      if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
      window.ui.setWebRTCBadge("connected", "🟢 WebRTC Connected");
      window.logToConsole("WebRTC Connected", "success");
      // Backup trigger — channel.onopen is the primary (uses isHost closure, not peerRole)
      if (peerRole === "host") {
        window.ui.showSenderPanel();
      } else if (peerRole === "guest") {
        window.ui.showReceiverPanel();
      }

    } else if (state === "connecting") {
      window.ui.setWebRTCBadge("connecting", "🟡 Connecting...");

    } else if (state === "disconnected") {
      window.ui.setWebRTCBadge("not-connected", "🔴 Not Connected");
      window.logToConsole("WebRTC disconnected — waiting 5s before cleanup…", "error");
      disconnectTimer = setTimeout(() => {
        // Guard: only act if this pc is still the active connection
        if (pc === peerConnection && peerConnection.connectionState === "disconnected") {
          window.logToConsole("WebRTC did not recover — cleaning up.", "error");
          cleanup();
        }
      }, 5000);

    } else if (state === "failed") {
      window.ui.setWebRTCBadge("not-connected", "🔴 Not Connected");
      window.logToConsole("WebRTC failed — cleaning up.", "error");
      // Guard: stale old-pc events must not destroy a newly created connection
      if (pc === peerConnection) cleanup();

    } else if (state === "closed") {
      window.ui.setWebRTCBadge("not-connected", "🔴 Not Connected");
      // Guard: same staleness check — old pc fires "closed" after cleanup()
      // already replaced peerConnection with a new session
      if (pc === peerConnection) cleanup();
    }
  };

  return pc;
}

// ── DataChannel setup ─────────────────────────────────────────────────────────

function setupDataChannel(channel, isHost) {
  dataChannel = channel;

  // arraybuffer is required — default "blob" silently breaks binary chunk detection
  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    window.logToConsole("Data Channel Open", "success");
    // Use isHost (closure variable, always correct) — not peerRole (may race)
    if (isHost) {
      window.ui.showSenderPanel();
    } else {
      window.ui.showReceiverPanel();
    }
    if (window.transfer) window.transfer.onDataChannelReady(channel, isHost);
  };

  // Guard: channel may already be open when ondatachannel fires on the guest side
  if (channel.readyState === "open") {
    window.logToConsole("Data Channel Open", "success");
    if (isHost) {
      window.ui.showSenderPanel();
    } else {
      window.ui.showReceiverPanel();
    }
    if (window.transfer) window.transfer.onDataChannelReady(channel, isHost);
  }

  channel.onmessage = (event) => {
    if (window.transfer) window.transfer.handleMessage(event);
  };

  channel.onclose = () => {
    window.logToConsole("Data Channel Closed", "info");
    if (window.transfer) window.transfer.onDataChannelClosed();
  };

  channel.onerror = (err) => {
    window.logToConsole(`Data Channel Error: ${err.message ?? err}`, "error");
  };
}

// ── ICE candidate buffering ───────────────────────────────────────────────────

async function drainPendingCandidates() {
  for (const candidate of pendingCandidates) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      window.logToConsole("ICE Candidate Applied (buffered)", "info");
    } catch (err) {
      window.logToConsole(`ICE buffer error: ${err.message}`, "error");
    }
  }
  pendingCandidates = [];
}

// ── Public API ────────────────────────────────────────────────────────────────

async function startAsHost(roomId) {
  window.logToConsole("Initiating WebRTC as Host...", "system");

  peerRole = "host";   // set synchronously — before any awaits

  window.ui.showSection("webrtc-section");
  window.ui.updateWebRTCStats("Host", "Idle", "—", "new");
  window.ui.setWebRTCBadge("not-connected", "🔴 Not Connected");

  try {
    peerConnection = createPeerConnection(roomId);

    const channel = peerConnection.createDataChannel("file-transfer");
    setupDataChannel(channel, true);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    window.sendToServer({ type: "offer", room_id: roomId, offer });
    window.ui.updateWebRTCStats(null, "Offer Sent", null, null);
    window.logToConsole("Offer Created", "success");
    window.ui.setWebRTCBadge("connecting", "🟡 Connecting...");

  } catch (err) {
    window.logToConsole(`Host setup error: ${err.message}`, "error");
    cleanup();
  }
}

async function startAsGuest(roomId, offer) {
  window.logToConsole("Offer Received — starting WebRTC as Guest...", "system");

  peerRole = "guest";   // set synchronously — before any awaits

  window.ui.showSection("webrtc-section");
  window.ui.updateWebRTCStats("Guest", "Offer Received", "—", "new");
  window.ui.setWebRTCBadge("connecting", "🟡 Connecting...");
  window.logToConsole("Offer Received", "success");

  try {
    peerConnection = createPeerConnection(roomId);

    // Set binaryType on the raw channel object immediately — before any queued
    // messages can arrive and before setupDataChannel runs
    peerConnection.ondatachannel = ({ channel }) => {
      channel.binaryType = "arraybuffer";
      setupDataChannel(channel, false);
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    remoteDescriptionSet = true;
    await drainPendingCandidates();

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    window.sendToServer({ type: "answer", room_id: roomId, answer });
    window.ui.updateWebRTCStats(null, "Answer Sent", null, null);
    window.logToConsole("Answer Created", "success");

  } catch (err) {
    window.logToConsole(`Guest setup error: ${err.message}`, "error");
    cleanup();
  }
}

async function handleAnswer(answer) {
  if (!peerConnection) return;

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    remoteDescriptionSet = true;
    await drainPendingCandidates();
    window.ui.updateWebRTCStats(null, "Answer Received", null, null);
    window.logToConsole("Answer Received", "success");

  } catch (err) {
    window.logToConsole(`Answer error: ${err.message}`, "error");
  }
}

async function handleIceCandidate(candidate) {
  if (!peerConnection) return;

  window.logToConsole("ICE Candidate Received", "info");

  if (!remoteDescriptionSet) {
    pendingCandidates.push(candidate);
    return;
  }

  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    window.logToConsole(`ICE candidate error: ${err.message}`, "error");
  }
}

function cleanup() {
  if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }

  if (dataChannel) {
    try { dataChannel.close(); } catch (_) {}
    dataChannel = null;
  }
  if (peerConnection) {
    try { peerConnection.close(); } catch (_) {}
    peerConnection = null;
  }

  peerRole             = null;
  remoteDescriptionSet = false;
  pendingCandidates    = [];

  window.ui.hideTransferSection();
  window.ui.hideSection("webrtc-section");
  window.ui.setWebRTCBadge("not-connected", "🔴 Not Connected");
  window.ui.updateWebRTCStats("—", "Idle", "—", "—");

  if (window.transfer) window.transfer.onDataChannelClosed();
}

// ── Expose public API ─────────────────────────────────────────────────────────
window.webrtc = {
  startAsHost,
  startAsGuest,
  handleAnswer,
  handleIceCandidate,
  cleanup,
};
