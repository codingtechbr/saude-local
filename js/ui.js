// Componentes de interface reutilizáveis (sem acesso ao Firebase).
import { escapeHtml, pageUrl, STATUS, PRIORITY, ROOT, ROLES } from "./utils.js";

const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    list: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
    file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    mapPin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
    stethoscope: '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v2a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/>',
    heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    volumeOff: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 4 6M21 9l-4 6"/>',
    square: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>'
};

export function icon(name, size = 22, className = "") {
    const paths = ICONS[name] || ICONS.info;
    return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

// Substitui <span data-icon="nome"> pelos SVGs (usado nas páginas HTML estáticas).
export function hydrateIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
        el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 22);
        el.removeAttribute("data-icon");
    });
}

/* ---------- Toast ---------- */

let toastRoot;

export function toast(message, type = "info", timeout = 4500) {
    if (!toastRoot) {
        toastRoot = document.createElement("div");
        toastRoot.className = "toast-container";
        toastRoot.setAttribute("role", "status");
        toastRoot.setAttribute("aria-live", "polite");
        document.body.appendChild(toastRoot);
    }
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.textContent = message;
    toastRoot.appendChild(el);
    setTimeout(() => {
        el.classList.add("toast--hide");
        setTimeout(() => el.remove(), 300);
    }, timeout);
}

/* ---------- Botões ---------- */

export function setButtonLoading(button, loading, loadingText = "Aguarde...") {
    if (!button) return;
    if (loading) {
        if (button.dataset.originalHtml === undefined) button.dataset.originalHtml = button.innerHTML;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.innerHTML = `<span class="spinner spinner--sm" aria-hidden="true"></span><span>${escapeHtml(loadingText)}</span>`;
    } else {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        if (button.dataset.originalHtml !== undefined) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        }
    }
}

/* ---------- Estados de tela ---------- */

export function loadingState(text = "Carregando...") {
    return `<div class="state state--loading" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <p>${escapeHtml(text)}</p>
    </div>`;
}

export function skeletonList(count = 3) {
    return `<div class="skeleton-list" aria-hidden="true">${'<div class="skeleton skeleton--card"></div>'.repeat(count)}</div>
        <span class="sr-only" role="status">Carregando...</span>`;
}

export function emptyState({ title, text = "", actionLabel = "", actionHref = "", iconName = "list" }) {
    return `<div class="state state--empty">
        <div class="state__icon">${icon(iconName, 28)}</div>
        <h2>${escapeHtml(title)}</h2>
        ${text ? `<p>${escapeHtml(text)}</p>` : ""}
        ${actionLabel ? `<a class="btn btn-primary state__action" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>` : ""}
    </div>`;
}

export function renderError(container, onRetry, {
    title = "Não conseguimos carregar as informações.",
    text = "Verifique sua conexão e tente novamente."
} = {}) {
    container.innerHTML = `<div class="state state--error" role="alert">
        <div class="state__icon state__icon--danger">${icon("alert", 28)}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(text)}</p>
        ${onRetry ? `<button type="button" class="btn btn-primary state__action" data-retry>${icon("refresh", 18)} Tentar novamente</button>` : ""}
    </div>`;
    container.querySelector("[data-retry]")?.addEventListener("click", onRetry);
}

// Tela de bloqueio usada pelos guards (perfil ausente, sem permissão etc.).
export function renderFatal({ title, text, actionLabel, onAction }) {
    document.body.innerHTML = `<main class="fatal-screen">
        <div class="state state--error" role="alert">
            <div class="state__icon state__icon--danger">${icon("alert", 28)}</div>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(text)}</p>
            ${actionLabel ? `<button type="button" class="btn btn-primary state__action" data-action>${escapeHtml(actionLabel)}</button>` : ""}
        </div>
    </main>`;
    document.querySelector("[data-action]")?.addEventListener("click", onAction);
}

/* ---------- Badges ---------- */

