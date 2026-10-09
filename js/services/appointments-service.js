// Agendamentos.
import { db } from "../firebase-config.js";
import {
    doc, collection, getDoc, getDocs, query, where, writeBatch, serverTimestamp, Timestamp
} from "../lib/firestore.js";
import { addAudit } from "./audit-service.js";
import { addNotification } from "./notifications-service.js";
import { sortByDate, formatLongDate, formatTime, userError } from "../utils.js";
import { getRequest } from "./requests-service.js";

export async function getAppointment(id) {
    const snapshot = await getDoc(doc(db, "appointments", id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function listMyAppointments(uid) {
    const snapshot = await getDocs(query(collection(db, "appointments"), where("patientUid", "==", uid)));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "scheduledFor", "asc");
}

export async function listMunicipalityAppointments(municipalityId, { patientId = null } = {}) {
    const filters = [where("municipalityId", "==", municipalityId)];
    if (patientId) filters.push(where("patientId", "==", patientId));
    const snapshot = await getDocs(query(collection(db, "appointments"), ...filters));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "scheduledFor", "asc");
}

function historyRef(requestId) {
    return doc(collection(db, "requests", requestId, "history"));
}

/* ---------- Paciente ---------- */

export async function confirmAppointment({ user, appointment }) {
    const request = await getRequest(appointment.requestId);
    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id), {
        patientConfirmed: true,
        status: "CONFIRMED",
        updatedAt: serverTimestamp()
    });
    if (request?.status === "SCHEDULED") {
        batch.update(doc(db, "requests", request.id), { status: "CONFIRMED", updatedAt: serverTimestamp() });
        batch.set(historyRef(request.id), {
            previousStatus: "SCHEDULED",
            newStatus: "CONFIRMED",
            changedBy: user.uid,
            changedByName: "Paciente",
            reason: "Paciente confirmou presença",
            createdAt: serverTimestamp()
        });
    }
    await batch.commit();
}

