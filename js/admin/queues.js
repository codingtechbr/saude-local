// Filas por procedimento (criadas automaticamente quando a primeira solicitação entra).
import { initAdminPage } from "./shell.js";
import { listQueues, countWaiting } from "../services/queues-service.js";
import { icon, renderError, emptyState, loadingState } from "../ui.js";
import { escapeHtml, pageUrl } from "../utils.js";

const { profile, content } = await initAdminPage("queues", "Filas");

async function load() {
    content.innerHTML = loadingState();
    try {
        const queues = await listQueues(profile.municipalityId);
        if (!queues.length) {
            content.innerHTML = emptyState({
                title: "Nenhuma fila ainda.",
                text: "As filas são criadas automaticamente quando uma solicitação é aprovada na regulação.",
                iconName: "layers"
            });
            return;
        }
        const counts = await Promise.all(queues.map((q) => countWaiting(q.id, profile.municipalityId)));
        content.innerHTML = `<div class="stat-grid">${queues.map((q, i) => `
            <a class="stat-card" href="${pageUrl("admin/fila.html", { id: q.id })}">
                <span class="stat-card__icon">${icon("layers", 20)}</span>
                <p class="stat-card__label">${escapeHtml(q.name)}</p>
                <p class="stat-card__value">${counts[i].toLocaleString("pt-BR")}</p>
                <p class="stat-card__hint">aguardando vaga</p>
            </a>`).join("")}</div>`;
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