export function statusBadge(status, audience = "citizen") {
    const info = STATUS[status] || { admin: status, citizen: status, tone: "neutral" };
    return `<span class="badge badge--${info.tone}">${escapeHtml(info[audience] || status)}</span>`;
}

export function priorityBadge(priority) {
    const info = PRIORITY[priority] || PRIORITY.NORMAL;
    return `<span class="badge badge--${info.tone}">${escapeHtml(info.label)}</span>`;
}

export function toneBadge(label, tone = "neutral") {
    return `<span class="badge badge--${tone}">${escapeHtml(label)}</span>`;
}

/* ---------- Navegação inferior (paciente) ---------- */

const PATIENT_NAV = [
    { key: "home", label: "Início", href: "app/home.html", icon: "home" },
    { key: "requests", label: "Pedidos", href: "app/solicitacoes.html", icon: "list" },
    { key: "new", label: "Solicitar", href: "app/nova-solicitacao.html", icon: "plus", center: true },
    { key: "notifications", label: "Avisos", href: "app/notificacoes.html", icon: "bell" },
    { key: "profile", label: "Perfil", href: "app/perfil.html", icon: "user" }
];

export function renderBottomNav(active) {
    const nav = document.createElement("nav");
    nav.className = "bottom-nav";
    nav.setAttribute("aria-label", "Navegação principal");
    nav.innerHTML = PATIENT_NAV.map((item) => `
        <a class="nav-item ${item.center ? "nav-item--center" : ""}" href="${pageUrl(item.href)}"
           data-nav="${item.key}" ${item.key === active ? 'aria-current="page"' : ""}>
            <span class="nav-item__icon">${icon(item.icon, item.center ? 26 : 22)}</span>
            <span class="nav-item__label">${item.label}</span>
        </a>`).join("");
    document.body.appendChild(nav);
    return nav;
}

// Atualiza o contador de avisos não lidos (barra inferior e sino do cabeçalho).
export function setUnreadBadge(count) {
    const label = count > 99 ? "99+" : String(count);
    document.querySelectorAll('[data-nav="notifications"], [data-unread-target]').forEach((el) => {
        let badge = el.querySelector(".nav-badge");
        if (!count) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "nav-badge";
            el.appendChild(badge);
        }
        badge.textContent = label;
        badge.setAttribute("aria-label", `${count} avisos não lidos`);
    });
}

/* ---------- Modal ---------- */

