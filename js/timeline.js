// Linha do tempo da solicitação (usada no app do paciente e no painel).
import { STATUS, formatDate, escapeHtml, sortByDate } from "./utils.js";
import { icon } from "./ui.js";

const STAGE = {
    DRAFT: 0,
    SUBMITTED: 1,
    DOCUMENT_REVIEW: 1,
    DOCUMENT_PENDING: 1,
    WAITING_REGULATION: 3,
    REGULATION: 3,
    APPROVED: 4,
    WAITING_QUEUE: 4,
    SCHEDULED: 6,
    CONFIRMED: 6,
    COMPLETED: 7
};

export function buildTimeline(request, history = []) {
    const entries = sortByDate(history, "createdAt", "asc");
    const firstDate = (statuses) => entries.find((h) => statuses.includes(h.newStatus))?.createdAt || null;
    const sentAt = request.requestedAt || request.createdAt;
    const noRegulation = request.requiresRegulation === false;

    const steps = [
        { label: "Solicitação enviada", date: sentAt },
        { label: "Documentos em análise", doneLabel: "Documentos recebidos", date: sentAt },
        { label: "Aprovação dos documentos", doneLabel: "Documentos aprovados", date: firstDate(["WAITING_REGULATION", "APPROVED", "WAITING_QUEUE"]) },
        { label: noRegulation ? "Avaliação" : "Regulação", currentLabel: "Em avaliação pela regulação", doneLabel: noRegulation ? "Aprovada" : "Regulação concluída", date: request.regulatedAt || firstDate(["APPROVED", "WAITING_QUEUE"]) },
        { label: "Aguardando vaga", date: request.queueEnteredAt || firstDate(["WAITING_QUEUE"]) },
        { label: "Agendamento", doneLabel: "Agendado", date: firstDate(["SCHEDULED"]) },
        { label: "Realização", currentLabel: "Aguardando o dia do atendimento", doneLabel: "Realizado", date: request.completedAt }
    ];

    const negative = request.status === "CANCELLED" || request.status === "NO_SHOW";
    if (negative) {
        const finalEntry = [...entries].reverse().find((h) => h.newStatus === request.status);
        const base = STAGE[finalEntry?.previousStatus] ?? 1;
        const done = steps.slice(0, Math.max(base, 1)).map((step) => ({ ...step, state: "done", label: step.doneLabel || step.label }));
        done.push({
            label: STATUS[request.status].citizen,
            date: finalEntry?.createdAt || request.updatedAt,
            note: finalEntry?.reason || "",
            state: "cancelled"
        });
        return done;
    }

    const current = STAGE[request.status] ?? 1;
    return steps.map((step, index) => {
        if (index < current) return { ...step, state: "done", label: step.doneLabel || step.label };
        if (index === current) {
            if (request.status === "DOCUMENT_PENDING") return { ...step, label: "Documento pendente", state: "alert", date: null };
            return { ...step, label: step.currentLabel || step.label, state: "current", date: null };
        }
        return { ...step, state: "todo", date: null };
    });
}

const STATE_TEXT = {
    done: "concluído",
    current: "etapa atual",
    alert: "precisa de atenção",
    cancelled: "encerrado",
    todo: "pendente"
};

export function renderTimeline(steps) {
    return `<ol class="timeline">
        ${steps.map((step) => {
            const marker = step.state === "done" ? icon("check", 16)
                : step.state === "alert" ? icon("alert", 16)
                    : step.state === "cancelled" ? icon("x", 16)
                        : step.state === "current" ? '<span class="timeline__dot"></span>' : "";
            return `<li class="timeline__item timeline__item--${step.state}">
                <span class="timeline__marker" aria-hidden="true">${marker}</span>
                <div class="timeline__content">
                    <p class="timeline__title">${escapeHtml(step.label)} <span class="sr-only">(${STATE_TEXT[step.state]})</span></p>
                    ${step.date ? `<p class="timeline__date">${formatDate(step.date)}</p>` : ""}
                    ${step.note ? `<p class="timeline__note">${escapeHtml(step.note)}</p>` : ""}
                </div>
            </li>`;
        }).join("")}
    </ol>`;
}
