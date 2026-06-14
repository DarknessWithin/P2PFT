// transfer.js — File transfer over RTCDataChannel (Phase 4)
//
// Load order: ui.js → websocket.js → ... → webrtc.js → transfer.js → room.js
//
// Public API exposed via window.transfer:
//   onDataChannelReady(channel, isHost) — called by webrtc.js when channel opens
//   handleMessage(event)               — called by webrtc.js on every channel message
//   onDataChannelClosed()              — called by webrtc.js on channel close / cleanup
//
// Uses window.ui.* for all DOM updates. Uses window.ui.DOM.* for event listeners.

// ── Constants ─────────────────────────────────────────────────────────────────
const CHUNK_SIZE       = 16384;   // 16 KB per binary frame
const BUFFER_THRESHOLD = 262144;  // 256 KB — pause while send buffer exceeds this

// ── Sender state ──────────────────────────────────────────────────────────────
let txChannel         = null;   // RTCDataChannel ref — set by onDataChannelReady
let selectedFile      = null;   // File object chosen by host
let isSending         = false;  // guard: prevent double-click
let transferStartTime = null;   // Date.now() when chunk loop begins

// ── Receiver state ────────────────────────────────────────────────────────────
let pendingFile            = null;  // { name, size, hash } — set on file_info arrival
let receivedChunks         = [];    // Array<ArrayBuffer> — accumulates binary frames
let receiverStartTime      = null;  // Date.now() when file_info arrives
let receiverBytesTotal     = 0;     // expected file size from file_info
let receiverBytesReceived  = 0;     // running sum of received chunk sizes

// ── Utility ───────────────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024)                    return `${bytes} B`;
  if (bytes < 1024 * 1024)             return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bps) {
  if (bps < 1024)             return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024)      return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatETA(secs) {
  if (secs < 1)   return "< 1s";
  if (secs < 60)  return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ── Flow control ──────────────────────────────────────────────────────────────

async function waitForBufferDrain() {
  if (!txChannel || txChannel.bufferedAmount <= BUFFER_THRESHOLD) return;
  return new Promise((resolve) => {
    const check = () => {
      if (!txChannel || txChannel.bufferedAmount <= BUFFER_THRESHOLD) {
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };
    setTimeout(check, 10);
  });
}

// ── File selection ────────────────────────────────────────────────────────────

function handleFileSelected(file) {
  if (!file) return;

  selectedFile = file;
  window.ui.updateFileInfo(file.name, formatSize(file.size));
  window.ui.setSendBtnEnabled(
    txChannel !== null && txChannel.readyState === "open"
  );
  window.logToConsole(`File Selected: ${file.name} (${formatSize(file.size)})`, "info");
}

function clearSelection() {
  selectedFile = null;
  window.ui.clearFileInfo();
  window.ui.DOM.fileInput.value = ""; // reset so same file can be re-selected
  window.logToConsole("File cleared.", "info");
}

// ── Send (host) ───────────────────────────────────────────────────────────────

async function sendFile() {
  if (!selectedFile) {
    window.logToConsole("No file selected.", "error");
    return;
  }
  if (!txChannel || txChannel.readyState !== "open") {
    window.logToConsole("DataChannel not open — cannot send.", "error");
    return;
  }
  if (isSending) return;

  isSending = true;
  window.ui.setSendBtnEnabled(false);
  window.ui.DOM.fileInput.disabled = true;

  const file = selectedFile;

  try {
    // ── Step 1: hash ───────────────────────────────────────────────────────
    window.logToConsole("Computing SHA-256…", "system");
    const hashHex = window.p2pHash.toHex(await window.p2pHash.computeHash(file));
    window.logToConsole(`SHA-256: ${hashHex.slice(0, 16)}…`, "info");

    // ── Step 2: metadata ───────────────────────────────────────────────────
    txChannel.send(JSON.stringify({
      type: "file_info",
      name: file.name,
      size: file.size,
      hash: hashHex,
    }));
    window.logToConsole(`Metadata Sent: ${file.name} (${formatSize(file.size)})`, "system");
    window.ui.setSenderStatus(`Sending ${file.name}…`, "sending");

    // ── Step 3: binary chunks ──────────────────────────────────────────────
    window.logToConsole("Sending Chunks", "system");
    window.ui.showProgressSection();
    window.ui.resetProgress();
    transferStartTime = Date.now();

    let offset = 0;
    while (offset < file.size) {
      // Abort loop cleanly if channel closed mid-transfer
      if (!txChannel || txChannel.readyState !== "open") break;

      await waitForBufferDrain();

      // Re-check after await — channel may have closed during the yield
      if (!txChannel || txChannel.readyState !== "open") break;

      const end    = Math.min(offset + CHUNK_SIZE, file.size);
      const buffer = await file.slice(offset, end).arrayBuffer();
      txChannel.send(buffer);
      offset = end;

      const elapsed   = Math.max((Date.now() - transferStartTime) / 1000, 0.001);
      const percent   = (offset / file.size) * 100;
      const speed     = offset / elapsed;
      const remaining = file.size - offset;
      const eta       = speed > 0 ? remaining / speed : 0;
      window.ui.updateProgress(
        percent,
        formatSpeed(speed),
        formatETA(eta),
        formatSize(offset),
        formatSize(remaining)
      );
    }

    // ── Step 4: completion sentinel ────────────────────────────────────────
    if (!txChannel || txChannel.readyState !== "open") {
      window.logToConsole("Transfer interrupted — peer disconnected.", "error");
      window.ui.setSenderStatus("Transfer interrupted — peer disconnected", "error");
      return;
    }
    txChannel.send(JSON.stringify({ type: "file_complete" }));
    window.ui.updateProgress(100, "—", "—", formatSize(file.size), "0 B");
    window.logToConsole("Transfer Complete", "success");
    window.ui.setSenderStatus("Transfer Complete ✓", "complete");

  } catch (err) {
    window.logToConsole(`Transfer error: ${err.message}`, "error");
    window.ui.setSenderStatus("Transfer Failed", "error");

  } finally {
    isSending = false;
    window.ui.setSendBtnEnabled(true);
    window.ui.DOM.fileInput.disabled = false;
  }
}

// ── Receive (guest) ───────────────────────────────────────────────────────────

async function handleControlMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    window.logToConsole(`Received text: ${raw}`, "info");
    return;
  }

  if (msg.type === "file_info") {
    pendingFile           = { name: msg.name, size: msg.size, hash: msg.hash || null };
    receivedChunks        = [];
    receiverStartTime     = Date.now();
    receiverBytesTotal    = msg.size;
    receiverBytesReceived = 0;
    window.ui.showProgressSection();
    window.ui.resetProgress();
    window.ui.setReceiverStatus(
      `Receiving: ${msg.name}`,
      `${formatSize(msg.size)} — receiving chunks…`
    );
    window.logToConsole(
      `Metadata Received: ${msg.name} (${formatSize(msg.size)})`, "success"
    );

  } else if (msg.type === "file_complete") {
    if (!pendingFile) return;

    // Capture then reset state before any async work
    const chunks = receivedChunks;
    const info   = pendingFile;
    receivedChunks = [];
    pendingFile    = null;

    // Clamp progress to 100% before reassembly
    window.ui.updateProgress(100, "—", "—", formatSize(info.size), "0 B");

    // Reassemble + trigger download
    const blob = new Blob(chunks);
    const url  = URL.createObjectURL(blob);
    const a         = document.createElement("a");
    a.href          = url;
    a.download      = info.name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    window.logToConsole("File Reassembled", "success");
    window.logToConsole(`Download Started: ${info.name}`, "success");
    window.ui.setReceiverStatus(
      `Downloaded: ${info.name}`,
      `${formatSize(blob.size)} — saved to Downloads ✓`
    );

    // SHA-256 verification
    if (info.hash) {
      window.logToConsole("Verifying SHA-256…", "system");
      const receivedHex = window.p2pHash.toHex(
        await window.p2pHash.computeHashFromChunks(chunks)
      );
      const verified = receivedHex === info.hash;
      window.logToConsole(
        verified ? "Verification Passed ✓" : "Verification FAILED ✗",
        verified ? "success" : "error"
      );
      window.ui.showVerification(verified, info.hash, receivedHex);
    }
  }
}

