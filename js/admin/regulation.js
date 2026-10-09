// Fila de trabalho da regulação: solicitações com documentação aprovada.
import { initAdminPage } from "./shell.js";
import { listRequestsByStatuses } from "../services/requests-service.js";
import { statusBadge, renderError, emptyState, loadingState } from "../ui.js";
import { escapeHtml, pageUrl, REQUEST_TYPES, ROLE_GROUPS, formatDate, daysSince, formatCPF } from "../utils.js";

const { profile, content } = await initAdminPage("regulation", "Regulação", ROLE_GROUPS.REGULATION);

async function load() {
    content.innerHTML = loadingState();
    try {
        const requests = await listRequestsByStatuses(profile.municipalityId, ["REGULATION", "WAITING_REGULATION", "APPROVED"]);
        const inProgress = requests.filter((r) => r.status === "REGULATION");
        const waiting = requests.filter((r) => r.status !== "REGULATION");

        const table = (list) => `<div class="table-wrap"><table class="table">
            <thead><tr><th>Protocolo</th><th>Paciente</th><th>Procedimento</th><th>Status</th><th>Enviada</th><th>Dias aguardando</th></tr></thead>
            <tbody>${list.map((r) => `<tr class="is-clickable" data-href="${pageUrl("admin/solicitacao.html", { id: r.id })}" tabindex="0">
                <td><strong>${escapeHtml(r.protocol)}</strong></td>
                <td>${escapeHtml(r.patientName)}<br><small class="text-secondary">${escapeHtml(formatCPF(r.patientCpf))}</small></td>
                <td>${escapeHtml(r.procedureName)}<br><small class="text-secondary">${escapeHtml(REQUEST_TYPES[r.type]?.label || "")}</small></td>
                <td>${statusBadge(r.status, "admin")}</td>
                <td>${formatDate(r.requestedAt || r.createdAt)}</td>
                <td>${daysSince(r.requestedAt || r.createdAt) ?? "—"}</td>
            </tr>`).join("")}</tbody></table></div>`;

        content.innerHTML = `
            <p class="hint mb-16">Ordenadas da mais antiga para a mais recente. Abra a solicitação para aprovar, definir prioridade ou devolver.</p>
            <section class="panel">
                <div class="panel__header"><h2 class="panel__title">Em análise (${inProgress.length})</h2></div>
                ${inProgress.length ? table(inProgress) : '<p class="hint">Nenhuma solicitação em análise.</p>'}
            </section>
            <section class="panel">
                <div class="panel__header"><h2 class="panel__title">Aguardando regulação (${waiting.length})</h2></div>
                ${waiting.length ? table(waiting) : emptyState({ title: "Nada aguardando regulação.", iconName: "check" })}
            </section>`;
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

content.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-href]");
    if (row) window.location.href = row.dataset.href;
});
content.addEventListener("keydown", (event) => {
    const row = event.target.closest("tr[data-href]");
    if (row && event.key === "Enter") window.location.href = row.dataset.href;
});

load();
