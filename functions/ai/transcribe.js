// Transcrição de áudio (voz -> texto) com o Whisper da Groq.
// O áudio chega em base64 pela Cloud Function e NÃO é armazenado.
const { HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { GROQ_TRANSCRIBE_URL, GROQ_WHISPER_MODELS } = require("../config");

const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // ~4 MB (bem acima de 1 minuto de voz)

const EXTENSIONS = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-m4a": "m4a",
    "audio/aac": "m4a"
};

function decodeAudio(base64, mimeType) {
    if (typeof base64 !== "string" || !base64) throw new HttpsError("invalid-argument", "Áudio não recebido.");
    const type = String(mimeType || "").split(";")[0].trim().toLowerCase();
    if (!EXTENSIONS[type]) throw new HttpsError("invalid-argument", "Formato de áudio não suportado.");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length < 1000) throw new HttpsError("invalid-argument", "O áudio ficou muito curto. Segure o botão e fale de novo.");
    if (buffer.length > MAX_AUDIO_BYTES) throw new HttpsError("invalid-argument", "O áudio ficou muito longo. Fale por até 1 minuto.");
    return { buffer, type, extension: EXTENSIONS[type] };
}

async function transcribeAudio(apiKey, base64, mimeType) {
    const { buffer, type, extension } = decodeAudio(base64, mimeType);

    for (const model of GROQ_WHISPER_MODELS) {
        const form = new FormData();
        form.append("file", new Blob([buffer], { type }), `audio.${extension}`);
        form.append("model", model);
        form.append("language", "pt");
        form.append("temperature", "0");
        form.append("response_format", "json");

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(GROQ_TRANSCRIBE_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}` },
                body: form,
                signal: controller.signal
            });
            if (!response.ok) {
                const text = await response.text();
                logger.error("Groq (transcrição) respondeu com erro", { model, status: response.status, body: text.slice(0, 500) });
                if (response.status === 404 || /model_not_found|decommissioned/.test(text)) continue;
                throw new HttpsError("unavailable", "Não consegui entender o áudio agora. Tente de novo ou digite sua dúvida.");
            }
            const data = await response.json();
            const transcript = String(data?.text || "").trim();
            if (!transcript) throw new HttpsError("invalid-argument", "Não consegui entender o áudio. Fale mais perto do microfone.");
            return transcript.slice(0, 800);
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            logger.error("Falha na transcrição", { model, error: String(error) });
            throw new HttpsError("unavailable", "Não consegui entender o áudio agora. Tente de novo ou digite sua dúvida.");
        } finally {
            clearTimeout(timer);
        }
    }
    throw new HttpsError("unavailable", "Transcrição de áudio indisponível no momento.");
}

module.exports = { transcribeAudio };
