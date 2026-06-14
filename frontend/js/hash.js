// hash.js — SHA-256 file integrity verification (Phase 5)
//
// Uses the Web Crypto API (crypto.subtle) — available natively in all modern
// browsers. No library needed.
//
// All functions are async and return Promises.
// toHex() is synchronous (pure transformation, no I/O).

async function computeHash(file) {
  const buffer = await file.arrayBuffer();
  return crypto.subtle.digest("SHA-256", buffer);
}

async function computeHashFromChunks(chunks) {
  // Concatenate all ArrayBuffer chunks into a single buffer then hash it
  const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const combined   = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return crypto.subtle.digest("SHA-256", combined);
}

function toHex(arrayBuffer) {
  return Array.from(new Uint8Array(arrayBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

window.p2pHash = { computeHash, computeHashFromChunks, toHex };
