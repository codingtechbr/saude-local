// Inicialização única do Firebase.
// Todos os módulos importam os SDKs através de js/lib/*.js, que fixam a MESMA versão.
// Misturar versões diferentes do SDK é uma causa comum de erros como
// "Type does not match the expected instance".
import { initializeApp } from "./lib/app.js";
import { getAuth, connectAuthEmulator } from "./lib/auth.js";
import { getFirestore, connectFirestoreEmulator } from "./lib/firestore.js";
import { getStorage, connectStorageEmulator } from "./lib/storage.js";
import { getFunctions, connectFunctionsEmulator } from "./lib/functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyBJcyF9rURCQT0_IwgEiVQvH7b6iFhhbk0",
    authDomain: "chamados-hopital.firebaseapp.com",
    projectId: "chamados-hopital",
    storageBucket: "chamados-hopital.firebasestorage.app",
    messagingSenderId: "45373815879",
    appId: "1:45373815879:web:955c2f74963393ae75c562"
};

// Município atendido por esta instalação (multi-tenancy desde o início).
export const MUNICIPALITY_ID = "municipio001";

// Nome exibido ao cidadão (independente do ID do projeto Firebase).
export const APP_NAME = "Saúde Municipal";

// Precisa ser a MESMA região usada em functions/config.js.
export const FUNCTIONS_REGION = "southamerica-east1";

// Chave pública VAPID (Console Firebase > Configurações do projeto > Cloud Messaging > Certificados push da Web).
// Enquanto estiver vazia, o botão de notificações push fica desativado e o app usa apenas os avisos internos.
export const VAPID_KEY = "";

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
auth.languageCode = "pt-BR";

const db = getFirestore(app);

const storage = getStorage(app);

const functions = getFunctions(app, FUNCTIONS_REGION);

// Emuladores locais para desenvolvimento (somente em localhost).
// Abra qualquer página com ?emulator=1 para ligar e ?emulator=0 para desligar.
function shouldUseEmulators() {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return false;
    try {
        const flag = new URLSearchParams(window.location.search).get("emulator");
        if (flag === "1") localStorage.setItem("useEmulators", "1");
        if (flag === "0") localStorage.removeItem("useEmulators");
        return localStorage.getItem("useEmulators") === "1";
    } catch {
        return false;
    }
}

export const USING_EMULATORS = shouldUseEmulators();

if (USING_EMULATORS) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    console.info("Firebase: usando EMULADORES locais.");
}

export {
    app,
    auth,
    db,
    storage,
    functions,
    firebaseConfig
};
