/**
 * Minimal Apps Script entry point.
 *
 * This scaffold intentionally does not expose registration/login or arbitrary
 * spreadsheet actions. Browser integration must wait until secure session
 * transport and cross-origin behavior are demonstrated for the chosen host.
 */
function doGet(e) {
  const action = e && e.parameter ? String(e.parameter.action || "health") : "health";
  if (action !== "health") {
    return jsonResponse_({
      ok: false,
      code: "ACTION_NOT_AVAILABLE",
      message: "This operation is not enabled."
    });
  }
  return jsonResponse_(getPublicHealth_());
}

function doPost(e) {
  let payload;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw) throw new Error("EMPTY_BODY");
    payload = JSON.parse(raw);
  } catch (error) {
    return jsonResponse_({
      ok: false,
      code: "INVALID_REQUEST",
      message: "A valid JSON request body is required."
    });
  }

  const action = String(payload.action || "");
  if (action === "health") {
    return jsonResponse_(getPublicHealth_());
  }

  // Registration/login are not exposed until authentication transport,
  // identity verification and session policy are implemented and tested.
  return jsonResponse_({
    ok: false,
    code: "OPERATION_NOT_ENABLED",
    message: "This operation is not enabled yet."
  });
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
