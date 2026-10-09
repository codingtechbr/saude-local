import { initPatientPage } from "./shell.js";
import { appointmentCard, bindAppointmentActions } from "./components.js";
import { listMyAppointments } from "../services/appointments-service.js";
import { skeletonList, emptyState, renderError } from "../ui.js";
import { toDate, sortByDate } from "../utils.js";

const { user } = await initPatientPage("home");

const main = document.getElementById("main");
let appointments = [];

bindAppointmentActions(main, {
    user,
    findAppointment: (id) => appointments.find((a) => a.id === id),
    onChange: load
});

function render() {
    if (!appointments.length) {
        main.innerHTML = emptyState({
            title: "Nenhum agendamento ainda.",
            text: "Quando a Secretaria agendar seu atendimento, ele aparecerá aqui e você receberá um aviso.",
            iconName: "calendar"
        });
        return;
    }
    const limit = Date.now() - 6 * 3600 * 1000;
    const upcoming = appointments.filter((a) => ["SCHEDULED", "CONFIRMED"].includes(a.status) && (toDate(a.scheduledFor)?.getTime() ?? 0) >= limit);
    const past = sortByDate(appointments.filter((a) => !upcoming.includes(a)), "scheduledFor", "desc");

    main.innerHTML = `
        <h2 class="section-title">Próximos</h2>
        ${upcoming.length ? upcoming.map((a) => appointmentCard(a)).join("") : '<p class="hint">Nenhum agendamento futuro.</p>'}
        ${past.length ? `<h2 class="section-title mt-24">Anteriores</h2>${past.map((a) => appointmentCard(a, { actions: false })).join("")}` : ""}`;
}

async function load() {
    main.innerHTML = skeletonList(2);
    try {
        appointments = await listMyAppointments(user.uid);
        render();
    } catch (error) {
        console.error(error);
        renderError(main, load, { title: "Não conseguimos carregar seus agendamentos." });
    }
}

load();
