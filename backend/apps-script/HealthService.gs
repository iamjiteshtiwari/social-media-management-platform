function getPublicHealth_() {
  return {
    ok: true,
    service: "social-media-management-platform-api",
    apiVersion: AppConfig.API_VERSION,
    status: "scaffold",
    capabilities: {
      captchaVerificationModule: true,
      sheetSchemaModule: true,
      registration: false,
      login: false,
      sessions: false,
      workspaceCrud: false,
      publishing: false
    },
    message: "Backend source scaffold only; protected operations are not enabled."
  };
}
