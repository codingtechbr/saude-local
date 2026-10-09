import { login, logout, waitForUser, getProfile } from "../auth.js";
import { hydrateIcons, setButtonLoading, bindPasswordToggles, showFormError } from "../ui.js";
import { go, friendlyError, STAFF_ROLES, userError } from "../utils.js";

hydrateIcons();
bindPasswordToggles();

const form = document.getElementById("admin-login-form");
const submit = document.getElementById("admin-login-submit");
const errorBox = document.getElementById("form-error");

waitForUser().then(async (user) => {
    if (!user) return;
    const profile = await getProfile(user.uid).catch(() => null);
    if (STAFF_ROLES.includes(profile?.role) && profile.active !== false) go("admin/dashboard.html");
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(errorBox, "");
    const email = form.elements.namedItem("email").value.trim();
    const password = form.elements.namedItem("password").value;
    if (!email.includes("@")) {
        showFormError(errorBox, "Informe seu e-mail institucional.");
        return;
    }
    setButtonLoading(submit, true, "Entrando...");
    try {
        const { profile } = await login(email, password);
        if (!profile || !STAFF_ROLES.includes(profile.role)) {
            await logout("admin/login.html");
            throw userError("Esta conta não tem acesso ao painel da Secretaria.");
        }
        if (profile.active === false) {
            await logout("admin/login.html");
            throw userError("Seu acesso está desativado. Fale com o administrador.");
        }
        go("admin/dashboard.html");
    } catch (error) {
        console.error(error);
        showFormError(errorBox, friendlyError(error, "Não foi possível entrar."));
        setButtonLoading(submit, false);
    }
});
