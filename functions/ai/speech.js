// Voz humanizada (texto -> fala) com o Google Cloud Text-to-Speech.
// Usa a conta de serviço do próprio projeto (sem chave extra).
// Requer a API "Cloud Text-to-Speech" ativada no projeto do Google Cloud.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { applicationDefault } = require("firebase-admin/app");
const { TTS_VOICES } = require("../config");

const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const MAX_CHARS = 1500;

function cleanForSpeech(text) {
    return String(text || "")
        .replace(/[*_#`>|]/g, " ")
        .replace(/https?:\/\/\S+/g, "link")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CHARS);
}

async function synthesize(token, voice, text) {
    const body = {
        input: { text },
        voice: { languageCode: "pt-BR", name: voice.name },
        audioConfig: { audioEncoding: "MP3", speakingRate: voice.speakingRate || 1.0 }
    };
    // Vozes Chirp 3 HD não aceitam pitch; as demais aceitam um tom levemente mais caloroso.
    if (!voice.name.includes("Chirp")) body.audioConfig.pitch = voice.pitch ?? 0;

    const response = await fetch(TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const text = await response.text();
        return { error: { status: response.status, body: text.slice(0, 400) } };
    }
    const data = await response.json();
    return { audio: data.audioContent };
}

exports.assistantSpeech = onCall({ timeoutSeconds: 30, memory: "256MiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Entre na sua conta.");
    const text = cleanForSpeech(request.data?.text);
    if (!text) throw new HttpsError("invalid-argument", "Nada para ler.");

    let token;
    try {
        token = (await applicationDefault().getAccessToken()).access_token;
    } catch (error) {
        logger.error("Sem credencial para o Text-to-Speech", error);
        throw new HttpsError("unavailable", "Voz indisponível.");
    }

    for (const voice of TTS_VOICES) {
        const result = await synthesize(token, voice, text);
        if (result.audio) return { audio: result.audio, mimeType: "audio/mpeg", voice: voice.name };
        logger.warn("Text-to-Speech recusou a voz", { voice: voice.name, ...result.error });
        // API desativada ou sem permissão: não adianta tentar outras vozes.
        if (result.error.status === 403 || result.error.status === 401) break;
    }
    throw new HttpsError("unavailable", "Voz indisponível no momento.");
});
