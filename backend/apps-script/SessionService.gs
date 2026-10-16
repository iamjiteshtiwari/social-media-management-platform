/**
 * Server-side fixed-expiry sessions. Raw credentials are never stored or logged.
 * Session credential transport is not exposed by the API until approved.
 */
const SESSION_ABSOLUTE_LIFETIME_MS = 9 * 60 * 60 * 1000;
function createSession_(userId) {
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    revokeUserSessions_(String(userId),"replaced_by_new_login");
    const token=Utilities.getUuid().replace(/-/g,"")+Utilities.getUuid().replace(/-/g,"");
    const sessionId=Utilities.getUuid(), now=Date.now();
    const record={session_id:sessionId,user_id:String(userId),credential_verifier:hmacBase64_(getRequiredPrivateProperty_("SESSION_HMAC_SECRET"),sessionId+"|"+token),issued_at:new Date(now).toISOString(),expires_at:new Date(now+SESSION_ABSOLUTE_LIFETIME_MS).toISOString(),revoked_at:"",revoke_reason:"",created_at:new Date(now).toISOString()};
    appendRecord_(getRequiredSheet_(getMasterSpreadsheet_(),"Sessions"),record);
    return {token:token,session_id:sessionId,issued_at:record.issued_at,expires_at:record.expires_at};
  } finally { lock.releaseLock(); }
}
function validateSession_(token) {
  if(typeof token!=="string"||token.length<50||token.length>100)return null;
  const sheet=getRequiredSheet_(getMasterSpreadsheet_(),"Sessions"); if(sheet.getLastRow()<2)return null;
  const rows=sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues(),secret=getRequiredPrivateProperty_("SESSION_HMAC_SECRET"),now=Date.now();
  for(let i=rows.length-1;i>=0;i--){const r=rowToRecord_(sheet,rows[i]);if(r.revoked_at||!r.session_id||now>=Date.parse(r.expires_at))continue;const expected=String(r.credential_verifier||""),actual=hmacBase64_(secret,r.session_id+"|"+token);if(!constantTimeStringEqual_(actual,expected))continue;const user=getUserById_(String(r.user_id));return canAccountAuthenticate_(user)?{session_id:String(r.session_id),user:user,expires_at:r.expires_at}:null;}
  return null;
}
function revokeSession_(token,reason) {
  if(typeof token!=="string"||!token)return false;
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{const sheet=getRequiredSheet_(getMasterSpreadsheet_(),"Sessions");if(sheet.getLastRow()<2)return false;const headers=getHeaderMap_(sheet),rows=sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues(),secret=getRequiredPrivateProperty_("SESSION_HMAC_SECRET");
    for(let i=rows.length-1;i>=0;i--){const r=rowToRecord_(sheet,rows[i]);if(r.revoked_at||!r.session_id)continue;if(!constantTimeStringEqual_(hmacBase64_(secret,r.session_id+"|"+token),String(r.credential_verifier||"")))continue;setCellIfColumnExists_(sheet,i+2,headers,"revoked_at",new Date().toISOString());setCellIfColumnExists_(sheet,i+2,headers,"revoke_reason",String(reason||"logout").slice(0,80));appendAuditEvent_({user_id:String(r.user_id),action:"session_revoked",outcome:"success",details:{reason:String(reason||"logout")}});return true;}return false;
  }finally{lock.releaseLock();}
}
function revokeUserSessions_(userId,reason) {
  const sheet=getRequiredSheet_(getMasterSpreadsheet_(),"Sessions");if(sheet.getLastRow()<2)return 0;const headers=getHeaderMap_(sheet),rows=sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).getValues(),now=new Date().toISOString();let count=0;
  rows.forEach(function(values,index){const r=rowToRecord_(sheet,values);if(String(r.user_id)!==String(userId)||r.revoked_at)return;setCellIfColumnExists_(sheet,index+2,headers,"revoked_at",now);setCellIfColumnExists_(sheet,index+2,headers,"revoke_reason",String(reason||"revoked").slice(0,80));count++;});return count;
}
function getUserById_(userId){const sheet=getRequiredSheet_(getMasterSpreadsheet_(),"Users"),found=findRecordByValue_(sheet,"user_id",String(userId));return found?rowToRecord_(sheet,found.values):null;}
