// Campo de envio de documento: "Tirar foto" (câmera) ou "Escolher arquivo" (galeria/PDF).
import { icon, toast } from "../ui.js";
import { escapeHtml, formatFileSize } from "../utils.js";
import { prepareFile, validateFile, contentTypeOf } from "../services/storage-service.js";

const previews = new Map();

function previewUrl(key, file) {
    const cached = previews.get(key);
    if (cached && cached.file === file) return cached.url;
    if (cached) URL.revokeObjectURL(cached.url);
    const url = URL.createObjectURL(file);
    previews.set(key, { file, url });
    return url;
}

function inputs(key) {
    return `<input hidden type="file" id="file-${key}-camera" data-file-input="${key}" accept="image/*" capture="environment">
        <input hidden type="file" id="file-${key}-pick" data-file-input="${key}" accept="image/*,application/pdf">`;
}

export function fileSlotHtml({ key, label, hint = "", required = false, file = null }) {
    const requiredBadge = required
        ? '<span class="badge badge--neutral badge--plain">Obrigatório</span>'
        : '<span class="badge badge--neutral badge--plain">Opcional</span>';

    if (file) {
        const isImage = contentTypeOf(file).startsWith("image/");
        const preview = isImage
            ? `<img src="${previewUrl(key, file)}" alt="Prévia de ${escapeHtml(label)}">`
            : `<span class="file-preview__pdf">${icon("file", 28)}</span>`;
        return `<div class="file-slot file-slot--filled" data-slot="${key}">
            <div class="file-slot__header"><strong>${escapeHtml(label)}</strong>${requiredBadge}</div>
            <div class="file-preview">
                ${preview}
                <div class="file-preview__info">
                    <p class="file-preview__name">${icon("check", 16)} ${escapeHtml(file.name || "arquivo")}</p>
                    <p class="hint">${formatFileSize(file.size)}</p>
                </div>
            </div>
            <div class="file-slot__actions">
                <button type="button" class="btn btn-secondary btn-sm" data-pick="file-${key}-camera">${icon("camera", 18)} Nova foto</button>
                <button type="button" class="btn btn-ghost btn-sm" data-remove="${key}">${icon("x", 18)} Remover</button>
            </div>
            ${inputs(key)}
        </div>`;
    }

    return `<div class="file-slot" data-slot="${key}">
        <div class="file-slot__header"><strong>${escapeHtml(label)}</strong>${requiredBadge}</div>
        ${hint ? `<p class="hint">${escapeHtml(hint)}</p>` : ""}
        <div class="file-slot__actions">
            <button type="button" class="btn btn-primary btn-sm" data-pick="file-${key}-camera">${icon("camera", 18)} Tirar foto</button>
            <button type="button" class="btn btn-secondary btn-sm" data-pick="file-${key}-pick">${icon("upload", 18)} Escolher arquivo</button>
        </div>
        ${inputs(key)}
    </div>`;
}

// Delegação de eventos: chame uma única vez no container que contém os slots.
export function bindFileSlots(container, files, onChange) {
    container.addEventListener("click", (event) => {
        const pick = event.target.closest("[data-pick]");
        if (pick) {
            document.getElementById(pick.dataset.pick)?.click();
            return;
        }
        const remove = event.target.closest("[data-remove]");
        if (remove) {
            delete files[remove.dataset.remove];
            onChange();
        }
    });

    container.addEventListener("change", async (event) => {
        const input = event.target.closest("[data-file-input]");
        if (!input || !input.files?.length) return;
        const key = input.dataset.fileInput;
        const slot = input.closest(".file-slot");
        slot?.classList.add("file-slot--busy");
        const prepared = await prepareFile(input.files[0]);
        slot?.classList.remove("file-slot--busy");
        const problem = validateFile(prepared);
        input.value = "";
        if (problem) {
            toast(problem, "error");
            return;
        }
        files[key] = prepared;
        onChange();
    });
}
