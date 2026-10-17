/**
 * Protected media-retention maintenance.
 *
 * Cleanup is manual-only and disabled unless ENABLE_MEDIA_CLEANUP=YES.
 * Files are eligible only when they are older than the retention period,
 * recorded in MediaLibrary, not referenced by any PostMedia row, and directly
 * inside the user's mapped media folder. Published media is stored separately.
 * This module is intentionally not exposed through Api.gs.
 */

const MEDIA_RETENTION_DAYS = 30;

function previewMediaCleanupForUser_(userId, retentionDays) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("USER_ID_REQUIRED");
  const days = Number(retentionDays || MEDIA_RETENTION_DAYS);
  if (!Number.isInteger(days) || days < MEDIA_RETENTION_DAYS || days > 3650) {
    throw new Error("INVALID_RETENTION_DAYS");
  }

  const master = getMasterSpreadsheet_();
  const resourcesSheet = getRequiredSheet_(master, "UserResources");
  const resourceMatch = findRecordByValue_(resourcesSheet, "user_id", id);
  if (!resourceMatch) throw new Error("USER_RESOURCE_NOT_FOUND");
  const resource = rowToRecord_(resourcesSheet, resourceMatch);
  if (String(resource.provisioning_status || "").toLowerCase() !== "ready" ||
      !resource.user_spreadsheet_id || !resource.media_folder_id) {
    throw new Error("USER_RESOURCES_NOT_READY");
  }
  if (resource.published_media_folder_id &&
      String(resource.media_folder_id) === String(resource.published_media_folder_id)) {
    throw new Error("MEDIA_AND_PUBLISHED_FOLDERS_MUST_DIFFER");
  }

  const workbook = SpreadsheetApp.openById(String(resource.user_spreadsheet_id));
  const library = getRequiredSheet_(workbook, "MediaLibrary");
  const postMedia = getRequiredSheet_(workbook, "PostMedia");
  const mediaHeaders = getHeaderMap_(library);
  const linkHeaders = getHeaderMap_(postMedia);
  ["media_id", "drive_file_id", "uploaded_at", "status", "retention_status"].forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(mediaHeaders, key)) throw new Error("MEDIA_SCHEMA_INVALID");
  });
  ["media_id", "post_id"].forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(linkHeaders, key)) throw new Error("POST_MEDIA_SCHEMA_INVALID");
  });

  const referenced = {};
  if (postMedia.getLastRow() >= 2) {
    const mediaColumn = linkHeaders.media_id + 1;
    postMedia.getRange(2, mediaColumn, postMedia.getLastRow() - 1, 1).getDisplayValues()
      .forEach(function (row) {
        const mediaId = String(row[0] || "").trim();
        if (mediaId) referenced[mediaId] = true;
      });
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const candidates = [];
  const skipped = { referenced: 0, tooNew: 0, protected: 0, outsideFolder: 0, invalid: 0 };
  if (library.getLastRow() < 2) {
    return { ok: true, dryRun: true, userId: id, retentionDays: days, candidateCount: 0, candidates: [], skipped: skipped };
  }

  const rows = library.getRange(2, 1, library.getLastRow() - 1, library.getLastColumn()).getValues();
  rows.forEach(function (values, index) {
    const media = rowToRecord_(library, { values: values });
    const mediaId = String(media.media_id || "").trim();
    const fileId = String(media.drive_file_id || "").trim();
    if (!mediaId || !fileId) { skipped.invalid++; return; }
    if (referenced[mediaId]) { skipped.referenced++; return; }
    const status = String(media.status || "").toLowerCase();
    const retention = String(media.retention_status || "").toLowerCase();
    if (["published", "publishing", "scheduled", "processing", "protected", "keep"].indexOf(status) >= 0 ||
        ["protected", "keep", "legal_hold", "cleaned"].indexOf(retention) >= 0) {
      skipped.protected++; return;
    }
    const uploaded = new Date(media.uploaded_at).getTime();
    if (!Number.isFinite(uploaded) || uploaded > cutoff) { skipped.tooNew++; return; }

    try {
      const file = DriveApp.getFileById(fileId);
      const parents = file.getParents();
      let inMappedFolder = false;
      while (parents.hasNext()) {
        if (parents.next().getId() === String(resource.media_folder_id)) inMappedFolder = true;
      }
      if (!inMappedFolder || file.isTrashed()) { skipped.outsideFolder++; return; }
      candidates.push({
        rowNumber: index + 2,
        mediaId: mediaId,
        fileId: fileId,
        fileName: String(media.file_name || file.getName()),
        uploadedAt: new Date(uploaded).toISOString()
      });
    } catch (error) {
      skipped.invalid++;
    }
  });

  return {
    ok: true,
    dryRun: true,
    userId: id,
    retentionDays: days,
    cutoffUtc: new Date(cutoff).toISOString(),
    candidateCount: candidates.length,
    candidates: candidates.map(function (item) {
      return { rowNumber: item.rowNumber, mediaId: item.mediaId, fileName: item.fileName, uploadedAt: item.uploadedAt };
    }),
    skipped: skipped
  };
}

/**
 * Explicitly gated manual execution. Preview is recalculated immediately before
 * each file is trashed. It never deletes PostMedia/Posts rows or social-platform
 * content. Keep the opt-in property unset except during an approved run.
 */
function runMediaCleanupForUser_(userId) {
  if (getPrivateProperty_(AppConfig.PROPERTY.ENABLE_MEDIA_CLEANUP) !== "YES") {
    throw new Error("MEDIA_CLEANUP_NOT_ENABLED");
  }
  const preview = previewMediaCleanupForUser_(userId, MEDIA_RETENTION_DAYS);
  const master = getMasterSpreadsheet_();
  const resourcesSheet = getRequiredSheet_(master, "UserResources");
  const resourceMatch = findRecordByValue_(resourcesSheet, "user_id", String(userId));
  const resource = rowToRecord_(resourcesSheet, resourceMatch);
  const workbook = SpreadsheetApp.openById(String(resource.user_spreadsheet_id));
  const library = getRequiredSheet_(workbook, "MediaLibrary");
  const results = [];

  preview.candidates.forEach(function (candidate) {
    try {
      // Recheck that no post references this media immediately before deletion.
      const freshPreview = previewMediaCleanupForUser_(userId, MEDIA_RETENTION_DAYS);
      const stillEligible = freshPreview.candidates.some(function (item) {
        return item.mediaId === candidate.mediaId && item.rowNumber === candidate.rowNumber;
      });
      if (!stillEligible) {
        results.push({ mediaId: candidate.mediaId, result: "skipped_changed" });
        return;
      }
      const fileId = String(candidate.fileId || "");
      // Resolve the file ID from the current MediaLibrary row, not request data.
      const file = DriveApp.getFileById(fileId);
      file.setTrashed(true);
      updateSheetRowFields_(library, candidate.rowNumber, {
        status: "trashed",
        retention_status: "cleaned",
        updated_at: new Date().toISOString()
      });
      appendAuditEvent_({
        actor_type: "system",
        action: "media_retention_cleanup",
        target_type: "media",
        target_id: candidate.mediaId,
        outcome: "trashed",
        details: { reason: "UNREFERENCED_OVER_30_DAYS" }
      });
      results.push({ mediaId: candidate.mediaId, result: "trashed" });
    } catch (error) {
      results.push({ mediaId: candidate.mediaId, result: "failed" });
    }
  });
  return {
    ok: results.every(function (item) { return item.result !== "failed"; }),
    dryRun: false,
    considered: preview.candidateCount,
    trashed: results.filter(function (item) { return item.result === "trashed"; }).length,
    results: results
  };
}
