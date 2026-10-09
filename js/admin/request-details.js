// Detalhe da solicitação no painel: análise documental, regulação, fila e agendamento.
import { initAdminPage } from "./shell.js";
import { openScheduleModal } from "./scheduling.js";
import {
    getRequest, listRequestDocuments, listRequestHistory, latestDocumentsByType, documentsReady,
    reviewDocument, requestNewDocument, approveDocumentation, startRegulation, returnToDocumentation,
    enterQueue, changePriority, cancelRequest
} from "../services/requests-service.js";
import { getAppointment, finishAppointment, cancelAppointment } from "../services/appointments-service.js";
import { getFileUrl, isImagePath } from "../services/storage-service.js";
import { buildTimeline, renderTimeline } from "../timeline.js";
import {
    icon, statusBadge, priorityBadge, toneBadge, renderError, loadingState, openModal, confirmDialog,
    toast, setButtonLoading, printFile, printButtonHtml
} from "../ui.js";
import {
    escapeHtml, getParam, pageUrl, STATUS, PRIORITY, REQUEST_TYPES, DOCUMENT_TYPES, DOCUMENT_STATUS,
    REJECT_REASONS, APPOINTMENT_STATUS, ROLE_GROUPS, FINAL_STATUSES, formatDate, formatDateTime, formatCPF,
    formatLongDate, formatTime, friendlyError, userError
} from "../utils.js";

const { actor, content, can } = await initAdminPage("requests", "Solicitação");

const requestId = getParam("id");
let request = null;
let documents = [];
let history = [];
let appointment = null;

/* ---------- Renderização ---------- */

function actionsFor(r) {
    const actions = [];
    const docsStage = ["SUBMITTED", "DOCUMENT_REVIEW", "DOCUMENT_PENDING"].includes(r.status);
    if (docsStage && can(ROLE_GROUPS.DOCUMENTS)) {
        const ready = documentsReady(documents);
        actions.push({ id: "approve-docs", label: "Aprovar documentação", primary: true, disabled: !ready, hint: ready ? "" : "Aprove todos os documentos para liberar" });
        actions.push({ id: "request-doc", label: "Solicitar documento" });
    }
    if (["WAITING_REGULATION", "REGULATION", "APPROVED"].includes(r.status) && can(ROLE_GROUPS.REGULATION)) {
        if (r.status === "WAITING_REGULATION") actions.push({ id: "start-regulation", label: "Iniciar regulação" });
        actions.push({ id: "regulate", label: "Aprovar e enviar para a fila", primary: true });
        if (r.status !== "APPROVED") actions.push({ id: "return-docs", label: "Devolver para documentação" });
    }
    if (r.status === "WAITING_QUEUE") {
        if (can(ROLE_GROUPS.SCHEDULING)) actions.push({ id: "schedule", label: "Agendar", primary: true });
        if (can(ROLE_GROUPS.REGULATION)) actions.push({ id: "priority", label: "Alterar prioridade" });
    }
    if (["SCHEDULED", "CONFIRMED"].includes(r.status) && appointment && can(ROLE_GROUPS.SCHEDULING)) {
        actions.push({ id: "complete", label: "Registrar realização", primary: true });
        actions.push({ id: "no-show", label: "Registrar falta" });
        actions.push({ id: "cancel-appointment", label: "Cancelar agendamento" });
    }
    if (!FINAL_STATUSES.includes(r.status)) {
        actions.push({ id: "cancel", label: ["WAITING_REGULATION", "REGULATION"].includes(r.status) ? "Negar solicitação" : "Cancelar solicitação", danger: true });
    }
    return actions;
}

