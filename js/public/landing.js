// Tela inicial pública. Se já houver sessão de paciente, vai direto para a Home.
import { waitForUser, getProfile } from "../auth.js";
import { MUNICIPALITY_ID } from "../firebase-config.js";
import { listUnits } from "../services/units-service.js";
import { hydrateIcons, registerServiceWorker } from "../ui.js";
import { go, escapeHtml, UNIT_TYPES, STAFF_ROLES } from "../utils.js";

hydrateIcons();
registerServiceWorker();

waitForUser().then(async (user) => {
    if (!user) return;
    const profile = await getProfile(user.uid).catch(() => null);
    if (profile?.role === "PATIENT") go("app/home.html");
    else if (STAFF_ROLES.includes(profile?.role)) go("admin/dashboard.html");
});

// Lista de unidades carregada só quando o usuário abre a seção.
const unitsDetails = document.getElementById("units-details");
const unitsList = document.getElementById("units-list");
let unitsLoaded = false;

unitsDetails?.addEventListener("toggle", async () => {
    if (!unitsDetails.open || unitsLoaded) return;
    unitsLoaded = true;
    try {
        const units = await listUnits(MUNICIPALITY_ID, { activeOnly: true });
        unitsList.innerHTML = units.length
            ? units.map((u) => `<li><strong>${escapeHtml(u.name)}</strong><br><small>${escapeHtml(UNIT_TYPES[u.type] || "")}${u.address ? ` · ${escapeHtml(u.address)}` : ""}</small></li>`).join("")
            : "<li>Nenhuma unidade cadastrada ainda.</li>";
    } catch (error) {
        console.warn(error);
        unitsLoaded = false;
        unitsList.innerHTML = "<li>Não foi possível carregar as unidades agora.</li>";
    }
});
