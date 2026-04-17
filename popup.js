console.log("[push-to-qbt] popup.js loaded");

const DEFAULT_SETTINGS = {
  qbtUrl: "http://localhost:8080",
  qbtUsername: "",
  qbtPassword: "",
  interceptClicks: false,
  interceptHeadCheck: false,
  pauseOnAdd: false,
  category: "",
  savePath: "",
  showNotifications: true,
};

const statusEl    = document.getElementById("status");
const interceptEl = document.getElementById("intercept-clicks");
const pauseEl     = document.getElementById("pause-on-add");
const btnSettings = document.getElementById("btn-settings");
const btnTest     = document.getElementById("btn-test");

browser.storage.local.get(DEFAULT_SETTINGS).then((s) => {
  interceptEl.checked = s.interceptClicks;
  pauseEl.checked     = s.pauseOnAdd;
  testConnection(s);
}).catch((e) => {
  setStatus("err", "Storage error: " + e.message);
});

interceptEl.addEventListener("change", () => {
  browser.storage.local.set({ interceptClicks: interceptEl.checked });
});
pauseEl.addEventListener("change", () => {
  browser.storage.local.set({ pauseOnAdd: pauseEl.checked });
});

btnSettings.addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

btnTest.addEventListener("click", async () => {
  btnTest.disabled = true;
  const s = await browser.storage.local.get(DEFAULT_SETTINGS);
  await testConnection(s);
  btnTest.disabled = false;
});

async function testConnection(s) {
  setStatus("checking", "Checking connection...");
  const base = s.qbtUrl.replace(/\/$/, "");
  try {
    const loginResp = await fetch(`${base}/api/v2/auth/login`, {
      method: "POST",
      body: new URLSearchParams({ username: s.qbtUsername, password: s.qbtPassword }),
      credentials: "include",
    });
    const text = await loginResp.text();
    if (text.trim() !== "Ok.") throw new Error(`Login failed: ${text.trim()}`);
    const verResp = await fetch(`${base}/api/v2/app/version`, { credentials: "include" });
    const ver = await verResp.text();
    setStatus("ok", `Connected - qBittorrent ${ver.trim()}`);
  } catch (e) {
    setStatus("err", e.message);
  }
}

function setStatus(cls, msg) {
  statusEl.className = "status " + cls;
  statusEl.textContent = msg;
}
