// Nova solicitação: tipo > procedimento > unidade > pedido médico > documentos > revisão > protocolo.
import { initPatientPage } from "./shell.js";
import { fileSlotHtml, bindFileSlots } from "./file-slot.js";
import { listProcedures } from "../services/procedures-service.js";
import { listUnits } from "../services/units-service.js";
import { getPatient } from "../services/patients-service.js";
import { createRequest } from "../services/requests-service.js";
import { icon, toast, setButtonLoading, loadingState, renderError, emptyState } from "../ui.js";
import {
    REQUEST_TYPES, DOCUMENT_TYPES, UNIT_TYPES, escapeHtml, normalizeText, getParam, pageUrl,
    friendlyError, maskCPF, debounce
} from "../utils.js";

const { user, profile } = await initPatientPage("new");

const main = document.getElementById("main");
const backButton = document.getElementById("back-button");
const TOTAL_STEPS = 6;

const state = {
    step: 0,
    type: null,
    procedure: null,
    unit: null,
    unitChosen: false,
    files: {},
    notes: "",
    search: "",
    accepted: false,
    sending: false,
    done: null
};

let procedures = [];
let units = [];
let patient = null;

/* ---------- Navegação entre etapas (com suporte ao botão voltar do celular) ---------- */

function goTo(step) {
    state.step = step;
    history.pushState({ step }, "");
    render();
    window.scrollTo(0, 0);
}

window.addEventListener("popstate", (event) => {
    if (state.sending) {
        history.pushState({ step: state.step }, "");
        return;
    }
    if (state.done) {
        window.location.href = pageUrl("app/home.html");
        return;
    }
    state.step = event.state?.step ?? 0;
    render();
});

backButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (state.sending) return;
    if (state.done || state.step === 0) {
        window.location.href = pageUrl("app/home.html");
    } else {
        history.back();
    }
});

const initialType = getParam("type");
if (initialType && REQUEST_TYPES[initialType]) {
    state.type = initialType;
    history.replaceState({ step: 0 }, "");
    history.pushState({ step: 1 }, "");
    state.step = 1;
} else {
    history.replaceState({ step: 0 }, "");
}

bindFileSlots(main, state.files, () => render());

/* ---------- Etapas ---------- */

function progress() {
    const step = state.step + 1;
    return `<div class="wizard-progress">
        <p class="wizard-progress__label">Etapa ${step} de ${TOTAL_STEPS}</p>
        <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${TOTAL_STEPS}" aria-valuenow="${step}" aria-label="Progresso da solicitação">
            <div class="progress__bar" style="width:${(step / TOTAL_STEPS) * 100}%"></div>
        </div>
    </div>`;
}

function stepType() {
    return `${progress()}
        <h1 class="step-title">Nova solicitação</h1>
        <p class="step-subtitle">O que você precisa solicitar?</p>
        <div class="option-list">
            ${Object.entries(REQUEST_TYPES).map(([key, type]) => `
                <button type="button" class="option ${state.type === key ? "option--selected" : ""}" data-type="${key}">
                    <span class="option__icon">${icon(type.icon, 24)}</span>
                    <span class="option__text"><strong>${type.label}</strong><small>${escapeHtml(type.description)}</small></span>
                    ${icon("chevronRight", 20, "option__chevron")}
                </button>`).join("")}
        </div>`;
}

function filteredProcedures() {
    const term = normalizeText(state.search);
    return procedures.filter((p) => p.category === state.type && (!term || normalizeText(p.name).includes(term)));
}

function procedureListHtml() {
    const list = filteredProcedures();
    if (!list.length) {
        return state.search
            ? `<p class="hint text-center">Nenhum procedimento encontrado para “${escapeHtml(state.search)}”.</p>`
            : emptyState({ title: "Nenhum procedimento disponível", text: "Ainda não há procedimentos cadastrados para este tipo. Procure sua unidade de saúde.", iconName: "info" });
    }
    return list.map((p) => `
        <button type="button" class="option option--compact ${state.procedure?.id === p.id ? "option--selected" : ""}" data-procedure="${escapeHtml(p.id)}">
            <span class="option__text"><strong>${escapeHtml(p.name)}</strong></span>
            ${icon("chevronRight", 20, "option__chevron")}
        </button>`).join("");
}

function stepProcedure() {
    const type = REQUEST_TYPES[state.type];
    return `${progress()}
        <h1 class="step-title">O que você precisa?</h1>
        <p class="step-subtitle">${type.label}: escolha conforme o pedido médico.</p>
        <div class="search-field">
            ${icon("search", 20)}
            <label for="procedure-search" class="sr-only">Buscar procedimento</label>
            <input id="procedure-search" class="input" type="search" placeholder="Buscar procedimento" value="${escapeHtml(state.search)}" autocomplete="off">
        </div>
        <div class="option-list" id="procedure-list">${procedureListHtml()}</div>`;
}

