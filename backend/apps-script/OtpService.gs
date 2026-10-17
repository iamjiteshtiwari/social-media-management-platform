/**
 * One-time challenge creation, verification helpers and challenge consumption.
 * Shared data helpers are in SheetRepository.gs; secrets remain in Script Properties.
 */

function issueEmailVerificationOtp_(userId, email, fullName) {
  const master = getMasterSpreadsheet_();
  const challenges = getRequiredSheet_(master, "AuthChallenges");
  const previous = findLatestChallenge_(challenges, userId, "email_verification");
  const now = new Date();
  const nowIso = now.toISOString();

  if (previous && !previous.consumed_at) {
    consumeChallenge_(challenges, previous.rowNumber, nowIso);
  }

  // UUID digits provide a non-sequential code; the code is never persisted.
  const otp = String(parseInt(Utilities.getUuid().replace(/-/g, "").slice(0, 12), 16) % 1000000).padStart(6, "0");
  const challengeId = Utilities.getUuid();

  appendRecord_(challenges, {
    challenge_id: challengeId,
    user_id: userId,
    challenge_type: "email_verification",
    verifier_hash: hashOtp_(otp, challengeId, userId),
    expires_at: new Date(now.getTime() + EMAIL_OTP_TTL_MS).toISOString(),
    attempt_count: 0,
    max_attempts: EMAIL_OTP_MAX_ATTEMPTS,
    last_sent_at: nowIso,
    consumed_at: "",
    created_at: nowIso
  });

  try {
    MailApp.sendEmail({
      to: email,
      subject: "Verify your Social Media Management Platform account",
      name: "Social Media Management Platform",
      body: "Hello " + String(fullName || "there") + ",\n\n" +
        "Your email verification code is: " + otp + "\n\n" +
        "This code expires in 5 minutes and can be used once. If you did not request this, ignore this email.\n\n" +
        "Social Media Management Platform"
    });
  } catch (error) {
    const failed = findLatestChallenge_(challenges, userId, "email_verification");
    if (failed && !failed.consumed_at) consumeChallenge_(challenges, failed.rowNumber, new Date().toISOString());
    throw new Error("VERIFICATION_EMAIL_UNAVAILABLE");
  }
}

function hashOtp_(otp, challengeId, userId) {
  const secret = getRequiredPrivateProperty_(AppConfig.PROPERTY.OTP_HMAC_SECRET);
  const message = String(challengeId || "") + "|" + String(userId || "") + "|" + String(otp);
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(message, secret));
}

function findLatestChallenge_(sheet, userId, challengeType) {
  const map = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let found = null;
  rows.forEach(function (values, index) {
    const record = {};
    Object.keys(map).forEach(function (key) { record[key] = values[map[key]]; });
    if (String(record.user_id) === String(userId) &&
        String(record.challenge_type) === String(challengeType)) {
      found = Object.assign({ rowNumber: index + 2 }, record);
    }
  });
  return found;
}

function consumeChallenge_(sheet, rowNumber, consumedAt) {
  updateSheetRowFields_(sheet, rowNumber, { consumed_at: consumedAt });
}
