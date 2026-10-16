function getPublicHealth_() {
  const registrationEnabled =
    getPrivateProperty_(AppConfig.PROPERTY.ENABLE_PUBLIC_REGISTRATION) === "YES";
  return {
    ok: true,
    service: "social-media-management-platform-api",
    apiVersion: AppConfig.API_VERSION,
    status: "source_scaffold",
    capabilities: {
      captchaVerificationModule: true,
      passwordHashingModule: true,
      registrationRoute: registrationEnabled,
      emailOtpRoute: registrationEnabled,
      login: false,
      sessions: false,
      accountAdministration: false,
      socialIntegrations: false,
      publishing: false
    },
    message: "Source modules are not proof of deployment or live readiness."
  };
}
