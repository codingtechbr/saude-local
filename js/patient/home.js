import { initPatientPage } from "./shell.js";
import { requestCard, appointmentCard, bindAppointmentActions } from "./components.js";
import { listMyRequests } from "../services/requests-service.js";
import { listMyAppointments } from "../services/appointments-service.js";
import { icon, skeletonList, emptyState, renderError } from "../ui.js";
import { escapeHtml, firstName, pageUrl, FINAL_STATUSES, toDate } from "../utils.js";

const { user, profile } = await initPatientPage("home");

const greeting = document.getElementById("greeting");
const nextAppointment = document.getElementById("next-appointment");
const list = document.getElementById("requests-list");
let appointments = [];

greeting.textContent = `Olá, ${firstName(profile.name) || "bem-vindo(a)"}`;

document.getElementById("quick-actions").innerHTML = [
    { label: "Exames", icon: "flask", href: pageUrl("app/nova-solicitacao.html", { type: "EXAM" }) },
    { label: "Consultas", icon: "stethoscope", href: pageUrl("app/nova-solicitacao.html", { type: "CONSULTATION" }) },
    { label: "Cirurgias", icon: "heart", href: pageUrl("app/nova-solicitacao.html", { type: "SURGERY" }) },
    { label: "Documentos", icon: "folder", href: pageUrl("app/documentos.html") }
].map((item) => `<a class="quick-card" href="${item.href}">
    <span class="quick-card__icon">${icon(item.icon, 24)}</span>
    <span>${escapeHtml(item.label)}</span>
</a>`).join("");

bindAppointmentActions(nextAppointment, {
    user,
    findAppointment: (id) => appointments.find((a) => a.id === id),
    onChange: load
});

async function load() {
    list.innerHTML = skeletonList(2);
    try {
        const [requests, myAppointments] = await Promise.all([listMyRequests(user.uid), listMyAppointments(user.uid)]);
        appointments = myAppointments;

        const now = Date.now() - 3 * 3600 * 1000;
        const upcoming = appointments.find((a) => ["SCHEDULED", "CONFIRMED"].includes(a.status) && (toDate(a.scheduledFor)?.getTime() ?? 0) >= now);
        nextAppointment.innerHTML = upcoming ? `<h2 class="section-title">Próximo atendimento</h2>${appointmentCard(upcoming)}` : "";

        const active = requests.filter((r) => !FINAL_STATUSES.includes(r.status));
        if (!requests.length) {
            list.innerHTML = emptyState({
                title: "Você ainda não possui solicitações.",
                text: "Quando precisar solicitar um exame ou procedimento, comece por aqui.",
                actionLabel: "Nova solicitação",
                actionHref: pageUrl("app/nova-solicitacao.html")
            });
            return;
        }
        const shown = (active.length ? active : requests).slice(0, 3);
        list.innerHTML = shown.map(requestCard).join("") +
            (requests.length > shown.length ? `<a class="btn btn-secondary" href="${pageUrl("app/solicitacoes.html")}">Ver todas as solicitações</a>` : "");
    } catch (error) {
        console.error(error);
        renderError(list, load, { title: "Não conseguimos carregar suas solicitações." });
    }
}

load();
