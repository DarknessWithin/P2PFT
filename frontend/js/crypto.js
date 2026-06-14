// crypto.js — AES-GCM 256-bit encryption
//
// Phase 1–7 stub — exposes the public API as no-ops.
// Full implementation (key generation, chunk encrypt/decrypt, URL hash key) comes in Phase 8.

window.p2pCrypto = {
  generateKey:    async ()                        => null,
  exportKey:      async (_key)                    => null,
  importKey:      async (_base64)                 => null,
  encryptChunk:   async (_key, _buffer)           => null,
  decryptChunk:   async (_key, _encryptedBuffer)  => null,
  isEncrypted:    ()                              => false,
};
