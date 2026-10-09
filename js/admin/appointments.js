// Agendamentos do município, por dia.
import { initAdminPage } from "./shell.js";
import { listMunicipalityAppointments, finishAppointment, cancelAppointment } from "../services/appointments-service.js";
import { icon, toneBadge, renderError, emptyState, loadingState, confirmDialog, openModal, toast } from "../ui.js";
import {
    escapeHtml, pageUrl, APPOINTMENT_STATUS, ROLE_GROUPS, formatTime, isSameDay, toDate, toDateInputValue,
    friendlyError, userError
} from "../utils.js";

const { profile, actor, content, can } = await initAdminPage("appointments", "Agendamentos");

let appointments = [];

content.innerHTML = `
    <section class="panel">
        <div class="filters">
            <div class="field"><label for="f-date">Data</label><input id="f-date" type="date" class="input" value="${toDateInputValue()}"></div>
            <div class="field"><label for="f-status">Situação</label>
                <select id="f-status" class="input"><option value="">Todas</option>
                ${Object.entries(APPOINTMENT_STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></div>
            <div class="field"><label for="f-reschedule">Pedidos de reagendamento</label>
                <select id="f-reschedule" class="input"><option value="">Mostrar todos</option><option value="yes">Somente com pedido</option></select></div>
        </div>
        <div id="results">${loadingState()}</div>
    </section>`;

const results = document.getElementById("results");
const dateInput = document.getElementById("f-date");
const statusInput = document.getElementById("f-status");
const rescheduleInput = document.getElementById("f-reschedule");

function render() {
    const day = dateInput.value ? new Date(`${dateInput.value}T12:00:00`) : null;
    const onlyReschedule = rescheduleInput.value === "yes";
    const list = appointments.filter((a) => {
        if (onlyReschedule) return a.rescheduleRequested && ["SCHEDULED", "CONFIRMED"].includes(a.status);
        if (day && !isSameDay(a.scheduledFor, day)) return false;
        if (statusInput.value && a.status !== statusInput.value) return false;
        return true;
    });

    if (!list.length) {
        results.innerHTML = emptyState({ title: "Nenhum agendamento encontrado.", iconName: "calendar" });
        return;
    }
    const canAct = can(ROLE_GROUPS.SCHEDULING);
    results.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Data/hora</th><th>Paciente</th><th>Procedimento</th><th>Unidade</th><th>Situação</th><th>Ações</th></tr></thead>
        <tbody>${list.map((a) => {
            const st = APPOINTMENT_STATUS[a.status] || { label: a.status, tone: "neutral" };
            const active = ["SCHEDULED", "CONFIRMED"].includes(a.status);
            return `<tr>
                <td><strong>${toDate(a.scheduledFor)?.toLocaleDateString("pt-BR") || "—"}</strong><br>${formatTime(a.scheduledFor)}</td>
                <td><a href="${pageUrl("admin/solicitacao.html", { id: a.requestId })}">${escapeHtml(a.patientName)}</a><br><small class="text-secondary">${escapeHtml(a.protocol || "")}</small></td>
                <td>${escapeHtml(a.procedureName)}</td>
                <td>${escapeHtml(a.healthUnitName)}</td>
                <td>${toneBadge(st.label, st.tone)}
                    ${a.patientConfirmed ? `<br><small class="text-success">${icon("check", 14)} Confirmado</small>` : ""}
                    ${a.rescheduleRequested && active ? `<br>${toneBadge("Pediu reagendamento", "warning")}` : ""}</td>
                <td class="table-actions">${active && canAct ? `
                    <button type="button" class="btn btn-secondary btn-sm" data-act="COMPLETED" data-id="${escapeHtml(a.id)}">Realizado</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-act="NO_SHOW" data-id="${escapeHtml(a.id)}">Faltou</button>
                    <button type="button" class="btn btn-danger-outline btn-sm" data-act="CANCEL" data-id="${escapeHtml(a.id)}">Cancelar</button>` : ""}</td>
            </tr>`;
        }).join("")}</tbody></table></div>`;
}

[dateInput, statusInput, rescheduleInput].forEach((el) => el.addEventListener("change", render));

results.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const appointment = appointments.find((a) => a.id === button.dataset.id);
    const act = button.dataset.act;
    try {
        if (act === "CANCEL") {
            const result = await openModal({
                title: "Cancelar agendamento",
                confirmLabel: "Cancelar agendamento",
                danger: true,
                body: `<p class="hint">A solicitação volta para a fila e o paciente é avisado.</p>
                    <div class="field"><label for="reason">Motivo</label><textarea id="reason" name="reason" class="input" rows="3" required></textarea></div>`,
                onConfirm: async (form) => {
                    const reason = form.elements.namedItem("reason").value.trim();
                    if (!reason) throw userError("Informe o motivo.");
                    await cancelAppointment({ appointment, actor, reason });
                }
            });
            if (!result) return;
            toast("Agendamento cancelado.", "success");
        } else {
            const ok = await confirmDialog({
                title: act === "COMPLETED" ? "Registrar realização" : "Registrar falta",
                message: `${appointment.patientName} - ${appointment.procedureName}`,
                confirmLabel: "Confirmar",
                danger: act === "NO_SHOW"
            });
            if (!ok) return;
            await finishAppointment({ appointment, actor, outcome: act });
            toast("Registro salvo.", "success");
        }
        await load();
    } catch (error) {
        console.error(error);
        toast(friendlyError(error), "error", 7000);
    }
});

async function load() {
    results.innerHTML = loadingState();
    try {
        appointments = await listMunicipalityAppointments(profile.municipalityId);
        render();
    } catch (error) {
        console.error(error);
        renderError(results, load);
    }
}

load();