function stepUnit() {
    return `${progress()}
        <h1 class="step-title">Onde você foi atendido?</h1>
        <p class="step-subtitle">Informe a unidade onde o médico fez o pedido.</p>
        <div class="option-list">
            ${units.map((u) => `
                <button type="button" class="option option--compact ${state.unit?.id === u.id ? "option--selected" : ""}" data-unit="${escapeHtml(u.id)}">
                    <span class="option__icon option__icon--sm">${icon("building", 20)}</span>
                    <span class="option__text"><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(UNIT_TYPES[u.type] || "")}</small></span>
                </button>`).join("")}
            <button type="button" class="option option--compact ${state.unitChosen && !state.unit ? "option--selected" : ""}" data-unit="">
                <span class="option__icon option__icon--sm">${icon("help", 20)}</span>
                <span class="option__text"><strong>Não sei / Outra unidade</strong></span>
            </button>
        </div>`;
}

function stepMedical() {
    const hasFile = Boolean(state.files.MEDICAL_REQUEST);
    return `${progress()}
        <h1 class="step-title">Envie o pedido médico</h1>
        <p class="step-subtitle">Fotografe a guia ou pedido entregue pelo médico.</p>
        <ul class="tips">
            <li>${icon("check", 18)} Coloque o papel sobre uma superfície lisa</li>
            <li>${icon("check", 18)} Use um lugar bem iluminado</li>
            <li>${icon("check", 18)} Mostre o documento inteiro, com carimbo e assinatura</li>
        </ul>
        ${fileSlotHtml({ key: "MEDICAL_REQUEST", label: DOCUMENT_TYPES.MEDICAL_REQUEST, required: true, file: state.files.MEDICAL_REQUEST })}
        <button type="button" class="btn btn-primary" data-next ${hasFile ? "" : "disabled"}>Continuar</button>`;
}

function requiredExtraDocuments() {
    const required = state.procedure?.requiredDocuments?.length
        ? state.procedure.requiredDocuments
        : ["MEDICAL_REQUEST", "PERSONAL_DOCUMENT", "SUS_CARD"];
    return required.filter((d) => d !== "MEDICAL_REQUEST");
}

function stepDocuments() {
    const required = requiredExtraDocuments();
    const missing = required.filter((d) => !state.files[d]);
    return `${progress()}
        <h1 class="step-title">Outros documentos</h1>
        <p class="step-subtitle">Envie os documentos pedidos para este procedimento.</p>
        ${required.map((d) => fileSlotHtml({ key: d, label: DOCUMENT_TYPES[d] || d, required: true, file: state.files[d] })).join("")}
        ${fileSlotHtml({ key: "PREVIOUS_REPORT", label: DOCUMENT_TYPES.PREVIOUS_REPORT, hint: "Se tiver, envie laudos ou exames anteriores.", file: state.files.PREVIOUS_REPORT })}
        <div class="field">
            <label for="notes">Observações (opcional)</label>
            <textarea id="notes" class="input" rows="3" maxlength="500" placeholder="Algo que a Secretaria precisa saber?">${escapeHtml(state.notes)}</textarea>
        </div>
        ${missing.length ? `<p class="hint">Falta enviar: ${missing.map((d) => escapeHtml(DOCUMENT_TYPES[d] || d)).join(", ")}.</p>` : ""}
        <button type="button" class="btn btn-primary" data-next ${missing.length ? "disabled" : ""}>Revisar solicitação</button>`;
}

function selectedFiles() {
    const order = ["MEDICAL_REQUEST", ...requiredExtraDocuments(), "PREVIOUS_REPORT"];
    return order.filter((key) => state.files[key]).map((key) => ({ type: key, file: state.files[key] }));
}

function stepReview() {
    const type = REQUEST_TYPES[state.type];
    return `${progress()}
        <h1 class="step-title">Revise sua solicitação</h1>
        <p class="step-subtitle">Confira antes de enviar.</p>
        <section class="card">
            <dl class="review-list">
                <div><dt>Tipo</dt><dd>${type.label}</dd></div>
                <div><dt>Procedimento</dt><dd>${escapeHtml(state.procedure.name)}</dd></div>
                <div><dt>Unidade de origem</dt><dd>${escapeHtml(state.unit?.name || "Não informada")}</dd></div>
                <div><dt>Paciente</dt><dd>${escapeHtml(patient?.name || profile.name)}<br><small>CPF ${maskCPF(patient?.cpf)}</small></dd></div>
                <div><dt>Documentos</dt><dd>${selectedFiles().map((f) => `${icon("check", 16)} ${escapeHtml(DOCUMENT_TYPES[f.type])}`).join("<br>")}</dd></div>
                ${state.notes ? `<div><dt>Observações</dt><dd>${escapeHtml(state.notes)}</dd></div>` : ""}
            </dl>
        </section>
        <label class="checkbox">
            <input type="checkbox" id="accept" ${state.accepted ? "checked" : ""}>
            <span>Declaro que as informações e documentos enviados são verdadeiros.</span>
        </label>
        <div id="upload-progress" class="upload-progress" hidden>
            <p class="hint" id="upload-label">Enviando documentos...</p>
            <div class="progress"><div class="progress__bar" id="upload-bar"></div></div>
        </div>
        <button type="button" class="btn btn-primary" id="submit-request" ${state.accepted ? "" : "disabled"}>${icon("send", 20)} Enviar solicitação</button>`;
}