function handleChunk(buffer) {
  if (!pendingFile) return;
  receivedChunks.push(buffer);
  receiverBytesReceived += buffer.byteLength;

  const elapsed   = Math.max((Date.now() - receiverStartTime) / 1000, 0.001);
  const percent   = receiverBytesTotal > 0
    ? (receiverBytesReceived / receiverBytesTotal) * 100 : 0;
  const speed     = receiverBytesReceived / elapsed;
  const remaining = Math.max(receiverBytesTotal - receiverBytesReceived, 0);
  const eta       = speed > 0 ? remaining / speed : 0;
  window.ui.updateProgress(
    percent,
    formatSpeed(speed),
    formatETA(eta),
    formatSize(receiverBytesReceived),
    formatSize(remaining)
  );
}

// ── Message router ────────────────────────────────────────────────────────────

function handleMessage(event) {
  if (typeof event.data === "string") {
    handleControlMessage(event.data);
  } else if (event.data instanceof ArrayBuffer) {
    handleChunk(event.data);
  }
}

// ── Lifecycle hooks — called by webrtc.js ─────────────────────────────────────

function onDataChannelReady(channel, isHost) {
  txChannel = channel;
  if (isHost) {
    window.ui.setSendBtnEnabled(selectedFile !== null);
  }
}

function onDataChannelClosed() {
  const wasInFlight = isSending;
  txChannel             = null;
  isSending             = false;
  transferStartTime     = null;
  pendingFile           = null;
  receivedChunks        = [];
  receiverStartTime     = null;
  receiverBytesTotal    = 0;
  receiverBytesReceived = 0;

  window.ui.setSenderStatus(
    wasInFlight ? "Transfer interrupted — peer disconnected" : "",
    wasInFlight ? "error" : ""
  );
  window.ui.setSendBtnEnabled(false);
  window.ui.DOM.fileInput.disabled = false;
  window.ui.setReceiverStatus("Waiting for file from host...", "");
  window.ui.hideVerification();
  window.ui.hideProgressSection();
}

// ── DOM event listeners ───────────────────────────────────────────────────────

const dropZone  = window.ui.DOM.dropZone;
const fileInput = window.ui.DOM.fileInput;

// CSS sets display:none on this input; Chrome/Windows silently drops the
// change event on display:none inputs. Override to off-screen instead.
fileInput.style.cssText =
  "display:block;position:fixed;left:-9999px;width:1px;height:1px;opacity:0;";

// Drag & drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", (e) => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove("drag-over");
  }
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelected(file);
});

// Clicking anywhere on the zone that is NOT the button opens the picker too
dropZone.addEventListener("click", (e) => {
  if (e.target.closest(".choose-file-btn")) return;
  fileInput.click();
});

// File selected — change fires reliably now that input is display:block
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) handleFileSelected(file);
});

// Clear selected file
window.ui.DOM.clearFileBtn.addEventListener("click", clearSelection);

// Send button
window.ui.DOM.sendFileBtn.addEventListener("click", sendFile);

// ── Expose public API ─────────────────────────────────────────────────────────
window.transfer = {
  onDataChannelReady,
  handleMessage,
  onDataChannelClosed,
};
