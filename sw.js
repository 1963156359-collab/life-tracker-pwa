/* =========================================================================
   生活记录 · Service Worker（离线缓存）
   -------------------------------------------------------------------------
   策略：
   - 安装时预缓存 应用外壳（index.html / manifest / 图标）；
   - 页面导航请求：网络优先，失败回退缓存（保证打开的是最新页面）；
   - 其它同源静态资源：缓存优先，命中即返回，未命中再请求并写入缓存；
   - 跨域请求一律不处理（本应用本来就没有任何外部资源）。

   更新版本：改了 index.html 等文件后，把 CACHE_NAME 里的版本号 +1，
   重新加载页面即可自动使用新缓存（旧缓存会在 activate 时被清理）。
   ========================================================================= */
'use strict';

const CACHE_NAME = 'life-tracker-v1';
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

/* 安装：预缓存应用外壳 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())          // 新版本立即接管
  );
});

/* 激活：清理旧版本缓存，并接管所有同源页面 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 请求拦截 */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;            // 只缓存 GET

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;  // 只处理同源（本应用无跨域资源）

  /* 页面导航：网络优先，离线时回退到缓存的 index.html */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* 静态资源：缓存优先 */
  event.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});
