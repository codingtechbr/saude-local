// Tarefa agendada: lembra os pacientes dos atendimentos do dia seguinte.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { TIMEZONE } = require("../config");

// Início e fim de "amanhã" no fuso de São Paulo (UTC-3, sem horário de verão).
function tomorrowRange() {
    const offsetMs = 3 * 3600 * 1000;
    const nowLocal = new Date(Date.now() - offsetMs);
    const start = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() + 1) + offsetMs;
    return { start: new Date(start), end: new Date(start + 86400000 - 1) };
}

exports.appointmentReminders = onSchedule({ schedule: "every day 18:00", timeZone: TIMEZONE }, async () => {
    const db = getFirestore();
    const { start, end } = tomorrowRange();

    // Filtro de intervalo em um único campo: não exige índice composto.
    const snapshot = await db.collection("appointments")
        .where("scheduledFor", ">=", Timestamp.fromDate(start))
        .where("scheduledFor", "<=", Timestamp.fromDate(end))
        .get();

    const pending = snapshot.docs.filter((d) => ["SCHEDULED", "CONFIRMED"].includes(d.get("status")) && !d.get("reminderSentAt"));
    let batch = db.batch();
    let operations = 0;

    for (const doc of pending) {
        const a = doc.data();
        const when = a.scheduledFor.toDate().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });
        batch.set(db.collection("notifications").doc(), {
            municipalityId: a.municipalityId,
            userId: a.patientUid,
            patientId: a.patientId,
            requestId: a.requestId,
            type: "APPOINTMENT_REMINDER",
            title: "Lembrete: atendimento amanhã",
            message: `${a.procedureName} amanhã às ${when}, ${a.healthUnitName}.${a.patientConfirmed ? "" : " Confirme sua presença no aplicativo."}`,
            read: false,
            createdAt: FieldValue.serverTimestamp()
        });
        batch.update(doc.ref, { reminderSentAt: FieldValue.serverTimestamp() });
        operations += 2;
        if (operations >= 400) {
            await batch.commit();
            batch = db.batch();
            operations = 0;
        }
    }
    if (operations) await batch.commit();
    logger.info(`Lembretes enviados: ${pending.length}`);
});
