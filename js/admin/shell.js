// Inicialização comum das telas do painel.
import { requireStaff } from "../guards.js";
import { logout } from "../auth.js";
import { renderAdminShell, emptyState } from "../ui.js";
import { functions } from "../firebase-config.js";
import { httpsCallable } from "../lib/functions.js";

// Garante que o token de login tenha o perfil do servidor (necessário para ver documentos no Storage).
async function ensureStaffClaims(user, profile) {
    try {
        const token = await user.getIdTokenResult();
        if (token.claims.role === profile.role && token.claims.municipalityId === profile.municipalityId) return;
        await httpsCallable(functions, "syncStaffClaims")();
        await user.getIdToken(true);
    } catch (error) {
        console.warn("Não foi possível sincronizar o perfil no token:", error);
    }
}

// allowedRoles: perfis que podem usar a tela (só interface; as regras protegem os dados).
export async function initAdminPage(active, title, allowedRoles = null) {
    const { user, profile } = await requireStaff();
    const claimsReady = ensureStaffClaims(user, profile);
    const content = renderAdminShell({
        active,
        title,
        profile,
        onLogout: () => logout("admin/login.html")
    });

    const actor = {
        uid: user.uid,
        name: profile.name || user.email,
        role: profile.role,
        municipalityId: profile.municipalityId
    };

    const can = (roles) => roles.includes(profile.role);

    if (allowedRoles && !can(allowedRoles)) {
        content.innerHTML = emptyState({
            title: "Sem permissão",
            text: "Seu perfil não tem acesso a esta área. Fale com o administrador.",
            iconName: "lock"
        });
        return new Promise(() => {});
    }

    await claimsReady;
    return { user, profile, actor, content, can };
}
