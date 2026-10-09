// Guards de página. Controlam apenas a INTERFACE (redirecionamentos).
// A proteção real dos dados está em firestore.rules e storage.rules.
import { waitForUser, getProfile, logout } from "./auth.js";
import { go, STAFF_ROLES } from "./utils.js";
import { renderFatal } from "./ui.js";

// Promise que nunca resolve: interrompe o script da página após um redirecionamento.
const halt = () => new Promise(() => {});

async function loadProfileOrFail(user, loginPage) {
    try {
        const profile = await getProfile(user.uid);
        if (profile) return profile;
        renderFatal({
            title: "Cadastro incompleto",
            text: "Sua conta existe, mas o perfil não foi encontrado. Saia e tente novamente ou procure a Secretaria de Saúde.",
            actionLabel: "Sair",
            onAction: () => logout(loginPage)
        });
    } catch (error) {
        console.error("Falha ao carregar perfil:", error);
        renderFatal({
            title: "Não conseguimos carregar seu perfil",
            text: error.code === "permission-denied"
                ? "Acesso negado pelas regras de segurança. Confira se o arquivo firestore.rules foi publicado."
                : "Verifique sua conexão e tente novamente.",
            actionLabel: "Tentar novamente",
            onAction: () => window.location.reload()
        });
    }
    return null;
}

export async function requirePatient() {
    const user = await waitForUser();
    if (!user) {
        go("login.html");
        return halt();
    }
    const profile = await loadProfileOrFail(user, "login.html");
    if (!profile) return halt();

    if (STAFF_ROLES.includes(profile.role)) {
        go("admin/dashboard.html");
        return halt();
    }
    if (profile.role !== "PATIENT" || profile.active === false) {
        await logout("login.html");
        return halt();
    }
    return { user, profile };
}

export async function requireStaff() {
    const user = await waitForUser();
    if (!user) {
        go("admin/login.html");
        return halt();
    }
    const profile = await loadProfileOrFail(user, "admin/login.html");
    if (!profile) return halt();

    if (!STAFF_ROLES.includes(profile.role) || profile.active === false) {
        renderFatal({
            title: "Acesso restrito",
            text: "Esta área é exclusiva para servidores da Secretaria de Saúde.",
            actionLabel: "Sair",
            onAction: () => logout("admin/login.html")
        });
        return halt();
    }
    return { user, profile };
}
