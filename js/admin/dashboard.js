import { initAdminPage } from "./shell.js";
import { countRequests } from "../services/requests-service.js";
import { listMunicipalityAppointments } from "../services/appointments-service.js";
import { icon, renderError, toneBadge } from "../ui.js";
import { escapeHtml, pageUrl, isSameDay, formatTime, APPOINTMENT_STATUS } from "../utils.js";

const { profile, content } = await initAdminPage("dashboard", "Dashboard");

const INDICATORS = [
    { label: "Novas solicitações", statuses: ["SUBMITTED", "DOCUMENT_REVIEW"], icon: "list", hint: "Aguardando análise documental" },
    { label: "Documentos pendentes", statuses: ["DOCUMENT_PENDING"], icon: "alert", hint: "Aguardando o paciente" },
    { label: "Aguardando regulação", statuses: ["WAITING_REGULATION"], icon: "shield" },
    { label: "Em análise na regulação", statuses: ["REGULATION"], icon: "activity" },
    { label: "Aguardando vaga", statuses: ["APPROVED", "WAITING_QUEUE"], icon: "layers" },
    { label: "Agendados", statuses: ["SCHEDULED", "CONFIRMED"], icon: "calendar" },
    { label: "Não comparecimentos", statuses: ["NO_SHOW"], icon: "x" },
    { label: "Procedimentos concluídos", statuses: ["COMPLETED"], icon: "check" }
];

async function load() {
    content.innerHTML = `<div class="stat-grid">${INDICATORS.map(() => '<div class="stat-card skeleton"></div>').join("")}</div>`;
    try {
        const counts = await Promise.all(INDICATORS.map(async (ind) => {
            const values = await Promise.all(ind.statuses.map((s) => countRequests(profile.municipalityId, s)));
            return values.reduce((a, b) => a + b, 0);
        }));
        const appointments = await listMunicipalityAppointments(profile.municipalityId);
        const today = appointments.filter((a) => isSameDay(a.scheduledFor, new Date()) && a.status !== "CANCELLED");

        content.innerHTML = `
            <div class="stat-grid">
                ${INDICATORS.map((ind, i) => `
                    <a class="stat-card" href="${pageUrl("admin/solicitacoes.html", { status: ind.statuses.join(",") })}">
                        <span class="stat-card__icon">${icon(ind.icon, 20)}</span>
                        <p class="stat-card__label">${escapeHtml(ind.label)}</p>
                        <p class="stat-card__value">${counts[i].toLocaleString("pt-BR")}</p>
                        ${ind.hint ? `<p class="stat-card__hint">${escapeHtml(ind.hint)}</p>` : ""}
                    </a>`).join("")}
                <a class="stat-card stat-card--accent" href="${pageUrl("admin/agendamentos.html")}">
                    <span class="stat-card__icon">${icon("clock", 20)}</span>
                    <p class="stat-card__label">Agendamentos de hoje</p>
                    <p class="stat-card__value">${today.length.toLocaleString("pt-BR")}</p>
                </a>
            </div>

            <section class="panel mt-24">
                <div class="panel__header">
                    <h2 class="panel__title">Agenda de hoje</h2>
                    <a class="btn btn-secondary btn-sm" href="${pageUrl("admin/agendamentos.html")}">Ver agendamentos</a>
                </div>
                ${today.length ? `<div class="table-wrap"><table class="table">
                    <thead><tr><th>Horário</th><th>Paciente</th><th>Procedimento</th><th>Unidade</th><th>Situação</th></tr></thead>
                    <tbody>${today.map((a) => {
                        const st = APPOINTMENT_STATUS[a.status] || { label: a.status, tone: "neutral" };
                        return `<tr class="is-clickable" data-href="${pageUrl("admin/solicitacao.html", { id: a.requestId })}">
                            <td><strong>${formatTime(a.scheduledFor)}</strong></td>
                            <td>${escapeHtml(a.patientName)}</td>
                            <td>${escapeHtml(a.procedureName)}</td>
                            <td>${escapeHtml(a.healthUnitName)}</td>
                            <td>${toneBadge(st.label, st.tone)}</td>
                        </tr>`;
                    }).join("")}</tbody></table></div>` : '<p class="hint">Nenhum agendamento para hoje.</p>'}
            </section>`;
    } catch (error) {
        console.error(error);
        renderError(content, load, { title: "Não foi possível carregar os indicadores." });
    }
}

content.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-href]");
    if (row) window.location.href = row.dataset.href;
});

load();
