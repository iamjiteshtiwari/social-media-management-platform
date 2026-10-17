/**
 * User media storage service.
 *
 * The caller must authenticate/authorize the user before invoking these
 * internal functions. Drive folder IDs are resolved only from UserResources.
 * Uploads are size-limited to keep Apps Script requests practical.
 */
const MAX_MEDIA_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_MEDIA_MIME_TYPES = Object.freeze({
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video"
});

function uploadUserMedia_(userId, input) {
  const value = input || {};
  const fileName = String(value.file_name || "").trim().replace(/[\\/\\r\\n\\0]/g, "_");
  const mimeType = String(value.mime_type || "").trim().toLowerCase();
  const encoded = String(value.base64_data || "").replace(/^data:[^,]*;base64,/i, "").replace(/\\s/g, "");
  if (!fileName || fileName.length > 180 || !Object.prototype.hasOwnProperty.call(ALLOWED_MEDIA_MIME_TYPES, mimeType) ||
      !encoded || encoded.length > Math.ceil(MAX_MEDIA_UPLOAD_BYTES * 4 / 3) + 16) {
    throw new Error("INVALID_MEDIA_UPLOAD");
  }
  let bytes;
  try {
    bytes = Utilities.base64Decode(encoded);
  } catch (error) {
    throw new Error("INVALID_MEDIA_UPLOAD");
  }
  if (!bytes.length || bytes.length > MAX_MEDIA_UPLOAD_BYTES) throw new Error("MEDIA_SIZE_LIMIT");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  let createdFile = null;
  try {
    const context = getOperationalContextForUser_(userId);
    const folderId = String(context.resource.media_folder_id || "").trim();
    if (!folderId || folderId === String(context.resource.published_media_folder_id || "")) {
      throw new Error("MEDIA_FOLDER_NOT_READY");
    }
    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    createdFile = folder.createFile(blob);
    const library = getRequiredSheet_(context.workbook, "MediaLibrary");
    const now = new Date().toISOString();
    const mediaId = Utilities.getUuid();
    try {
      appendRecord_(library, {
        media_id: mediaId,
        drive_file_id: createdFile.getId(),
        file_name: fileName,
        mime_type: mimeType,
        media_type: ALLOWED_MEDIA_MIME_TYPES[mimeType],
        size_bytes: bytes.length,
        alt_text: String(value.alt_text || "").trim().slice(0, 500),
        status: "available",
        uploaded_at: now,
        updated_at: now,
        retention_status: "normal",
        cleanup_eligible_at: "",
        last_referenced_at: ""
      });
    } catch (sheetError) {
      createdFile.setTrashed(true);
      createdFile = null;
      throw new Error("MEDIA_RECORD_WRITE_FAILED");
    }
    return {
      ok: true,
      code: "MEDIA_UPLOADED",
      media: {
        media_id: mediaId,
        file_name: fileName,
        mime_type: mimeType,
        media_type: ALLOWED_MEDIA_MIME_TYPES[mimeType],
        size_bytes: bytes.length,
        uploaded_at: now
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function deleteUserMedia_(userId, mediaId) {
  const id = String(mediaId || "").trim();
  if (!id) throw new Error("MEDIA_NOT_FOUND");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    const context = getOperationalContextForUser_(userId);
    const library = getRequiredSheet_(context.workbook, "MediaLibrary");
    const match = findRecordByValue_(library, "media_id", id);
    if (!match) throw new Error("MEDIA_NOT_FOUND");
    const media = rowToRecord_(library, match);
    const links = getRequiredSheet_(context.workbook, "PostMedia");
    if (links.getLastRow() >= 2) {
      const map = getHeaderMap_(links);
      const values = links.getRange(2, map.media_id + 1, links.getLastRow() - 1, 1).getDisplayValues();
      if (values.some(function (row) { return String(row[0] || "") === id; })) {
        throw new Error("MEDIA_IN_USE");
      }
    }
    if (String(media.status || "").toLowerCase() === "published" ||
        String(media.retention_status || "").toLowerCase() === "protected") {
      throw new Error("MEDIA_PROTECTED");
    }
    const fileId = String(media.drive_file_id || "");
    const file = DriveApp.getFileById(fileId);
    const parents = file.getParents();
    let inFolder = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === String(context.resource.media_folder_id)) inFolder = true;
    }
    if (!inFolder) throw new Error("MEDIA_FOLDER_MISMATCH");
    file.setTrashed(true);
    updateSheetRowFields_(library, match.rowNumber, {
      status: "trashed",
      retention_status: "cleaned",
      updated_at: new Date().toISOString()
    });
    appendAuditEvent_({
      user_id: String(userId),
      action: "media_deleted",
      outcome: "success",
      target_type: "media",
      target_id: id,
      details: { reason: "USER_REQUEST" }
    });
    return { ok: true, code: "MEDIA_DELETED", media_id: id };
  } finally {
    lock.releaseLock();
  }
}
