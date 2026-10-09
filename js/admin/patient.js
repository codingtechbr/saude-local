// Ficha do paciente no painel: dados, solicitações, agendamentos, documentos e auditoria.
import { initAdminPage } from "./shell.js";
import { getPatient } from "../services/patients-service.js";
import { listMunicipalityRequests, listRequestDocuments } from "../services/requests-service.js";
import { listMunicipalityAppointments } from "../services/appointments-service.js";
import { listAuditLogs } from "../services/settings-service.js";
import { icon, statusBadge, toneBadge, renderError, loadingState } from "../ui.js";
import {
    escapeHtml, getParam, pageUrl, formatCPF, formatCNS, formatPhone, formatCEP, formatBirthDate, formatDate,
    formatDateTime, APPOINTMENT_STATUS, DOCUMENT_TYPES, DOCUMENT_STATUS, ROLE_GROUPS, sortByDate
} from "../utils.js";

const { profile, content, can } = await initAdminPage("patients", "Paciente");

const patientId = getParam("id");
let tab = "data";
let data = null;

const TABS = [
    { key: "data", label: "Dados pessoais" },
    { key: "requests", label: "Solicitações" },
    { key: "documents", label: "Documentos" },
    { key: "appointments", label: "Agendamentos" },
    { key: "audit", label: "Auditoria", roles: ROLE_GROUPS.REPORTS }
];

function tabContent() {
    const { patient, requests, appointments, documents, audit } = data;
    if (tab === "data") {
        const a = patient.address || {};
        return `<dl class="kv">
            <dt>Nome</dt><dd>${escapeHtml(patient.name)}</dd>
            <dt>CPF</dt><dd>${escapeHtml(formatCPF(patient.cpf))}</dd>
            <dt>CNS</dt><dd>${escapeHtml(formatCNS(patient.cns) || "—")}</dd>
            <dt>Nascimento</dt><dd>${formatBirthDate(patient.birthDate)}</dd>
            <dt>Nome da mãe</dt><dd>${escapeHtml(patient.motherName || "—")}</dd>
            <dt>Telefone</dt><dd>${escapeHtml(formatPhone(patient.phone) || "—")}</dd>
            <dt>E-mail</dt><dd>${escapeHtml(patient.email || "—")}</dd>
            <dt>Endereço</dt><dd>${escapeHtml([a.street, a.number, a.district, a.city, a.state].filter(Boolean).join(", ") || "—")}${a.zipCode ? ` · CEP ${escapeHtml(formatCEP(a.zipCode))}` : ""}</dd>
            <dt>Cadastro</dt><dd>${formatDateTime(patient.createdAt)}</dd>
        </dl>`;
    }
    if (tab === "requests") {
        return requests.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Protocolo</th><th>Procedimento</th><th>Status</th><th>Enviada</th></tr></thead>
            <tbody>${requests.map((r) => `<tr class="is-clickable" data-href="${pageUrl("admin/solicitacao.html", { id: r.id })}">
                <td><strong>${escapeHtml(r.protocol)}</strong></td><td>${escapeHtml(r.procedureName)}</td>
                <td>${statusBadge(r.status, "admin")}</td><td>${formatDate(r.requestedAt || r.createdAt)}</td></tr>`).join("")}
            </tbody></table></div>` : '<p class="hint">Nenhuma solicitação.</p>';
    }
    if (tab === "documents") {
        return documents.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Documento</th><th>Solicitação</th><th>Enviado</th><th>Situação</th></tr></thead>
            <tbody>${documents.map((d) => {
                const st = DOCUMENT_STATUS[d.status] || DOCUMENT_STATUS.PENDING;
                return `<tr class="is-clickable" data-href="${pageUrl("admin/solicitacao.html", { id: d.requestId })}">
                    <td>${escapeHtml(DOCUMENT_TYPES[d.type] || d.type)}</td><td>${escapeHtml(d.protocol)}</td>
                    <td>${formatDate(d.uploadedAt)}</td><td>${toneBadge(st.label, st.tone)}</td></tr>`;
            }).join("")}</tbody></table></div>` : '<p class="hint">Nenhum documento.</p>';
    }
    if (tab === "appointments") {
        return appointments.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Data</th><th>Procedimento</th><th>Unidade</th><th>Situação</th></tr></thead>
            <tbody>${appointments.map((a) => {
                const st = APPOINTMENT_STATUS[a.status] || { label: a.status, tone: "neutral" };
                return `<tr><td>${formatDateTime(a.scheduledFor)}</td><td>${escapeHtml(a.procedureName)}</td>
                    <td>${escapeHtml(a.healthUnitName)}</td><td>${toneBadge(st.label, st.tone)}</td></tr>`;
            }).join("")}</tbody></table></div>` : '<p class="hint">Nenhum agendamento.</p>';
    }
    if (tab === "audit") {
        if (!audit) return '<p class="hint">Sem permissão para ver a auditoria.</p>';
        return audit.length ? `<div class="table-wrap"><table class="table table--compact">
            <thead><tr><th>Data</th><th>Ação</th><th>Usuário</th><th>Detalhes</th></tr></thead>
            <tbody>${audit.map((l) => `<tr><td>${formatDateTime(l.createdAt)}</td><td>${escapeHtml(l.action)}</td>
                <td>${escapeHtml(l.userName || l.userId)}</td>
                <td><small>${escapeHtml(JSON.stringify(l.newData || {}))}</small></td></tr>`).join("")}</tbody></table></div>`
            : '<p class="hint">Nenhum registro de auditoria.</p>';
    }
    return "";
}

function render() {
    document.querySelector(".admin-topbar h1").textContent = data.patient.name;
    content.innerHTML = `
        <a class="back-link" href="${pageUrl("admin/pacientes.html")}">${icon("chevronLeft", 18)} Pacientes</a>
        <div class="tabs tabs--inline mb-16" role="tablist">
            ${TABS.filter((t) => !t.roles || can(t.roles)).map((t) => `<button type="button" class="tab" role="tab" data-tab="${t.key}" aria-selected="${t.key === tab}">${t.label}</button>`).join("")}
        </div>
        <section class="panel">${tabContent()}</section>`;
}

content.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) {
        tab = tabButton.dataset.tab;
        render();
        return;
    }
    const row = event.target.closest("tr[data-href]");
    if (row) window.location.href = row.dataset.href;
});

async function load() {
    if (!patientId) {
        renderError(content, null, { title: "Paciente não informado." });
        return;
    }
    content.innerHTML = loadingState();
    try {
        const patient = await getPatient(patientId);
        if (!patient) {
            renderError(content, null, { title: "Paciente não encontrado." });
            return;
        }
        const [requests, appointments, audit] = await Promise.all([
            listMunicipalityRequests(profile.municipalityId, { patientId }),
            listMunicipalityAppointments(profile.municipalityId, { patientId }),
            can(ROLE_GROUPS.REPORTS) ? listAuditLogs(profile.municipalityId, { patientId }).catch(() => null) : null
        ]);
        const documentLists = await Promise.all(requests.map(async (r) =>
            (await listRequestDocuments(r.id)).map((d) => ({ ...d, requestId: r.id, protocol: r.protocol }))));
        data = {
            patient,
            requests,
            appointments: sortByDate(appointments, "scheduledFor", "desc"),
            documents: sortByDate(documentLists.flat(), "uploadedAt", "desc"),
            audit: audit ? sortByDate(audit, "createdAt", "desc") : null
        };
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
