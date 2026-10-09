// Usuários da Secretaria (servidores). Somente ADMIN.
import { initAdminPage } from "./shell.js";
import { listStaff, createStaffUser, updateStaffUser, sendAccessEmail } from "../services/users-service.js";
import { icon, toneBadge, renderError, loadingState, openModal, toast, setButtonLoading } from "../ui.js";
import { escapeHtml, ROLES, ROLE_GROUPS, formatDate, friendlyError, userError } from "../utils.js";

const { actor, content } = await initAdminPage("users", "Usuários", ROLE_GROUPS.ADMIN);

const ASSIGNABLE = ["ATTENDANT", "REGULATOR", "MANAGER", "ADMIN"];
const ROLE_HELP = {
    ATTENDANT: "Analisa documentos e faz agendamentos",
    REGULATOR: "Avalia solicitações e define prioridade",
    MANAGER: "Gestão: catálogo, relatórios e auditoria",
    ADMIN: "Acesso total, inclusive usuários e configurações"
};
let users = [];

function roleOptions(selected) {
    return ASSIGNABLE.map((r) => `<option value="${r}" ${r === selected ? "selected" : ""}>${ROLES[r]} - ${ROLE_HELP[r]}</option>`).join("");
}

function render() {
    content.innerHTML = `
        <section class="panel">
            <div class="panel__header">
                <p class="hint">Servidores com acesso ao painel. A pessoa recebe um e-mail para criar a própria senha.</p>
                <button type="button" class="btn btn-primary" id="new">${icon("plus", 18)} Novo usuário</button>
            </div>
            <div class="table-wrap"><table class="table">
                <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Criado em</th><th></th></tr></thead>
                <tbody>${users.map((u) => `<tr>
                    <td><strong>${escapeHtml(u.name || "—")}</strong>${u.id === actor.uid ? " <small>(você)</small>" : ""}</td>
                    <td>${escapeHtml(u.email)}</td>
                    <td>${escapeHtml(ROLES[u.role] || u.role)}</td>
                    <td>${u.active === false ? toneBadge("Desativado", "danger") : toneBadge("Ativo", "success")}</td>
                    <td>${formatDate(u.createdAt)}</td>
                    <td class="table-actions">${u.id === actor.uid ? "" : `
                        <button type="button" class="btn btn-secondary btn-sm" data-edit="${escapeHtml(u.id)}">${icon("edit", 16)} Editar</button>
                        <button type="button" class="btn btn-ghost btn-sm" data-reset="${escapeHtml(u.id)}">Reenviar acesso</button>`}</td>
                </tr>`).join("")}</tbody></table></div>
        </section>`;
}

function createModal() {
    return openModal({
        title: "Novo usuário",
        confirmLabel: "Criar e enviar acesso",
        body: `
            <div class="field"><label for="n-name">Nome completo</label><input id="n-name" name="fullName" class="input" required></div>
            <div class="field"><label for="n-email">E-mail</label><input id="n-email" name="email" type="email" class="input" required></div>
            <div class="field"><label for="n-role">Perfil</label><select id="n-role" name="role" class="input">${roleOptions("ATTENDANT")}</select></div>`,
        onConfirm: async (form) => {
            const data = Object.fromEntries(new FormData(form));
            if (!data.fullName.trim()) throw userError("Informe o nome.");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) throw userError("E-mail inválido.");
            try {
                await createStaffUser(actor, { name: data.fullName, email: data.email, role: data.role });
            } catch (error) {
                throw userError(friendlyError(error));
            }
        }
    });
}

function editModal(user) {
    return openModal({
        title: "Editar usuário",
        confirmLabel: "Salvar",
        body: `
            <div class="field"><label for="e-name">Nome</label><input id="e-name" name="fullName" class="input" value="${escapeHtml(user.name || "")}"></div>
            <div class="field"><label for="e-role">Perfil</label><select id="e-role" name="role" class="input">${roleOptions(user.role)}</select></div>
            <label class="checkbox"><input type="checkbox" name="active" ${user.active !== false ? "checked" : ""}><span>Acesso ativo</span></label>
            <p class="hint">Desativar bloqueia o acesso aos dados imediatamente (regras de segurança).</p>`,
        onConfirm: async (form) => {
            const fd = new FormData(form);
            await updateStaffUser(actor, user, { name: String(fd.get("fullName") || ""), role: fd.get("role"), active: fd.has("active") });
        }
    });
}

content.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    try {
        if (button.id === "new" && await createModal()) {
            toast("Usuário criado. Um e-mail para definir a senha foi enviado.", "success", 7000);
            await load();
        } else if (button.dataset.edit && await editModal(users.find((u) => u.id === button.dataset.edit))) {
            toast("Usuário atualizado.", "success");
            await load();
        } else if (button.dataset.reset) {
            const user = users.find((u) => u.id === button.dataset.reset);
            setButtonLoading(button, true, "Enviando...");
            await sendAccessEmail(user.email);
            setButtonLoading(button, false);
            toast(`E-mail de acesso enviado para ${user.email}.`, "success");
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
        users = await listStaff(actor.municipalityId);
        render();
    } catch (error) {
        console.error(error);
        renderError(content, load);
    }
}

load();
