// Solicitações: criação pelo paciente, análise documental, regulação, fila e status.
//
// Todas as alterações são feitas em LOTES (writeBatch): solicitação + histórico +
// auditoria + aviso ao paciente são gravados juntos ou nada é gravado.
// As consultas usam apenas filtros de igualdade (sem orderBy) para não exigir
// índices compostos; a ordenação é feita no navegador.
import { db } from "../firebase-config.js";
import {
    doc, collection, getDoc, getDocs, query, where, writeBatch, runTransaction,
    serverTimestamp, arrayUnion, getCountFromServer
} from "../lib/firestore.js";
import { buildRequestFilePath, uploadFile } from "./storage-service.js";
import { addAudit } from "./audit-service.js";
import { addNotification } from "./notifications-service.js";
import { sortByDate, DOCUMENT_TYPES, PRIORITY, userError } from "../utils.js";

/* ---------- Leitura ---------- */

export async function getRequest(id) {
    const snapshot = await getDoc(doc(db, "requests", id));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function listMyRequests(uid) {
    const snapshot = await getDocs(query(collection(db, "requests"), where("patientUid", "==", uid)));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt", "desc");
}

export async function listMunicipalityRequests(municipalityId, { status = null, patientId = null } = {}) {
    const filters = [where("municipalityId", "==", municipalityId)];
    if (status) filters.push(where("status", "==", status));
    if (patientId) filters.push(where("patientId", "==", patientId));
    const snapshot = await getDocs(query(collection(db, "requests"), ...filters));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt", "desc");
}

export async function listRequestsByStatuses(municipalityId, statuses) {
    const lists = await Promise.all(statuses.map((status) => listMunicipalityRequests(municipalityId, { status })));
    return sortByDate(lists.flat(), "createdAt", "asc");
}

export async function countRequests(municipalityId, status) {
    const q = query(collection(db, "requests"), where("municipalityId", "==", municipalityId), where("status", "==", status));
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
}

export async function listRequestDocuments(requestId) {
    const snapshot = await getDocs(collection(db, "requests", requestId, "documents"));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "uploadedAt", "asc");
}

export async function listRequestHistory(requestId) {
    const snapshot = await getDocs(collection(db, "requests", requestId, "history"));
    return sortByDate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })), "createdAt", "asc");
}

// Último documento enviado de cada tipo (reenvios substituem os recusados).
export function latestDocumentsByType(documents) {
    const latest = {};
    sortByDate(documents, "uploadedAt", "asc").forEach((d) => { latest[d.type] = d; });
    return latest;
}

export function documentsReady(documents) {
    const latest = Object.values(latestDocumentsByType(documents));
    return latest.length > 0 && latest.every((d) => d.status === "APPROVED");
}

/* ---------- Criação pelo paciente ---------- */

async function generateProtocol(municipalityId) {
    const year = new Date().getFullYear();
    const counterRef = doc(db, "counters", `${municipalityId}_requests_${year}`);
    const next = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(counterRef);
        if (!snapshot.exists()) {
            transaction.set(counterRef, { value: 1, municipalityId, updatedAt: serverTimestamp() });
            return 1;
        }
        const value = (snapshot.data().value || 0) + 1;
        transaction.update(counterRef, { value, updatedAt: serverTimestamp() });
        return value;
    });
    return `${year}-${String(next).padStart(7, "0")}`;
}

function historyRef(requestId) {
    return doc(collection(db, "requests", requestId, "history"));
}

async function uploadAll({ municipalityId, patientId, requestId, files }, onProgress) {
    const total = files.reduce((sum, f) => sum + f.file.size, 0) || 1;
    const progress = new Array(files.length).fill(0);
    const uploaded = [];
    for (let i = 0; i < files.length; i++) {
        const { type, file } = files[i];
        const path = buildRequestFilePath({ municipalityId, patientId, requestId, documentType: type, file, index: i });
        await uploadFile(path, file, (sent) => {
            progress[i] = sent;
            onProgress?.(Math.round((progress.reduce((a, b) => a + b, 0) / total) * 100));
        });
        uploaded.push({ type, path, fileName: file.name || path.split("/").pop(), size: file.size, contentType: file.type });
    }
    return uploaded;
}

