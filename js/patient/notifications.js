import { initPatientPage } from "./shell.js";
import {
    listMyNotifications, markNotificationRead, markAllNotificationsRead, enablePush, isPushConfigured
} from "../services/notifications-service.js";
import { icon, skeletonList, emptyState, renderError, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, pageUrl, relativeTime, NOTIFICATION_ICONS, friendlyError } from "../utils.js";

const { user } = await initPatientPage("notifications");

const main = document.getElementById("main");
const markAllButton = document.getElementById("mark-all");
let notifications = [];

function render() {
    markAllButton.hidden = !notifications.some((n) => !n.read);
    const pushBox = isPushConfigured() && Notification.permission !== "granted"
        ? `<div class="card push-card">
            <span class="push-card__icon">${icon("bell", 22)}</span>
            <div><strong>Receba avisos no celular</strong><small>Saiba na hora quando seu atendimento for agendado.</small></div>
            <button type="button" class="btn btn-secondary btn-sm" id="enable-push">Ativar</button>
        </div>` : "";

    if (!notifications.length) {
        main.innerHTML = pushBox + emptyState({
            title: "Nenhum aviso por enquanto.",
            text: "Você será avisado aqui sobre documentos, aprovações e agendamentos.",
            iconName: "bell"
        });
        return;
    }
    main.innerHTML = pushBox + `<ul class="notification-list">${notifications.map((n) => `
        <li>
            <button type="button" class="notification-item ${n.read ? "" : "notification-item--unread"}" data-id="${escapeHtml(n.id)}">
                <span class="notification-item__icon">${icon(NOTIFICATION_ICONS[n.type] || "bell", 20)}</span>
                <span class="notification-item__body">
                    <strong>${escapeHtml(n.title)}</strong>
                    <span>${escapeHtml(n.message)}</span>
                    <small>${relativeTime(n.createdAt)}${n.read ? "" : " · <span class=\"unread-label\">Novo</span>"}</small>
                </span>
            </button>
        </li>`).join("")}</ul>`;
}

main.addEventListener("click", async (event) => {
    const pushButton = event.target.closest("#enable-push");
    if (pushButton) {
        try {
            setButtonLoading(pushButton, true, "Ativando...");
            await enablePush(user.uid);
            toast("Notificações ativadas neste aparelho.", "success");
            render();
        } catch (error) {
            console.error(error);
            setButtonLoading(pushButton, false);
            toast(friendlyError(error), "error", 7000);
        }
        return;
    }

    const item = event.target.closest("[data-id]");
    if (!item) return;
    const notification = notifications.find((n) => n.id === item.dataset.id);
    if (!notification) return;
    if (!notification.read) {
        markNotificationRead(notification.id).catch((error) => console.warn(error));
    }
    window.location.href = notification.requestId
        ? pageUrl("app/solicitacao.html", { id: notification.requestId })
        : pageUrl(notification.type?.startsWith("APPOINTMENT") ? "app/agendamentos.html" : "app/solicitacoes.html");
});

markAllButton.addEventListener("click", async () => {
    try {
        setButtonLoading(markAllButton, true, "Marcando...");
        await markAllNotificationsRead(notifications);
        notifications = notifications.map((n) => ({ ...n, read: true }));
        setButtonLoading(markAllButton, false);
        render();
    } catch (error) {
        console.error(error);
        setButtonLoading(markAllButton, false);
        toast(friendlyError(error), "error");
    }
});

async function load() {
    main.innerHTML = skeletonList(4);
    try {
        notifications = await listMyNotifications(user.uid);
        render();
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: "Não conseguimos carregar seus avisos." });
    }
}

load();
