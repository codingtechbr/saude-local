import { initAdminPage } from "./shell.js";
import { listUnits, saveUnit, seedDefaultUnits } from "../services/units-service.js";
import { icon, toneBadge, renderError, emptyState, loadingState, openModal, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, UNIT_TYPES, ROLE_GROUPS, formatPhone, bindMask, friendlyError, userError } from "../utils.js";

const { actor, content } = await initAdminPage("units", "Unidades de saúde", ROLE_GROUPS.CATALOG);

let units = [];

function render() {
    content.innerHTML = `
        <section class="panel">
            <div class="panel__header">
                <p class="hint">Unidades de origem dos pedidos e locais de atendimento.</p>
                <div class="actions-bar">
                    ${units.length ? "" : `<button type="button" class="btn btn-secondary" id="seed">Criar unidades de exemplo</button>`}
                    <button type="button" class="btn btn-primary" id="new">${icon("plus", 18)} Nova unidade</button>
                </div>
            </div>
            ${units.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Nome</th><th>Tipo</th><th>Endereço</th><th>Telefone</th><th>Situação</th><th></th></tr></thead>
                <tbody>${units.map((u) => `<tr>
                    <td><strong>${escapeHtml(u.name)}</strong></td>
                    <td>${escapeHtml(UNIT_TYPES[u.type] || u.type)}</td>
                    <td>${escapeHtml(u.address || "—")}</td>
                    <td>${escapeHtml(formatPhone(u.phone) || "—")}</td>
                    <td>${u.active === false ? toneBadge("Inativa", "neutral") : toneBadge("Ativa", "success")}</td>
                    <td><button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(u.id)}">${icon("edit", 16)} Editar</button></td>
                </tr>`).join("")}</tbody></table></div>`
                : emptyState({ title: "Nenhuma unidade cadastrada.", iconName: "building" })}
        </section>`;
}

function edit(unit = null) {
    const u = unit || { type: "UBS", active: true };
    return openModal({
        title: unit ? "Editar unidade" : "Nova unidade",
        confirmLabel: "Salvar",
        body: `
            <div class="field"><label for="u-name">Nome</label><input id="u-name" name="name" class="input" required value="${escapeHtml(u.name || "")}"></div>
            <div class="field"><label for="u-type">Tipo</label><select id="u-type" name="type" class="input">
                ${Object.entries(UNIT_TYPES).map(([k, v]) => `<option value="${k}" ${u.type === k ? "selected" : ""}>${escapeHtml(v)}</option>`).join("")}</select></div>
            <div class="field"><label for="u-address">Endereço</label><input id="u-address" name="address" class="input" value="${escapeHtml(u.address || "")}"></div>
            <div class="field-row">
                <div class="field"><label for="u-phone">Telefone</label><input id="u-phone" name="phone" class="input" inputmode="tel" value="${escapeHtml(formatPhone(u.phone))}"></div>
                <div class="field"><label for="u-hours">Horário</label><input id="u-hours" name="openingHours" class="input" value="${escapeHtml(u.openingHours || "")}"></div>
            </div>
            <label class="checkbox"><input type="checkbox" name="active" ${u.active !== false ? "checked" : ""}><span>Unidade ativa</span></label>`,
        onOpen: (form) => bindMask(form.querySelector("#u-phone"), formatPhone),
        onConfirm: async (form) => {
            const fd = new FormData(form);
            const data = Object.fromEntries(fd);
            if (!String(data.name || "").trim()) throw userError("Informe o nome.");
            await saveUnit(actor, { ...data, active: fd.has("active") }, unit?.id || null);
        }
    });
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
        if (button.id === "new" && await edit()) {
            toast("Unidade salva.", "success");
            await load();
        } else if (button.dataset.edit && await edit(units.find((u) => u.id === button.dataset.edit))) {
            toast("Unidade salva.", "success");
            await load();
        } else if (button.id === "seed") {
            setButtonLoading(button, true, "Criando...");
            const count = await seedDefaultUnits(actor);
            toast(`${count} unidades criadas.`, "success");
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
        units = await listUnits(actor.municipalityId);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
