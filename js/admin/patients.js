// Busca de pacientes por nome, CPF, CNS ou telefone.
import { initAdminPage } from "./shell.js";
import { listPatients } from "../services/patients-service.js";
import { renderError, emptyState, loadingState } from "../ui.js";
import {
    escapeHtml, pageUrl, formatCPF, formatCNS, formatPhone, formatBirthDate, normalizeText, onlyDigits, debounce
} from "../utils.js";

const { profile, content } = await initAdminPage("patients", "Pacientes");

let patients = [];

content.innerHTML = `
    <section class="panel">
        <div class="filters">
            <div class="field field--wide"><label for="search">Buscar por nome, CPF, CNS ou telefone</label>
                <input id="search" type="search" class="input" autocomplete="off" placeholder="Digite para buscar"></div>
        </div>
        <p class="hint" id="count" aria-live="polite"></p>
        <div id="results">${loadingState()}</div>
    </section>`;

const search = document.getElementById("search");
const results = document.getElementById("results");

function render() {
    const text = normalizeText(search.value);
    const digits = onlyDigits(search.value);
    const list = patients.filter((p) => {
        if (!text) return true;
        if (normalizeText(p.name).includes(text)) return true;
        return digits.length >= 3 && [p.cpf, p.cns, p.phone].some((v) => (v || "").includes(digits));
    });
    document.getElementById("count").textContent = `${list.length} de ${patients.length} pacientes`;
    if (!list.length) {
        results.innerHTML = emptyState({ title: "Nenhum paciente encontrado.", iconName: "users" });
        return;
    }
    results.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Nome</th><th>CPF</th><th>CNS</th><th>Telefone</th><th>Nascimento</th></tr></thead>
        <tbody>${list.slice(0, 300).map((p) => `<tr class="is-clickable" data-href="${pageUrl("admin/paciente.html", { id: p.id })}" tabindex="0">
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${escapeHtml(formatCPF(p.cpf))}</td>
            <td>${escapeHtml(formatCNS(p.cns) || "—")}</td>
            <td>${escapeHtml(formatPhone(p.phone) || "—")}</td>
            <td>${formatBirthDate(p.birthDate)}</td>
        </tr>`).join("")}</tbody></table></div>
        ${list.length > 300 ? '<p class="hint">Mostrando os 300 primeiros. Refine a busca.</p>' : ""}`;
}

search.addEventListener("input", debounce(render, 200));
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
        patients = await listPatients(profile.municipalityId);
        render();
        search.focus();
    } catch (error) {
        console.error(error);
        renderError(results, load);
    }
}

load();
