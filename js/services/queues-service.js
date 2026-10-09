// Filas de espera por procedimento.
import { db } from "../firebase-config.js";
import { doc, collection, getDoc, getDocs, query, where, getCountFromServer } from "../lib/firestore.js";
import { PRIORITY_ORDER, toDate } from "../utils.js";

export async function listQueues(municipalityId) {
    const snapshot = await getDocs(query(collection(db, "queues"), where("municipalityId", "==", municipalityId)));
    return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}

export async function getQueue(queueId) {
    const snapshot = await getDoc(doc(db, "queues", queueId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

// A consulta inclui municipalityId porque as regras exigem esse filtro.
export async function countWaiting(queueId, municipalityId) {
    const q = query(
        collection(db, "queues", queueId, "entries"),
        where("municipalityId", "==", municipalityId),
        where("status", "==", "WAITING")
    );
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
}

// Ordem da fila: prioridade (urgente > prioritária > normal) e depois data de entrada.
export function sortQueueEntries(entries) {
    return [...entries].sort((a, b) => {
        const p = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
        if (p !== 0) return p;
        return (toDate(a.enteredAt)?.getTime() ?? 0) - (toDate(b.enteredAt)?.getTime() ?? 0);
    });
}

export async function listQueueEntries(queueId, municipalityId, status) {
    const snapshot = await getDocs(query(
        collection(db, "queues", queueId, "entries"),
        where("municipalityId", "==", municipalityId),
        where("status", "==", status)
    ));
    return sortQueueEntries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
}
