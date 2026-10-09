// Envia push (Firebase Cloud Messaging) para os aparelhos do paciente
// sempre que um documento é criado em notifications/.
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { logger } = require("firebase-functions");
const { APP_URL } = require("../config");

const INVALID_TOKEN_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
    "messaging/invalid-argument"
]);

exports.onNotificationCreated = onDocumentCreated("notifications/{notificationId}", async (event) => {
    const notification = event.data?.data();
    if (!notification?.userId) return;

    const userRef = getFirestore().doc(`users/${notification.userId}`);
    const userSnapshot = await userRef.get();
    const tokens = userSnapshot.get("fcmTokens") || [];
    if (!tokens.length) return;

    const link = notification.requestId
        ? `${APP_URL}/app/solicitacao.html?id=${notification.requestId}`
        : `${APP_URL}/app/notificacoes.html`;

    const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title: notification.title, body: notification.message },
        data: { link, type: String(notification.type || "") },
        webpush: { fcmOptions: { link } }
    });

    const invalid = response.responses
        .map((r, i) => (!r.success && INVALID_TOKEN_CODES.has(r.error?.code) ? tokens[i] : null))
        .filter(Boolean);

    if (invalid.length) {
        await userRef.update({ fcmTokens: FieldValue.arrayRemove(...invalid) });
        logger.info(`Removidos ${invalid.length} tokens inválidos de ${notification.userId}`);
    }
});
