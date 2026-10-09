// Pacientes.
import { db } from "../firebase-config.js";
import { doc, collection, getDoc, getDocs, query, where, updateDoc, serverTimestamp } from "../lib/firestore.js";
import { onlyDigits } from "../utils.js";

export async function getPatient(patientId) {
    const snapshot = await getDoc(doc(db, "patients", patientId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

// Paciente só pode alterar telefone e endereço (garantido pelas regras).
export function updateOwnContact(patientId, { phone, address }) {
    return updateDoc(doc(db, "patients", patientId), {
        phone: onlyDigits(phone),
        address: {
            zipCode: onlyDigits(address.zipCode),
            street: (address.street || "").trim(),
            number: (address.number || "").trim(),
            district: (address.district || "").trim(),
            city: (address.city || "").trim(),
            state: (address.state || "").trim().toUpperCase()
        },
        updatedAt: serverTimestamp()
    });
}

export async function listPatients(municipalityId) {
    const snapshot = await getDocs(query(collection(db, "patients"), where("municipalityId", "==", municipalityId)));
    return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt-BR"));
}