function documentsHtml() {
    if (!documents.length) return '<p class="hint">Nenhum documento enviado.</p>';
    const latest = latestDocumentsByType(documents);
    const reviewable = ["SUBMITTED", "DOCUMENT_REVIEW", "DOCUMENT_PENDING"].includes(request.status) && can(ROLE_GROUPS.DOCUMENTS);
    return documents.map((d) => {
        const status = DOCUMENT_STATUS[d.status] || DOCUMENT_STATUS.PENDING;
        const superseded = latest[d.type]?.id !== d.id;
        return `<div class="doc-item ${superseded ? "doc-item--superseded" : ""}">
            <span class="doc-item__icon">${icon("file", 22)}</span>
            <div class="doc-item__info">
                <strong>${escapeHtml(DOCUMENT_TYPES[d.type] || d.type)}</strong>
                <small>${escapeHtml(d.fileName || "")} · enviado em ${formatDateTime(d.uploadedAt)}</small>
                ${d.reviewReason ? `<small class="text-danger">Motivo: ${escapeHtml(d.reviewReason)}</small>` : ""}
                ${d.reviewedByName ? `<small>Analisado por ${escapeHtml(d.reviewedByName)} em ${formatDateTime(d.reviewedAt)}</small>` : ""}
            </div>
            <div class="doc-item__actions">
                ${superseded ? toneBadge("Substituído", "neutral") : `<span class="badge badge--${status.tone}">${status.label}</span>`}
                <button type="button" class="btn btn-secondary btn-sm" data-view="${escapeHtml(d.id)}">${icon("eye", 16)} Ver</button>
                ${reviewable && !superseded && d.status === "PENDING" ? `
                    <button type="button" class="btn btn-primary btn-sm" data-approve-doc="${escapeHtml(d.id)}">${icon("check", 16)} Aprovar</button>
                    <button type="button" class="btn btn-danger btn-sm" data-reject-doc="${escapeHtml(d.id)}">${icon("x", 16)} Recusar</button>` : ""}
            </div>
        </div>`;
    }).join("");
}

function historyHtml() {
    if (!history.length) return '<p class="hint">Sem registros.</p>';
    return `<div class="table-wrap"><table class="table table--compact">
        <thead><tr><th>Data</th><th>De</th><th>Para</th><th>Responsável</th><th>Observação</th></tr></thead>
        <tbody>${[...history].reverse().map((h) => `<tr>
            <td>${formatDateTime(h.createdAt)}</td>
            <td>${h.previousStatus ? escapeHtml(STATUS[h.previousStatus]?.admin || h.previousStatus) : "—"}</td>
            <td>${escapeHtml(STATUS[h.newStatus]?.admin || h.newStatus)}</td>
            <td>${escapeHtml(h.changedByName || "—")}</td>
            <td>${escapeHtml(h.reason || "")}</td>
        </tr>`).join("")}</tbody></table></div>`;
}

function appointmentHtml() {
    if (!appointment) return "";
    const st = APPOINTMENT_STATUS[appointment.status] || { label: appointment.status, tone: "neutral" };
    return `<section class="panel">
        <h2 class="panel__title">Agendamento</h2>
        <dl class="kv">
            <dt>Data</dt><dd>${formatLongDate(appointment.scheduledFor)} às ${formatTime(appointment.scheduledFor)}</dd>
            <dt>Unidade</dt><dd>${escapeHtml(appointment.healthUnitName)}</dd>
            <dt>Situação</dt><dd>${toneBadge(st.label, st.tone)}</dd>
            <dt>Paciente confirmou</dt><dd>${appointment.patientConfirmed ? "Sim" : "Não"}</dd>
            ${appointment.rescheduleRequested ? `<dt>Atenção</dt><dd>${toneBadge("Paciente pediu reagendamento", "warning")}</dd>` : ""}
            ${appointment.instructions ? `<dt>Orientações</dt><dd>${escapeHtml(appointment.instructions)}</dd>` : ""}
        </dl>
    </section>`;
}

