// Assistente de IA: Browser -> Auth -> esta função -> verifica paciente -> busca dados -> Groq.
// A chave GROQ_API_KEY fica no Secret Manager (nunca no frontend):
//   firebase functions:secrets:set GROQ_API_KEY
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { buildPatientContext } = require("./tools");
const { SYSTEM_PROMPT, buildContextMessage } = require("./prompts");
const { GROQ_MODELS, GROQ_URL } = require("../config");

const GROQ_API_KEY = defineSecret("GROQ_API_KEY");

const MAX_MESSAGE_LENGTH = 800;
const HISTORY_SIZE = 10;

const UNAVAILABLE_MESSAGE = "O assistente está indisponível no momento. Tente novamente em instantes.";

// Tenta um modelo. Retorna { reply } ou { skip: true } quando o modelo não existe para esta conta.
async function tryModel(apiKey, model, messages) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const body = { model, messages, temperature: 0.2, max_tokens: 1024 };
        // Modelos gpt-oss "pensam" antes de responder; esforço baixo deixa a resposta rápida e curta.
        if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

        const response = await fetch(GROQ_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        if (!response.ok) {
            const text = await response.text();
            logger.error("Groq respondeu com erro", { model, status: response.status, body: text.slice(0, 500) });
            if (response.status === 404 || /model_not_found|model_decommissioned|decommissioned/.test(text)) return { skip: true };
            if (response.status === 401) throw new HttpsError("unavailable", "O assistente está sem chave válida. Avise a Secretaria.");
            throw new HttpsError("unavailable", UNAVAILABLE_MESSAGE);
        }
        const data = await response.json();
        const reply = data?.choices?.[0]?.message?.content?.trim();
        if (!reply) {
            logger.warn("Groq retornou resposta vazia", { model, finish: data?.choices?.[0]?.finish_reason });
            return { skip: true };
        }
        return { reply, model };
    } catch (error) {
        if (error instanceof HttpsError) throw error;
        logger.error("Falha ao chamar a Groq", { model, error: String(error) });
        throw new HttpsError("unavailable", UNAVAILABLE_MESSAGE);
    } finally {
        clearTimeout(timer);
    }
}

async function callGroq(apiKey, messages) {
    for (const model of GROQ_MODELS) {
        const result = await tryModel(apiKey, model, messages);
        if (!result.skip) return result;
    }
    logger.error("Nenhum modelo da Groq disponível", { tried: GROQ_MODELS });
    throw new HttpsError("unavailable", UNAVAILABLE_MESSAGE);
}

exports.assistantChat = onCall({ secrets: [GROQ_API_KEY], timeoutSeconds: 60, memory: "256MiB" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Entre na sua conta para usar o assistente.");
    }

    const uid = request.auth.uid;
    const message = String(request.data?.message ?? "").trim();
    if (!message) throw new HttpsError("invalid-argument", "Digite sua dúvida.");
    if (message.length > MAX_MESSAGE_LENGTH) throw new HttpsError("invalid-argument", "Mensagem muito longa. Resuma sua dúvida.");

    const db = getFirestore();
    const context = await buildPatientContext(db, uid);

    // Conversa: reaproveita a existente somente se pertencer ao mesmo usuário.
    let conversationRef = null;
    const requestedId = request.data?.conversationId;
    if (typeof requestedId === "string" && /^[A-Za-z0-9]{10,40}$/.test(requestedId)) {
        const ref = db.collection("aiConversations").doc(requestedId);
        const snapshot = await ref.get();
        if (snapshot.exists && snapshot.get("userId") === uid) conversationRef = ref;
    }
    if (!conversationRef) {
        conversationRef = db.collection("aiConversations").doc();
        await conversationRef.set({
            municipalityId: context.municipalityId,
            userId: uid,
            patientId: context.patientId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    const historySnapshot = await conversationRef.collection("messages").orderBy("createdAt", "desc").limit(HISTORY_SIZE).get();
    const history = historySnapshot.docs.reverse().map((d) => ({ role: d.get("role"), content: d.get("content") }));

    const { reply, model } = await callGroq(GROQ_API_KEY.value(), [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: buildContextMessage(context) },
        ...history,
        { role: "user", content: message }
    ]);

    const now = Date.now();
    const batch = db.batch();
    batch.set(conversationRef.collection("messages").doc(), { role: "user", content: message, createdAt: Timestamp.fromMillis(now) });
    batch.set(conversationRef.collection("messages").doc(), { role: "assistant", content: reply, model, createdAt: Timestamp.fromMillis(now + 1) });
    batch.update(conversationRef, { updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();

    return { conversationId: conversationRef.id, reply };
});
