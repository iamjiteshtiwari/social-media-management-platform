/**
 * One-time email challenge helpers. OTPs are never written to a Sheet or log.
 * Set AUTH_CHALLENGE_HMAC_SECRET privately in Apps Script Script Properties.
 */
const EMAIL_OTP_TTL_MS = 5 * 60 * 1000;
const EMAIL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_OTP_MAX_ATTEMPTS = 5;

function createEmailOtp_(userId) {
  const now = Date.now();
  const otp = generateSixDigitOtp_();
  const challengeId = Utilities.getUuid();
  const secret = getRequiredPrivateProperty_("AUTH_CHALLENGE_HMAC_SECRET");
  return {
    otp: otp,
    record: {
      challenge_id: challengeId,
      user_id: userId,
      challenge_type: "email_verification",
      verifier_hash: hmacBase64_(secret, challengeId + "|" + userId + "|" + otp),
      expires_at: new Date(now + EMAIL_OTP_TTL_MS).toISOString(),
      attempt_count: 0,
      max_attempts: EMAIL_OTP_MAX_ATTEMPTS,
      last_sent_at: new Date(now).toISOString(),
      consumed_at: "",
      created_at: new Date(now).toISOString()
    }
  };
}

function generateSixDigitOtp_() {
  const hex = Utilities.getUuid().replace(/-/g, "").slice(0, 12);
  return String(parseInt(hex, 16) % 1000000).padStart(6, "0");
}

function hmacBase64_(secret, message) {
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(message, secret));
}

function verifyEmailOtpRecord_(record, userId, otp) {
  if (!record || String(record.user_id) !== String(userId) ||
      record.challenge_type !== "email_verification" || record.consumed_at ||
      Date.now() >= Date.parse(record.expires_at) ||
      Number(record.attempt_count) >= Number(record.max_attempts || EMAIL_OTP_MAX_ATTEMPTS) ||
      !/^[0-9]{6}$/.test(String(otp || ""))) {
    return { ok: false, code: "INVALID_OR_EXPIRED_CODE" };
  }
  const secret = getRequiredPrivateProperty_("AUTH_CHALLENGE_HMAC_SECRET");
  const expected = String(record.verifier_hash || "");
  const actual = hmacBase64_(secret, record.challenge_id + "|" + userId + "|" + String(otp));
  return constantTimeStringEqual_(actual, expected)
    ? { ok: true, code: "OTP_VERIFIED" }
    : { ok: false, code: "INVALID_OR_EXPIRED_CODE" };
}

function constantTimeStringEqual_(left, right) {
  left = String(left || "");
  right = String(right || "");
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}
