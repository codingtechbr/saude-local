// Copia o perfil do servidor (role, municipalityId) para o token de login (custom claims).
// As regras do Storage leem o perfil direto do token, sem consultar o Firestore.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const STAFF_ROLES = ["ATTENDANT", "REGULATOR", "MANAGER", "ADMIN", "SUPER_ADMIN"];

function claimsFor(user) {
    if (!user || user.active !== true || !STAFF_ROLES.includes(user.role)) return {};
    return { role: user.role, municipalityId: user.municipalityId };
}

async function applyClaims(uid, user) {
    const claims = claimsFor(user);
    try {
        await getAuth().setCustomUserClaims(uid, Object.keys(claims).length ? claims : null);
    } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
    }
    return claims;
}

// Chamado pelo painel quando o token ainda não tem o perfil (ex.: primeiro acesso).
exports.syncStaffClaims = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Entre novamente.");
    const snapshot = await getFirestore().doc(`users/${request.auth.uid}`).get();
    return applyClaims(request.auth.uid, snapshot.data());
});

// Mantém o token atualizado quando um administrador muda perfil ou desativa alguém.
exports.onUserProfileWritten = onDocumentWritten("users/{uid}", async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const same = JSON.stringify(claimsFor(before)) === JSON.stringify(claimsFor(after));
    if (same && before) return;
    await applyClaims(event.params.uid, after);
});