function render() {
    const actions = actionsFor(request);
    document.querySelector(".admin-topbar h1").textContent = `Solicitação ${request.protocol}`;
    content.innerHTML = `
        <div class="page-toolbar no-print">
            <a class="back-link" href="${pageUrl("admin/solicitacoes.html")}">${icon("chevronLeft", 18)} Voltar para solicitações</a>
            <button type="button" class="btn btn-secondary btn-sm" data-print-page>${icon("printer", 16)} Imprimir solicitação</button>
        </div>
        <section class="panel request-hero">
            <div class="request-hero__main">
                <p class="hint">${escapeHtml(REQUEST_TYPES[request.type]?.label || "")} · Protocolo ${escapeHtml(request.protocol)}</p>
                <h2 class="request-hero__title">${escapeHtml(request.procedureName)}</h2>
                <div class="badge-row">${statusBadge(request.status, "admin")} ${priorityBadge(request.priority)}
                    ${request.requiresRegulation === false ? toneBadge("Sem regulação", "neutral") : ""}</div>
                ${request.status === "DOCUMENT_PENDING" && request.pendingReason ? `<p class="alert alert--warning mt-16">${icon("alert", 18)} Pendência informada ao paciente: ${escapeHtml(request.pendingReason)}</p>` : ""}
            </div>
            ${actions.length ? `<div class="actions-bar no-print">${actions.map((a) => `
                <button type="button" class="btn ${a.primary ? "btn-primary" : a.danger ? "btn-danger-outline" : "btn-secondary"}"
                    data-action="${a.id}" ${a.disabled ? `disabled title="${escapeHtml(a.hint)}"` : ""}>${escapeHtml(a.label)}</button>`).join("")}
            </div>${actions.find((a) => a.disabled && a.hint) ? `<p class="hint">${escapeHtml(actions.find((a) => a.disabled).hint)}</p>` : ""}` : ""}
        </section>

        <div class="detail-grid">
            <div>
                <section class="panel">
                    <h2 class="panel__title">Documentos</h2>
                    ${documentsHtml()}
                </section>
                ${appointmentHtml()}
                <section class="panel">
                    <h2 class="panel__title">Histórico</h2>
                    ${historyHtml()}
                </section>
            </div>
            <div>
                <section class="panel">
                    <h2 class="panel__title">Paciente</h2>
                    <dl class="kv kv--stacked">
                        <dt>Nome</dt><dd><a href="${pageUrl("admin/paciente.html", { id: request.patientId })}">${escapeHtml(request.patientName)}</a></dd>
                        <dt>CPF</dt><dd>${escapeHtml(formatCPF(request.patientCpf))}</dd>
                    </dl>
                </section>
                <section class="panel">
                    <h2 class="panel__title">Dados da solicitação</h2>
                    <dl class="kv kv--stacked">
                        <dt>Enviada em</dt><dd>${formatDateTime(request.requestedAt || request.createdAt)}</dd>
                        <dt>Unidade de origem</dt><dd>${escapeHtml(request.originUnitName || "Não informada")}</dd>
                        ${request.notes ? `<dt>Observações do paciente</dt><dd>${escapeHtml(request.notes)}</dd>` : ""}
                        ${request.regulationNote ? `<dt>Parecer da regulação</dt><dd>${escapeHtml(request.regulationNote)}</dd>` : ""}
                        ${request.regulatedAt ? `<dt>Regulada em</dt><dd>${formatDateTime(request.regulatedAt)}</dd>` : ""}
                        ${request.queueEnteredAt ? `<dt>Entrada na fila</dt><dd>${formatDateTime(request.queueEnteredAt)}</dd>` : ""}
                        ${request.cancelReason ? `<dt>Motivo do cancelamento</dt><dd>${escapeHtml(request.cancelReason)}</dd>` : ""}
                    </dl>
                </section>
                <section class="panel">
                    <h2 class="panel__title">Linha do tempo (visão do paciente)</h2>
                    ${renderTimeline(buildTimeline(request, history))}
                </section>
            </div>
        </div>`;
}

/* ---------- Ações ---------- */

