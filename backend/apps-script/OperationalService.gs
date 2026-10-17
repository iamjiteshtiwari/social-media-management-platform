/**
 * Operational workbook business rules for brands, posts and post-media links.
 *
 * These functions are internal service functions only. They are not routed
 * through Api.gs until secure session transport and authorization are approved.
 * Workbook IDs are resolved from trusted UserResources rows, never request data.
 */

function getOperationalContextForUser_(userId) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("USER_ID_REQUIRED");
  const master = getMasterSpreadsheet_();
  const users = getRequiredSheet_(master, "Users");
  const userMatch = findRecordByValue_(users, "user_id", id);
  if (!userMatch) throw new Error("ACCOUNT_NOT_AVAILABLE");
  const user = rowToRecord_(users, userMatch);
  if (!canAccountAuthenticate_(user)) throw new Error("ACCOUNT_NOT_AVAILABLE");

  const resources = getRequiredSheet_(master, "UserResources");
  const resourceMatch = findRecordByValue_(resources, "user_id", id);
  if (!resourceMatch) throw new Error("USER_RESOURCES_NOT_READY");
  const resource = rowToRecord_(resources, resourceMatch);
  if (String(resource.provisioning_status || "").toLowerCase() !== "ready" ||
      String(resource.spreadsheet_status || "").toLowerCase() !== "ready" ||
      !String(resource.user_spreadsheet_id || "").trim()) {
    throw new Error("USER_RESOURCES_NOT_READY");
  }
  if (String(resource.user_spreadsheet_id) === String(getPrivateProperty_(AppConfig.PROPERTY.MASTER_SPREADSHEET_ID))) {
    throw new Error("OPERATIONAL_WORKBOOK_MUST_DIFFER_FROM_MASTER");
  }
  const workbook = SpreadsheetApp.openById(String(resource.user_spreadsheet_id));
  assertOperationalWorkbookSchema_(workbook);
  return { user: user, resource: resource, workbook: workbook };
}

/** Fail closed if an operational workbook is missing tabs or has drifted headers. */
function assertOperationalWorkbookSchema_(workbook) {
  const schema = getOperationalSchema_();
  Object.keys(schema).forEach(function (sheetName) {
    const sheet = workbook.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() !== schema[sheetName].length) {
      throw new Error("OPERATIONAL_SCHEMA_MISMATCH");
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      .map(function (value) { return String(value || "").trim(); });
    if (headers.some(function (header, index) { return header !== schema[sheetName][index]; })) {
      throw new Error("OPERATIONAL_SCHEMA_MISMATCH");
    }
  });
}

function listUserBrands_(userId) {
  const context = getOperationalContextForUser_(userId);
  const sheet = getRequiredSheet_(context.workbook, "Brands");
  return { ok: true, brands: readSheetRecords_(sheet).filter(function (brand) {
    return String(brand.status || "").toLowerCase() !== "deleted";
  }).map(function (brand) {
    return {
      brand_id: String(brand.brand_id),
      brand_name: String(brand.brand_name),
      description: String(brand.description || ""),
      website_url: String(brand.website_url || ""),
      timezone: String(brand.timezone || "Asia/Kolkata"),
      status: String(brand.status || "active"),
      created_at: String(brand.created_at || ""),
      updated_at: String(brand.updated_at || "")
    };
  }) };
}

