// Autenticação: login por e-mail ou CPF, cadastro do paciente e sessão.
import { auth, db, functions, MUNICIPALITY_ID } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    deleteUser,
    updateProfile
} from "./lib/auth.js";
import { doc, getDoc, writeBatch, serverTimestamp } from "./lib/firestore.js";
import { httpsCallable } from "./lib/functions.js";
import { normalizeCPF, isValidCPF, onlyDigits, userError, go } from "./utils.js";

// Aguarda o Firebase restaurar a sessão salva antes de decidir se há usuário logado.
export async function waitForUser() {
    await auth.authStateReady();
    return auth.currentUser;
}

export async function getProfile(uid) {
    const snapshot = await getDoc(doc(db, "users", uid));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

// O usuário pode digitar CPF ou e-mail. CPF é resolvido por uma Cloud Function,
// porque o índice CPF -> conta não pode ser lido por quem não está logado.
async function resolveEmail(identifier) {
    const value = String(identifier || "").trim();
    if (!value) throw userError("Informe seu CPF ou e-mail.");
    if (value.includes("@")) return value.toLowerCase();

    const cpf = normalizeCPF(value);
    if (!isValidCPF(cpf)) throw userError("Informe um CPF válido ou seu e-mail.");

    try {
        const resolve = httpsCallable(functions, "resolveLoginEmail");
        const { data } = await resolve({ cpf });
        if (!data?.email) throw new Error("Resposta sem e-mail");
        return data.email;
    } catch (error) {
        if (error.code === "functions/not-found") {
            throw userError("Não encontramos cadastro com este CPF. Confira os números ou crie sua conta.");
        }
        console.warn("Falha ao resolver CPF (a Cloud Function resolveLoginEmail está publicada?):", error);
        throw userError("No momento não foi possível entrar com CPF. Use o e-mail cadastrado.");
    }
}

export async function login(identifier, password) {
    if (!password) throw userError("Informe sua senha.");
    const email = await resolveEmail(identifier);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getProfile(credential.user.uid);
    return { user: credential.user, profile };
}

// Cadastro do paciente: cria a conta no Auth e, em UM lote atômico,
// grava users/{uid}, patients/{uid} e cpfIndex/{cpf} (garante CPF único).
export async function registerPatient(data) {
    const cpf = normalizeCPF(data.cpf);
    const email = data.email.trim().toLowerCase();
    const name = data.name.trim().replace(/\s+/g, " ");

    const credential = await createUserWithEmailAndPassword(auth, email, data.password);
    const uid = credential.user.uid;
    const now = serverTimestamp();

    const batch = writeBatch(db);

    batch.set(doc(db, "cpfIndex", cpf), {
        uid,
        municipalityId: MUNICIPALITY_ID,
        createdAt: now
    });

    batch.set(doc(db, "users", uid), {
        municipalityId: MUNICIPALITY_ID,
        patientId: uid,
        role: "PATIENT",
        email,
        name,
        active: true,
        createdAt: now,
        updatedAt: now
    });

    batch.set(doc(db, "patients", uid), {
        municipalityId: MUNICIPALITY_ID,
        authUid: uid,
        name,
        cpf,
        cns: onlyDigits(data.cns),
        birthDate: data.birthDate || "",
        motherName: (data.motherName || "").trim(),
        phone: onlyDigits(data.phone),
        email,
        address: {
            zipCode: onlyDigits(data.zipCode),
            street: (data.street || "").trim(),
            number: (data.number || "").trim(),
            district: (data.district || "").trim(),
            city: (data.city || "").trim(),
            state: (data.state || "").trim().toUpperCase()
        },
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now
    });

    try {
        await batch.commit();
    } catch (error) {
        console.error("Falha ao gravar cadastro:", error);
        // Remove a conta recém-criada para o usuário poder tentar de novo.
        await deleteUser(credential.user).catch(() => signOut(auth));
        if (error.code === "permission-denied") {
            throw userError("Não foi possível concluir o cadastro. Este CPF pode já estar cadastrado. Se você já tem conta, entre ou recupere a senha.");
        }
        throw error;
    }

    updateProfile(credential.user, { displayName: name }).catch(() => {});
    return credential.user;
}

export async function logout(target = "login.html") {
    await signOut(auth);
    go(target);
}

export async function resetPassword(identifier) {
    const email = await resolveEmail(identifier);
    await sendPasswordResetEmail(auth, email);
}

export async function changePassword(currentPassword, newPassword) {
    const user = auth.currentUser;
    if (!user) throw userError("Sua sessão expirou. Entre novamente.");
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
}
