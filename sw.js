// 搬家日記 · Service Worker
// 策略：shell 快取（HTML/icon/fonts）走 stale-while-revalidate；
// Supabase API/Realtime 永遠走網路，不快取（資料才會新鮮）。

const CACHE = 'packing-diary-v1';

const SHELL = [
  './',
  './packing-cloud.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

// 安裝：預先快取 shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(
        // 用個別 add 並吞錯，避免單一檔案 404 整個安裝失敗
        SHELL.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] skip caching', url, err.message);
        }))
      ))
      .then(() => self.skipWaiting())
  );
});

// 啟用：清掉舊版快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// 取得：對 shell 用 stale-while-revalidate；Supabase 直接放行
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 永遠不快取 Supabase REST / Realtime
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((resp) => {
        if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);

      // 有快取就先回快取（很快），同時背景更新
      return cached || fetchPromise;
    })
  );
});
