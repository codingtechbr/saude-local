// Voz no assistente: gravação pelo microfone (MediaRecorder) e leitura em voz alta
// (voz humanizada do Google pela Cloud Function, com a voz do aparelho de reserva).
import { functions } from "../firebase-config.js";
import { httpsCallable } from "../lib/functions.js";
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
// 1º: voz humanizada do Google (Cloud Function "assistantSpeech", MP3).
// 2º (reserva): melhor voz em português instalada no aparelho.

const synthesizeSpeech = httpsCallable(functions, "assistantSpeech", { timeout: 30000 });
const audioCache = new Map(); // texto -> URL do MP3 (evita gerar de novo ao tocar "Ouvir")
const player = new Audio();
player.preload = "auto";
let cloudAvailable = true;
let currentToken = 0;

// Áudio silencioso (WAV de 0,05 s) usado para liberar o som no iPhone dentro de um toque.
const SILENT_AUDIO = (() => {
    const samples = 400;
    const bytes = new Uint8Array(44 + samples * 2);
    const view = new DataView(bytes.buffer);
    const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVE"); text(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, "data"); view.setUint32(40, samples * 2, true);
    return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
})();

export function isSpeechSupported() {
    return true; // sempre há o reprodutor de áudio; a voz do aparelho é só reserva
}

function hasDeviceVoice() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

// Prefere vozes "naturais" (Edge: Natural, Google, iOS: Aprimorada/Premium).
function bestDeviceVoice() {
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().replace("_", "-").startsWith("pt"));
    const score = (v) => {
        const name = v.name.toLowerCase();
        let points = v.lang.toLowerCase().replace("_", "-") === "pt-br" ? 10 : 0;
        if (/natural|neural|online/.test(name)) points += 8;
        if (/premium|enhanced|aprimorad/.test(name)) points += 7;
        if (/google/.test(name)) points += 5;
        if (/luciana|francisca|thalita|vitoria|vitória/.test(name)) points += 2;
        if (v.localService === false) points += 1;
        return points;
    };
    return voices.sort((a, b) => score(b) - score(a))[0] || null;
}

// Chamar dentro de um toque do usuário (libera o áudio no iPhone).
export function unlockSpeech() {
    try {
        player.src = SILENT_AUDIO;
        player.play().catch(() => {});
    } catch { /* ignore */ }
    if (hasDeviceVoice()) {
        const u = new SpeechSynthesisUtterance("");
        u.volume = 0;
        window.speechSynthesis.speak(u);
    }
}

function cleanForSpeech(text) {
    return String(text || "")
        .replace(/[*_#`>|]/g, " ")
        .replace(/https?:\/\/\S+/g, "link")
        .replace(/\s+/g, " ")
        .trim();
}

function base64ToUrl(base64, mimeType) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

async function cloudAudioUrl(text) {
    if (audioCache.has(text)) return audioCache.get(text);
    const { data } = await synthesizeSpeech({ text });
    const url = base64ToUrl(data.audio, data.mimeType || "audio/mpeg");
    audioCache.set(text, url);
    return url;
}

function speakWithDevice(text, { onStart, onEnd }) {
    if (!hasDeviceVoice()) {
        onEnd?.();
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    const voice = bestDeviceVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1;
    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
}

export async function speak(rawText, { onStart, onEnd, onLoading } = {}) {
    const text = cleanForSpeech(rawText);
    if (!text) return false;
    stopSpeaking();
    const token = ++currentToken;

    if (cloudAvailable) {
        try {
            onLoading?.();
            const url = await cloudAudioUrl(text);
            if (token !== currentToken) return true; // outro áudio foi pedido nesse meio tempo
            player.src = url;
            player.onplay = () => onStart?.();
            player.onended = () => onEnd?.();
            player.onerror = () => onEnd?.();
            await player.play();
            return true;
        } catch (error) {
            console.warn("Voz humanizada indisponível; usando a voz do aparelho.", error);
            // API desativada/sem permissão: não tenta de novo nesta sessão.
            if (["functions/unavailable", "functions/not-found", "functions/internal"].includes(error?.code)) cloudAvailable = false;
            if (token !== currentToken) return true;
        }
    }
    speakWithDevice(text, { onStart, onEnd });
    return true;
}

export function stopSpeaking() {
    currentToken++;
    try {
        player.pause();
        player.currentTime = 0;
    } catch { /* ignore */ }
    if (hasDeviceVoice()) window.speechSynthesis.cancel();
}

if (hasDeviceVoice()) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", () => window.speechSynthesis.getVoices());
}
