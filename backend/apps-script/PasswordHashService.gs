/**
 * Password hashing adapter using PBKDF2-HMAC-SHA-256 and Apps Script's built-in
 * HMAC primitive. Benchmark on the target script before launch. If this is too
 * slow or the runtime is unsuitable, replace it with a vetted identity provider;
 * never silently lower the work factor.
 */
const PASSWORD_HASH_ALGORITHM = "PBKDF2-HMAC-SHA-256";
const PASSWORD_HASH_ITERATIONS = 210000;
const PASSWORD_HASH_BYTES = 32;

function createPasswordHash_(password) {
  const normalized = validatePassword_(password);
  const saltText = Utilities.getUuid() + Utilities.getUuid();
  const saltBytes = Utilities.newBlob(saltText).getBytes();
  const derived = pbkdf2Sha256_(normalized, saltBytes, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_BYTES);
  return {
    password_hash: Utilities.base64Encode(derived),
    password_salt: Utilities.base64Encode(saltBytes),
    password_hash_algorithm: PASSWORD_HASH_ALGORITHM,
    password_hash_iterations: PASSWORD_HASH_ITERATIONS
  };
}

function verifyPasswordHash_(password, user) {
  if (!user || user.password_hash_algorithm !== PASSWORD_HASH_ALGORITHM) return false;
  const iterations = Number(user.password_hash_iterations);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 500000) return false;
  if (!user.password_hash || !user.password_salt) return false;
  try {
    const salt = Utilities.base64Decode(String(user.password_salt));
    const expected = Utilities.base64Decode(String(user.password_hash));
    const actual = pbkdf2Sha256_(validatePassword_(password), salt, iterations, expected.length);
    return constantTimeBytesEqual_(actual, expected);
  } catch (error) {
    return false;
  }
}

function validatePassword_(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new Error("PASSWORD_POLICY_FAILED");
  }
  if (/^\s|\s$/.test(password)) throw new Error("PASSWORD_POLICY_FAILED");
  return password;
}

/** PBKDF2, RFC 8018, HMAC-SHA-256, first 32-byte block. */
function pbkdf2Sha256_(password, saltBytes, iterations, outputBytes) {
  const passwordBytes = Utilities.newBlob(password).getBytes();
  const block = saltBytes.slice();
  block.push(0, 0, 0, 1);
  let u = Utilities.computeHmacSha256Signature(block, passwordBytes);
  let t = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = Utilities.computeHmacSha256Signature(u, passwordBytes);
    for (let j = 0; j < t.length; j++) t[j] = t[j] ^ u[j];
  }
  return t.slice(0, outputBytes);
}

function constantTimeBytesEqual_(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
