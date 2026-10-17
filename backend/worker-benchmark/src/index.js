import { scryptSync, randomBytes } from "node:crypto";

/**
 * Isolated password-hash runtime benchmark.
 *
 * This is NOT an authentication API. It accepts no user input, performs no
 * Google calls, stores nothing, and never returns/logs the derived key.
 * Deploy only to a disposable test Worker after reviewing the instructions.
 */
const TEST_PASSWORD = "benchmark-only-not-a-real-password";
const TEST_SALT = "smm-runtime-benchmark-salt-v1";
const SCRYPT = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 32,
  maxmem: 64 * 1024 * 1024
});

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== "GET" || url.pathname !== "/benchmark") {
      return Response.json(
        { ok: false, code: "NOT_FOUND" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const start = performance.now();
    let derived;
    try {
      derived = scryptSync(
        TEST_PASSWORD,
        TEST_SALT,
        SCRYPT.keyLength,
        {
          N: SCRYPT.N,
          r: SCRYPT.r,
          p: SCRYPT.p,
          maxmem: SCRYPT.maxmem
        }
      );
    } catch {
      return Response.json(
        {
          ok: false,
          code: "HASH_BENCHMARK_FAILED",
          note: "The configured scrypt operation did not complete in this runtime."
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    const elapsedMs = Number((performance.now() - start).toFixed(3));
    const outputLengthBytes = derived.length;
    derived.fill(0);

    return Response.json(
      {
        ok: true,
        benchmarkOnly: true,
        algorithm: "scrypt",
        parameters: {
          N: SCRYPT.N,
          r: SCRYPT.r,
          p: SCRYPT.p,
          keyLengthBytes: SCRYPT.keyLength
        },
        elapsedMs,
        outputLengthBytes,
        hashValueReturned: false,
        persistence: "none",
        googleResourcesAccessed: false,
        warning: "Elapsed wall time is useful for comparison but does not report the platform CPU meter. Check the Worker invocation CPU usage in Cloudflare logs/metrics."
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
};