function documentPayload(item, uid) {
    return {
        type: item.type,
        fileName: item.fileName,
        storagePath: item.path,
        contentType: item.contentType || "",
        size: item.size || 0,
        status: "PENDING",
        uploadedBy: uid,
        uploadedAt: serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        reviewReason: null
    };
}

// files = [{ type: "MEDICAL_REQUEST", file: File }, ...]
export async function createRequest({ user, profile, patient, type, procedure, unit, files, notes }, onProgress) {
    if (!files.some((f) => f.type === "MEDICAL_REQUEST")) throw userError("Envie a foto do pedido médico.");

    const municipalityId = profile.municipalityId;
    const patientId = profile.patientId;
    const requestRef = doc(collection(db, "requests"));

    const protocol = await generateProtocol(municipalityId);
    const uploaded = await uploadAll({ municipalityId, patientId, requestId: requestRef.id, files }, onProgress);

    const batch = writeBatch(db);
    batch.set(requestRef, {
        municipalityId,
        patientId,
        patientUid: user.uid,
        patientName: patient?.name || profile.name || "",
        patientCpf: patient?.cpf || "",
        procedureId: procedure.id,
        procedureName: procedure.name,
        requiresRegulation: procedure.requiresRegulation !== false,
        originUnitId: unit?.id || null,
        originUnitName: unit?.name || null,
        type,
        protocol,
        priority: "NORMAL",
        status: "DOCUMENT_REVIEW",
        notes: (notes || "").trim().slice(0, 500),
        requestedAt: serverTimestamp(),
        regulatedAt: null,
        scheduledAt: null,
        completedAt: null,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    uploaded.forEach((item) => batch.set(doc(collection(requestRef, "documents")), documentPayload(item, user.uid)));

    batch.set(historyRef(requestRef.id), {
        previousStatus: null,
        newStatus: "DOCUMENT_REVIEW",
        changedBy: user.uid,
        changedByName: "Paciente",
        reason: "Solicitação enviada pelo aplicativo",
        createdAt: serverTimestamp()
    });

    await batch.commit();
    return { id: requestRef.id, protocol };
}

// Paciente reenvia documentos quando a solicitação está com DOCUMENT_PENDING.
export async function resubmitDocuments({ user, request, files }, onProgress) {
    if (!files.length) throw userError("Selecione pelo menos um documento.");
    const uploaded = await uploadAll({
        municipalityId: request.municipalityId,
        patientId: request.patientId,
        requestId: request.id,
        files
    }, onProgress);

    const requestRef = doc(db, "requests", request.id);
    const batch = writeBatch(db);
    uploaded.forEach((item) => batch.set(doc(collection(requestRef, "documents")), documentPayload(item, user.uid)));
    batch.update(requestRef, { status: "DOCUMENT_REVIEW", updatedAt: serverTimestamp() });
    batch.set(historyRef(request.id), {
        previousStatus: "DOCUMENT_PENDING",
        newStatus: "DOCUMENT_REVIEW",
        changedBy: user.uid,
        changedByName: "Paciente",
        reason: "Paciente enviou novos documentos",
        createdAt: serverTimestamp()
    });
    await batch.commit();
}

/* ---------- Ações do painel ---------- */

function notifyPatient(batch, request, { type, title, message }) {
    addNotification(batch, {
        municipalityId: request.municipalityId,
        userId: request.patientUid,
        patientId: request.patientId,
        requestId: request.id,
        type,
        title,
        message
    });
}

function addHistory(batch, request, actor, newStatus, reason = "", previousStatus = request.status) {
    batch.set(historyRef(request.id), {
        previousStatus,
        newStatus,
        changedBy: actor.uid,
        changedByName: actor.name || "",
        reason,
        createdAt: serverTimestamp()
    });
}

// Mudança de status genérica (com histórico, auditoria e aviso opcional).
export async function changeRequestStatus({ request, actor, newStatus, reason = "", extra = {}, auditExtra = {}, notification = null }) {
    const batch = writeBatch(db);
    batch.update(doc(db, "requests", request.id), { status: newStatus, updatedAt: serverTimestamp(), ...extra });
    addHistory(batch, request, actor, newStatus, reason);
    addAudit(batch, actor, {
        action: "REQUEST_STATUS_UPDATED",
        entity: "REQUEST",
        entityId: request.id,
        patientId: request.patientId,
        previousData: { status: request.status },
        newData: { status: newStatus, reason, ...auditExtra }
    });
    if (notification) notifyPatient(batch, request, notification);
    await batch.commit();
}

export async function reviewDocument({ request, document, actor, approved, reason = "" }) {
    const batch = writeBatch(db);
    batch.update(doc(db, "requests", request.id, "documents", document.id), {
        status: approved ? "APPROVED" : "REJECTED",
        reviewedBy: actor.uid,
        reviewedByName: actor.name || "",
        reviewedAt: serverTimestamp(),
        reviewReason: approved ? null : reason
    });
    addAudit(batch, actor, {
        action: approved ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
        entity: "DOCUMENT",
        entityId: document.id,
        patientId: request.patientId,
        previousData: { status: document.status },
        newData: { status: approved ? "APPROVED" : "REJECTED", requestId: request.id, reason }
    });

    if (!approved) {
        const label = DOCUMENT_TYPES[document.type] || "Documento";
        const pendingReason = `${label}: ${reason}`;
        const requestUpdate = {
            pendingDocuments: arrayUnion(document.type),
            pendingReason,
            updatedAt: serverTimestamp()
        };
        if (request.status !== "DOCUMENT_PENDING") {
            requestUpdate.status = "DOCUMENT_PENDING";
            addHistory(batch, request, actor, "DOCUMENT_PENDING", pendingReason);
        }
        batch.update(doc(db, "requests", request.id), requestUpdate);
        notifyPatient(batch, request, {
            type: "DOCUMENT_REJECTED",
            title: "Documento precisa ser reenviado",
            message: `${label} da solicitação ${request.protocol}: ${reason}. Abra a solicitação para enviar novamente.`
        });
    }
    await batch.commit();
}

export function requestNewDocument({ request, actor, documentType, reason }) {
    const label = DOCUMENT_TYPES[documentType] || "Documento";
    const pendingReason = reason ? `${label}: ${reason}` : `Envie: ${label}`;
    return changeRequestStatus({
        request,
        actor,
        newStatus: "DOCUMENT_PENDING",
        reason: pendingReason,
        extra: { pendingDocuments: arrayUnion(documentType), pendingReason },
        auditExtra: { documentType },
        notification: {
            type: "DOCUMENT_REQUIRED",
            title: "Documento solicitado",
            message: `A Secretaria precisa de: ${label} (protocolo ${request.protocol}). ${reason || ""}`.trim()
        }
    });
}

// Documentação aprovada: segue para regulação ou direto para a fila.
export async function approveDocumentation({ request, actor }) {
    if (request.requiresRegulation === false) {
        return enterQueue({ request, actor, priority: request.priority || "NORMAL", note: "Documentação aprovada (procedimento sem regulação)", fromDocuments: true });
    }
    return changeRequestStatus({
        request,
        actor,
        newStatus: "WAITING_REGULATION",
        reason: "Documentação aprovada",
        extra: { pendingDocuments: [], pendingReason: null },
        notification: {
            type: "DOCUMENT_APPROVED",
            title: "Documentos aprovados",
            message: `Os documentos da solicitação ${request.protocol} foram aprovados. Agora ela será avaliada pela regulação.`
        }
    });
}

export function startRegulation({ request, actor }) {
    return changeRequestStatus({ request, actor, newStatus: "REGULATION", reason: "Regulação iniciada" });
}

export function returnToDocumentation({ request, actor, reason }) {
    return changeRequestStatus({
        request,
        actor,
        newStatus: "DOCUMENT_PENDING",
        reason,
        extra: { pendingReason: reason },
        notification: {
            type: "DOCUMENT_REQUIRED",
            title: "Informação pendente",
            message: `Sua solicitação ${request.protocol} precisa de complemento: ${reason}`
        }
    });
}

function queueIdFor(request) {
    return `${request.municipalityId}__${request.procedureId}`;
}

// Aprovação na regulação + definição de prioridade + entrada na fila (um único lote).
export async function enterQueue({ request, actor, priority, note = "", fromDocuments = false }) {
    if (!PRIORITY[priority]) throw userError("Prioridade inválida.");
    const queueId = queueIdFor(request);
    const queueRef = doc(db, "queues", queueId);
    const queueSnapshot = await getDoc(queueRef);

    const batch = writeBatch(db);
    if (!queueSnapshot.exists()) {
        batch.set(queueRef, {
            municipalityId: request.municipalityId,
            procedureId: request.procedureId,
            name: `Fila de ${request.procedureName}`,
            active: true,
            createdAt: serverTimestamp()
        });
    }

    batch.set(doc(db, "queues", queueId, "entries", request.id), {
        municipalityId: request.municipalityId,
        requestId: request.id,
        patientId: request.patientId,
        patientUid: request.patientUid,
        patientName: request.patientName || "",
        protocol: request.protocol,
        procedureId: request.procedureId,
        procedureName: request.procedureName,
        priority,
        status: "WAITING",
        enteredAt: serverTimestamp(),
        scheduledAt: null,
        appointmentId: null
    });

    const update = {
        status: "WAITING_QUEUE",
        priority,
        queueId,
        queueEnteredAt: serverTimestamp(),
        pendingDocuments: [],
        pendingReason: null,
        regulationNote: note,
        updatedAt: serverTimestamp()
    };
    if (!fromDocuments) {
        update.regulatedAt = serverTimestamp();
        update.regulatedBy = actor.uid;
    }
    batch.update(doc(db, "requests", request.id), update);

    addHistory(batch, request, actor, "APPROVED", note || (fromDocuments ? "Documentação aprovada" : "Aprovada na regulação"));
    addHistory(batch, request, actor, "WAITING_QUEUE", `Entrada na fila com prioridade ${PRIORITY[priority].label}`, "APPROVED");
    addAudit(batch, actor, {
        action: "REQUEST_QUEUED",
        entity: "REQUEST",
        entityId: request.id,
        patientId: request.patientId,
        previousData: { status: request.status, priority: request.priority || "NORMAL" },
        newData: { status: "WAITING_QUEUE", priority, queueId }
    });
    notifyPatient(batch, request, {
        type: fromDocuments ? "QUEUE_ENTERED" : "REGULATION_COMPLETED",
        title: "Solicitação aprovada",
        message: `Sua solicitação de ${request.procedureName} foi aprovada e está aguardando vaga. Avisaremos quando houver agendamento.`
    });
    await batch.commit();
}

export async function changePriority({ request, actor, priority, reason = "" }) {
    if (!PRIORITY[priority]) throw userError("Prioridade inválida.");
    const batch = writeBatch(db);
    batch.update(doc(db, "requests", request.id), { priority, updatedAt: serverTimestamp() });
    if (request.queueId) {
        batch.update(doc(db, "queues", request.queueId, "entries", request.id), { priority });
    }
    addHistory(batch, request, actor, request.status, `Prioridade alterada para ${PRIORITY[priority].label}. ${reason}`.trim());
    addAudit(batch, actor, {
        action: "REQUEST_PRIORITY_UPDATED",
        entity: "REQUEST",
        entityId: request.id,
        patientId: request.patientId,
        previousData: { priority: request.priority || "NORMAL" },
        newData: { priority, reason }
    });
    await batch.commit();
}

export async function cancelRequest({ request, actor, reason }) {
    const batch = writeBatch(db);
    batch.update(doc(db, "requests", request.id), { status: "CANCELLED", cancelReason: reason, updatedAt: serverTimestamp() });
    if (request.queueId) {
        batch.update(doc(db, "queues", request.queueId, "entries", request.id), { status: "CANCELLED" });
    }
    if (request.appointmentId) {
        batch.update(doc(db, "appointments", request.appointmentId), { status: "CANCELLED", updatedAt: serverTimestamp() });
    }
    addHistory(batch, request, actor, "CANCELLED", reason);
    addAudit(batch, actor, {
        action: "REQUEST_CANCELLED",
        entity: "REQUEST",
        entityId: request.id,
        patientId: request.patientId,
        previousData: { status: request.status },
        newData: { status: "CANCELLED", reason }
    });
    notifyPatient(batch, request, {
        type: "REQUEST_CANCELLED",
        title: "Solicitação cancelada",
        message: `A solicitação ${request.protocol} (${request.procedureName}) foi cancelada. Motivo: ${reason}`
    });
    await batch.commit();
}