function createUserBrand_(userId, input) {
  const value = input || {};
  const name = String(value.brand_name || "").trim().replace(/\s+/g, " ");
  const description = String(value.description || "").trim();
  const website = String(value.website_url || "").trim();
  const timezone = String(value.timezone || "Asia/Kolkata").trim();
  if (name.length < 2 || name.length > 100 || description.length > 1000 ||
      website.length > 500 || (website && !/^https?:\/\//i.test(website)) ||
      !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(timezone)) {
    throw new Error("INVALID_BRAND");
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    const context = getOperationalContextForUser_(userId);
    const sheet = getRequiredSheet_(context.workbook, "Brands");
    const now = new Date().toISOString();
    const brandId = Utilities.getUuid();
    appendRecord_(sheet, {
      brand_id: brandId, brand_name: name, description: description,
      website_url: website, timezone: timezone, status: "active",
      created_at: now, updated_at: now
    });
    return { ok: true, code: "BRAND_CREATED", brand_id: brandId };
  } finally {
    lock.releaseLock();
  }
}

function updateUserBrand_(userId, brandId, input) {
  const id = String(brandId || "").trim();
  const value = input || {};
  const fields = {};
  if (Object.prototype.hasOwnProperty.call(value, "brand_name")) {
    const name = String(value.brand_name || "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 100) throw new Error("INVALID_BRAND");
    fields.brand_name = name;
  }
  if (Object.prototype.hasOwnProperty.call(value, "description")) {
    const description = String(value.description || "").trim();
    if (description.length > 1000) throw new Error("INVALID_BRAND");
    fields.description = description;
  }
  if (Object.prototype.hasOwnProperty.call(value, "website_url")) {
    const website = String(value.website_url || "").trim();
    if (website.length > 500 || (website && !/^https?:\/\//i.test(website))) throw new Error("INVALID_BRAND");
    fields.website_url = website;
  }
  if (Object.prototype.hasOwnProperty.call(value, "timezone")) {
    const timezone = String(value.timezone || "").trim();
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(timezone)) throw new Error("INVALID_BRAND");
    fields.timezone = timezone;
  }
  if (!id || !Object.keys(fields).length) throw new Error("INVALID_BRAND_UPDATE");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    const context = getOperationalContextForUser_(userId);
    const sheet = getRequiredSheet_(context.workbook, "Brands");
    const match = findRecordByValue_(sheet, "brand_id", id);
    if (!match) throw new Error("BRAND_NOT_FOUND");
    const brand = rowToRecord_(sheet, match);
    if (String(brand.status || "").toLowerCase() === "deleted") throw new Error("BRAND_NOT_FOUND");
    fields.updated_at = new Date().toISOString();
    updateSheetRowFields_(sheet, match.rowNumber, fields);
    return { ok: true, code: "BRAND_UPDATED", brand_id: id };
  } finally {
    lock.releaseLock();
  }
}

function createUserPost_(userId, input) {
  const value = input || {};
  const brandId = String(value.brand_id || "").trim();
  const caption = String(value.caption || "");
  const firstComment = String(value.first_comment || "");
  const contentType = String(value.content_type || "text").trim().toLowerCase();
  const status = String(value.status || "draft").trim().toLowerCase();
  const timezone = String(value.timezone || "Asia/Kolkata").trim();
  const scheduledRaw = String(value.scheduled_at_utc || "").trim();
  if (!brandId || caption.length > 5000 || firstComment.length > 2200 ||
      ["text", "image", "video", "carousel", "reel", "story"].indexOf(contentType) < 0 ||
      ["draft", "scheduled"].indexOf(status) < 0 ||
      !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(timezone)) {
    throw new Error("INVALID_POST");
  }
  let scheduledAt = "";
  if (status === "scheduled") {
    const time = Date.parse(scheduledRaw);
    if (!scheduledRaw || !Number.isFinite(time) || time <= Date.now()) throw new Error("INVALID_SCHEDULE_TIME");
    scheduledAt = new Date(time).toISOString();
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    const context = getOperationalContextForUser_(userId);
    const brands = getRequiredSheet_(context.workbook, "Brands");
    const brandMatch = findRecordByValue_(brands, "brand_id", brandId);
    if (!brandMatch || String(rowToRecord_(brands, brandMatch).status || "").toLowerCase() !== "active") {
      throw new Error("BRAND_NOT_AVAILABLE");
    }
    const posts = getRequiredSheet_(context.workbook, "Posts");
    const now = new Date().toISOString();
    const postId = Utilities.getUuid();
    appendRecord_(posts, {
      post_id: postId, brand_id: brandId, caption: caption,
      first_comment: firstComment, content_type: contentType, status: status,
      scheduled_at_utc: scheduledAt, timezone: timezone,
      created_at: now, updated_at: now, deleted_at: ""
    });
    return { ok: true, code: "POST_CREATED", post_id: postId, status: status };
  } finally {
    lock.releaseLock();
  }
}

function listUserPosts_(userId, options) {
  const context = getOperationalContextForUser_(userId);
  const opts = options || {};
  const requestedStatus = String(opts.status || "").trim().toLowerCase();
  const allowedStatuses = ["draft", "scheduled", "publishing", "published", "failed", "cancelled", "deleted"];
  if (requestedStatus && allowedStatuses.indexOf(requestedStatus) < 0) throw new Error("INVALID_POST_STATUS");
  const posts = readSheetRecords_(getRequiredSheet_(context.workbook, "Posts"));
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));
  const filtered = posts.filter(function (post) {
    if (!opts.includeDeleted && (post.deleted_at || String(post.status || "").toLowerCase() === "deleted")) return false;
    if (requestedStatus && String(post.status || "").toLowerCase() !== requestedStatus) return false;
    if (opts.brand_id && String(post.brand_id || "") !== String(opts.brand_id)) return false;
    return true;
  }).sort(function (a, b) {
    return String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""));
  }).slice(0, limit).map(function (post) {
    return {
      post_id: String(post.post_id || ""),
      brand_id: String(post.brand_id || ""),
      caption: String(post.caption || ""),
      first_comment: String(post.first_comment || ""),
      content_type: String(post.content_type || "text"),
      status: String(post.status || "draft"),
      scheduled_at_utc: String(post.scheduled_at_utc || ""),
      timezone: String(post.timezone || "Asia/Kolkata"),
      created_at: String(post.created_at || ""),
      updated_at: String(post.updated_at || ""),
      deleted_at: String(post.deleted_at || "")
    };
  });
  return { ok: true, posts: filtered };
}

