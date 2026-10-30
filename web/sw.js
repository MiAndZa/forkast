// Keeps the app shell available offline. Same-origin files are fetched from the network first,
// so a new version shows up on the next load, and fall back to the cached copy when offline.
// Bump VERSION when the list of shell files changes.
const VERSION = "larder-v3";
const SHELL = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    // A navigation Request can't take init options, so refetch it by URL.
    fetch(e.request.mode === "navigate" ? e.request.url : e.request, { cache: "no-cache" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
