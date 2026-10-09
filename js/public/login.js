import { login, logout, waitForUser, getProfile } from "../auth.js";
import { hydrateIcons, setButtonLoading, bindPasswordToggles, showFormError, setFieldError, registerServiceWorker } from "../ui.js";
import { go, friendlyError, formatCPF, STAFF_ROLES } from "../utils.js";

hydrateIcons();
bindPasswordToggles();
registerServiceWorker();

const form = document.getElementById("login-form");
const identifier = document.getElementById("identifier");
const password = document.getElementById("password");
const submit = document.getElementById("login-submit");
const errorBox = document.getElementById("form-error");

waitForUser().then(async (user) => {
    if (!user) return;
    const profile = await getProfile(user.uid).catch(() => null);
    if (profile?.role === "PATIENT") go("app/home.html");
});

// Formata como CPF quando o usuário digita só números.
identifier.addEventListener("input", () => {
    const value = identifier.value;
    if (/^[\d.\-\s]+$/.test(value) && value.replace(/\D/g, "").length <= 11) {
        identifier.value = formatCPF(value);
    }
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(errorBox, "");
    setFieldError(identifier, identifier.value.trim() ? "" : "Informe seu CPF ou e-mail.");
    setFieldError(password, password.value ? "" : "Informe sua senha.");
    if (!identifier.value.trim() || !password.value) return;

    setButtonLoading(submit, true, "Entrando...");
    try {
        const { profile } = await login(identifier.value, password.value);
        if (!profile) {
            showFormError(errorBox, "Sua conta não tem cadastro de paciente. Procure a Secretaria de Saúde.");
            await logout("login.html");
            return;
        }
        if (STAFF_ROLES.includes(profile.role)) {
            go("admin/dashboard.html");
            return;
        }
        go("app/home.html");
    } catch (error) {
        console.error(error);
        showFormError(errorBox, friendlyError(error, "Não foi possível entrar. Tente novamente."));
        setButtonLoading(submit, false);
    }
});
