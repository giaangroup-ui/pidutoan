// PiDự toán service worker — cache theo phiên bản: sw.js?v=<phiên bản>. Bản mới → cache mới, cache cũ bị xóa.
const V = new URL(self.location).searchParams.get("v") || "dev";
const C = "pidutoan-" + V;
const JS = ["sample-prices", "core", "dxf-takeoff", "xlsx-formula", "excel-io", "arch-standard", "arch-takeoff", "rules", "checks", "docs-store", "pdf-table", "media", "workflow", "app", "pwa"];
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg", "./css/app.css", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-192.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png"].concat(JS.map((f) => "./js/" + f + ".js"));
const CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(dxf-parser@1\.1\.2|xlsx@0\.18\.5|pdfjs-dist@3\.11\.174)\//;
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: "reload" }).then((r) => r.ok && c.put(u, r)).catch(() => {})))));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith("pidutoan-") && x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (CDN.test(r.url)) { // thư viện CDN có số phiên bản cố định → cache-first
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); } return res; })));
    return;
  }
  if (u.origin !== location.origin) return;
  if (u.pathname.endsWith("version.json")) return; // luôn lấy từ mạng
  const fresh = r.mode === "navigate" || /\/$|\.html$|\.js$|\.css$|\.webmanifest$/.test(u.pathname);
  if (fresh) { // network-first để không phục vụ bản cũ khi có mạng
    e.respondWith(fetch(r, { cache: "no-store" }).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); } return res; })
      .catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match("./"))));
    return;
  }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then((m) => m || fetch(r).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); } return res; })));
});
