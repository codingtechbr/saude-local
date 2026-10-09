// Login por CPF: o app envia o CPF e recebe o e-mail da conta para fazer signIn.
// O índice cpfIndex não é legível pelo navegador; só o servidor consulta.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

exports.resolveLoginEmail = onCall(async (request) => {
    const cpf = String(request.data?.cpf ?? "").replace(/\D/g, "");
    if (cpf.length !== 11) {
        throw new HttpsError("invalid-argument", "CPF inválido.");
    }

    const snapshot = await getFirestore().doc(`cpfIndex/${cpf}`).get();
    if (!snapshot.exists) {
        throw new HttpsError("not-found", "Não encontramos cadastro com este CPF.");
    }

    try {
        const user = await getAuth().getUser(snapshot.get("uid"));
        if (user.disabled || !user.email) throw new Error("conta indisponível");
        return { email: user.email };
    } catch (error) {
        throw new HttpsError("not-found", "Não encontramos cadastro com este CPF.");
    }
});
