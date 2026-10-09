// Usuários da Secretaria (servidores).
import { db, auth, firebaseConfig, USING_EMULATORS } from "../firebase-config.js";
import { initializeApp, deleteApp } from "../lib/app.js";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from "../lib/auth.js";
import { doc, collection, getDocs, query, where, writeBatch, serverTimestamp } from "../lib/firestore.js";
import { addAudit } from "./audit-service.js";
import { randomPassword, STAFF_ROLES, userError } from "../utils.js";

export async function listStaff(municipalityId) {
    // Uma consulta por perfil (apenas igualdades, sem índice composto).
    const roles = STAFF_ROLES.filter((r) => r !== "SUPER_ADMIN");
    const lists = await Promise.all(roles.map(async (role) => {
        const snapshot = await getDocs(query(
            collection(db, "users"),
            where("municipalityId", "==", municipalityId),
            where("role", "==", role)
        ));
        return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    }));
    return lists.flat().sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}

// Cria a conta em uma instância SECUNDÁRIA do Firebase para não deslogar o administrador.
// O servidor recebe um e-mail para definir a própria senha.
export async function createStaffUser(actor, { name, email, role }) {
    if (!STAFF_ROLES.includes(role) || role === "SUPER_ADMIN") throw userError("Perfil inválido.");
    const normalizedEmail = email.trim().toLowerCase();
    const secondary = initializeApp(firebaseConfig, `staff-${Date.now()}`);
    try {
        const secondaryAuth = getAuth(secondary);
        // A instância secundária precisa apontar para o mesmo destino da principal.
        if (USING_EMULATORS) connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
        const credential = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, randomPassword());
        const uid = credential.user.uid;
        await signOut(secondaryAuth);

        const batch = writeBatch(db);
        batch.set(doc(db, "users", uid), {
            municipalityId: actor.municipalityId,
            patientId: null,
            role,
            email: normalizedEmail,
            name: name.trim(),
            active: true,
            createdBy: actor.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        addAudit(batch, actor, { action: "USER_CREATED", entity: "USER", entityId: uid, newData: { email: normalizedEmail, role } });
        await batch.commit();

        await sendPasswordResetEmail(auth, normalizedEmail);
        return uid;
    } finally {
        await deleteApp(secondary).catch(() => {});
    }
}

export async function updateStaffUser(actor, user, { role, active, name }) {
    if (user.id === actor.uid) throw userError("Você não pode alterar o próprio perfil por aqui.");
    if (!STAFF_ROLES.includes(role) || role === "SUPER_ADMIN") throw userError("Perfil inválido.");
    const batch = writeBatch(db);
    batch.update(doc(db, "users", user.id), { role, active, name: name.trim(), updatedAt: serverTimestamp() });
    addAudit(batch, actor, {
        action: "USER_UPDATED",
        entity: "USER",
        entityId: user.id,
        previousData: { role: user.role, active: user.active },
        newData: { role, active }
    });
    await batch.commit();
}

export function sendAccessEmail(email) {
    return sendPasswordResetEmail(auth, email);
}
