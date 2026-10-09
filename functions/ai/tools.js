// Busca SOMENTE os dados permitidos do paciente autenticado para montar o contexto da IA.
const { HttpsError } = require("firebase-functions/v2/https");

const FINAL = ["COMPLETED", "CANCELLED", "NO_SHOW"];

function toDate(value) {
    return value && typeof value.toDate === "function" ? value.toDate() : null;
}

async function buildPatientContext(db, uid) {
    const userSnapshot = await db.doc(`users/${uid}`).get();
    const user = userSnapshot.data();
    if (!user || user.role !== "PATIENT" || user.active === false) {
        throw new HttpsError("permission-denied", "O assistente está disponível apenas para pacientes.");
    }

    const municipalityId = user.municipalityId;
    const patientId = user.patientId;

    const [patientSnapshot, requestsSnapshot, appointmentsSnapshot, knowledgeSnapshot] = await Promise.all([
        db.doc(`patients/${patientId}`).get(),
        db.collection("requests").where("patientUid", "==", uid).get(),
        db.collection("appointments").where("patientUid", "==", uid).get(),
        db.collection("knowledgeBase").where("municipalityId", "==", municipalityId).where("active", "==", true).limit(30).get()
    ]);

    const requests = requestsSnapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0))
        .slice(0, 15);

    // Documentos apenas das solicitações em andamento.
    const withDocuments = await Promise.all(requests.map(async (request) => {
        if (FINAL.includes(request.status)) return { ...request, documents: [] };
        const docs = await db.collection(`requests/${request.id}/documents`).get();
        return { ...request, documents: docs.docs.map((d) => d.data()) };
    }));

    const appointments = appointmentsSnapshot.docs
        .map((d) => d.data())
        .sort((a, b) => (toDate(a.scheduledFor)?.getTime() ?? 0) - (toDate(b.scheduledFor)?.getTime() ?? 0));

    return {
        municipalityId,
        patientId,
        patientName: patientSnapshot.get("name") || user.name || "",
        requests: withDocuments,
        appointments,
        knowledge: knowledgeSnapshot.docs.map((d) => ({ title: d.get("title"), content: d.get("content") }))
    };
}

module.exports = { buildPatientContext, toDate };