export async function requestReschedule({ appointment }) {
    const batch = writeBatch(db);
    batch.update(doc(db, "appointments", appointment.id), {
        rescheduleRequested: true,
        rescheduleRequestedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    await batch.commit();
}

/* ---------- Painel ---------- */

export async function scheduleAppointment({ request, actor, unit, scheduledFor, instructions }) {
    if (!(scheduledFor instanceof Date) || Number.isNaN(scheduledFor.getTime())) throw userError("Informe data e horário válidos.");
    if (scheduledFor.getTime() < Date.now() - 60000) throw userError("A data do agendamento já passou.");
    if (!["WAITING_QUEUE", "APPROVED"].includes(request.status)) throw userError("Esta solicitação não está aguardando vaga.");

    const when = Timestamp.fromDate(scheduledFor);
    const appointmentRef = doc(collection(db, "appointments"));
    const batch = writeBatch(db);

    batch.set(appointmentRef, {
        municipalityId: request.municipalityId,
        patientId: request.patientId,
        patientUid: request.patientUid,
        patientName: request.patientName || "",
        requestId: request.id,
        protocol: request.protocol,
        procedureId: request.procedureId,
        procedureName: request.procedureName,
        healthUnitId: unit.id,
        healthUnitName: unit.name,
        healthUnitAddress: unit.address || "",
        scheduledFor: when,
        status: "SCHEDULED",
        patientConfirmed: false,
        rescheduleRequested: false,
        instructions: (instructions || "").trim(),
        createdBy: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    batch.update(doc(db, "requests", request.id), {
        status: "SCHEDULED",
        scheduledAt: when,
        appointmentId: appointmentRef.id,
        updatedAt: serverTimestamp()
    });

    if (request.queueId) {
        batch.update(doc(db, "queues", request.queueId, "entries", request.id), {
            status: "SCHEDULED",
            scheduledAt: when,
            appointmentId: appointmentRef.id
        });
    }

    batch.set(historyRef(request.id), {
        previousStatus: request.status,
        newStatus: "SCHEDULED",
        changedBy: actor.uid,
        changedByName: actor.name || "",
        reason: `Agendado para ${formatLongDate(when)} às ${formatTime(when)} - ${unit.name}`,
        createdAt: serverTimestamp()
    });

    addAudit(batch, actor, {
        action: "APPOINTMENT_CREATED",
        entity: "APPOINTMENT",
        entityId: appointmentRef.id,
        patientId: request.patientId,
        previousData: { status: request.status },
        newData: { status: "SCHEDULED", requestId: request.id, healthUnitId: unit.id, scheduledFor: scheduledFor.toISOString() }
    });

    addNotification(batch, {
        municipalityId: request.municipalityId,
        userId: request.patientUid,
        patientId: request.patientId,
        requestId: request.id,
        type: "APPOINTMENT_CREATED",
        title: "Atendimento agendado",
        message: `${request.procedureName}: ${formatLongDate(when)} às ${formatTime(when)}, ${unit.name}. Confirme sua presença no aplicativo.`
    });

    await batch.commit();
    return appointmentRef.id;
}

// Encerra o agendamento como realizado (COMPLETED) ou falta (NO_SHOW).
export async function finishAppointment({ appointment, actor, outcome }) {
    if (!["COMPLETED", "NO_SHOW"].includes(outcome)) throw userError("Resultado inválido.");
    const request = await getRequest(appointment.requestId);
    const batch = writeBatch(db);

    batch.update(doc(db, "appointments", appointment.id), { status: outcome, updatedAt: serverTimestamp() });

    if (request) {
        const update = { status: outcome, updatedAt: serverTimestamp() };
        if (outcome === "COMPLETED") update.completedAt = serverTimestamp();
        batch.update(doc(db, "requests", request.id), update);
        if (request.queueId) {
            batch.update(doc(db, "queues", request.queueId, "entries", request.id), { status: outcome === "COMPLETED" ? "DONE" : "NO_SHOW" });
        }
        batch.set(historyRef(request.id), {
            previousStatus: request.status,
            newStatus: outcome,
            changedBy: actor.uid,
            changedByName: actor.name || "",
            reason: outcome === "COMPLETED" ? "Atendimento realizado" : "Paciente não compareceu",
            createdAt: serverTimestamp()
        });
        if (outcome === "COMPLETED") {
            addNotification(batch, {
                municipalityId: request.municipalityId,
                userId: request.patientUid,
                patientId: request.patientId,
                requestId: request.id,
                type: "REQUEST_COMPLETED",
                title: "Atendimento realizado",
                message: `${request.procedureName} registrado como realizado. Obrigado por comparecer.`
            });
        }
    }

    addAudit(batch, actor, {
        action: outcome === "COMPLETED" ? "APPOINTMENT_COMPLETED" : "APPOINTMENT_NO_SHOW",
        entity: "APPOINTMENT",
        entityId: appointment.id,
        patientId: appointment.patientId,
        previousData: { status: appointment.status },
        newData: { status: outcome }
    });
    await batch.commit();
}

// Cancela o agendamento e devolve a solicitação para a fila.
export async function cancelAppointment({ appointment, actor, reason }) {
    const request = await getRequest(appointment.requestId);
    const batch = writeBatch(db);

    batch.update(doc(db, "appointments", appointment.id), {
        status: "CANCELLED",
        cancelReason: reason,
        updatedAt: serverTimestamp()
    });

    if (request && ["SCHEDULED", "CONFIRMED"].includes(request.status)) {
        batch.update(doc(db, "requests", request.id), {
            status: "WAITING_QUEUE",
            scheduledAt: null,
            appointmentId: null,
            updatedAt: serverTimestamp()
        });
        if (request.queueId) {
            batch.update(doc(db, "queues", request.queueId, "entries", request.id), {
                status: "WAITING",
                scheduledAt: null,
                appointmentId: null
            });
        }
        batch.set(historyRef(request.id), {
            previousStatus: request.status,
            newStatus: "WAITING_QUEUE",
            changedBy: actor.uid,
            changedByName: actor.name || "",
            reason: `Agendamento cancelado: ${reason}`,
            createdAt: serverTimestamp()
        });
    }

    addAudit(batch, actor, {
        action: "APPOINTMENT_CANCELLED",
        entity: "APPOINTMENT",
        entityId: appointment.id,
        patientId: appointment.patientId,
        previousData: { status: appointment.status },
        newData: { status: "CANCELLED", reason }
    });

    addNotification(batch, {
        municipalityId: appointment.municipalityId,
        userId: appointment.patientUid,
        patientId: appointment.patientId,
        requestId: appointment.requestId,
        type: "APPOINTMENT_CANCELLED",
        title: "Agendamento cancelado",
        message: `O agendamento de ${appointment.procedureName} foi cancelado. Motivo: ${reason}. Sua solicitação voltou para a fila e você será avisado do novo horário.`
    });

    await batch.commit();
}
