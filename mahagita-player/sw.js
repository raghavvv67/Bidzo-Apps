// Offline shell cache for Mahagita Player.
// This only ever touches the app's own files (the page, icons, manifest).
// The audio streams from oshoworld.com are deliberately left alone: they're
// cross-origin Range requests that the browser has to manage itself, and
// routing them through a service worker (as an earlier version did) can slow
// them down or make them stall.
var CACHE_NAME = "mahagita-shell-v2";
var SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  // Not ours (e.g. the oshoworld.com audio) or a Range request (media
  // streaming): don't touch it — the browser handles it natively.
  if (new URL(req.url).origin !== self.location.origin) return;
  if (req.headers.has("range")) return;

  // Opening the app: network first, so a newly published version shows up
  // right away instead of one launch late; the cached copy is only the
  // fallback for when there's no connection.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (response) {
          if (response && response.status === 200) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return response;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match("./index.html");
          });
        })
    );
    return;
  }

  // Icons, manifest, etc.: cached copy first, refreshed in the background.
  event.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req)
        .then(function (response) {
          if (response && response.status === 200 && response.type === "basic") {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
          }
          return response;
        })
        .catch(function () { return cached; });
      return cached || network;
    })
  );
});
