// Todos os documentos enviados pelo paciente, agrupados por solicitação.
import { initPatientPage } from "./shell.js";
import { listMyRequests, listRequestDocuments } from "../services/requests-service.js";
import { getFileUrl, isImagePath } from "../services/storage-service.js";
import { icon, skeletonList, emptyState, renderError, openModal, toast, setButtonLoading, printFile, printButtonHtml } from "../ui.js";
import { escapeHtml, pageUrl, DOCUMENT_TYPES, DOCUMENT_STATUS, formatDate, friendlyError } from "../utils.js";

const { user } = await initPatientPage("home");

const main = document.getElementById("main");
let groups = [];

function render() {
    if (!groups.some((g) => g.documents.length)) {
        main.innerHTML = emptyState({
            title: "Nenhum documento enviado.",
            text: "Os documentos ficam guardados aqui quando você faz uma solicitação.",
            actionLabel: "Nova solicitação",
            actionHref: pageUrl("app/nova-solicitacao.html"),
            iconName: "folder"
        });
        return;
    }
    main.innerHTML = groups.filter((g) => g.documents.length).map(({ request, documents }) => `
        <section class="card">
            <a class="doc-group__title" href="${pageUrl("app/solicitacao.html", { id: request.id })}">
                <strong>${escapeHtml(request.procedureName)}</strong>
                <small>Protocolo ${escapeHtml(request.protocol)}</small>
            </a>
            <ul class="doc-list">${documents.map((d) => {
                const status = DOCUMENT_STATUS[d.status] || DOCUMENT_STATUS.PENDING;
                return `<li class="doc-list__item">
                    <span class="doc-list__icon">${icon("file", 20)}</span>
                    <div class="doc-list__info">
                        <strong>${escapeHtml(DOCUMENT_TYPES[d.type] || d.type)}</strong>
                        <small>${formatDate(d.uploadedAt)}</small>
                    </div>
                    <div class="doc-list__side">
                        <span class="badge badge--${status.tone}">${status.label}</span>
                        <button type="button" class="link-btn" data-path="${escapeHtml(d.storagePath)}" data-label="${escapeHtml(DOCUMENT_TYPES[d.type] || "Documento")}">Ver</button>
                    </div>
                </li>`;
            }).join("")}</ul>
        </section>`).join("");
}

main.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-path]");
    if (!button) return;
    try {
        setButtonLoading(button, true, "Abrindo...");
        const url = await getFileUrl(button.dataset.path);
        setButtonLoading(button, false);
        openModal({
            title: button.dataset.label,
            body: `${isImagePath(button.dataset.path) ? `<img class="doc-preview" src="${escapeHtml(url)}" alt="${escapeHtml(button.dataset.label)}">` : "<p>Arquivo PDF.</p>"}
                ${printButtonHtml()}
                <a class="btn btn-secondary mt-16" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon("download", 18)} Abrir arquivo</a>`,
            hideConfirm: true,
            onOpen: (form) => form.querySelector("[data-print]").addEventListener("click", () => printFile(url, { isImage: isImagePath(button.dataset.path), title: button.dataset.label }))
        });
    } catch (error) {
        console.error(error);
        setButtonLoading(button, false);
        toast(friendlyError(error, "Não foi possível abrir o documento."), "error");
    }
});

async function load() {
    main.innerHTML = skeletonList(3);
    try {
        const requests = await listMyRequests(user.uid);
        groups = await Promise.all(requests.map(async (request) => ({ request, documents: await listRequestDocuments(request.id) })));
        render();
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: "Não conseguimos carregar seus documentos." });
    }
}

load();