function addUserPostMedia_(userId, postId, mediaIds) {
  const postKey = String(postId || "").trim();
  const ids = Array.isArray(mediaIds) ? mediaIds.map(function (value) { return String(value || "").trim(); }).filter(Boolean) : [];
  if (!postKey || !ids.length || ids.length > 10 || ids.some(function (id) { return id.length > 100; })) {
    throw new Error("INVALID_POST_MEDIA");
  }
  if (new Set(ids).size !== ids.length) throw new Error("DUPLICATE_MEDIA_ID");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    const context = getOperationalContextForUser_(userId);
    const posts = getRequiredSheet_(context.workbook, "Posts");
    const postMatch = findRecordByValue_(posts, "post_id", postKey);
    if (!postMatch) throw new Error("POST_NOT_FOUND");
    const post = rowToRecord_(posts, postMatch);
    if (post.deleted_at || ["published", "publishing", "deleted"].indexOf(String(post.status || "").toLowerCase()) >= 0) {
      throw new Error("POST_NOT_EDITABLE");
    }
    const library = getRequiredSheet_(context.workbook, "MediaLibrary");
    const links = getRequiredSheet_(context.workbook, "PostMedia");
    const currentLinks = readSheetRecords_(links).filter(function (row) {
      return String(row.post_id || "") === postKey;
    });
    const alreadyLinked = {};
    currentLinks.forEach(function (row) { alreadyLinked[String(row.media_id || "")] = true; });
    if (ids.some(function (mediaId) { return alreadyLinked[mediaId]; })) throw new Error("MEDIA_ALREADY_ATTACHED");
    const existingOrders = currentLinks.map(function (row) { return Number(row.sort_order) || 0; });
    let order = existingOrders.length ? Math.max.apply(null, existingOrders) + 1 : 1;
    const validatedMedia = ids.map(function (mediaId) {
      const mediaMatch = findRecordByValue_(library, "media_id", mediaId);
      if (!mediaMatch) throw new Error("MEDIA_NOT_FOUND");
      const media = rowToRecord_(library, mediaMatch);
      if (String(media.status || "").toLowerCase() !== "available" ||
          String(media.retention_status || "").toLowerCase() === "protected") {
        throw new Error("MEDIA_NOT_AVAILABLE");
      }
      return { mediaId: mediaId, rowNumber: mediaMatch.rowNumber };
    });
    const now = new Date().toISOString();
    // Validate the entire request before the first write to avoid input-driven partial updates.
    validatedMedia.forEach(function (item) {
      appendRecord_(links, {
        post_media_id: Utilities.getUuid(),
        post_id: postKey,
        media_id: item.mediaId,
        sort_order: order++,
        created_at: now
      });
      updateSheetRowFields_(library, item.rowNumber, {
        last_referenced_at: now,
        cleanup_eligible_at: ""
      });
    });
    updateSheetRowFields_(posts, postMatch.rowNumber, { updated_at: now });
    return { ok: true, code: "POST_MEDIA_ATTACHED", post_id: postKey, attached_count: ids.length };
  } finally {
    lock.releaseLock();
  }
}

