const CACHE='sala-giochi-v2.6.0';
const ASSETS=[
  './','./index.html','./styles.css','./nextgen.css','./app.js','./nextgen.js','./manifest.webmanifest','./icon.svg','./escape-room-bg.jpg',
  './assets/home-room.svg','./assets/classic-desk.svg','./assets/future-city.svg','./assets/ng-shiftline.svg','./assets/ng-lumina.svg','./assets/ng-everybody.svg','./assets/ng-another.svg','./assets/ng-alibi.svg'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return resp;}).catch(()=>caches.match('./index.html'))));});
