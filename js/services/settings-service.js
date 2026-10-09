// Município e base de conhecimento usada pela IA.
import { db } from "../firebase-config.js";
import {
    doc, collection, getDoc, getDocs, query, where, writeBatch, serverTimestamp
} from "../lib/firestore.js";
import { addAudit } from "./audit-service.js";

export async function getMunicipality(municipalityId) {
    const snapshot = await getDoc(doc(db, "municipalities", municipalityId));
    return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function saveMunicipality(actor, data) {
    const ref = doc(db, "municipalities", actor.municipalityId);
    const existing = await getDoc(ref);
    const payload = {
        name: data.name.trim(),
        healthDepartmentName: data.healthDepartmentName.trim(),
        phone: (data.phone || "").trim(),
        address: (data.address || "").trim(),
        active: true,
        branding: {
            logo: "",
            primaryColor: data.primaryColor || "#176b5b",
            municipalityName: data.municipalityName.trim()
        },
        updatedAt: serverTimestamp()
    };
    if (!existing.exists()) payload.createdAt = serverTimestamp();

    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    addAudit(batch, actor, { action: "MUNICIPALITY_UPDATED", entity: "MUNICIPALITY", entityId: actor.municipalityId, newData: { name: payload.name } });
    await batch.commit();
}

export const DEFAULT_ARTICLES = [
    {
        title: "Documentos necessários para solicitar exames",
        category: "DOCUMENTS",
        content: "Para solicitar exames, consultas ou cirurgias envie: foto nítida do pedido médico (com carimbo e assinatura), documento pessoal com foto (RG ou CNH) e Cartão SUS. A foto deve mostrar o documento inteiro, sem cortes e com boa iluminação."
    },
    {
        title: "Como acompanhar minha solicitação",
        category: "PROCESS",
        content: "Depois de enviar a solicitação você recebe um número de protocolo. Na tela Pedidos é possível ver a linha do tempo: análise de documentos, regulação, aguardando vaga, agendamento e realização. Você também recebe avisos a cada mudança."
    },
    {
        title: "O que significa aguardando vaga",
        category: "PROCESS",
        content: "Aguardando vaga significa que a solicitação foi aprovada e está na fila do procedimento. A ordem considera a prioridade definida pela equipe de regulação e a data de entrada. Não é possível informar previsão de data até o agendamento ser feito pela Secretaria."
    },
    {
        title: "Como reagendar ou faltar a um agendamento",
        category: "APPOINTMENTS",
        content: "Se não puder comparecer, use a opção Preciso reagendar na tela de agendamentos ou procure a Secretaria com antecedência. Faltas sem aviso podem fazer a solicitação ser encerrada."
    },
    {
        title: "Urgências e emergências",
        category: "GENERAL",
        content: "Este aplicativo não atende urgências. Em caso de emergência ligue 192 (SAMU) ou procure o pronto-socorro mais próximo."
    }
];

export async function listArticles(municipalityId) {
    const snapshot = await getDocs(query(collection(db, "knowledgeBase"), where("municipalityId", "==", municipalityId)));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.title || "").localeCompare(b.title || "", "pt-BR"));
}

export async function saveArticle(actor, data, id = null) {
    const ref = id ? doc(db, "knowledgeBase", id) : doc(collection(db, "knowledgeBase"));
    const payload = {
        municipalityId: actor.municipalityId,
        title: data.title.trim(),
        category: data.category,
        content: data.content.trim(),
        active: data.active !== false,
        updatedAt: serverTimestamp()
    };
    if (!id) payload.createdAt = serverTimestamp();
    const batch = writeBatch(db);
    batch.set(ref, payload, { merge: true });
    addAudit(batch, actor, { action: id ? "ARTICLE_UPDATED" : "ARTICLE_CREATED", entity: "KNOWLEDGE_BASE", entityId: ref.id, newData: { title: payload.title } });
    await batch.commit();
}

export async function seedDefaultArticles(actor) {
    const existing = await listArticles(actor.municipalityId);
    const titles = new Set(existing.map((a) => a.title.toLowerCase()));
    const missing = DEFAULT_ARTICLES.filter((a) => !titles.has(a.title.toLowerCase()));
    if (!missing.length) return 0;
    const batch = writeBatch(db);
    missing.forEach((a) => batch.set(doc(collection(db, "knowledgeBase")), {
        municipalityId: actor.municipalityId,
        ...a,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }));
    addAudit(batch, actor, { action: "ARTICLES_SEEDED", entity: "KNOWLEDGE_BASE", entityId: "seed", newData: { count: missing.length } });
    await batch.commit();
    return missing.length;
}

export async function listAuditLogs(municipalityId, { patientId = null } = {}) {
    const filters = [where("municipalityId", "==", municipalityId)];
    if (patientId) filters.push(where("patientId", "==", patientId));
    const snapshot = await getDocs(query(collection(db, "auditLogs"), ...filters));
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}
