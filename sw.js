// 오프라인 지원
// - 항상 네트워크에서 최신 파일을 먼저 받음 (브라우저 HTTP 캐시도 건너뜀)
// - 인터넷이 안 될 때만 저장해 둔 파일 사용
// 게임을 고칠 때마다 index.html의 ?v= 숫자와 아래 CACHE 이름을 함께 올려 주세요.
const CACHE = 'subway-quiz-v5';
const FILES = [
  './',
  './index.html',
  './style.css?v=5',
  './game.js?v=5',
  './data.js?v=5',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  // 같은 사이트 파일은 브라우저 캐시를 건너뛰고 서버에 확인
  const fresh = sameOrigin ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req);
  e.respondWith(
    fresh
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
