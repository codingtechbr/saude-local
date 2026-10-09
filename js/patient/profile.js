import { initPatientPage } from "./shell.js";
import { getPatient, updateOwnContact } from "../services/patients-service.js";
import { logout, changePassword } from "../auth.js";
import { icon, loadingState, renderError, openModal, toast, bindPasswordToggles } from "../ui.js";
import {
    escapeHtml, maskCPF, maskCNS, maskPhone, maskEmail, initials, formatPhone, formatCEP, onlyDigits,
    pageUrl, bindMask, friendlyError, userError
} from "../utils.js";

const { profile } = await initPatientPage("profile");

const main = document.getElementById("main");
let patient = null;

function row(label, value) {
    return `<div class="profile-row"><dt>${label}</dt><dd>${value}</dd></div>`;
}

function render() {
    const a = patient.address || {};
    const address = [a.street, a.number, a.district, a.city && `${a.city}${a.state ? `/${a.state}` : ""}`].filter(Boolean).join(", ");
    main.innerHTML = `
        <section class="profile-header">
            <span class="avatar" aria-hidden="true">${escapeHtml(initials(patient.name))}</span>
            <div><p class="hint">Minha conta</p><h1>${escapeHtml(patient.name)}</h1></div>
        </section>

        <section class="card">
            <h2 class="section-title">Dados pessoais</h2>
            <dl class="profile-list">
                ${row("CPF", maskCPF(patient.cpf))}
                ${row("CNS", maskCNS(patient.cns))}
                ${row("Telefone", maskPhone(patient.phone))}
                ${row("E-mail", escapeHtml(maskEmail(patient.email || profile.email)))}
                ${row("Endereço", escapeHtml(address || "Não informado"))}
            </dl>
            <button type="button" class="btn btn-secondary" id="edit-data">${icon("edit", 18)} Editar telefone e endereço</button>
            <p class="hint mt-8">Para corrigir nome, CPF ou CNS procure a Secretaria de Saúde.</p>
        </section>

        <section class="card menu-list">
            <a href="${pageUrl("app/agendamentos.html")}" class="menu-list__item">${icon("calendar")}<span>Meus agendamentos</span>${icon("chevronRight", 18)}</a>
            <a href="${pageUrl("app/documentos.html")}" class="menu-list__item">${icon("folder")}<span>Meus documentos</span>${icon("chevronRight", 18)}</a>
            <a href="${pageUrl("app/assistente.html")}" class="menu-list__item">${icon("bot")}<span>Assistente da Saúde</span>${icon("chevronRight", 18)}</a>
            <button type="button" class="menu-list__item" id="privacy">${icon("shield")}<span>Privacidade</span>${icon("chevronRight", 18)}</button>
            <button type="button" class="menu-list__item" id="change-password">${icon("lock")}<span>Alterar senha</span>${icon("chevronRight", 18)}</button>
            <button type="button" class="menu-list__item menu-list__item--danger" id="logout">${icon("logout")}<span>Sair</span></button>
        </section>`;
}

main.addEventListener("click", (event) => {
    if (event.target.closest("#edit-data")) editData();
    if (event.target.closest("#change-password")) editPassword();
    if (event.target.closest("#privacy")) showPrivacy();
    if (event.target.closest("#logout")) logout("login.html");
});

function editData() {
    const a = patient.address || {};
    openModal({
        title: "Editar dados",
        confirmLabel: "Salvar",
        body: `
            <div class="field"><label for="m-phone">Celular</label><input id="m-phone" name="phone" class="input" inputmode="tel" autocomplete="tel" value="${escapeHtml(formatPhone(patient.phone))}"></div>
            <div class="field"><label for="m-zip">CEP</label><input id="m-zip" name="zipCode" class="input" inputmode="numeric" autocomplete="postal-code" value="${escapeHtml(formatCEP(a.zipCode))}"></div>
            <div class="field"><label for="m-street">Rua</label><input id="m-street" name="street" class="input" autocomplete="address-line1" value="${escapeHtml(a.street)}"></div>
            <div class="field-row">
                <div class="field"><label for="m-number">Número</label><input id="m-number" name="number" class="input" value="${escapeHtml(a.number)}"></div>
                <div class="field"><label for="m-district">Bairro</label><input id="m-district" name="district" class="input" value="${escapeHtml(a.district)}"></div>
            </div>
            <div class="field-row">
                <div class="field"><label for="m-city">Cidade</label><input id="m-city" name="city" class="input" autocomplete="address-level2" value="${escapeHtml(a.city)}"></div>
                <div class="field field--sm"><label for="m-state">UF</label><input id="m-state" name="state" class="input" maxlength="2" autocomplete="address-level1" value="${escapeHtml(a.state)}"></div>
            </div>`,
        onOpen: (form) => {
            bindMask(form.querySelector("#m-phone"), formatPhone);
            bindMask(form.querySelector("#m-zip"), formatCEP);
        },
        onConfirm: async (form) => {
            const data = Object.fromEntries(new FormData(form));
            if (onlyDigits(data.phone).length < 10) throw userError("Informe um celular válido com DDD.");
            await updateOwnContact(patient.id, { phone: data.phone, address: data });
            patient = await getPatient(patient.id);
            render();
            toast("Dados atualizados.", "success");
        }
    }).catch(() => {});
}

function editPassword() {
    openModal({
        title: "Alterar senha",
        confirmLabel: "Alterar senha",
        body: `
            <div class="field"><label for="p-current">Senha atual</label>
                <div class="password-field"><input id="p-current" name="current" type="password" class="input" autocomplete="current-password" required>
                <button type="button" class="icon-btn" data-toggle-password="p-current" aria-label="Mostrar senha"></button></div></div>
            <div class="field"><label for="p-new">Nova senha</label>
                <div class="password-field"><input id="p-new" name="next" type="password" class="input" autocomplete="new-password" minlength="8" required>
                <button type="button" class="icon-btn" data-toggle-password="p-new" aria-label="Mostrar senha"></button></div>
                <p class="hint">Mínimo de 8 caracteres.</p></div>
            <div class="field"><label for="p-confirm">Confirme a nova senha</label><input id="p-confirm" name="confirm" type="password" class="input" autocomplete="new-password" required></div>`,
        onOpen: (form) => bindPasswordToggles(form),
        onConfirm: async (form) => {
            const data = Object.fromEntries(new FormData(form));
            if (data.next.length < 8) throw userError("A nova senha precisa ter pelo menos 8 caracteres.");
            if (data.next !== data.confirm) throw userError("As senhas não conferem.");
            try {
                await changePassword(data.current, data.next);
            } catch (error) {
                throw userError(error.code === "auth/invalid-credential" || error.code === "auth/wrong-password"
                    ? "Senha atual incorreta." : friendlyError(error));
            }
            toast("Senha alterada com sucesso.", "success");
        }
    });
}

function showPrivacy() {
    openModal({
        title: "Privacidade",
        hideConfirm: true,
        body: `<p>Seus dados são usados apenas pela Secretaria Municipal de Saúde para analisar e agendar suas solicitações, conforme a Lei Geral de Proteção de Dados (LGPD).</p>
            <p>Somente você e os servidores autorizados do seu município podem ver suas solicitações e documentos. Todas as alterações feitas pela Secretaria ficam registradas.</p>
            <p>O assistente de IA consulta apenas as suas informações e não faz diagnósticos.</p>`
    });
}

async function load() {
    main.innerHTML = loadingState();
    try {
        patient = await getPatient(profile.patientId);
        if (!patient) throw new Error("Paciente não encontrado");
        render();
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: "Não conseguimos carregar seu perfil." });
    }
}

load();