function createUserPostTarget_(userId, postId, socialConnectionId) {
  const postKey = String(postId || "").trim();
  const connectionKey = String(socialConnectionId || "").trim();
  if (!postKey || !connectionKey) throw new Error("INVALID_POST_TARGET");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    const context = getOperationalContextForUser_(userId);
    const posts = getRequiredSheet_(context.workbook, "Posts");
    const postMatch = findRecordByValue_(posts, "post_id", postKey);
    if (!postMatch) throw new Error("POST_NOT_FOUND");
    const post = rowToRecord_(posts, postMatch);
    if (post.deleted_at || ["published", "publishing", "deleted", "cancelled"].indexOf(String(post.status || "").toLowerCase()) >= 0) {
      throw new Error("POST_NOT_TARGETABLE");
    }

    const master = getMasterSpreadsheet_();
    const connections = getRequiredSheet_(master, "SocialConnections");
    const connectionMatch = findRecordByValue_(connections, "social_connection_id", connectionKey);
    if (!connectionMatch) throw new Error("SOCIAL_CONNECTION_NOT_AVAILABLE");
    const connection = rowToRecord_(connections, connectionMatch);
    if (String(connection.user_id || "") !== String(userId) ||
        String(connection.brand_id || "") !== String(post.brand_id) ||
        String(connection.connection_status || "").toLowerCase() !== "connected" ||
        !String(connection.token_reference || "").trim()) {
      throw new Error("SOCIAL_CONNECTION_NOT_AVAILABLE");
    }

    const targets = getRequiredSheet_(context.workbook, "PostTargets");
    const existing = readSheetRecords_(targets).some(function (target) {
      return String(target.post_id || "") === postKey &&
        String(target.social_connection_id || "") === connectionKey &&
        ["cancelled", "failed"].indexOf(String(target.platform_status || "").toLowerCase()) < 0;
    });
    if (existing) throw new Error("POST_TARGET_ALREADY_EXISTS");
    const now = new Date().toISOString();
    const targetId = Utilities.getUuid();
    const initialStatus = String(post.status || "").toLowerCase() === "scheduled" ? "scheduled" : "pending";
    appendRecord_(targets, {
      target_id: targetId,
      post_id: postKey,
      social_connection_id: connectionKey,
      platform_status: initialStatus,
      scheduled_at_utc: String(post.scheduled_at_utc || ""),
      published_at_utc: "",
      platform_post_id: "",
      attempt_count: 0,
      next_retry_at: "",
      last_error_code: "",
      updated_at: now
    });
    return { ok: true, code: "POST_TARGET_CREATED", target_id: targetId, platform_status: initialStatus };
  } finally {
    lock.releaseLock();
  }
}

