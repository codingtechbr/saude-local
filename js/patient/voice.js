// Voz no assistente: gravação pelo microfone (MediaRecorder) e leitura em voz alta (speechSynthesis).
// Funciona em HTTPS ou localhost. No iPhone, a fala só é liberada depois de um toque do usuário.

export const MAX_RECORDING_SECONDS = 60;

export function isRecordingSupported() {
    return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

function pickMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export class VoiceRecorder {
    constructor({ onTick, onAutoStop } = {}) {
        this.onTick = onTick;
        this.onAutoStop = onAutoStop;
        this.recorder = null;
        this.stream = null;
        this.chunks = [];
        this.timer = null;
        this.startedAt = 0;
    }

    get recording() {
        return this.recorder?.state === "recording";
    }

    async start() {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const mimeType = pickMimeType();
        this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
        this.chunks = [];
        this.recorder.ondataavailable = (event) => {
            if (event.data?.size) this.chunks.push(event.data);
        };
        this.recorder.start();
        this.startedAt = Date.now();
        this.timer = setInterval(() => {
            const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
            this.onTick?.(seconds);
            if (seconds >= MAX_RECORDING_SECONDS) this.onAutoStop?.();
        }, 250);
    }

    // Para a gravação e devolve { base64, mimeType, seconds }.
    stop() {
        return new Promise((resolve, reject) => {
            if (!this.recorder) {
                reject(new Error("Gravação não iniciada"));
                return;
            }
            const recorder = this.recorder;
            recorder.onstop = async () => {
                const mimeType = (recorder.mimeType || this.chunks[0]?.type || "audio/webm").split(";")[0];
                const blob = new Blob(this.chunks, { type: mimeType });
                const seconds = (Date.now() - this.startedAt) / 1000;
                this.cleanup();
                try {
                    resolve({ base64: await blobToBase64(blob), mimeType, seconds, size: blob.size });
                } catch (error) {
                    reject(error);
                }
            };
            recorder.stop();
        });
    }

    cancel() {
        if (this.recorder && this.recorder.state !== "inactive") {
            this.recorder.onstop = null;
            this.recorder.stop();
        }
        this.cleanup();
    }

    cleanup() {
        clearInterval(this.timer);
        this.timer = null;
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.recorder = null;
    }
}

/* ---------- Leitura em voz alta ---------- */

export function isSpeechSupported() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function portugueseVoice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang?.toLowerCase() === "pt-br")
        || voices.find((v) => v.lang?.toLowerCase().startsWith("pt"))
        || null;
}

// Chamar dentro de um toque do usuário (necessário no iPhone para liberar a fala depois).
export function unlockSpeech() {
    if (!isSpeechSupported()) return;
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
}

function cleanForSpeech(text) {
    return String(text || "")
        .replace(/[*_#`>|]/g, " ")
        .replace(/https?:\/\/\S+/g, "link")
        .replace(/\s+/g, " ")
        .trim();
}

export function speak(text, { onStart, onEnd } = {}) {
    if (!isSpeechSupported()) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanForSpeech(text));
    utterance.lang = "pt-BR";
    const voice = portugueseVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
    return true;
}

export function stopSpeaking() {
    if (isSpeechSupported()) window.speechSynthesis.cancel();
}

// Algumas plataformas carregam as vozes depois; força o carregamento.
if (isSpeechSupported()) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", () => window.speechSynthesis.getVoices());
}
