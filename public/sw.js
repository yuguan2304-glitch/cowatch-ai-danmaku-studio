/* CoWatch offline shell — caches app assets, never API calls or user videos. */
const CACHE = "cowatch-shell-v1";
const CORE = ["/", "/manifest.webmanifest", "/app-icon.svg"];
const sameOrigin = (url) => url.origin === self.location.origin;

async function warmShell() {
  const cache = await caches.open(CACHE);
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) throw new Error("offline shell unavailable");
  await cache.put("/", response.clone());
  const html = await response.text();
  const assetPaths = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match => match[1]);
  await Promise.allSettled([...CORE.slice(1), ...assetPaths].map(async path => {
    const res = await fetch(path, { cache: "reload" });
    if (res.ok) await cache.put(path, res);
  }));
}
self.addEventListener("install", event => {
  event.waitUntil(warmShell().then(() => self.skipWaiting()).catch(() => undefined));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("cowatch-shell-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;
  const navigation = request.mode === "navigate";
  const asset = url.pathname.startsWith("/assets/") || url.pathname === "/manifest.webmanifest" || url.pathname === "/app-icon.svg";
  if (!navigation && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (asset) {
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }
    try {
      const response = await fetch(request);
      if (response.ok) {
        // Cache a successful application navigation, not API responses.
        await cache.put("/", response.clone());
      }
      return response;
    } catch {
      const saved = await cache.match("/");
      if (saved) return saved;
      return Response.error();
    }
  })());
});
