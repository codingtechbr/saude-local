// Cartões reutilizados nas telas do paciente.
import { icon, statusBadge, toast, setButtonLoading, confirmDialog } from "../ui.js";
import { confirmAppointment, requestReschedule } from "../services/appointments-service.js";
import {
    escapeHtml, pageUrl, REQUEST_TYPES, formatDate, formatLongDate, formatTime, formatWeekday, APPOINTMENT_STATUS, friendlyError
} from "../utils.js";

export function requestCard(request) {
    const type = REQUEST_TYPES[request.type] || { label: "Solicitação", icon: "list" };
    return `<a class="card card--interactive request-card" href="${pageUrl("app/solicitacao.html", { id: request.id })}">
        <div class="request-card__top">
            <span class="request-card__icon">${icon(type.icon, 20)}</span>
            <div class="request-card__body">
                <p class="request-card__title">${escapeHtml(request.procedureName)}</p>
                <p class="request-card__meta">${escapeHtml(type.label)} · Protocolo ${escapeHtml(request.protocol)}</p>
            </div>
        </div>
        <div class="request-card__bottom">
            ${statusBadge(request.status)}
            <span class="request-card__link">Ver andamento ${icon("chevronRight", 16)}</span>
        </div>
        <p class="request-card__date">Enviada em ${formatDate(request.requestedAt || request.createdAt)}</p>
    </a>`;
}

export function appointmentCard(appointment, { actions = true } = {}) {
    const status = APPOINTMENT_STATUS[appointment.status] || { label: appointment.status, tone: "neutral" };
    const canAct = actions && appointment.status === "SCHEDULED";
    const isActive = ["SCHEDULED", "CONFIRMED"].includes(appointment.status);
    return `<article class="card appointment-card ${isActive ? "appointment-card--active" : ""}" data-appointment="${escapeHtml(appointment.id)}">
        <p class="appointment-card__eyebrow">${isActive ? "Seu atendimento foi agendado" : "Agendamento"}</p>
        <h3 class="appointment-card__title">${escapeHtml(appointment.procedureName)}</h3>
        <div class="appointment-card__when">
            <div>${icon("calendar", 20)}<span><strong>${formatLongDate(appointment.scheduledFor)}</strong><small>${escapeHtml(formatWeekday(appointment.scheduledFor))}</small></span></div>
            <div>${icon("clock", 20)}<strong>${formatTime(appointment.scheduledFor)}</strong></div>
        </div>
        <p class="appointment-card__place">${icon("mapPin", 18)}<span><strong>${escapeHtml(appointment.healthUnitName)}</strong>${appointment.healthUnitAddress ? `<br><small>${escapeHtml(appointment.healthUnitAddress)}</small>` : ""}</span></p>
        ${appointment.instructions ? `<div class="appointment-card__instructions"><strong>Orientação</strong><p>${escapeHtml(appointment.instructions)}</p></div>` : ""}
        <p><span class="badge badge--${status.tone}">${escapeHtml(status.label)}</span>
        ${appointment.rescheduleRequested && isActive ? '<span class="badge badge--warning">Reagendamento solicitado</span>' : ""}</p>
        ${canAct ? `<div class="appointment-card__actions">
            <button type="button" class="btn btn-primary" data-confirm-appointment="${escapeHtml(appointment.id)}">${icon("check", 20)} Confirmar presença</button>
            ${appointment.rescheduleRequested ? "" : `<button type="button" class="link-btn" data-reschedule="${escapeHtml(appointment.id)}">Preciso reagendar</button>`}
        </div>` : ""}
    </article>`;
}

// Liga os botões "Confirmar presença" e "Preciso reagendar" dos cartões de agendamento.
export function bindAppointmentActions(container, { user, findAppointment, onChange }) {
    container.addEventListener("click", async (event) => {
        const confirmButton = event.target.closest("[data-confirm-appointment]");
        const rescheduleButton = event.target.closest("[data-reschedule]");
        if (!confirmButton && !rescheduleButton) return;

        const button = confirmButton || rescheduleButton;
        const appointment = findAppointment(button.dataset.confirmAppointment || button.dataset.reschedule);
        if (!appointment) return;

        if (rescheduleButton) {
            const ok = await confirmDialog({
                title: "Precisa reagendar?",
                message: "Vamos avisar a Secretaria que você não poderá comparecer neste horário. Um novo horário será informado pelo aplicativo.",
                confirmLabel: "Avisar a Secretaria"
            });
            if (!ok) return;
        }

        try {
            setButtonLoading(button, true, confirmButton ? "Confirmando..." : "Enviando...");
            if (confirmButton) {
                await confirmAppointment({ user, appointment });
                toast("Presença confirmada. Obrigado!", "success");
            } else {
                await requestReschedule({ appointment });
                toast("Pedido de reagendamento enviado à Secretaria.", "success");
            }
            await onChange();
        } catch (error) {
            console.error(error);
            setButtonLoading(button, false);
            toast(friendlyError(error), "error");
        }
    });
}