function updateUserPost_(userId, postId, input) {
  const id = String(postId || "").trim();
  const value = input || {};
  if (!id) throw new Error("POST_NOT_FOUND");
  const allowed = ["caption", "first_comment", "content_type", "scheduled_at_utc", "timezone", "status"];
  const fields = {};
  allowed.forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(value, key)) fields[key] = value[key];
  });
  if (!Object.keys(fields).length) throw new Error("INVALID_POST_UPDATE");
  if (Object.prototype.hasOwnProperty.call(fields, "caption")) {
    fields.caption = String(fields.caption || "");
    if (fields.caption.length > 5000) throw new Error("INVALID_POST");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "first_comment")) {
    fields.first_comment = String(fields.first_comment || "");
    if (fields.first_comment.length > 2200) throw new Error("INVALID_POST");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "content_type")) {
    fields.content_type = String(fields.content_type || "").toLowerCase();
    if (["text", "image", "video", "carousel", "reel", "story"].indexOf(fields.content_type) < 0) throw new Error("INVALID_POST");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "status")) {
    fields.status = String(fields.status || "").toLowerCase();
    if (["draft", "scheduled", "cancelled"].indexOf(fields.status) < 0) throw new Error("INVALID_POST_STATUS");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "timezone")) {
    fields.timezone = String(fields.timezone || "").trim();
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(fields.timezone)) throw new Error("INVALID_POST");
  }
  if (Object.prototype.hasOwnProperty.call(fields, "scheduled_at_utc")) {
    const raw = String(fields.scheduled_at_utc || "").trim();
    const time = Date.parse(raw);
    if (raw && (!Number.isFinite(time) || time <= Date.now())) throw new Error("INVALID_SCHEDULE_TIME");
    fields.scheduled_at_utc = raw ? new Date(time).toISOString() : "";
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    const context = getOperationalContextForUser_(userId);
    const posts = getRequiredSheet_(context.workbook, "Posts");
    const match = findRecordByValue_(posts, "post_id", id);
    if (!match) throw new Error("POST_NOT_FOUND");
    const post = rowToRecord_(posts, match);
    if (post.deleted_at || ["published", "publishing", "deleted"].indexOf(String(post.status || "").toLowerCase()) >= 0) {
      throw new Error("POST_NOT_EDITABLE");
    }
    if (fields.status === "scheduled") {
      const effectiveSchedule = Object.prototype.hasOwnProperty.call(fields, "scheduled_at_utc")
        ? fields.scheduled_at_utc : String(post.scheduled_at_utc || "");
      const scheduleTime = Date.parse(effectiveSchedule);
      if (!effectiveSchedule || !Number.isFinite(scheduleTime) || scheduleTime <= Date.now()) {
        throw new Error("INVALID_SCHEDULE_TIME");
      }
    }
    const updatedAt = new Date().toISOString();
    fields.updated_at = updatedAt;
    updateSheetRowFields_(posts, match.rowNumber, fields);
    if (fields.status === "cancelled") cancelPostTargets_(context.workbook, id, updatedAt);
    return { ok: true, code: "POST_UPDATED", post_id: id };
  } finally {
    lock.releaseLock();
  }
}

function deleteUserPost_(userId, postId) {
  const id = String(postId || "").trim();
  if (!id) throw new Error("POST_NOT_FOUND");
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("TRY_AGAIN");
  try {
    const context = getOperationalContextForUser_(userId);
    const posts = getRequiredSheet_(context.workbook, "Posts");
    const match = findRecordByValue_(posts, "post_id", id);
    if (!match) throw new Error("POST_NOT_FOUND");
    const post = rowToRecord_(posts, match);
    if (post.deleted_at || ["published", "publishing"].indexOf(String(post.status || "").toLowerCase()) >= 0) {
      throw new Error("POST_NOT_DELETABLE");
    }
    const now = new Date().toISOString();
    updateSheetRowFields_(posts, match.rowNumber, { status: "deleted", deleted_at: now, updated_at: now });
    cancelPostTargets_(context.workbook, id, now);
    appendAuditEvent_({
      user_id: String(userId),
      action: "post_soft_deleted",
      outcome: "success",
      details: {}
    });
    return { ok: true, code: "POST_DELETED", post_id: id };
  } finally {
    lock.releaseLock();
  }
}

/** Returns records keyed by headers; do not use this helper for credential sheets. */
function readSheetRecords_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return values.map(function (row) {
    const record = {};
    headers.forEach(function (header, index) {
      const key = String(header || "").trim();
      if (key) record[key] = row[index];
    });
    return record;
  });
}

/** Cancel queued targets whenever a post is soft-deleted or cancelled. */
function cancelPostTargets_(workbook, postId, nowIso) {
  const targets = getRequiredSheet_(workbook, "PostTargets");
  const match = getHeaderMap_(targets);
  if (!Object.prototype.hasOwnProperty.call(match, "post_id") ||
      !Object.prototype.hasOwnProperty.call(match, "platform_status")) {
    throw new Error("POST_TARGET_SCHEMA_INVALID");
  }
  if (targets.getLastRow() < 2) return 0;
  const rows = targets.getRange(2, 1, targets.getLastRow() - 1, targets.getLastColumn()).getValues();
  let changed = 0;
  rows.forEach(function (values, index) {
    const record = rowToRecord_(targets, { values: values });
    if (String(record.post_id || "") !== String(postId)) return;
    const status = String(record.platform_status || "").toLowerCase();
    if (["published", "publishing"].indexOf(status) >= 0) return;
    updateSheetRowFields_(targets, index + 2, {
      platform_status: "cancelled",
      next_retry_at: "",
      updated_at: nowIso
    });
    changed++;
  });
  return changed;
}
