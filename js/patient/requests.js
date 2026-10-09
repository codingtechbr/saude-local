import { initPatientPage } from "./shell.js";
import { requestCard } from "./components.js";
import { listMyRequests } from "../services/requests-service.js";
import { skeletonList, emptyState, renderError } from "../ui.js";
import { pageUrl, FINAL_STATUSES } from "../utils.js";

const { user } = await initPatientPage("requests");

const list = document.getElementById("requests-list");
const tabs = document.querySelectorAll("[data-tab]");
let requests = [];
let activeTab = "active";

tabs.forEach((tab) => tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    render();
}));

function render() {
    const filtered = requests.filter((r) => (activeTab === "active") !== FINAL_STATUSES.includes(r.status));
    if (!requests.length) {
        list.innerHTML = emptyState({
            title: "Você ainda não possui solicitações.",
            text: "Quando precisar solicitar um exame ou procedimento, comece por aqui.",
            actionLabel: "Nova solicitação",
            actionHref: pageUrl("app/nova-solicitacao.html")
        });
        return;
    }
    if (!filtered.length) {
        list.innerHTML = emptyState({
            title: activeTab === "active" ? "Nenhuma solicitação em andamento." : "Nenhuma solicitação finalizada.",
            iconName: "check"
        });
        return;
    }
    list.innerHTML = filtered.map(requestCard).join("");
}

async function load() {
    list.innerHTML = skeletonList(3);
    try {
        requests = await listMyRequests(user.uid);
        render();
    } catch (error) {
        console.error(error);
        renderError(list, load, { title: "Não conseguimos carregar suas solicitações." });
    }
}

load();
