// Configurações: dados do município, dados iniciais e base de conhecimento da IA.
import { initAdminPage } from "./shell.js";
import {
    getMunicipality, saveMunicipality, listArticles, saveArticle, seedDefaultArticles
} from "../services/settings-service.js";
import { seedDefaultProcedures } from "../services/procedures-service.js";
import { seedDefaultUnits } from "../services/units-service.js";
import { icon, toneBadge, renderError, loadingState, openModal, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, ROLE_GROUPS, friendlyError, userError } from "../utils.js";

const { actor, content } = await initAdminPage("settings", "Configurações", ROLE_GROUPS.ADMIN);

const CATEGORIES = { DOCUMENTS: "Documentos", PROCESS: "Andamento", APPOINTMENTS: "Agendamentos", GENERAL: "Geral" };
let municipality = null;
let articles = [];

function render() {
    const m = municipality || {};
    content.innerHTML = `
        <section class="panel">
            <h2 class="panel__title">Município</h2>
            <form id="municipality-form" class="form-grid">
                <div class="field"><label for="m-name">Nome da Prefeitura</label><input id="m-name" name="prefName" class="input" required value="${escapeHtml(m.name || "Prefeitura Municipal")}"></div>
                <div class="field"><label for="m-dept">Nome da Secretaria</label><input id="m-dept" name="healthDepartmentName" class="input" required value="${escapeHtml(m.healthDepartmentName || "Secretaria Municipal de Saúde")}"></div>
                <div class="field"><label for="m-city">Nome do município (exibido ao cidadão)</label><input id="m-city" name="municipalityName" class="input" value="${escapeHtml(m.branding?.municipalityName || "")}"></div>
                <div class="field"><label for="m-phone">Telefone de atendimento</label><input id="m-phone" name="phone" class="input" value="${escapeHtml(m.phone || "")}"></div>
                <div class="field"><label for="m-address">Endereço da Secretaria</label><input id="m-address" name="address" class="input" value="${escapeHtml(m.address || "")}"></div>
                <div class="field"><label for="m-color">Cor principal</label><input id="m-color" name="primaryColor" type="color" class="input input--color" value="${escapeHtml(m.branding?.primaryColor || "#176b5b")}"></div>
                <div class="form-actions"><button type="submit" class="btn btn-primary" id="save-municipality">Salvar</button></div>
            </form>
            <p class="hint">ID do município nesta instalação: <code>${escapeHtml(actor.municipalityId)}</code></p>
        </section>

        <section class="panel">
            <h2 class="panel__title">Dados iniciais</h2>
            <p class="hint">Cria procedimentos, unidades e artigos de ajuda padrão. Itens com o mesmo nome não são duplicados.</p>
            <button type="button" class="btn btn-secondary" id="seed-all">${icon("refresh", 18)} Criar dados iniciais</button>
        </section>

        <section class="panel">
            <div class="panel__header">
                <h2 class="panel__title">Base de conhecimento do assistente</h2>
                <button type="button" class="btn btn-primary btn-sm" id="new-article">${icon("plus", 16)} Novo artigo</button>
            </div>
            <p class="hint">O assistente de IA usa somente estes textos para responder dúvidas administrativas.</p>
            ${articles.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Título</th><th>Categoria</th><th>Situação</th><th></th></tr></thead>
                <tbody>${articles.map((a) => `<tr>
                    <td><strong>${escapeHtml(a.title)}</strong><br><small class="text-secondary">${escapeHtml(a.content.slice(0, 120))}${a.content.length > 120 ? "..." : ""}</small></td>
                    <td>${escapeHtml(CATEGORIES[a.category] || a.category)}</td>
                    <td>${a.active === false ? toneBadge("Inativo", "neutral") : toneBadge("Ativo", "success")}</td>
                    <td><button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(a.id)}">${icon("edit", 16)} Editar</button></td>
                </tr>`).join("")}</tbody></table></div>` : '<p class="hint">Nenhum artigo ainda.</p>'}
        </section>`;

    document.getElementById("municipality-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = document.getElementById("save-municipality");
        const data = Object.fromEntries(new FormData(event.target));
        try {
            setButtonLoading(button, true, "Salvando...");
            await saveMunicipality(actor, { ...data, name: data.prefName });
            municipality = await getMunicipality(actor.municipalityId);
            setButtonLoading(button, false);
            toast("Dados do município salvos.", "success");
        } catch (error) {
            console.error(error);
            setButtonLoading(button, false);
            toast(friendlyError(error), "error");
        }
    });
}

function editArticle(article = null) {
    const a = article || { category: "GENERAL", active: true };
    return openModal({
        title: article ? "Editar artigo" : "Novo artigo",
        confirmLabel: "Salvar",
        wide: true,
        body: `
            <div class="field"><label for="a-title">Título</label><input id="a-title" name="title" class="input" value="${escapeHtml(a.title || "")}"></div>
            <div class="field"><label for="a-category">Categoria</label><select id="a-category" name="category" class="input">
                ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${a.category === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
            <div class="field"><label for="a-content">Conteúdo</label><textarea id="a-content" name="content" class="input" rows="6">${escapeHtml(a.content || "")}</textarea></div>
            <label class="checkbox"><input type="checkbox" name="active" ${a.active !== false ? "checked" : ""}><span>Ativo</span></label>`,
        onConfirm: async (form) => {
            const fd = new FormData(form);
            const data = Object.fromEntries(fd);
            if (!data.title.trim() || !data.content.trim()) throw userError("Preencha título e conteúdo.");
            await saveArticle(actor, { ...data, active: fd.has("active") }, article?.id || null);
        }
    });
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
        if (button.id === "seed-all") {
            setButtonLoading(button, true, "Criando...");
            const [p, u, a] = await Promise.all([seedDefaultProcedures(actor), seedDefaultUnits(actor), seedDefaultArticles(actor)]);
            toast(`Criados: ${p} procedimentos, ${u} unidades e ${a} artigos.`, "success", 7000);
            await load();
        } else if (button.id === "new-article" && await editArticle()) {
            toast("Artigo salvo.", "success");
            await load();
        } else if (button.dataset.edit && await editArticle(articles.find((a) => a.id === button.dataset.edit))) {
            toast("Artigo salvo.", "success");
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
        [municipality, articles] = await Promise.all([getMunicipality(actor.municipalityId), listArticles(actor.municipalityId)]);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
