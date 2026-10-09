// Detalhes da solicitação: status, linha do tempo, documentos, pendências e agendamento.
import { initPatientPage } from "./shell.js";
import { appointmentCard, bindAppointmentActions } from "./components.js";
import { fileSlotHtml, bindFileSlots } from "./file-slot.js";
import {
    getRequest, listRequestDocuments, listRequestHistory, latestDocumentsByType, resubmitDocuments
} from "../services/requests-service.js";
import { getAppointment } from "../services/appointments-service.js";
import { getFileUrl, isImagePath } from "../services/storage-service.js";
import { buildTimeline, renderTimeline } from "../timeline.js";
import { icon, statusBadge, toast, setButtonLoading, loadingState, renderError, openModal, printFile, printButtonHtml } from "../ui.js";
import {
    escapeHtml, getParam, pageUrl, STATUS, REQUEST_TYPES, DOCUMENT_TYPES, DOCUMENT_STATUS,
    formatDate, friendlyError
} from "../utils.js";

const { user } = await initPatientPage("requests");

const main = document.getElementById("main");
const requestId = getParam("id");
const resubmitFiles = {};
let request = null;
let documents = [];
let appointment = null;

bindFileSlots(main, resubmitFiles, () => renderPending());
bindAppointmentActions(main, { user, findAppointment: () => appointment, onChange: load });

function pendingTypes() {
    const latest = latestDocumentsByType(documents);
    const rejected = Object.values(latest).filter((d) => d.status === "REJECTED").map((d) => d.type);
    const requested = (request.pendingDocuments || []).filter((type) => !latest[type] || latest[type].status === "REJECTED");
    return [...new Set([...rejected, ...requested])];
}

function pendingHtml() {
    if (request.status !== "DOCUMENT_PENDING") return "";
    const types = pendingTypes();
    const latest = latestDocumentsByType(documents);
    const slots = (types.length ? types : ["OTHER"]).map((type) => fileSlotHtml({
        key: type,
        label: DOCUMENT_TYPES[type] || type,
        hint: latest[type]?.reviewReason ? `Motivo: ${latest[type].reviewReason}` : "",
        required: true,
        file: resubmitFiles[type]
    })).join("");
    const ready = Object.keys(resubmitFiles).length > 0;
    return `<section class="alert alert--warning" aria-labelledby="pending-title">
        ${icon("alert", 22)}
        <div>
            <h2 id="pending-title" class="alert__title">Ação necessária</h2>
            <p>${escapeHtml(request.pendingReason || "Envie novamente os documentos indicados.")}</p>
        </div>
    </section>
    <div id="pending-slots">${slots}
        <div id="resubmit-progress" class="upload-progress" hidden>
            <p class="hint" id="resubmit-label">Enviando...</p>
            <div class="progress"><div class="progress__bar" id="resubmit-bar"></div></div>
        </div>
        <button type="button" class="btn btn-primary" id="resubmit" ${ready ? "" : "disabled"}>${icon("upload", 20)} Enviar documentos</button>
    </div>`;
}

function renderPending() {
    const container = document.getElementById("pending-container");
    if (container) container.innerHTML = pendingHtml();
}

function documentsHtml() {
    if (!documents.length) return '<p class="hint">Nenhum documento enviado.</p>';
    return `<ul class="doc-list">${documents.map((d) => {
        const status = DOCUMENT_STATUS[d.status] || DOCUMENT_STATUS.PENDING;
        return `<li class="doc-list__item">
            <span class="doc-list__icon">${icon("file", 20)}</span>
            <div class="doc-list__info">
                <strong>${escapeHtml(DOCUMENT_TYPES[d.type] || d.type)}</strong>
                <small>Enviado em ${formatDate(d.uploadedAt)}</small>
                ${d.status === "REJECTED" && d.reviewReason ? `<small class="text-danger">Motivo: ${escapeHtml(d.reviewReason)}</small>` : ""}
            </div>
            <div class="doc-list__side">
                <span class="badge badge--${status.tone}">${status.label}</span>
                <button type="button" class="link-btn" data-view="${escapeHtml(d.id)}">Ver</button>
            </div>
        </li>`;
    }).join("")}</ul>`;
}

