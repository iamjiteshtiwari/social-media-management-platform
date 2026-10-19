/**
 * TEST-only harness check for controlled spreadsheet-write failure injection.
 *
 * This function does not open spreadsheets or touch Drive. It temporarily
 * replaces the global updateSheetRowFields_ binding, verifies that a controlled
 * failure can be observed, and restores the original binding in finally.
 *
 * Run manually in the isolated SMM Backend TEST Apps Script project only.
 */
function testMediaFailureInjectionHarness() {
  const originalUpdate = updateSheetRowFields_;
  let injectedFailureObserved = false;
  let restored = false;

  try {
    updateSheetRowFields_ = function () {
      throw new Error("TEST_INJECTED_WRITE_FAILURE");
    };

    try {
      updateSheetRowFields_({}, 2, { status: "test" });
    } catch (error) {
      injectedFailureObserved =
        String(error && error.message || error) === "TEST_INJECTED_WRITE_FAILURE";
    }
  } finally {
    updateSheetRowFields_ = originalUpdate;
    restored = updateSheetRowFields_ === originalUpdate;
  }

  const result = {
    ok: injectedFailureObserved && restored,
    injectedFailureObserved: injectedFailureObserved,
    originalHelperRestored: restored,
    spreadsheetTouched: false,
    driveTouched: false
  };
  console.log("MEDIA FAILURE INJECTION HARNESS:");
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) throw new Error("MEDIA_FAILURE_INJECTION_HARNESS_FAILED");
  return result;
}
