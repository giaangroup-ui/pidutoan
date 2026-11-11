/* Cài app (PWA): đăng ký service worker theo phiên bản, nút «Cài app», gợi ý iOS, kiểm tra bản mới. */
(function () {
  const meta = document.querySelector('meta[name="app-version"]');
  const CUR = (meta && meta.content) || "dev";
  window.PIDUTOAN_VERSION = CUR;
  const btn = document.getElementById("installBtn");
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferred = null;
  function iosHint() {
    if (document.querySelector(".ios-hint")) return;
    const d = document.createElement("div");
    d.className = "ios-hint";
    d.innerHTML = 'Cài PiDự toán trên iPhone/iPad: mở bằng Safari → <b>Chia sẻ</b> → <b>Thêm vào MH chính</b>. <button class="btn" style="margin-left:8px">Đóng</button>';
    d.querySelector("button").onclick = () => d.remove();
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 15000);
  }
  if (btn) {
    if (!standalone() && isIos) btn.hidden = false;
    btn.onclick = async () => {
      if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; btn.hidden = true; return; }
      if (isIos) { iosHint(); return; }
      alert("Trình duyệt chưa cho cài trực tiếp. Trên Chrome/Edge: menu ⋮ → «Cài đặt PiDự toán» / «Thêm vào màn hình chính».");
    };
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; if (btn && !standalone()) btn.hidden = false; });
  window.addEventListener("appinstalled", () => { deferred = null; if (btn) btn.hidden = true; });
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js?v=" + encodeURIComponent(CUR), { scope: "./" }).catch(() => {}));
  }
  // Bản mới: so version.json; có bản mới thì đăng ký SW mới và mời tải lại.
  async function check() {
    try {
      const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (!j.v || j.v === CUR || CUR === "dev") return;
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v=" + encodeURIComponent(j.v), { scope: "./" }).catch(() => {});
      if (document.querySelector(".upd-bar")) return;
      const d = document.createElement("div");
      d.className = "ios-hint upd-bar";
      d.innerHTML = '🔄 Có phiên bản mới (' + j.v + '). <button class="btn pri" style="margin-left:8px">Tải lại</button>';
      d.querySelector("button").onclick = () => location.reload();
      document.body.appendChild(d);
    } catch (e) {}
  }
  setTimeout(check, 3000);
  setInterval(check, 10 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
})();