function render(history) {
    const type = REQUEST_TYPES[request.type] || { label: "Solicitação" };
    const status = STATUS[request.status] || {};
    document.getElementById("page-title").textContent = request.procedureName;

    main.innerHTML = `
        <section class="card detail-header">
            <p class="hint">${escapeHtml(type.label)}</p>
            <h1 class="detail-header__title">${escapeHtml(request.procedureName)}</h1>
            <div class="detail-header__row">
                <div><p class="hint">Protocolo</p><p class="protocol-inline">${escapeHtml(request.protocol)}</p></div>
                ${statusBadge(request.status)}
            </div>
            ${status.description ? `<p class="detail-header__description">${escapeHtml(status.description)}</p>` : ""}
        </section>

        <div id="pending-container">${pendingHtml()}</div>

        ${appointment && ["SCHEDULED", "CONFIRMED"].includes(appointment.status) ? appointmentCard(appointment) : ""}

        <section class="card">
            <h2 class="section-title">Andamento</h2>
            ${renderTimeline(buildTimeline(request, history))}
        </section>

        <section class="card">
            <h2 class="section-title">Documentos</h2>
            ${documentsHtml()}
        </section>

        <a class="card card--interactive assistant-banner" href="${pageUrl("app/assistente.html")}">
            <span class="assistant-banner__icon">${icon("bot", 24)}</span>
            <span><strong>Ficou com dúvida?</strong><small>Pergunte ao assistente da Saúde</small></span>
            ${icon("chevronRight", 20)}
        </a>`;
}

main.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) {
        const doc = documents.find((d) => d.id === viewButton.dataset.view);
        if (doc) viewDocument(doc, viewButton);
        return;
    }
    const resubmitButton = event.target.closest("#resubmit");
    if (resubmitButton) resubmit(resubmitButton);
});

async function viewDocument(doc, button) {
    try {
        setButtonLoading(button, true, "Abrindo...");
        const url = await getFileUrl(doc.storagePath);
        setButtonLoading(button, false);
        const body = isImagePath(doc.storagePath)
            ? `<img class="doc-preview" src="${escapeHtml(url)}" alt="${escapeHtml(DOCUMENT_TYPES[doc.type] || "Documento")}">`
            : `<p>Este documento é um arquivo PDF.</p>`;
        const isImage = isImagePath(doc.storagePath);
        openModal({
            title: DOCUMENT_TYPES[doc.type] || "Documento",
            body: `${body}${printButtonHtml()}<a class="btn btn-secondary mt-16" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon("download", 18)} Abrir arquivo</a>`,
            hideConfirm: true,
            onOpen: (form) => form.querySelector("[data-print]").addEventListener("click", () => printFile(url, { isImage, title: DOCUMENT_TYPES[doc.type] || "Documento" }))
        });
    } catch (error) {
        console.error(error);
        setButtonLoading(button, false);
        toast(friendlyError(error, "Não foi possível abrir o documento."), "error");
    }
}

async function resubmit(button) {
    const files = Object.entries(resubmitFiles).map(([type, file]) => ({ type, file }));
    const progressBox = document.getElementById("resubmit-progress");
    const bar = document.getElementById("resubmit-bar");
    const label = document.getElementById("resubmit-label");
    try {
        setButtonLoading(button, true, "Enviando...");
        progressBox.hidden = false;
        await resubmitDocuments({ user, request, files }, (percent) => {
            bar.style.width = `${percent}%`;
            label.textContent = `Enviando... ${percent}%`;
        });
        Object.keys(resubmitFiles).forEach((key) => delete resubmitFiles[key]);
        toast("Documentos enviados! A Secretaria vai analisar.", "success");
        await load();
    } catch (error) {
        console.error(error);
        progressBox.hidden = true;
        setButtonLoading(button, false);
        toast(friendlyError(error, "Não foi possível enviar. Tente novamente."), "error", 7000);
    }
}

async function load() {
    if (!requestId) {
        renderError(main, null, { title: "Solicitação não informada.", text: "Volte e escolha uma solicitação." });
        return;
    }
    main.innerHTML = loadingState();
    try {
        request = await getRequest(requestId);
        if (!request) {
            renderError(main, null, { title: "Solicitação não encontrada.", text: "Ela pode ter sido removida." });
            return;
        }
        const [docs, history, appt] = await Promise.all([
            listRequestDocuments(requestId),
            listRequestHistory(requestId),
            request.appointmentId ? getAppointment(request.appointmentId).catch(() => null) : null
        ]);
        documents = docs;
        appointment = appt;
        render(history);
    } catch (error) {
        console.error(error);
        renderError(main, load, {
            title: error.code === "permission-denied" ? "Você não tem acesso a esta solicitação." : "Não conseguimos carregar a solicitação."
        });
    }
}

load();
