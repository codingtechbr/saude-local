// Lista de solicitações com filtros (aplicados no navegador sobre os dados do município).
import { initAdminPage } from "./shell.js";
import { listMunicipalityRequests } from "../services/requests-service.js";
import { statusBadge, priorityBadge, renderError, emptyState, loadingState } from "../ui.js";
import {
    escapeHtml, pageUrl, getParam, STATUS, PRIORITY, REQUEST_TYPES, formatDate, formatCPF,
    normalizeText, onlyDigits, toDate, debounce, daysSince
} from "../utils.js";

const { profile, content } = await initAdminPage("requests", "Solicitações");

let requests = [];
const initialStatuses = (getParam("status") || "").split(",").filter((s) => STATUS[s]);

content.innerHTML = `
    <section class="panel">
        <form class="filters" id="filters" role="search">
            <div class="field"><label for="f-text">Protocolo, paciente ou CPF</label><input id="f-text" class="input" type="search" autocomplete="off"></div>
            <div class="field"><label for="f-status">Status</label>
                <select id="f-status" class="input">
                    <option value="">Todos</option>
                    ${initialStatuses.length > 1 ? `<option value="${initialStatuses.join(",")}" selected>${initialStatuses.map((s) => STATUS[s].admin).join(" + ")}</option>` : ""}
                    ${Object.entries(STATUS).filter(([k]) => k !== "DRAFT").map(([k, v]) => `<option value="${k}" ${initialStatuses.length === 1 && initialStatuses[0] === k ? "selected" : ""}>${v.admin}</option>`).join("")}
                </select></div>
            <div class="field"><label for="f-type">Tipo</label>
                <select id="f-type" class="input"><option value="">Todos</option>${Object.entries(REQUEST_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></div>
            <div class="field"><label for="f-procedure">Procedimento</label><select id="f-procedure" class="input"><option value="">Todos</option></select></div>
            <div class="field"><label for="f-unit">Unidade de origem</label><select id="f-unit" class="input"><option value="">Todas</option></select></div>
            <div class="field"><label for="f-priority">Prioridade</label>
                <select id="f-priority" class="input"><option value="">Todas</option>${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></div>
            <div class="field"><label for="f-from">Enviada a partir de</label><input id="f-from" class="input" type="date"></div>
            <div class="field"><label for="f-to">Enviada até</label><input id="f-to" class="input" type="date"></div>
        </form>
        <p class="hint" id="result-count" aria-live="polite"></p>
        <div id="results">${loadingState()}</div>
    </section>`;

const $ = (id) => document.getElementById(id);
const results = $("results");

function applyFilters() {
    const text = normalizeText($("f-text").value);
    const digits = onlyDigits($("f-text").value);
    const statuses = $("f-status").value ? $("f-status").value.split(",") : [];
    const type = $("f-type").value;
    const procedure = $("f-procedure").value;
    const unit = $("f-unit").value;
    const priority = $("f-priority").value;
    const from = $("f-from").value ? new Date(`${$("f-from").value}T00:00:00`) : null;
    const to = $("f-to").value ? new Date(`${$("f-to").value}T23:59:59`) : null;

    return requests.filter((r) => {
        if (statuses.length && !statuses.includes(r.status)) return false;
        if (type && r.type !== type) return false;
        if (procedure && r.procedureId !== procedure) return false;
        if (unit && r.originUnitId !== unit) return false;
        if (priority && (r.priority || "NORMAL") !== priority) return false;
        const created = toDate(r.requestedAt || r.createdAt);
        if (from && (!created || created < from)) return false;
        if (to && (!created || created > to)) return false;
        if (text) {
            const haystack = normalizeText(`${r.protocol} ${r.patientName} ${r.procedureName}`);
            const cpfMatch = digits.length >= 3 && (r.patientCpf || "").includes(digits);
            if (!haystack.includes(text) && !cpfMatch) return false;
        }
        return true;
    });
}

function render() {
    const list = applyFilters();
    $("result-count").textContent = `${list.length} de ${requests.length} solicitações`;
    if (!list.length) {
        results.innerHTML = emptyState({ title: "Nenhuma solicitação encontrada.", text: "Ajuste os filtros.", iconName: "search" });
        return;
    }
    results.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Protocolo</th><th>Paciente</th><th>Procedimento</th><th>Status</th><th>Prioridade</th><th>Enviada</th><th>Dias</th></tr></thead>
        <tbody>${list.map((r) => `
            <tr class="is-clickable" data-href="${pageUrl("admin/solicitacao.html", { id: r.id })}" tabindex="0">
                <td><strong>${escapeHtml(r.protocol)}</strong></td>
                <td>${escapeHtml(r.patientName)}<br><small class="text-secondary">${escapeHtml(formatCPF(r.patientCpf))}</small></td>
                <td>${escapeHtml(r.procedureName)}<br><small class="text-secondary">${escapeHtml(REQUEST_TYPES[r.type]?.label || "")}</small></td>
                <td>${statusBadge(r.status, "admin")}</td>
                <td>${priorityBadge(r.priority)}</td>
                <td>${formatDate(r.requestedAt || r.createdAt)}</td>
                <td>${daysSince(r.requestedAt || r.createdAt) ?? "—"}</td>
            </tr>`).join("")}</tbody></table></div>`;
}

function fillSelect(select, entries) {
    select.insertAdjacentHTML("beforeend", entries.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join(""));
}

$("filters").addEventListener("input", debounce(render, 200));
$("filters").addEventListener("change", render);
$("filters").addEventListener("submit", (event) => event.preventDefault());

results.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-href]");
    if (row) window.location.href = row.dataset.href;
});
results.addEventListener("keydown", (event) => {
    const row = event.target.closest("tr[data-href]");
    if (row && event.key === "Enter") window.location.href = row.dataset.href;
});

async function load() {
    results.innerHTML = loadingState();
    try {
        requests = await listMunicipalityRequests(profile.municipalityId);
        const procedures = new Map(requests.map((r) => [r.procedureId, r.procedureName]));
        const units = new Map(requests.filter((r) => r.originUnitId).map((r) => [r.originUnitId, r.originUnitName]));
        fillSelect($("f-procedure"), [...procedures].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")));
        fillSelect($("f-unit"), [...units].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")));
        render();
    } catch (error) {
        console.error(error);
        renderError(results, load, { title: "Não foi possível carregar as solicitações." });
    }
}

load();
