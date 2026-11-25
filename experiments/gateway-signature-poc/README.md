# Gateway signature proof (isolated TEST only)

This folder contains a small proof for authenticating Node.js gateway requests to a separate Google Apps Script TEST deployment.

## Safety boundary

- Do not copy this into the existing SMM backend yet.
- Create a separate Apps Script TEST project for this proof.
- The only allowed action is `gateway.health`.
- It does not access Sheets, Drive, login/session functions, Meta, or production resources.
- Never deploy this endpoint as a public production service.
- The gateway secret must never be placed in frontend code or committed to GitHub.

## Files

- `apps-script/GatewaySignatureProof.gs`: standalone Apps Script POST handler.
- `node/gateway-proof-client.mjs`: local Node.js client and synthetic test suite.
- `PROTOCOL.md`: request format and security rules.

## Setup

1. Create a completely separate TEST Apps Script project.
2. Add the contents of `apps-script/GatewaySignatureProof.gs` as its code.
3. In Apps Script Project Settings > Script Properties, add:
   - Property: `GATEWAY_PROOF_HMAC_SECRET`
   - Value: a newly generated random secret of at least 32 characters.
4. Deploy this separate script as a Web App, executing as the script owner and allowing access needed for the test. This endpoint is protected by the HMAC proof, not by obscurity of its URL.
5. Copy the Web App `/exec` URL. Do not paste the secret into GitHub or chat.
6. On Windows Command Prompt, in this folder, set the local environment variables:
   ```cmd
   set SMM_GATEWAY_TEST_URL=https://script.google.com/macros/s/REPLACE_WITH_TEST_DEPLOYMENT_ID/exec
   set SMM_GATEWAY_HMAC_SECRET=PASTE_THE_SAME_SECRET_LOCALLY
   node node/gateway-proof-client.mjs
   ```
7. Keep the secret private. Close the Command Prompt when finished; do not take screenshots showing the secret.

## Expected tests

- Valid signed request accepted.
- Invalid signature rejected.
- Expired timestamp rejected.
- Reused request ID rejected.
- Concurrent duplicate request ID accepted at most once.

The output also reports whether Node followed a redirect and the final response host. A successful run must return parseable JSON for every test. If the redirect response cannot be read, stop and investigate; do not work around it by weakening verification.

## Important implementation caveat

The proof uses Script Properties plus ScriptLock for a short-lived nonce registry and has a conservative active-record cap. This is only a low-volume proof. Measure Apps Script quotas and behavior before any production design decision. The implementation fails closed if the nonce store is unavailable or at capacity.