function stepDone() {
    return `<div class="protocol-box">
        <div class="success-icon">${icon("check", 40)}</div>
        <h1 class="step-title">Solicitação enviada!</h1>
        <p class="step-subtitle">Guarde o número do protocolo.</p>
        <div class="card protocol-card">
            <p class="hint">Protocolo</p>
            <p class="protocol-number">${escapeHtml(state.done.protocol)}</p>
            <p class="hint">${escapeHtml(state.procedure.name)}</p>
        </div>
        <p>A Secretaria vai analisar seus documentos. Você receberá um aviso a cada etapa.</p>
        <a class="btn btn-primary" href="${pageUrl("app/solicitacao.html", { id: state.done.id })}">Acompanhar solicitação</a>
        <a class="btn btn-secondary" href="${pageUrl("app/home.html")}">Voltar ao início</a>
    </div>`;
}

const STEP_RENDERERS = [stepType, stepProcedure, stepUnit, stepMedical, stepDocuments, stepReview];

function render() {
    if (state.done) {
        main.innerHTML = stepDone();
        return;
    }
    // Garante consistência se o usuário voltar/avançar pelo histórico do navegador.
    if (state.step >= 1 && !state.type) state.step = 0;
    if (state.step >= 2 && !state.procedure) state.step = 1;
    main.innerHTML = STEP_RENDERERS[state.step]();
}

/* ---------- Eventos ---------- */

main.addEventListener("click", (event) => {
    const typeButton = event.target.closest("[data-type]");
    if (typeButton) {
        if (state.type !== typeButton.dataset.type) {
            state.procedure = null;
            state.search = "";
        }
        state.type = typeButton.dataset.type;
        goTo(1);
        return;
    }

    const procedureButton = event.target.closest("[data-procedure]");
    if (procedureButton) {
        state.procedure = procedures.find((p) => p.id === procedureButton.dataset.procedure) || null;
        goTo(units.length ? 2 : 3);
        return;
    }

    const unitButton = event.target.closest("[data-unit]");
    if (unitButton) {
        state.unit = units.find((u) => u.id === unitButton.dataset.unit) || null;
        state.unitChosen = true;
        goTo(3);
        return;
    }

    if (event.target.closest("[data-next]")) {
        goTo(state.step + 1);
        return;
    }

    if (event.target.closest("#submit-request")) {
        submit(event.target.closest("#submit-request"));
    }
});

main.addEventListener("input", debounce((event) => {
    if (event.target.id === "procedure-search") {
        state.search = event.target.value;
        document.getElementById("procedure-list").innerHTML = procedureListHtml();
    }
}, 150));

main.addEventListener("input", (event) => {
    if (event.target.id === "notes") state.notes = event.target.value;
});

main.addEventListener("change", (event) => {
    if (event.target.id === "accept") {
        state.accepted = event.target.checked;
        document.getElementById("submit-request").disabled = !state.accepted;
    }
});

async function submit(button) {
    if (state.sending) return;
    state.sending = true;
    setButtonLoading(button, true, "Enviando...");
    const progressBox = document.getElementById("upload-progress");
    const bar = document.getElementById("upload-bar");
    const label = document.getElementById("upload-label");
    progressBox.hidden = false;

    try {
        const result = await createRequest({
            user,
            profile,
            patient,
            type: state.type,
            procedure: state.procedure,
            unit: state.unit,
            files: selectedFiles(),
            notes: state.notes
        }, (percent) => {
            bar.style.width = `${percent}%`;
            label.textContent = `Enviando documentos... ${percent}%`;
        });
        state.done = result;
        state.sending = false;
        history.replaceState({ step: "done" }, "");
        render();
        window.scrollTo(0, 0);
    } catch (error) {
        console.error("Falha ao enviar solicitação:", error);
        state.sending = false;
        progressBox.hidden = true;
        setButtonLoading(button, false);
        toast(friendlyError(error, "Não foi possível enviar. Verifique sua conexão e tente novamente."), "error", 7000);
    }
}

/* ---------- Carregamento ---------- */

async function load() {
    main.innerHTML = loadingState("Carregando procedimentos...");
    try {
        [procedures, units, patient] = await Promise.all([
            listProcedures(profile.municipalityId, { activeOnly: true }),
            listUnits(profile.municipalityId, { activeOnly: true }),
            getPatient(profile.patientId)
        ]);
        render();
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: "Não conseguimos carregar os procedimentos." });
    }
}

load();