// Abre um modal com formulário. onConfirm(form) pode lançar erro (exibido no modal)
// ou retornar false para manter o modal aberto. Resolve com o retorno de onConfirm ou null.
export function openModal({
    title,
    body,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    danger = false,
    hideConfirm = false,
    wide = false,
    onConfirm,
    onOpen
}) {
    return new Promise((resolve) => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
            <div class="modal ${wide ? "modal--wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <form class="modal__form" novalidate>
                    <header class="modal__header">
                        <h2 id="modal-title">${escapeHtml(title)}</h2>
                        <button type="button" class="icon-btn" data-close aria-label="Fechar">${icon("x")}</button>
                    </header>
                    <div class="modal__body">${body}</div>
                    <p class="form-error" data-modal-error role="alert" hidden></p>
                    <footer class="modal__footer">
                        <button type="button" class="btn btn-secondary" data-close>${escapeHtml(hideConfirm ? "Fechar" : cancelLabel)}</button>
                        ${hideConfirm ? "" : `<button type="submit" class="btn ${danger ? "btn-danger" : "btn-primary"}">${escapeHtml(confirmLabel)}</button>`}
                    </footer>
                </form>
            </div>`;

        const form = overlay.querySelector("form");
        const submitButton = form.querySelector('button[type="submit"]');
        const errorEl = overlay.querySelector("[data-modal-error]");
        let closed = false;

        const close = (result) => {
            if (closed) return;
            closed = true;
            document.removeEventListener("keydown", onKey);
            overlay.remove();
            document.body.classList.remove("modal-open");
            if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
            resolve(result);
        };

        const onKey = (event) => {
            if (event.key === "Escape") close(null);
        };

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay || event.target.closest("[data-close]")) close(null);
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            errorEl.hidden = true;
            if (!onConfirm) {
                close(true);
                return;
            }
            try {
                setButtonLoading(submitButton, true, "Salvando...");
                const result = await onConfirm(form);
                setButtonLoading(submitButton, false);
                if (result === false) return;
                close(result === undefined ? true : result);
            } catch (error) {
                console.error(error);
                setButtonLoading(submitButton, false);
                errorEl.textContent = error.userMessage || error.message || "Não foi possível concluir.";
                errorEl.hidden = false;
            }
        });

        document.addEventListener("keydown", onKey);
        document.body.appendChild(overlay);
        document.body.classList.add("modal-open");
        if (onOpen) onOpen(form);
        const firstField = form.querySelector(".modal__body input, .modal__body select, .modal__body textarea") || submitButton;
        firstField?.focus();
    });
}

export async function confirmDialog({ title, message, confirmLabel = "Confirmar", danger = false }) {
    const result = await openModal({
        title,
        body: `<p>${escapeHtml(message)}</p>`,
        confirmLabel,
        danger,
        onConfirm: () => true
    });
    return result === true;
}

/* ---------- Painel administrativo ---------- */

const ADMIN_NAV = [
    { key: "dashboard", label: "Dashboard", href: "admin/dashboard.html", icon: "grid" },
    { key: "requests", label: "Solicitações", href: "admin/solicitacoes.html", icon: "list" },
    { key: "regulation", label: "Regulação", href: "admin/regulacao.html", icon: "shield", roles: ["REGULATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"] },
    { key: "queues", label: "Filas", href: "admin/filas.html", icon: "layers" },
    { key: "appointments", label: "Agendamentos", href: "admin/agendamentos.html", icon: "calendar" },
    { key: "patients", label: "Pacientes", href: "admin/pacientes.html", icon: "users" },
    { key: "procedures", label: "Procedimentos", href: "admin/procedimentos.html", icon: "activity", roles: ["MANAGER", "ADMIN", "SUPER_ADMIN"] },
    { key: "units", label: "Unidades", href: "admin/unidades.html", icon: "building", roles: ["MANAGER", "ADMIN", "SUPER_ADMIN"] },
    { key: "users", label: "Usuários", href: "admin/usuarios.html", icon: "user", roles: ["ADMIN", "SUPER_ADMIN"] },
    { key: "reports", label: "Relatórios", href: "admin/relatorios.html", icon: "chart", roles: ["MANAGER", "ADMIN", "SUPER_ADMIN"] },
    { key: "settings", label: "Configurações", href: "admin/configuracoes.html", icon: "settings", roles: ["ADMIN", "SUPER_ADMIN"] }
];

export function renderAdminShell({ active, title, profile, onLogout }) {
    document.body.classList.add("admin-body");
    const root = document.getElementById("admin-root");
    const items = ADMIN_NAV.filter((item) => !item.roles || item.roles.includes(profile.role));
    root.innerHTML = `
        <a class="skip-link" href="#admin-content">Pular para o conteúdo</a>
        <div class="admin-layout">
            <aside class="sidebar" id="sidebar" aria-label="Menu do painel">
                <div class="sidebar__brand">
                    <img src="${new URL("assets/logo/logo.svg", ROOT).href}" alt="" width="34" height="34">
                    <div><strong>Secretaria Municipal</strong><small>Saúde</small></div>
                </div>
                <nav class="sidebar__nav">
                    ${items.map((item) => `
                        <a href="${pageUrl(item.href)}" ${item.key === active ? 'aria-current="page"' : ""}>
                            ${icon(item.icon, 20)}<span>${item.label}</span>
                        </a>`).join("")}
                </nav>
                <div class="sidebar__footer">
                    <div class="sidebar__user">
                        <strong>${escapeHtml(profile.name || profile.email || "Usuário")}</strong>
                        <small>${escapeHtml(ROLES[profile.role] || profile.role)}</small>
                    </div>
                    <button type="button" class="sidebar__logout" data-logout>${icon("logout", 20)}<span>Sair</span></button>
                </div>
            </aside>
            <div class="sidebar-backdrop" data-close-sidebar></div>
            <div class="admin-main">
                <header class="admin-topbar">
                    <button type="button" class="icon-btn menu-btn" data-open-sidebar aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">${icon("menu")}</button>
                    <h1>${escapeHtml(title)}</h1>
                </header>
                <main id="admin-content" class="admin-content" tabindex="-1">${loadingState()}</main>
            </div>
        </div>`;

    const sidebar = root.querySelector("#sidebar");
    const backdrop = root.querySelector("[data-close-sidebar]");
    const openButton = root.querySelector("[data-open-sidebar]");
    const setOpen = (open) => {
        sidebar.classList.toggle("is-open", open);
        backdrop.classList.toggle("is-open", open);
        openButton.setAttribute("aria-expanded", String(open));
    };
    openButton.addEventListener("click", () => setOpen(true));
    backdrop.addEventListener("click", () => setOpen(false));
    root.querySelector("[data-logout]").addEventListener("click", onLogout);

    document.title = `${title} · Painel da Secretaria`;
    return root.querySelector("#admin-content");
}

/* ---------- PWA ---------- */

export function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return Promise.resolve(null);
    return navigator.serviceWorker
        .register(new URL("service-worker.js", ROOT).href, { scope: ROOT.pathname })
        .catch((error) => {
            console.warn("Service worker não registrado:", error);
            return null;
        });
}

/* ---------- Impressão ---------- */

// Imprime um arquivo do Storage. Deve ser chamado direto no clique (o navegador exige gesto do usuário).
// Imagem: abre uma página só com a imagem e chama a impressão.
// PDF: abre o arquivo no visualizador do navegador, que tem o botão de imprimir.
export function printFile(url, { isImage, title = "Documento" }) {
    if (!isImage) {
        window.open(url, "_blank", "noopener");
        return;
    }
    const win = window.open("", "_blank");
    if (!win) {
        window.open(url, "_blank", "noopener");
        return;
    }
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title>
        <style>@page{margin:12mm}html,body{margin:0;background:#fff}h1{font:600 14px Arial,sans-serif;margin:0 0 8px}
        img{display:block;max-width:100%;max-height:92vh;margin:0 auto;object-fit:contain}</style></head>
        <body><h1>${escapeHtml(title)}</h1><img src="${escapeHtml(url)}" alt="" onload="setTimeout(function(){window.focus();window.print();},250)"></body></html>`);
    win.document.close();
}

