const CACHE='focus-preview-pwa-v13';
const CACHE_PREFIX='focus-preview-';
const BUILD_ASSETS = [];
const FILES=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png',...BUILD_ASSETS];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(FILES))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX) && key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function cacheSuccessfulResponse(event,request,response){
  if(!response || !response.ok) return response;
  const write=caches.open(CACHE)
    .then(cache=>cache.put(request,response.clone()))
    .catch(()=>{});
  event.waitUntil(write);
  return response;
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  // Keep third-party APIs (notably live weather) out of the app-shell cache.
  if(new URL(event.request.url).origin!==self.location.origin) return;
  if(event.request.mode==='navigate' || event.request.url.endsWith('/index.html')){
    event.respondWith(
      fetch(event.request)
        .then(response=>cacheSuccessfulResponse(event,event.request,response))
        .catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then(hit=>hit||fetch(event.request).then(response=>cacheSuccessfulResponse(event,event.request,response)))
  );
});