function priorityOptions(selected = "NORMAL") {
    return Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${k === selected ? "selected" : ""}>${v.label}</option>`).join("");
}

function reasonField(id = "reason", label = "Motivo", required = true) {
    return `<div class="field"><label for="${id}">${label}</label><textarea id="${id}" name="${id}" class="input" rows="3" ${required ? "required" : ""}></textarea></div>`;
}

function requireText(value, message) {
    const text = String(value || "").trim();
    if (!text) throw userError(message);
    return text;
}

async function done(message) {
    toast(message, "success");
    await load();
}

const ACTIONS = {
    "approve-docs": async () => {
        const next = request.requiresRegulation === false ? "a fila de espera (procedimento sem regulação)" : "a regulação";
        if (!await confirmDialog({ title: "Aprovar documentação", message: `Todos os documentos foram aprovados. A solicitação seguirá para ${next} e o paciente será avisado.`, confirmLabel: "Aprovar" })) return;
        await approveDocumentation({ request, actor });
        await done("Documentação aprovada.");
    },
    "request-doc": async () => {
        const result = await openModal({
            title: "Solicitar documento ao paciente",
            confirmLabel: "Enviar pedido",
            body: `<div class="field"><label for="doc-type">Documento</label><select id="doc-type" name="type" class="input">
                    ${Object.entries(DOCUMENT_TYPES).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join("")}</select></div>
                ${reasonField("reason", "Mensagem ao paciente", false)}`,
            onConfirm: async (form) => {
                const data = Object.fromEntries(new FormData(form));
                await requestNewDocument({ request, actor, documentType: data.type, reason: data.reason.trim() });
            }
        });
        if (result) await done("Pedido enviado ao paciente.");
    },
    "start-regulation": async () => {
        await startRegulation({ request, actor });
        await done("Regulação iniciada.");
    },
    regulate: async () => {
        const result = await openModal({
            title: "Aprovar na regulação",
            confirmLabel: "Aprovar e enviar para a fila",
            body: `<p class="hint">A prioridade é definida exclusivamente pela regulação. O paciente não escolhe prioridade.</p>
                <div class="field"><label for="priority">Prioridade</label><select id="priority" name="priority" class="input">${priorityOptions(request.priority)}</select></div>
                ${reasonField("note", "Parecer (opcional)", false)}`,
            onConfirm: async (form) => {
                const data = Object.fromEntries(new FormData(form));
                await enterQueue({ request, actor, priority: data.priority, note: data.note.trim() });
            }
        });
        if (result) await done("Solicitação aprovada e enviada para a fila.");
    },
    "return-docs": async () => {
        const result = await openModal({
            title: "Devolver para documentação",
            confirmLabel: "Devolver",
            body: reasonField("reason", "O que o paciente precisa complementar?"),
            onConfirm: async (form) => {
                await returnToDocumentation({ request, actor, reason: requireText(form.elements.namedItem("reason").value, "Informe o motivo.") });
            }
        });
        if (result) await done("Solicitação devolvida ao paciente.");
    },
    schedule: async () => {
        const result = await openScheduleModal({ request, actor });
        if (result) await done("Agendamento criado e paciente avisado.");
    },
    priority: async () => {
        const result = await openModal({
            title: "Alterar prioridade",
            confirmLabel: "Salvar",
            body: `<div class="field"><label for="priority">Prioridade</label><select id="priority" name="priority" class="input">${priorityOptions(request.priority)}</select></div>
                ${reasonField("reason", "Justificativa")}`,
            onConfirm: async (form) => {
                const data = Object.fromEntries(new FormData(form));
                await changePriority({ request, actor, priority: data.priority, reason: requireText(data.reason, "Informe a justificativa.") });
            }
        });
        if (result) await done("Prioridade alterada.");
    },
    complete: async () => {
        if (!await confirmDialog({ title: "Registrar realização", message: "Confirmar que o paciente realizou o atendimento?", confirmLabel: "Confirmar" })) return;
        await finishAppointment({ appointment, actor, outcome: "COMPLETED" });
        await done("Atendimento registrado como realizado.");
    },
    "no-show": async () => {
        if (!await confirmDialog({ title: "Registrar falta", message: "Confirmar que o paciente não compareceu?", confirmLabel: "Registrar falta", danger: true })) return;
        await finishAppointment({ appointment, actor, outcome: "NO_SHOW" });
        await done("Falta registrada.");
    },
    "cancel-appointment": async () => {
        const result = await openModal({
            title: "Cancelar agendamento",
            confirmLabel: "Cancelar agendamento",
            danger: true,
            body: `<p class="hint">A solicitação voltará para a fila e o paciente será avisado.</p>${reasonField()}`,
            onConfirm: async (form) => {
                await cancelAppointment({ appointment, actor, reason: requireText(form.elements.namedItem("reason").value, "Informe o motivo.") });
            }
        });
        if (result) await done("Agendamento cancelado.");
    },
    cancel: async () => {
        const result = await openModal({
            title: "Cancelar / negar solicitação",
            confirmLabel: "Confirmar cancelamento",
            danger: true,
            body: `<p class="hint">Esta ação encerra a solicitação. O paciente verá o motivo.</p>${reasonField()}`,
            onConfirm: async (form) => {
                await cancelRequest({ request, actor, reason: requireText(form.elements.namedItem("reason").value, "Informe o motivo.") });
            }
        });
        if (result) await done("Solicitação cancelada.");
    }
};

async function viewDocument(doc) {
    const url = await getFileUrl(doc.storagePath);
    const isImage = isImagePath(doc.storagePath);
    const title = `${DOCUMENT_TYPES[doc.type] || "Documento"} · Protocolo ${request.protocol} · ${request.patientName}`;
    openModal({
        title: DOCUMENT_TYPES[doc.type] || "Documento",
        wide: true,
        hideConfirm: true,
        body: `${isImagePath(doc.storagePath)
            ? `<img class="doc-preview" src="${escapeHtml(url)}" alt="${escapeHtml(DOCUMENT_TYPES[doc.type] || "Documento")}">`
            : `<iframe class="doc-frame" src="${escapeHtml(url)}" title="${escapeHtml(doc.fileName || "Documento")}"></iframe>`}
            <div class="actions-bar">
                ${printButtonHtml()}
                <a class="btn btn-secondary mt-16" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon("download", 18)} Abrir em nova aba</a>
            </div>`,
        onOpen: (form) => form.querySelector("[data-print]").addEventListener("click", () => printFile(url, { isImage, title }))
    });
}

async function rejectDocument(doc) {
    const result = await openModal({
        title: `Recusar: ${DOCUMENT_TYPES[doc.type] || "Documento"}`,
        confirmLabel: "Recusar e avisar paciente",
        danger: true,
        body: `<fieldset class="radio-group"><legend>Motivo</legend>
                ${REJECT_REASONS.map((r, i) => `<label class="radio"><input type="radio" name="reason" value="${escapeHtml(r)}" ${i === 0 ? "checked" : ""}><span>${escapeHtml(r)}</span></label>`).join("")}
            </fieldset>
            ${reasonField("details", "Detalhes para o paciente", false)}`,
        onConfirm: async (form) => {
            const data = Object.fromEntries(new FormData(form));
            const details = data.details.trim();
            if (data.reason === "Outro" && !details) throw userError("Descreva o motivo.");
            const reason = data.reason === "Outro" ? details : (details ? `${data.reason}. ${details}` : data.reason);
            await reviewDocument({ request, document: doc, actor, approved: false, reason });
        }
    });
    if (result) await done("Documento recusado. O paciente foi avisado.");
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    const find = (id) => documents.find((d) => d.id === id);

    if (button.hasAttribute("data-print-page")) {
        window.print();
        return;
    }
    try {
        if (button.dataset.action) {
            await ACTIONS[button.dataset.action]?.();
        } else if (button.dataset.view) {
            setButtonLoading(button, true, "Abrindo...");
            await viewDocument(find(button.dataset.view));
            setButtonLoading(button, false);
        } else if (button.dataset.approveDoc) {
            setButtonLoading(button, true, "Aprovando...");
            await reviewDocument({ request, document: find(button.dataset.approveDoc), actor, approved: true });
            await done("Documento aprovado.");
        } else if (button.dataset.rejectDoc) {
            await rejectDocument(find(button.dataset.rejectDoc));
        }
    } catch (error) {
        console.error(error);
        setButtonLoading(button, false);
        toast(friendlyError(error), "error", 7000);
    }
});

/* ---------- Carregamento ---------- */

async function load() {
    if (!requestId) {
        renderError(content, null, { title: "Solicitação não informada." });
        return;
    }
    content.innerHTML = loadingState();
    try {
        request = await getRequest(requestId);
        if (!request) {
            renderError(content, null, { title: "Solicitação não encontrada." });
            return;
        }
        [documents, history, appointment] = await Promise.all([
            listRequestDocuments(requestId),
            listRequestHistory(requestId),
            request.appointmentId ? getAppointment(request.appointmentId) : null
        ]);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load, { title: error.code === "permission-denied" ? "Sem acesso a esta solicitação." : "Não foi possível carregar a solicitação." });
    }
}

load();
