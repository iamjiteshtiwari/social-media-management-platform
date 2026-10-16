/**
 * Private configuration access.
 * Store values in Apps Script > Project Settings > Script Properties.
 * Never log or return property values to the browser.
 */
const AppConfig = Object.freeze({
  PROPERTY: Object.freeze({
    ALLOWED_HOSTNAME: "APP_ALLOWED_HOSTNAME",
    MASTER_SPREADSHEET_ID: "MASTER_SPREADSHEET_ID",
    OTP_HMAC_SECRET: "OTP_HMAC_SECRET",
    SESSION_HMAC_SECRET: "SESSION_HMAC_SECRET",
    SESSION_TOKEN_GENERATION_SECRET: "SESSION_TOKEN_GENERATION_SECRET",
    ENABLE_PUBLIC_REGISTRATION: "ENABLE_PUBLIC_REGISTRATION",
    ENABLE_PUBLIC_LOGIN: "ENABLE_PUBLIC_LOGIN",
    REGISTRATION_CAPTCHA_SECRET: "RECAPTCHA_REGISTRATION_SECRET",
    LOGIN_CAPTCHA_SECRET: "RECAPTCHA_LOGIN_SECRET",
    CAPTCHA_MIN_SCORE: "RECAPTCHA_MIN_SCORE",
    REGISTRATION_CAPTCHA_ACTION: "RECAPTCHA_REGISTRATION_ACTION",
    LOGIN_CAPTCHA_ACTION: "RECAPTCHA_LOGIN_ACTION",
    ENABLE_SCHEMA_INITIALIZATION: "ENABLE_SCHEMA_INITIALIZATION",
    OPERATIONAL_TEST_SPREADSHEET_ID: "OPERATIONAL_TEST_SPREADSHEET_ID",
    ENABLE_OPERATIONAL_SCHEMA_INITIALIZATION: "ENABLE_OPERATIONAL_SCHEMA_INITIALIZATION"
  }),
  API_VERSION: "0.1.0",
  APP_HOSTNAME_DEFAULT: "social.iamjiteshtiwari.in"
});

function getPrivateProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

function getRequiredPrivateProperty_(key) {
  const value = getPrivateProperty_(key);
  if (!value || !String(value).trim()) {
    throw new Error("MISSING_PRIVATE_CONFIGURATION:" + key);
  }
  return String(value).trim();
}

function getAllowedHostname_() {
  return (getPrivateProperty_(AppConfig.PROPERTY.ALLOWED_HOSTNAME) ||
    AppConfig.APP_HOSTNAME_DEFAULT).toLowerCase();
}

function getCaptchaConfiguration_(purpose) {
  const normalizedPurpose = String(purpose || "").toLowerCase();
  let secretProperty;
  let actionProperty;

  if (normalizedPurpose === "registration") {
    secretProperty = AppConfig.PROPERTY.REGISTRATION_CAPTCHA_SECRET;
    actionProperty = AppConfig.PROPERTY.REGISTRATION_CAPTCHA_ACTION;
  } else if (normalizedPurpose === "login") {
    secretProperty = AppConfig.PROPERTY.LOGIN_CAPTCHA_SECRET;
    actionProperty = AppConfig.PROPERTY.LOGIN_CAPTCHA_ACTION;
  } else {
    throw new Error("UNSUPPORTED_CAPTCHA_PURPOSE");
  }

  return {
    secret: getRequiredPrivateProperty_(secretProperty),
    expectedHostname: getAllowedHostname_(),
    expectedAction: getPrivateProperty_(actionProperty),
    minScore: parseCaptchaMinScore_()
  };
}

function parseCaptchaMinScore_() {
  const raw = getPrivateProperty_(AppConfig.PROPERTY.CAPTCHA_MIN_SCORE);
  if (!raw) return 0.5;
  const score = Number(raw);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error("INVALID_PRIVATE_CONFIGURATION:RECAPTCHA_MIN_SCORE");
  }
  return score;
}
