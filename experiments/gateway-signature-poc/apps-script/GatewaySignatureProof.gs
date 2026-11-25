/**
 * Isolated gateway-signature proof.
 *
 * Copy this file only into a separate TEST Apps Script project.
 * Do NOT add it to the existing backend project yet.
 *
 * Required Script Property:
 *   GATEWAY_PROOF_HMAC_SECRET = same random secret configured in the local Node client
 *
 * This proof exposes only gateway.health. It does not call login/session services,
 * read Sheets, touch Drive, or call external APIs.
 */
const GATEWAY_PROOF_CONFIG_ = Object.freeze({
  SECRET_PROPERTY: "GATEWAY_PROOF_HMAC_SECRET",
  MAX_CLOCK_SKEW_MS: 5 * 60 * 1000,
  MAX_PAYLOAD_CHARS: 4096,
  MAX_NONCE_RECORDS: 500,
  NONCE_PREFIX: "GATEWAY_PROOF_NONCE_",
  LOCK_WAIT_MS: 10000
});

function doPost(e) {
  return gatewayProofHandlePost_(e);
}

function doGet() {
  return gatewayProofJson_({
    ok: false,
    code: "POST_REQUIRED"
  });
}

function gatewayProofHandlePost_(e) {
  let envelope;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 8192) {
      return gatewayProofJson_({ ok: false, code: "INVALID_ENVELOPE" });
    }
    envelope = JSON.parse(raw);
  } catch (error) {
    return gatewayProofJson_({ ok: false, code: "INVALID_ENVELOPE" });
  }

  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return gatewayProofJson_({ ok: false, code: "INVALID_ENVELOPE" });
  }

  const allowedKeys = ["version", "timestamp", "requestId", "action", "payload", "signature"];
  const actualKeys = Object.keys(envelope).sort();
  if (actualKeys.join("|") !== allowedKeys.slice().sort().join("|")) {
    return gatewayProofJson_({ ok: false, code: "INVALID_ENVELOPE_FIELDS" });
  }

  const timestampText = String(envelope.timestamp || "");
  const requestId = String(envelope.requestId || "");
  const action = String(envelope.action || "");
  const payloadText = envelope.payload;
  const signature = String(envelope.signature || "");

  if (envelope.version !== "v1" ||
      !/^\d{13}$/.test(timestampText) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId) ||
      typeof payloadText !== "string" ||
      payloadText.length > GATEWAY_PROOF_CONFIG_.MAX_PAYLOAD_CHARS ||
      !/^[A-Za-z0-9+/]{43}=$/.test(signature)) {
    return gatewayProofJson_({ ok: false, code: "INVALID_ENVELOPE_FIELDS" });
  }

  const timestamp = Number(timestampText);
  const now = Date.now();
  if (!Number.isSafeInteger(timestamp) ||
      Math.abs(now - timestamp) > GATEWAY_PROOF_CONFIG_.MAX_CLOCK_SKEW_MS) {
    return gatewayProofJson_({ ok: false, code: "TIMESTAMP_OUT_OF_WINDOW" });
  }

  if (action !== "gateway.health") {
    return gatewayProofJson_({ ok: false, code: "ACTION_NOT_ALLOWED" });
  }

  let payload;
  try {
    payload = JSON.parse(payloadText);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("INVALID_PAYLOAD");
    }
  } catch (error) {
    return gatewayProofJson_({ ok: false, code: "INVALID_PAYLOAD" });
  }

  let secret;
  try {
    secret = PropertiesService.getScriptProperties()
      .getProperty(GATEWAY_PROOF_CONFIG_.SECRET_PROPERTY);
    if (!secret || secret.length < 32) throw new Error("MISSING_OR_WEAK_SECRET");
  } catch (error) {
    return gatewayProofJson_({ ok: false, code: "GATEWAY_AUTH_NOT_CONFIGURED" });
  }

  const canonical = [
    "v1",
    timestampText,
    requestId,
    action,
    payloadText
  ].join("\n");

  let expectedSignature;
  try {
    expectedSignature = Utilities.base64Encode(
      Utilities.computeHmacSha256Signature(canonical, secret)
    );
  } catch (error) {
    return gatewayProofJson_({ ok: false, code: "GATEWAY_AUTH_FAILED" });
  }

  if (!gatewayProofConstantTimeEquals_(signature, expectedSignature)) {
    return gatewayProofJson_({ ok: false, code: "INVALID_GATEWAY_SIGNATURE" });
  }

  const nonceResult = gatewayProofClaimNonce_(requestId, timestamp, now);
  if (!nonceResult.ok) {
    return gatewayProofJson_({ ok: false, code: nonceResult.code });
  }

  // Synthetic health action only. No authentication, Sheets, Drive or provider calls.
  return gatewayProofJson_({
    ok: true,
    code: "GATEWAY_PROOF_OK",
    requestId: requestId,
    probe: String(payload.probe || "")
  });
}

function gatewayProofClaimNonce_(requestId, timestamp, now) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    locked = lock.tryLock(GATEWAY_PROOF_CONFIG_.LOCK_WAIT_MS);
    if (!locked) return { ok: false, code: "REPLAY_STORE_BUSY" };

    const store = PropertiesService.getScriptProperties();
    const all = store.getProperties();
    const prefix = GATEWAY_PROOF_CONFIG_.NONCE_PREFIX;
    const cutoff = now - GATEWAY_PROOF_CONFIG_.MAX_CLOCK_SKEW_MS;
    let activeCount = 0;
    const expiredKeys = [];

    Object.keys(all).forEach(function(key) {
      if (key.indexOf(prefix) !== 0) return;
      const storedTimestamp = Number(all[key]);
      if (!Number.isFinite(storedTimestamp) || storedTimestamp < cutoff) {
        expiredKeys.push(key);
      } else {
        activeCount++;
      }
    });

    if (expiredKeys.length) store.deleteProperties(expiredKeys.reduce(function(out, key) {
      out[key] = true;
      return out;
    }, {}));

    const nonceKey = prefix + requestId.replace(/-/g, "");
    if (store.getProperty(nonceKey) !== null) {
      return { ok: false, code: "REPLAY_DETECTED" };
    }

    if (activeCount >= GATEWAY_PROOF_CONFIG_.MAX_NONCE_RECORDS) {
      return { ok: false, code: "REPLAY_STORE_CAPACITY" };
    }

    // Claim before action execution. Any storage failure is caught and rejected.
    store.setProperty(nonceKey, String(timestamp));
    return { ok: true };
  } catch (error) {
    return { ok: false, code: "REPLAY_STORE_UNAVAILABLE" };
  } finally {
    if (locked) lock.releaseLock();
  }
}

function gatewayProofConstantTimeEquals_(left, right) {
  const a = String(left);
  const b = String(right);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^
      (b.charCodeAt(i % (b.length || 1)) || 0);
  }
  return diff === 0;
}

function gatewayProofJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
