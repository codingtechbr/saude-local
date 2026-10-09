// Uma fila: pacientes aguardando (por prioridade e data de entrada) e agendados.
import { initAdminPage } from "./shell.js";
import { openScheduleModal } from "./scheduling.js";
import { getQueue, listQueueEntries } from "../services/queues-service.js";
import { getRequest } from "../services/requests-service.js";
import { icon, priorityBadge, renderError, emptyState, loadingState, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, getParam, pageUrl, formatDate, formatDateTime, daysSince, ROLE_GROUPS, friendlyError } from "../utils.js";

const { profile, actor, content, can } = await initAdminPage("queues", "Fila");

const queueId = getParam("id");
let tab = "WAITING";

async function load() {
    if (!queueId) {
        renderError(content, null, { title: "Fila não informada." });
        return;
    }
    content.innerHTML = loadingState();
    try {
        const queue = await getQueue(queueId);
        if (!queue) {
            renderError(content, null, { title: "Fila não encontrada." });
            return;
        }
        document.querySelector(".admin-topbar h1").textContent = queue.name;
        const entries = await listQueueEntries(queueId, profile.municipalityId, tab);

        content.innerHTML = `
            <a class="back-link" href="${pageUrl("admin/filas.html")}">${icon("chevronLeft", 18)} Todas as filas</a>
            <div class="tabs tabs--inline mb-16" role="tablist">
                <button type="button" class="tab" role="tab" data-tab="WAITING" aria-selected="${tab === "WAITING"}">Aguardando vaga</button>
                <button type="button" class="tab" role="tab" data-tab="SCHEDULED" aria-selected="${tab === "SCHEDULED"}">Agendados</button>
            </div>
            <section class="panel">
                ${entries.length ? `<div class="table-wrap"><table class="table">
                    <thead><tr><th>#</th><th>Paciente</th><th>Protocolo</th><th>Prioridade</th><th>Entrada</th><th>Dias</th>${tab === "SCHEDULED" ? "<th>Agendado para</th>" : "<th></th>"}</tr></thead>
                    <tbody>${entries.map((e, i) => `<tr>
                        <td><strong>${i + 1}</strong></td>
                        <td><a href="${pageUrl("admin/solicitacao.html", { id: e.requestId })}">${escapeHtml(e.patientName)}</a></td>
                        <td>${escapeHtml(e.protocol)}</td>
                        <td>${priorityBadge(e.priority)}</td>
                        <td>${formatDate(e.enteredAt)}</td>
                        <td>${daysSince(e.enteredAt) ?? "—"}</td>
                        ${tab === "SCHEDULED"
                            ? `<td>${formatDateTime(e.scheduledAt)}</td>`
                            : `<td>${can(ROLE_GROUPS.SCHEDULING) ? `<button type="button" class="btn btn-primary btn-sm" data-schedule="${escapeHtml(e.requestId)}">${icon("calendar", 16)} Agendar</button>` : ""}</td>`}
                    </tr>`).join("")}</tbody></table></div>`
                    : emptyState({ title: tab === "WAITING" ? "Ninguém aguardando nesta fila." : "Nenhum agendamento pendente.", iconName: "check" })}
            </section>`;
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

content.addEventListener("click", async (event) => {
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) {
        tab = tabButton.dataset.tab;
        load();
        return;
    }
    const button = event.target.closest("[data-schedule]");
    if (!button) return;
    try {
        setButtonLoading(button, true, "Abrindo...");
        const request = await getRequest(button.dataset.schedule);
        setButtonLoading(button, false);
        const result = await openScheduleModal({ request, actor });
        if (result) {
            toast("Agendamento criado e paciente avisado.", "success");
            load();
        }
    } catch (error) {
        console.error(error);
        setButtonLoading(button, false);
        toast(friendlyError(error), "error", 7000);
    }
});

load();
