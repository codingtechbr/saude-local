// Inicialização comum das telas do paciente.
import { requirePatient } from "../guards.js";
import { renderBottomNav, setUnreadBadge, registerServiceWorker, hydrateIcons } from "../ui.js";
import { watchUnreadCount } from "../services/notifications-service.js";

export async function initPatientPage(activeNav, { nav = true } = {}) {
    hydrateIcons();
    const session = await requirePatient();
    if (nav) {
        renderBottomNav(activeNav);
        watchUnreadCount(session.user.uid, setUnreadBadge);
    }
    registerServiceWorker();
    return session;
}
