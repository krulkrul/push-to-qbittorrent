console.log("[push-to-qbt] options.js loaded");

const DEFAULT_SETTINGS = {
  qbtUrl: "http://localhost:8080",
  qbtUsername: "",
  qbtPassword: "",
  interceptClicks: true,
  pauseOnAdd: false,
  showNotifications: true,
};

const urlEl       = document.getElementById("qbt-url");
const userEl      = document.getElementById("qbt-user");
const passEl      = document.getElementById("qbt-pass");
const interceptEl = document.getElementById("intercept-clicks");
const pauseEl     = document.getElementById("pause-on-add");
const notifEl     = document.getElementById("notifications");
const statusEl    = document.getElementById("status");
const btnSave     = document.getElementById("btn-save");
const btnTest     = document.getElementById("btn-test");

// -- load saved settings (override HTML defaults) --------------------------

browser.storage.local.get(DEFAULT_SETTINGS).then((s) => {
  console.log("[push-to-qbt] storage loaded:", JSON.stringify(s));
  urlEl.value         = s.qbtUrl;
  userEl.value        = s.qbtUsername;
  passEl.value        = s.qbtPassword;
  interceptEl.checked = s.interceptClicks;
  pauseEl.checked     = s.pauseOnAdd;
  notifEl.checked     = s.showNotifications;
}).catch((e) => {
  console.error("[push-to-qbt] storage.get failed:", e);
});

// -- save ------------------------------------------------------------------

btnSave.addEventListener("click", () => {
  const settings = {
    qbtUrl:            urlEl.value.trim().replace(/\/$/, ""),
    qbtUsername:       userEl.value.trim(),
    qbtPassword:       passEl.value,
    interceptClicks:   interceptEl.checked,
    pauseOnAdd:        pauseEl.checked,
    showNotifications: notifEl.checked,
  };
  browser.storage.local.set(settings).then(() => {
    setStatus("info", "Settings saved.");
    setTimeout(() => { statusEl.className = ""; statusEl.textContent = ""; }, 2000);
  }).catch((e) => {
    setStatus("err", "Save failed: " + e.message);
  });
});

// -- test ------------------------------------------------------------------

btnTest.addEventListener("click", async () => {
  btnTest.disabled = true;
  await testConnection({
    qbtUrl:      urlEl.value.trim().replace(/\/$/, ""),
    qbtUsername: userEl.value.trim(),
    qbtPassword: passEl.value,
  });
  btnTest.disabled = false;
});

async function testConnection(s) {
  setStatus("info", "Connecting...");
  try {
    const loginResp = await fetch(`${s.qbtUrl}/api/v2/auth/login`, {
      method: "POST",
      body: new URLSearchParams({ username: s.qbtUsername, password: s.qbtPassword }),
      credentials: "include",
    });
    const loginText = await loginResp.text();
    if (loginText.trim() !== "Ok.") throw new Error(`Login failed: ${loginText.trim()}`);

    const verResp = await fetch(`${s.qbtUrl}/api/v2/app/version`, { credentials: "include" });
    const ver = await verResp.text();
    setStatus("ok", `Connected - qBittorrent ${ver.trim()}`);
  } catch (e) {
    console.error("[push-to-qbt] test failed:", e);
    setStatus("err", `Connection failed: ${e.message}`);
  }
}

function setStatus(cls, msg) {
  statusEl.className = cls;
  statusEl.textContent = msg;
}
