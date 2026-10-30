// Love Banqueting — salva l'app sul dispositivo per usarla senza internet
const CACHE = 'love-banqueting-v23';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const NETWORK_TIMEOUT_MS = 3000; // con poco segnale (es. allo stadio) dopo 3 secondi usa la copia salvata

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function fromCache(request) {
  return caches.match(request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'));
}

// Prova la rete (così ricevi gli aggiornamenti). Se non c'è internet, o la rete
// non risponde entro 3 secondi, usa la copia salvata; la rete continua in background
// e aggiorna la copia per la prossima apertura.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const network = fetch(e.request).then(res => {
    // salva solo risposte valide (mai pagine di errore 404/500)
    if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const useCache = () => fromCache(e.request).then(r => {
      if (done) return;
      if (r) { done = true; resolve(r); }
    });
    const timer = setTimeout(useCache, NETWORK_TIMEOUT_MS);
    network.then(res => {
      clearTimeout(timer);
      if (done) return;
      if (res.ok) { done = true; resolve(res); return; }
      // risposta di errore: meglio la copia salvata, se c'è
      fromCache(e.request).then(r => { if (!done) { done = true; resolve(r || res); } });
    }).catch(() => {
      clearTimeout(timer);
      fromCache(e.request).then(r => {
        if (!done) { done = true; resolve(r || new Response('Offline', { status: 503, statusText: 'Offline' })); }
      });
    });
  }));
});
