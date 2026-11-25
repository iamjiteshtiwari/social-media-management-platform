const API = "http://127.0.0.1:8787";
const output = document.querySelector("#output");
let csrfToken = null;

function show(value) {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { status: response.status });
  return payload;
}

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.querySelector("#email").value,
        password: document.querySelector("#password").value
      })
    });
    csrfToken = result.csrfToken;
    document.querySelector("#password").value = "";
    show({ step: "login", result, cookieReadableByJavaScript: document.cookie.includes("__Host-smm_session") });
  } catch (error) {
    show({ step: "login", error: error.message });
  }
});

document.querySelector("#check").addEventListener("click", async () => {
  try {
    const result = await api("/api/me");
    if (!csrfToken) csrfToken = (await api("/api/csrf")).csrfToken;
    show({ step: "session-validation", result, cookieReadableByJavaScript: document.cookie.includes("__Host-smm_session") });
  } catch (error) {
    show({ step: "session-validation", error: error.message });
  }
});

document.querySelector("#logout").addEventListener("click", async () => {
  try {
    if (!csrfToken) csrfToken = (await api("/api/csrf")).csrfToken;
    const result = await api("/api/logout", {
      method: "POST",
      headers: { "X-SMM-CSRF": csrfToken },
      body: "{}"
    });
    csrfToken = null;
    show({ step: "logout", result, cookieReadableByJavaScript: document.cookie.includes("__Host-smm_session") });
  } catch (error) {
    show({ step: "logout", error: error.message });
  }
});
