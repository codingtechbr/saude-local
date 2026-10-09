// Quando o paciente cria uma solicitação: aviso de recebimento + auditoria.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { createAudit } = require("../audit/create-audit");

exports.onRequestCreated = onDocumentCreated("requests/{requestId}", async (event) => {
    const request = event.data?.data();
    if (!request) return;
    const requestId = event.params.requestId;

    await getFirestore().collection("notifications").add({
        municipalityId: request.municipalityId,
        userId: request.patientUid,
        patientId: request.patientId,
        requestId,
        type: "REQUEST_CREATED",
        title: "Solicitação recebida",
        message: `Recebemos sua solicitação de ${request.procedureName}. Protocolo ${request.protocol}. Os documentos serão analisados.`,
        read: false,
        createdAt: FieldValue.serverTimestamp()
    });

    await createAudit({
        municipalityId: request.municipalityId,
        userId: request.createdBy || "system",
        action: "REQUEST_CREATED",
        entity: "REQUEST",
        entityId: requestId,
        patientId: request.patientId,
        newData: { status: request.status, procedureId: request.procedureId, protocol: request.protocol }
    });
});
