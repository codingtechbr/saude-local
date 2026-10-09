// Utilitários sem dependência do Firebase.

// Raiz do site calculada a partir deste arquivo (js/utils.js -> ../).
// Assim os links funcionam tanto na raiz do domínio quanto em subpastas.
export const ROOT = new URL("../", import.meta.url);

export function pageUrl(path, params = {}) {
    const url = new URL(path, ROOT);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, value);
        }
    });
    return url.href;
}

export function go(path, params) {
    window.location.href = pageUrl(path, params);
}

export function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

/* ---------- Documentos e máscaras ---------- */

export function onlyDigits(value) {
    return String(value ?? "").replace(/\D/g, "");
}

export function normalizeCPF(value) {
    return onlyDigits(value).slice(0, 11);
}

export function isValidCPF(value) {
    const cpf = normalizeCPF(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const digit = (length) => {
        let sum = 0;
        for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
        const rest = (sum * 10) % 11;
        return rest === 10 ? 0 : rest;
    };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function formatCPF(value) {
    return normalizeCPF(value)
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function formatPhone(value) {
    const d = onlyDigits(value).slice(0, 11);
    if (!d) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatCNS(value) {
    return onlyDigits(value).slice(0, 15)
        .replace(/^(\d{3})(\d)/, "$1 $2")
        .replace(/^(\d{3}) (\d{4})(\d)/, "$1 $2 $3")
        .replace(/^(\d{3}) (\d{4}) (\d{4})(\d)/, "$1 $2 $3 $4");
}

export function formatCEP(value) {
    return onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

export function maskCPF(value) {
    const d = normalizeCPF(value);
    if (d.length !== 11) return "—";
    return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

export function maskPhone(value) {
    const d = onlyDigits(value);
    if (d.length < 10) return "—";
    return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}

export function maskEmail(value) {
    const [user, domain] = String(value || "").split("@");
    if (!user || !domain) return "—";
    return `${user[0]}***@${domain}`;
}

export function maskCNS(value) {
    const d = onlyDigits(value);
    if (d.length < 4) return "—";
    return `*** **** **** ${d.slice(-4)}`;
}

// Liga a máscara a um <input> enquanto o usuário digita.
export function bindMask(input, formatter) {
    if (!input) return;
    input.addEventListener("input", () => {
        input.value = formatter(input.value);
    });
}

/* ---------- Datas ---------- */

export function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
    const date = toDate(value);
    return date ? date.toLocaleDateString("pt-BR") : "—";
}

export function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return "—";
    return `${date.toLocaleDateString("pt-BR")} ${formatTime(date)}`;
}

export function formatTime(value) {
    const date = toDate(value);
    return date ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function formatLongDate(value) {
    const date = toDate(value);
    return date ? date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

export function formatWeekday(value) {
    const date = toDate(value);
    return date ? date.toLocaleDateString("pt-BR", { weekday: "long" }) : "";
}

// Datas de nascimento ficam como "AAAA-MM-DD" (sem fuso horário).
export function formatBirthDate(value) {
    if (!value) return "—";
    const [y, m, d] = String(value).split("-");
    return y && m && d ? `${d}/${m}/${y}` : String(value);
}

export function relativeTime(value) {
    const date = toDate(value);
    if (!date) return "";
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return "agora";
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
    if (diff < 172800) return "ontem";
    return formatDate(date);
}

export function isSameDay(a, b) {
    const x = toDate(a);
    const y = toDate(b);
    return !!x && !!y && x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function toDateInputValue(value = new Date()) {
    const date = toDate(value);
    if (!date) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function daysSince(value) {
    const date = toDate(value);
    if (!date) return null;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

export function sortByDate(list, field, direction = "desc") {
    const factor = direction === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
        const x = toDate(a[field])?.getTime() ?? 0;
        const y = toDate(b[field])?.getTime() ?? 0;
        return (x - y) * factor;
    });
}

/* ---------- Texto ---------- */

export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function normalizeText(value) {
    return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "";
}

export function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function debounce(fn, wait = 250) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

export function randomPassword(length = 20) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const values = crypto.getRandomValues(new Uint32Array(length));
    return Array.from(values, (v) => chars[v % chars.length]).join("");
}

/* ---------- Erros ---------- */

// Erro com mensagem pronta para exibir ao usuário.
export function userError(message) {
    const error = new Error(message);
    error.userMessage = message;
    return error;
}

const ERROR_MESSAGES = {
    "auth/invalid-credential": "E-mail/CPF ou senha incorretos.",
    "auth/invalid-login-credentials": "E-mail/CPF ou senha incorretos.",
    "auth/wrong-password": "E-mail/CPF ou senha incorretos.",
    "auth/user-not-found": "E-mail/CPF ou senha incorretos.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/missing-password": "Informe a senha.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado. Tente entrar ou recuperar a senha.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/network-request-failed": "Sem conexão. Verifique sua internet e tente novamente.",
    "auth/user-disabled": "Esta conta está desativada. Procure a Secretaria de Saúde.",
    "auth/requires-recent-login": "Por segurança, entre novamente e repita a operação.",
    "auth/operation-not-allowed": "Login por e-mail e senha não está ativado no Firebase Authentication.",
    "permission-denied": "Você não tem permissão para esta ação.",
    "unauthenticated": "Sua sessão expirou. Entre novamente.",
    "unavailable": "Serviço indisponível no momento. Verifique sua conexão.",
    "not-found": "Registro não encontrado.",
    "failed-precondition": "O banco de dados precisa de um índice para esta consulta. Veja o link no console do navegador.",
    "resource-exhausted": "Limite de uso atingido. Tente novamente mais tarde.",
    "deadline-exceeded": "A operação demorou demais. Tente novamente.",
    "storage/unauthorized": "Sem permissão para acessar este arquivo. Saia e entre novamente; se continuar, avise a Secretaria.",
    "storage/unauthenticated": "Sua sessão expirou. Entre novamente.",
    "storage/canceled": "Envio cancelado.",
    "storage/retry-limit-exceeded": "A conexão caiu durante o envio. Tente novamente.",
    "storage/quota-exceeded": "Limite de armazenamento atingido. Procure a Secretaria.",
    "storage/object-not-found": "Arquivo não encontrado.",
    "functions/unauthenticated": "Sua sessão expirou. Entre novamente.",
    "functions/internal": "Serviço temporariamente indisponível. Tente novamente.",
    "functions/unavailable": "Serviço temporariamente indisponível. Tente novamente.",
    "functions/deadline-exceeded": "O serviço demorou para responder. Tente novamente."
};

export function friendlyError(error, fallback = "Algo deu errado. Tente novamente.") {
    if (!error) return fallback;
    if (error.userMessage) return error.userMessage;
    const code = String(error.code || "");
    if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    // Mensagens de HttpsError das nossas Cloud Functions já vêm em português.
    if (code.startsWith("functions/") && error.message && error.message !== code.replace("functions/", "")) {
        return error.message;
    }
    return fallback;
}

/* ---------- Domínio ---------- */

export const REQUEST_TYPES = {
    EXAM: { label: "Exame", plural: "Exames", icon: "flask", description: "Ultrassom, raio-X, mamografia, tomografia..." },
    CONSULTATION: { label: "Consulta", plural: "Consultas", icon: "stethoscope", description: "Consultas com especialistas" },
    SURGERY: { label: "Cirurgia", plural: "Cirurgias", icon: "heart", description: "Cirurgias eletivas encaminhadas pelo médico" }
};

export const STATUS = {
    DRAFT: { admin: "Rascunho", citizen: "Rascunho", tone: "neutral" },
    SUBMITTED: { admin: "Enviada", citizen: "Solicitação enviada", tone: "info",
        description: "Recebemos sua solicitação. Os documentos serão analisados pela Secretaria." },
    DOCUMENT_REVIEW: { admin: "Análise documental", citizen: "Documentos em análise", tone: "info",
        description: "A Secretaria está conferindo os documentos enviados." },
    DOCUMENT_PENDING: { admin: "Documento pendente", citizen: "Documento pendente", tone: "warning",
        description: "Falta algum documento ou ele precisa ser reenviado. Veja abaixo o que fazer." },
    WAITING_REGULATION: { admin: "Aguardando regulação", citizen: "Em avaliação", tone: "info",
        description: "Os documentos foram aprovados. A solicitação está aguardando avaliação da regulação." },
    REGULATION: { admin: "Em regulação", citizen: "Em avaliação", tone: "info",
        description: "A equipe de regulação está avaliando sua solicitação." },
    APPROVED: { admin: "Aprovada", citizen: "Aprovada", tone: "success",
        description: "Sua solicitação foi aprovada." },
    WAITING_QUEUE: { admin: "Na fila", citizen: "Aguardando vaga", tone: "info",
        description: "Sua solicitação está aprovada e aguardando disponibilidade de vaga. Avisaremos quando houver agendamento." },
    SCHEDULED: { admin: "Agendada", citizen: "Agendado", tone: "success",
        description: "Seu atendimento foi agendado. Confirme sua presença." },
    CONFIRMED: { admin: "Presença confirmada", citizen: "Presença confirmada", tone: "success",
        description: "Você confirmou presença. Não esqueça de levar seus documentos." },
    COMPLETED: { admin: "Concluída", citizen: "Realizado", tone: "neutral",
        description: "Atendimento realizado." },
    CANCELLED: { admin: "Cancelada", citizen: "Cancelada", tone: "danger",
        description: "Esta solicitação foi cancelada." },
    NO_SHOW: { admin: "Não compareceu", citizen: "Não compareceu", tone: "danger",
        description: "Não foi registrado comparecimento no dia agendado. Procure a Secretaria." }
};

export const FINAL_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW"];

export const PRIORITY = {
    NORMAL: { label: "Normal", tone: "neutral" },
    PRIORITY: { label: "Prioritária", tone: "warning" },
    URGENT: { label: "Urgente", tone: "danger" }
};

export const PRIORITY_ORDER = { URGENT: 0, PRIORITY: 1, NORMAL: 2 };

export const DOCUMENT_TYPES = {
    MEDICAL_REQUEST: "Pedido médico",
    PERSONAL_DOCUMENT: "Documento com foto (RG ou CNH)",
    SUS_CARD: "Cartão SUS",
    PROOF_OF_ADDRESS: "Comprovante de residência",
    PREVIOUS_REPORT: "Laudo ou exame anterior",
    OTHER: "Outro documento"
};

export const DOCUMENT_STATUS = {
    PENDING: { label: "Em análise", tone: "info" },
    APPROVED: { label: "Aprovado", tone: "success" },
    REJECTED: { label: "Recusado", tone: "danger" }
};

export const REJECT_REASONS = [
    "Documento ilegível",
    "Documento incorreto",
    "Documento vencido",
    "Informação incompleta",
    "Outro"
];

export const APPOINTMENT_STATUS = {
    SCHEDULED: { label: "Agendado", tone: "success" },
    CONFIRMED: { label: "Presença confirmada", tone: "success" },
    COMPLETED: { label: "Realizado", tone: "neutral" },
    NO_SHOW: { label: "Não compareceu", tone: "danger" },
    CANCELLED: { label: "Cancelado", tone: "danger" }
};

export const ROLES = {
    PATIENT: "Paciente",
    ATTENDANT: "Atendente",
    REGULATOR: "Regulador",
    MANAGER: "Gestor",
    ADMIN: "Administrador",
    SUPER_ADMIN: "Super administrador"
};

export const STAFF_ROLES = ["ATTENDANT", "REGULATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"];

// Grupos de permissão usados na interface. A proteção real está nas Security Rules.
export const ROLE_GROUPS = {
    ALL_STAFF: STAFF_ROLES,
    DOCUMENTS: ["ATTENDANT", "REGULATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"],
    REGULATION: ["REGULATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"],
    SCHEDULING: ["ATTENDANT", "MANAGER", "ADMIN", "SUPER_ADMIN"],
    CATALOG: ["MANAGER", "ADMIN", "SUPER_ADMIN"],
    REPORTS: ["MANAGER", "ADMIN", "SUPER_ADMIN"],
    ADMIN: ["ADMIN", "SUPER_ADMIN"]
};

export const UNIT_TYPES = {
    UBS: "Unidade Básica de Saúde",
    POLYCLINIC: "Policlínica / Centro de Especialidades",
    DIAGNOSTIC: "Centro de Diagnóstico",
    HOSPITAL: "Hospital",
    OTHER: "Outro"
};

export const NOTIFICATION_ICONS = {
    REQUEST_CREATED: "list",
    DOCUMENT_APPROVED: "check",
    DOCUMENT_REJECTED: "alert",
    DOCUMENT_REQUIRED: "alert",
    REGULATION_COMPLETED: "shield",
    QUEUE_ENTERED: "layers",
    APPOINTMENT_CREATED: "calendar",
    APPOINTMENT_REMINDER: "clock",
    APPOINTMENT_CANCELLED: "x",
    REQUEST_CANCELLED: "x",
    REQUEST_COMPLETED: "check"
};
