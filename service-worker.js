// Service worker do PWA.
// Estratégia "rede primeiro": sempre busca a versão mais nova e usa o cache só sem internet.
// Isso evita o erro clássico de o celular ficar preso em arquivos antigos após uma atualização.
// Dados do Firebase (Firestore/Storage/Auth) NUNCA são guardados em cache aqui.

const CACHE = "saude-municipal-v1";
const OFFLINE_URLS = ["./", "./index.html", "./login.html", "./app/home.html", "./manifest.json", "./assets/logo/logo.svg"];

// Notificações push (FCM). Mesma versão do SDK usada em js/lib/*.js.
try {
    importScripts(
        "https://www.gstatic.com/firebasejs/12.4.0/firebase-app-compat.js",
        "https://www.gstatic.com/firebasejs/12.4.0/firebase-messaging-compat.js"
    );
    firebase.initializeApp({
        apiKey: "AIzaSyBJcyF9rURCQT0_IwgEiVQvH7b6iFhhbk0",
        authDomain: "chamados-hopital.firebaseapp.com",
        projectId: "chamados-hopital",
        storageBucket: "chamados-hopital.firebasestorage.app",
        messagingSenderId: "45373815879",
        appId: "1:45373815879:web:955c2f74963393ae75c562"
    });
    // Mensagens com "notification" são exibidas automaticamente pelo SDK.
    firebase.messaging();
} catch (error) {
    // Sem internet na instalação ou navegador sem suporte: o app continua funcionando sem push.
    console.warn("Push indisponível:", error);
}

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(OFFLINE_URLS))
            .catch(() => undefined)
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);
    // Só arquivos do próprio site; Firebase, Groq e CDNs passam direto.
    if (request.method !== "GET" || url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok && response.type === "basic") {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
});

// O clique na notificação é tratado pelo SDK do Firebase (webpush.fcmOptions.link enviado pela Cloud Function).
