import { initAdminPage } from "./shell.js";
import { listProcedures, saveProcedure, seedDefaultProcedures } from "../services/procedures-service.js";
import { icon, toneBadge, renderError, emptyState, loadingState, openModal, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, REQUEST_TYPES, DOCUMENT_TYPES, ROLE_GROUPS, friendlyError, userError } from "../utils.js";

const { actor, content } = await initAdminPage("procedures", "Procedimentos", ROLE_GROUPS.CATALOG);

let procedures = [];

function render() {
    content.innerHTML = `
        <section class="panel">
            <div class="panel__header">
                <p class="hint">Procedimentos que o cidadão pode solicitar pelo aplicativo.</p>
                <div class="actions-bar">
                    ${procedures.length ? "" : `<button type="button" class="btn btn-secondary" id="seed">Criar lista padrão</button>`}
                    <button type="button" class="btn btn-primary" id="new">${icon("plus", 18)} Novo procedimento</button>
                </div>
            </div>
            ${procedures.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Nome</th><th>Tipo</th><th>Regulação</th><th>Documentos exigidos</th><th>Situação</th><th></th></tr></thead>
                <tbody>${procedures.map((p) => `<tr>
                    <td><strong>${escapeHtml(p.name)}</strong></td>
                    <td>${escapeHtml(REQUEST_TYPES[p.category]?.label || p.category)}</td>
                    <td>${p.requiresRegulation ? "Sim" : "Não"}</td>
                    <td><small>${(p.requiredDocuments || []).map((d) => escapeHtml(DOCUMENT_TYPES[d] || d)).join(", ")}</small></td>
                    <td>${p.active === false ? toneBadge("Inativo", "neutral") : toneBadge("Ativo", "success")}</td>
                    <td><button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(p.id)}">${icon("edit", 16)} Editar</button></td>
                </tr>`).join("")}</tbody></table></div>`
                : emptyState({ title: "Nenhum procedimento cadastrado.", text: "Crie a lista padrão ou cadastre manualmente.", iconName: "activity" })}
        </section>`;
}

function edit(procedure = null) {
    const p = procedure || { category: "EXAM", requiresRegulation: true, active: true, requiredDocuments: ["MEDICAL_REQUEST", "PERSONAL_DOCUMENT", "SUS_CARD"] };
    return openModal({
        title: procedure ? "Editar procedimento" : "Novo procedimento",
        confirmLabel: "Salvar",
        body: `
            <div class="field"><label for="p-name">Nome</label><input id="p-name" name="name" class="input" required value="${escapeHtml(p.name || "")}"></div>
            <div class="field"><label for="p-category">Tipo</label><select id="p-category" name="category" class="input">
                ${Object.entries(REQUEST_TYPES).map(([k, v]) => `<option value="${k}" ${p.category === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
            <fieldset class="checkbox-group"><legend>Documentos exigidos</legend>
                ${Object.entries(DOCUMENT_TYPES).filter(([k]) => k !== "OTHER").map(([k, v]) => `
                    <label class="checkbox"><input type="checkbox" name="requiredDocuments" value="${k}" ${k === "MEDICAL_REQUEST" ? "checked disabled" : (p.requiredDocuments || []).includes(k) ? "checked" : ""}><span>${escapeHtml(v)}</span></label>`).join("")}
            </fieldset>
            <label class="checkbox"><input type="checkbox" name="requiresRegulation" ${p.requiresRegulation ? "checked" : ""}><span>Exige regulação</span></label>
            <label class="checkbox"><input type="checkbox" name="active" ${p.active !== false ? "checked" : ""}><span>Disponível para solicitação</span></label>`,
        onConfirm: async (form) => {
            const fd = new FormData(form);
            const name = String(fd.get("name") || "").trim();
            if (!name) throw userError("Informe o nome.");
            await saveProcedure(actor, {
                name,
                category: fd.get("category"),
                requiredDocuments: ["MEDICAL_REQUEST", ...fd.getAll("requiredDocuments")],
                requiresRegulation: fd.has("requiresRegulation"),
                active: fd.has("active")
            }, procedure?.id || null);
        }
    });
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
        if (button.id === "new" && await edit()) {
            toast("Procedimento salvo.", "success");
            await load();
        } else if (button.dataset.edit && await edit(procedures.find((p) => p.id === button.dataset.edit))) {
            toast("Procedimento salvo.", "success");
            await load();
        } else if (button.id === "seed") {
            setButtonLoading(button, true, "Criando...");
            const count = await seedDefaultProcedures(actor);
            toast(`${count} procedimentos criados.`, "success");
            await load();
        }
    } catch (error) {
        console.error(error);
        setButtonLoading(button, false);
        toast(friendlyError(error), "error");
    }
});

async function load() {
    content.innerHTML = loadingState();
    try {
        procedures = await listProcedures(actor.municipalityId);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
