// Unidades de saúde (UBS, hospitais, centros de diagnóstico).
import { db } from "../firebase-config.js";
import { doc, collection, getDocs, query, where, writeBatch, serverTimestamp } from "../lib/firestore.js";
import { addAudit } from "./audit-service.js";
import { onlyDigits } from "../utils.js";

// Unidades de Saúde da Família de Antas (BA), conforme o CNES (DataSUS).
// Endereços em branco: preencha na tela Unidades do painel.
export const DEFAULT_UNITS = [
    { name: "ESF I - Posto de Saúde de Antas", type: "UBS", address: "Sede", cnes: "6585647" },
    { name: "ESF II - Maria Hilda Félix de Carvalho", type: "UBS", address: "", cnes: "3947750" },
    { name: "ESF III - Centro de Saúde de Antas", type: "UBS", address: "Sede", cnes: "2304635" },
    { name: "ESF IV - Frei Apolônio", type: "UBS", address: "Povoado Frei Apolônio", cnes: "5269954" },
    { name: "ESF V - Rangel", type: "UBS", address: "Povoado Rangel", cnes: "4021606" },
    { name: "ESF VI - Nova Antas", type: "UBS", address: "", cnes: "9905685" },
    { name: "ESF VI - Povoado Brejo", type: "UBS", address: "Povoado Brejo", cnes: "9905448" }
];

export async function listUnits(municipalityId, { activeOnly = false } = {}) {
    const snapshot = await getDocs(query(collection(db, "healthUnits"), where("municipalityId", "==", municipalityId)));
    return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => !activeOnly || u.active !== false)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}

export async function saveUnit(actor, data, id = null) {
    const ref = id ? doc(db, "healthUnits", id) : doc(collection(db, "healthUnits"));
    const payload = {
        municipalityId: actor.municipalityId,
        name: data.name.trim(),
        type: data.type,
        address: (data.address || "").trim(),
        phone: onlyDigits(data.phone),
        openingHours: (data.openingHours || "").trim(),
        active: data.active !== false,
        updatedAt: serverTimestamp()
    };
    if (!id) payload.createdAt = serverTimestamp();

    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    addAudit(batch, actor, {
        action: id ? "UNIT_UPDATED" : "UNIT_CREATED",
        entity: "HEALTH_UNIT",
        entityId: ref.id,
        newData: { name: payload.name, active: payload.active }
    });
    await batch.commit();
    return ref.id;
}

export async function seedDefaultUnits(actor) {
    const existing = await listUnits(actor.municipalityId);
    const names = new Set(existing.map((u) => u.name.toLowerCase()));
    const missing = DEFAULT_UNITS.filter((u) => !names.has(u.name.toLowerCase()));
    if (!missing.length) return 0;

    const batch = writeBatch(db);
    missing.forEach((u) => {
        batch.set(doc(collection(db, "healthUnits")), {
            municipalityId: actor.municipalityId,
            ...u,
            phone: "",
            openingHours: "Segunda a sexta, 7h às 17h",
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    });
    addAudit(batch, actor, { action: "UNITS_SEEDED", entity: "HEALTH_UNIT", entityId: "seed", newData: { count: missing.length } });
    await batch.commit();
    return missing.length;
}
