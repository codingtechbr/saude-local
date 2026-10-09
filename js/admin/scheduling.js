// Modal de agendamento (usado na solicitação e na fila).
import { listUnits } from "../services/units-service.js";
import { scheduleAppointment } from "../services/appointments-service.js";
import { openModal } from "../ui.js";
import { escapeHtml, toDateInputValue, userError } from "../utils.js";

const DEFAULT_INSTRUCTIONS = "Chegar 30 minutos antes. Levar documento com foto, Cartão SUS e o pedido médico original.";

export async function openScheduleModal({ request, actor }) {
    const units = await listUnits(actor.municipalityId, { activeOnly: true });
    if (!units.length) throw userError("Cadastre uma unidade de saúde antes de agendar.");

    return openModal({
        title: `Agendar · ${request.procedureName}`,
        confirmLabel: "Agendar e avisar paciente",
        body: `
            <p class="hint">Paciente: <strong>${escapeHtml(request.patientName)}</strong> · Protocolo ${escapeHtml(request.protocol)}</p>
            <div class="field"><label for="s-unit">Unidade de atendimento</label>
                <select id="s-unit" name="unit" class="input" required>
                    ${units.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)}</option>`).join("")}
                </select></div>
            <div class="field-row">
                <div class="field"><label for="s-date">Data</label><input id="s-date" name="date" type="date" class="input" min="${toDateInputValue()}" required></div>
                <div class="field"><label for="s-time">Horário</label><input id="s-time" name="time" type="time" class="input" required></div>
            </div>
            <div class="field"><label for="s-instructions">Orientações ao paciente</label>
                <textarea id="s-instructions" name="instructions" class="input" rows="3">${escapeHtml(DEFAULT_INSTRUCTIONS)}</textarea></div>`,
        onConfirm: async (form) => {
            const data = Object.fromEntries(new FormData(form));
            if (!data.date || !data.time) throw userError("Informe data e horário.");
            const unit = units.find((u) => u.id === data.unit);
            const scheduledFor = new Date(`${data.date}T${data.time}:00`);
            await scheduleAppointment({ request, actor, unit, scheduledFor, instructions: data.instructions });
            return true;
        }
    });
}
