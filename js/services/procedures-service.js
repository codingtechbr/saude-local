// Procedimentos (exames, consultas e cirurgias oferecidos pelo município).
import { db } from "../firebase-config.js";
import {
    doc, collection, getDoc, getDocs, query, where, writeBatch, serverTimestamp
} from "../lib/firestore.js";
import { addAudit } from "./audit-service.js";

export const DEFAULT_PROCEDURES = [
    { name: "Ultrassonografia abdominal", category: "EXAM", requiresRegulation: true },
    { name: "Ultrassonografia obstétrica", category: "EXAM", requiresRegulation: false },
    { name: "Mamografia", category: "EXAM", requiresRegulation: false },
    { name: "Raio-X", category: "EXAM", requiresRegulation: false },
    { name: "Tomografia computadorizada", category: "EXAM", requiresRegulation: true },
    { name: "Ressonância magnética", category: "EXAM", requiresRegulation: true },
    { name: "Eletrocardiograma", category: "EXAM", requiresRegulation: false },
    { name: "Consulta em Cardiologia", category: "CONSULTATION", requiresRegulation: true },
    { name: "Consulta em Ortopedia", category: "CONSULTATION", requiresRegulation: true },
    { name: "Consulta em Oftalmologia", category: "CONSULTATION", requiresRegulation: true },
    { name: "Consulta em Ginecologia", category: "CONSULTATION", requiresRegulation: true },
    { name: "Cirurgia de catarata", category: "SURGERY", requiresRegulation: true },
    { name: "Cirurgia geral eletiva (hérnia, vesícula)", category: "SURGERY", requiresRegulation: true }
];

const DEFAULT_DOCUMENTS = ["MEDICAL_REQUEST", "PERSONAL_DOCUMENT", "SUS_CARD"];

export async function listProcedures(municipalityId, { activeOnly = false } = {}) {
    const snapshot = await getDocs(query(collection(db, "procedures"), where("municipalityId", "==", municipalityId)));
    return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => !activeOnly || p.active !== false)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}

export async function getProcedure(id) {
    const snapshot = await getDoc(doc(db, "procedures", id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function saveProcedure(actor, data, id = null) {
    const ref = id ? doc(db, "procedures", id) : doc(collection(db, "procedures"));
    const payload = {
        municipalityId: actor.municipalityId,
        name: data.name.trim(),
        category: data.category,
        active: data.active !== false,
        requiresRegulation: Boolean(data.requiresRegulation),
        requiredDocuments: data.requiredDocuments?.length ? data.requiredDocuments : ["MEDICAL_REQUEST"],
        updatedAt: serverTimestamp()
    };
    if (!id) payload.createdAt = serverTimestamp();

    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    addAudit(batch, actor, {
        action: id ? "PROCEDURE_UPDATED" : "PROCEDURE_CREATED",
        entity: "PROCEDURE",
        entityId: ref.id,
        newData: { name: payload.name, active: payload.active }
    });
    await batch.commit();
    return ref.id;
}

export async function seedDefaultProcedures(actor) {
    const existing = await listProcedures(actor.municipalityId);
    const names = new Set(existing.map((p) => p.name.toLowerCase()));
    const missing = DEFAULT_PROCEDURES.filter((p) => !names.has(p.name.toLowerCase()));
    if (!missing.length) return 0;

    const batch = writeBatch(db);
    missing.forEach((p) => {
        batch.set(doc(collection(db, "procedures")), {
            municipalityId: actor.municipalityId,
            name: p.name,
            category: p.category,
            active: true,
            requiresRegulation: p.requiresRegulation,
            requiredDocuments: DEFAULT_DOCUMENTS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    });
    addAudit(batch, actor, { action: "PROCEDURES_SEEDED", entity: "PROCEDURE", entityId: "seed", newData: { count: missing.length } });
    await batch.commit();
    return missing.length;
}