export function printButtonHtml(label = "Imprimir") {
    return `<button type="button" class="btn btn-primary mt-16" data-print>${icon("printer", 18)} ${escapeHtml(label)}</button>`;
}

/* ---------- Diversos ---------- */

export function bindPasswordToggles(root = document) {
    root.querySelectorAll("[data-toggle-password]").forEach((button) => {
        const input = root.querySelector(`#${button.dataset.togglePassword}`);
        if (!input) return;
        button.innerHTML = icon("eye", 20);
        button.addEventListener("click", () => {
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            button.innerHTML = icon(show ? "eyeOff" : "eye", 20);
            button.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
        });
    });
}

export function setFieldError(input, message) {
    if (!input) return;
    const field = input.closest(".field");
    let error = field?.querySelector(".field-error");
    if (message) {
        input.setAttribute("aria-invalid", "true");
        if (field && !error) {
            error = document.createElement("p");
            error.className = "field-error";
            error.id = `${input.id}-error`;
            field.appendChild(error);
        }
        if (error) {
            error.textContent = message;
            input.setAttribute("aria-describedby", error.id);
        }
    } else {
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
        error?.remove();
    }
}

export function clearFieldErrors(form) {
    form.querySelectorAll("[aria-invalid]").forEach((input) => setFieldError(input, ""));
}

export function showFormError(element, message) {
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
}
