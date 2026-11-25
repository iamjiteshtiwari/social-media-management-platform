import crypto from "node:crypto";

const endpoint = process.env.SMM_GATEWAY_TEST_URL;
const secret = process.env.SMM_GATEWAY_HMAC_SECRET;

if (!endpoint || !secret || secret.length < 32) {
  console.error("Set SMM_GATEWAY_TEST_URL and a 32+ character SMM_GATEWAY_HMAC_SECRET.");
  process.exit(2);
}

function makeEnvelope({ requestId = crypto.randomUUID(), timestamp = Date.now(), invalidSignature = false } = {}) {
  const action = "gateway.health";
  const payload = JSON.stringify({ probe: "synthetic-local-test" });
  const canonical = ["v1", String(timestamp), requestId, action, payload].join("\n");
  let signature = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("base64");
  if (invalidSignature) signature = "A".repeat(43) + "=";

  return {
    version: "v1",
    timestamp: String(timestamp),
    requestId,
    action,
    payload,
    signature
  };
}

async function send(envelope) {
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope)
  });

  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { body = { parseError: true, responsePreview: text.slice(0, 200) }; }

  return {
    httpStatus: response.status,
    redirected: response.redirected,
    finalHost: (() => { try { return new URL(response.url).host; } catch { return "unknown"; } })(),
    body
  };
}

function assert(name, condition, details) {
  console.log((condition ? "PASS " : "FAIL ") + name);
  if (!condition) console.log(JSON.stringify(details));
  return condition;
}

async function main() {
  let passed = 0;
  let failed = 0;
  async function check(name, fn) {
    try {
      const result = await fn();
      if (assert(name, result.ok, result)) passed++; else failed++;
    } catch (error) {
      if (assert(name, false, { error: String(error) })) passed++; else failed++;
    }
  }

  await check("Valid signed request accepted and response readable", async () => {
    const result = await send(makeEnvelope());
    return {
      ok: result.body?.ok === true && result.body?.code === "GATEWAY_PROOF_OK",
      ...result
    };
  });

  await check("Invalid signature rejected", async () => {
    const result = await send(makeEnvelope({ invalidSignature: true }));
    return {
      ok: result.body?.ok === false && result.body?.code === "INVALID_GATEWAY_SIGNATURE",
      ...result
    };
  });

  await check("Expired timestamp rejected", async () => {
    const result = await send(makeEnvelope({ timestamp: Date.now() - 10 * 60 * 1000 }));
    return {
      ok: result.body?.ok === false && result.body?.code === "TIMESTAMP_OUT_OF_WINDOW",
      ...result
    };
  });

  await check("Reused request ID rejected", async () => {
    const envelope = makeEnvelope();
    const first = await send(envelope);
    const second = await send(envelope);
    return {
      ok: first.body?.ok === true &&
          second.body?.ok === false &&
          second.body?.code === "REPLAY_DETECTED",
      first: first.body,
      second: second.body,
      redirected: second.redirected,
      finalHost: second.finalHost
    };
  });

  await check("Concurrent duplicate request ID accepted at most once", async () => {
    const envelope = makeEnvelope();
    const results = await Promise.all([send(envelope), send(envelope)]);
    const accepted = results.filter(item => item.body?.ok === true).length;
    const replayRejected = results.filter(item =>
      item.body?.ok === false && item.body?.code === "REPLAY_DETECTED"
    ).length;
    return {
      ok: accepted === 1 && replayRejected === 1,
      accepted,
      replayRejected,
      results: results.map(item => item.body)
    };
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error("Test run failed:", String(error));
  process.exitCode = 1;
});
