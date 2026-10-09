// Avisos ao paciente (coleção notifications) e registro opcional de push (FCM).
import { db, VAPID_KEY, app } from "../firebase-config.js";
import {
    doc, collection, query, where, getDocs, updateDoc, writeBatch,
    onSnapshot, serverTimestamp, arrayUnion
} from "../lib/firestore.js";
import { sortByDate, userError } from "../utils.js";
import { registerServiceWorker } from "../ui.js";

// Adiciona um aviso a um lote existente (usado pelas ações do painel).
export function addNotification(batch, { municipalityId, userId, patientId, requestId = null, type, title, message }) {
    if (!userId) return;
    batch.set(doc(collection(db, "notifications")), {
        municipalityId,
        userId,
        patientId,
        requestId,
        type,
        title,
        message,
        read: false,
        createdAt: serverTimestamp()
    });
}

// Sem orderBy para não exigir índice composto; a ordenação é feita no navegador.
export async function listMyNotifications(uid) {
    const snapshot = await getDocs(query(collection(db, "notifications"), where("userId", "==", uid)));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt", "desc");
}

export function watchUnreadCount(uid, callback) {
    const q = query(collection(db, "notifications"), where("userId", "==", uid), where("read", "==", false));
    return onSnapshot(q, (snapshot) => callback(snapshot.size), (error) => console.warn("Contador de avisos:", error));
}

export function markNotificationRead(id) {
    return updateDoc(doc(db, "notifications", id), { read: true, readAt: serverTimestamp() });
}

export async function markAllNotificationsRead(notifications) {
    const unread = notifications.filter((n) => !n.read).slice(0, 450);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true, readAt: serverTimestamp() }));
    await batch.commit();
}

export function isPushConfigured() {
    return Boolean(VAPID_KEY) && "Notification" in window && "serviceWorker" in navigator;
}

// Ativa notificações push no aparelho e salva o token em users/{uid}.fcmTokens.
export async function enablePush(uid) {
    if (!isPushConfigured()) throw userError("Notificações no celular ainda não foram configuradas pela Secretaria.");
    const { getMessaging, getToken, isSupported } = await import("../lib/messaging.js");
    if (!(await isSupported())) throw userError("Este navegador não permite notificações. No iPhone, adicione o app à tela inicial primeiro.");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw userError("Permissão de notificação negada. Você pode liberar nas configurações do navegador.");

    const registration = await registerServiceWorker();
    if (!registration) throw userError("Não foi possível ativar as notificações neste navegador.");

    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) throw userError("Não foi possível ativar as notificações.");

    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token), updatedAt: serverTimestamp() });
    return token;
}
