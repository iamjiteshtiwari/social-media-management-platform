/**
 * Server-side password hashing adapter.
 *
 * PBKDF2-HMAC-SHA-256 is implemented with Apps Script's native HMAC primitive.
 * The iteration count is stored per user so it can be upgraded on later login.
 * Never move password hashing to the browser or log password material.
 */
const PASSWORD_HASH_ALGORITHM = "PBKDF2-HMAC-SHA256";
const PASSWORD_HASH_ITERATIONS = 120000;
const PASSWORD_HASH_BYTES = 32;

function hashPassword_(password) {
  const value = String(password || "");
  if (value.length < 8 || value.length > 256) {
    throw new Error("PASSWORD_POLICY_FAILED");
  }

  const salt = Utilities.getUuid() + Utilities.getUuid();
  const derived = pbkdf2Sha256_(value, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_BYTES);
  return {
    salt: salt,
    hash: Utilities.base64Encode(derived),
    algorithm: PASSWORD_HASH_ALGORITHM,
    iterations: PASSWORD_HASH_ITERATIONS
  };
}

function verifyPassword_(password, salt, expectedHash, algorithm, iterations) {
  if (String(algorithm || "") !== PASSWORD_HASH_ALGORITHM) return false;
  const rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < 100000 || rounds > 500000) return false;
  if (!salt || !expectedHash || typeof password !== "string" || password.length < 1 || password.length > 256) return false;

  const derived = pbkdf2Sha256_(password, String(salt), rounds, PASSWORD_HASH_BYTES);
  const actual = Utilities.base64Encode(derived);
  return constantTimeStringEquals_(actual, String(expectedHash));
}

function pbkdf2Sha256_(password, salt, iterations, keyLength) {
  const passwordBytes = Utilities.newBlob(String(password), "text/plain").getBytes();
  const saltBytes = Utilities.newBlob(String(salt), "text/plain").getBytes();
  const blockInput = saltBytes.concat([0, 0, 0, 1]);
  let u = Utilities.computeHmacSha256Signature(blockInput, passwordBytes);
  const output = u.slice();

  for (let round = 1; round < iterations; round++) {
    u = Utilities.computeHmacSha256Signature(u, passwordBytes);
    for (let i = 0; i < output.length; i++) output[i] = (output[i] ^ u[i]);
  }

  return output.slice(0, keyLength);
}

function constantTimeStringEquals_(left, right) {
  const a = String(left);
  const b = String(right);
  let difference = a.length ^ b.length;
  const maxLength = Math.max(a.length, b.length);
  for (let i = 0; i < maxLength; i++) {
    difference |= (a.charCodeAt(i % (a.length || 1)) || 0) ^
      (b.charCodeAt(i % (b.length || 1)) || 0);
  }
  return difference === 0;
}
