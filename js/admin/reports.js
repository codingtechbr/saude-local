// Relatórios simples + exportação CSV.
import { initAdminPage } from "./shell.js";
import { listMunicipalityRequests } from "../services/requests-service.js";
import { icon, renderError, loadingState } from "../ui.js";
import {
    escapeHtml, STATUS, REQUEST_TYPES, PRIORITY, ROLE_GROUPS, toDate, formatDate, formatCPF, toDateInputValue
} from "../utils.js";

const { profile, content } = await initAdminPage("reports", "Relatórios", ROLE_GROUPS.REPORTS);

let requests = [];

function countBy(list, keyFn) {
    const map = new Map();
    list.forEach((item) => {
        const key = keyFn(item);
        map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map].sort((a, b) => b[1] - a[1]);
}

function barTable(title, rows, total) {
    return `<section class="panel">
        <h2 class="panel__title">${escapeHtml(title)}</h2>
        ${rows.length ? `<table class="table table--bars">
            <tbody>${rows.map(([label, value]) => `<tr>
                <th scope="row">${escapeHtml(label)}</th>
                <td class="bar-cell"><span class="bar" style="width:${total ? Math.max(2, (value / total) * 100) : 0}%"></span></td>
                <td class="num">${value.toLocaleString("pt-BR")}</td>
            </tr>`).join("")}</tbody></table>` : '<p class="hint">Sem dados no período.</p>'}
    </section>`;
}

function average(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function render() {
    const from = new Date(`${document.getElementById("r-from").value}T00:00:00`);
    const to = new Date(`${document.getElementById("r-to").value}T23:59:59`);
    const list = requests.filter((r) => {
        const d = toDate(r.requestedAt || r.createdAt);
        return d && d >= from && d <= to;
    });

    const waitDays = list
        .filter((r) => r.scheduledAt)
        .map((r) => (toDate(r.scheduledAt) - toDate(r.requestedAt || r.createdAt)) / 86400000)
        .filter((n) => n >= 0);
    const avgWait = average(waitDays);
    const completed = list.filter((r) => r.status === "COMPLETED").length;
    const noShow = list.filter((r) => r.status === "NO_SHOW").length;

    document.getElementById("report-body").innerHTML = `
        <div class="stat-grid mb-16">
            <div class="stat-card"><p class="stat-card__label">Solicitações no período</p><p class="stat-card__value">${list.length.toLocaleString("pt-BR")}</p></div>
            <div class="stat-card"><p class="stat-card__label">Concluídas</p><p class="stat-card__value">${completed.toLocaleString("pt-BR")}</p></div>
            <div class="stat-card"><p class="stat-card__label">Faltas</p><p class="stat-card__value">${noShow.toLocaleString("pt-BR")}</p></div>
            <div class="stat-card"><p class="stat-card__label">Tempo médio até agendar</p><p class="stat-card__value">${avgWait === null ? "—" : `${avgWait.toFixed(1).replace(".", ",")} dias`}</p></div>
        </div>
        <div class="report-grid">
            ${barTable("Por status", countBy(list, (r) => STATUS[r.status]?.admin || r.status), list.length)}
            ${barTable("Por procedimento", countBy(list, (r) => r.procedureName), list.length)}
            ${barTable("Por tipo", countBy(list, (r) => REQUEST_TYPES[r.type]?.label || r.type), list.length)}
            ${barTable("Por prioridade", countBy(list, (r) => PRIORITY[r.priority]?.label || "Normal"), list.length)}
        </div>`;
    return list;
}

function csvCell(value) {
    const text = String(value ?? "");
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
    const list = render();
    const header = ["Protocolo", "Paciente", "CPF", "Procedimento", "Tipo", "Status", "Prioridade", "Enviada", "Agendada", "Concluída"];
    const rows = list.map((r) => [
        r.protocol, r.patientName, formatCPF(r.patientCpf), r.procedureName, REQUEST_TYPES[r.type]?.label,
        STATUS[r.status]?.admin, PRIORITY[r.priority]?.label, formatDate(r.requestedAt || r.createdAt),
        r.scheduledAt ? formatDate(r.scheduledAt) : "", r.completedAt ? formatDate(r.completedAt) : ""
    ]);
    const csv = "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `solicitacoes-${toDateInputValue()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function load() {
    content.innerHTML = loadingState();
    try {
        requests = await listMunicipalityRequests(profile.municipalityId);
        const start = new Date();
        start.setDate(start.getDate() - 30);
        content.innerHTML = `
            <section class="panel">
                <div class="filters">
                    <div class="field"><label for="r-from">De</label><input id="r-from" type="date" class="input" value="${toDateInputValue(start)}"></div>
                    <div class="field"><label for="r-to">Até</label><input id="r-to" type="date" class="input" value="${toDateInputValue()}"></div>
                    <div class="field field--action"><button type="button" class="btn btn-secondary" id="export">${icon("download", 18)} Exportar CSV</button></div>
                </div>
                <p class="hint">O CSV contém dados pessoais. Compartilhe apenas com pessoas autorizadas (LGPD).</p>
            </section>
            <div id="report-body"></div>`;
        document.getElementById("r-from").addEventListener("change", render);
        document.getElementById("r-to").addEventListener("change", render);
        document.getElementById("export").addEventListener("click", exportCsv);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
