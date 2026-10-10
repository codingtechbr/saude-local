// Assistente de IA com texto e voz. A chave da Groq NUNCA fica no navegador:
// texto ou áudio vão para a Cloud Function "assistantChat", que valida o usuário,
// transcreve o áudio (Whisper), busca somente os dados dele e chama a Groq no servidor.
import { initPatientPage } from "./shell.js";
import { functions, db } from "../firebase-config.js";
import { httpsCallable } from "../lib/functions.js";
import { collection, getDocs, query, orderBy, limit } from "../lib/firestore.js";
import { icon, toast } from "../ui.js";
import { escapeHtml, firstName, friendlyError } from "../utils.js";
import {
    VoiceRecorder, isRecordingSupported, isSpeechSupported, speak, stopSpeaking, unlockSpeech, MAX_RECORDING_SECONDS
} from "./voice.js";

const { user, profile } = await initPatientPage("home", { nav: false });

const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendButton = document.getElementById("chat-send");
const micButton = document.getElementById("chat-mic");
const recordingBar = document.getElementById("recording-bar");
const recordingTime = document.getElementById("recording-time");
const cancelRecordingButton = document.getElementById("recording-cancel");
const autoSpeakButton = document.getElementById("auto-speak");

const chat = httpsCallable(functions, "assistantChat", { timeout: 90000 });
const STORAGE_KEY = `assistant-conversation-${user.uid}`;
const AUTO_SPEAK_KEY = "assistant-auto-speak";
const SUGGESTIONS = ["Como está meu exame?", "Quando é minha consulta?", "Tenho documento pendente?", "Quais documentos preciso enviar?"];

let conversationId = null;
let busy = false;
let autoSpeak = false;
let speakingButton = null;

try {
    conversationId = localStorage.getItem(STORAGE_KEY);
    autoSpeak = localStorage.getItem(AUTO_SPEAK_KEY) === "1";
} catch { /* armazenamento indisponível */ }

const recorder = new VoiceRecorder({
    onTick: (seconds) => {
        const remaining = MAX_RECORDING_SECONDS - seconds;
        recordingTime.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${remaining <= 10 ? ` · termina em ${remaining}s` : ""}`;
    },
    onAutoStop: () => finishRecording()
});

/* ---------- Bolhas ---------- */

function setSpeaking(button, speaking, loading = false) {
    if (!button) return;
    button.innerHTML = loading ? `<span class="spinner spinner--xs" aria-hidden="true"></span> Preparando voz...`
        : speaking ? `${icon("square", 14)} Parar` : `${icon("volume", 14)} Ouvir`;
    button.setAttribute("aria-label", speaking ? "Parar leitura" : "Ouvir resposta");
    button.classList.toggle("is-speaking", speaking);
}

function speakFrom(button, text) {
    if (speakingButton === button) {
        stopSpeaking();
        setSpeaking(button, false);
        speakingButton = null;
        return;
    }
    setSpeaking(speakingButton, false);
    speakingButton = button;
    speak(text, {
        onLoading: () => setSpeaking(button, true, true),
        onStart: () => setSpeaking(button, true),
        onEnd: () => {
            setSpeaking(button, false);
            if (speakingButton === button) speakingButton = null;
        }
    });
}

function addBubble(role, text, { voice = false } = {}) {
    const bubble = document.createElement("div");
    bubble.className = `bubble bubble--${role === "user" ? "user" : "bot"}`;
    if (role === "user") {
        if (voice) bubble.insertAdjacentHTML("afterbegin", `<span class="bubble__voice">${icon("mic", 14)} <span class="sr-only">Mensagem de voz:</span></span>`);
        bubble.append(document.createTextNode(text));
    } else {
        bubble.innerHTML = '<span class="sr-only">Assistente: </span>';
        bubble.append(document.createTextNode(text));
        if (isSpeechSupported()) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "bubble__speak";
            setSpeaking(button, false);
            button.addEventListener("click", () => speakFrom(button, text));
            bubble.appendChild(button);
        }
    }
    messagesEl.appendChild(bubble);
    bubble.scrollIntoView({ block: "end", behavior: "smooth" });
    return bubble;
}

function showSuggestions() {
    const wrap = document.createElement("div");
    wrap.className = "chips";
    wrap.innerHTML = SUGGESTIONS.map((s) => `<button type="button" class="chip" data-suggestion="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("");
    messagesEl.appendChild(wrap);
}

function showTyping(label = "O assistente está digitando") {
    const typing = document.createElement("div");
    typing.className = "bubble bubble--bot typing";
    typing.setAttribute("role", "status");
    typing.innerHTML = `<span class="sr-only">${escapeHtml(label)}</span><span></span><span></span><span></span>`;
    messagesEl.appendChild(typing);
    typing.scrollIntoView({ block: "end" });
    return typing;
}

function setBusy(value) {
    busy = value;
    sendButton.disabled = value;
    micButton.disabled = value;
}

/* ---------- Envio (texto ou voz) ---------- */

async function ask(payload, { voice }) {
    setBusy(true);
    messagesEl.querySelector(".chips")?.remove();
    const pendingVoiceBubble = voice ? addBubble("user", "Transcrevendo áudio...", { voice: true }) : null;
    const typing = showTyping(voice ? "Ouvindo sua mensagem" : "O assistente está digitando");

    try {
        const { data } = await chat({ ...payload, conversationId });
        conversationId = data.conversationId;
        try { localStorage.setItem(STORAGE_KEY, conversationId); } catch { /* ignore */ }
        if (pendingVoiceBubble) {
            pendingVoiceBubble.lastChild.textContent = data.transcript || "(mensagem de voz)";
        }
        typing.remove();
        const bubble = addBubble("assistant", data.reply);
        // Responde em voz quando o paciente falou ou quando a leitura automática está ligada.
        if ((voice || autoSpeak) && isSpeechSupported()) bubble.querySelector(".bubble__speak")?.click();
    } catch (error) {
        console.error("Assistente:", error);
        typing.remove();
        pendingVoiceBubble?.remove();
        const fallback = error.code === "functions/not-found" || error.code === "functions/internal"
            ? "O assistente está indisponível no momento. Você pode acompanhar tudo pela tela Pedidos."
            : friendlyError(error, "Não consegui responder agora. Tente novamente em instantes.");
        addBubble("assistant", fallback);
    } finally {
        setBusy(false);
        input.focus();
    }
}

function sendText(text) {
    const message = text.trim();
    if (!message || busy) return;
    unlockSpeech();
    input.value = "";
    addBubble("user", message);
    ask({ message }, { voice: false });
}

/* ---------- Gravação ---------- */

function showRecording(active) {
    recordingBar.hidden = !active;
    input.hidden = active;
    micButton.classList.toggle("is-recording", active);
    micButton.innerHTML = active ? icon("send", 20) : icon("mic", 20);
    micButton.setAttribute("aria-label", active ? "Parar e enviar áudio" : "Gravar mensagem de voz");
    sendButton.hidden = active;
}

async function startRecording() {
    unlockSpeech();
    stopSpeaking();
    try {
        await recorder.start();
        recordingTime.textContent = "0:00";
        showRecording(true);
    } catch (error) {
        console.error(error);
        toast(error.name === "NotAllowedError"
            ? "Permita o uso do microfone nas configurações do navegador para falar com o assistente."
            : "Não foi possível acessar o microfone neste aparelho.", "error", 7000);
    }
}

async function finishRecording() {
    if (!recorder.recording) return;
    showRecording(false);
    try {
        const audio = await recorder.stop();
        if (audio.seconds < 0.8) {
            toast("Áudio muito curto. Toque no microfone, fale e toque de novo para enviar.", "info");
            return;
        }
        ask({ audio: audio.base64, mimeType: audio.mimeType }, { voice: true });
    } catch (error) {
        console.error(error);
        toast("Não foi possível gravar o áudio. Tente novamente.", "error");
    }
}

/* ---------- Histórico ---------- */

async function loadHistory() {
    if (!conversationId) return false;
    try {
        const snapshot = await getDocs(query(collection(db, "aiConversations", conversationId, "messages"), orderBy("createdAt", "desc"), limit(20)));
        const messages = snapshot.docs.map((d) => d.data()).reverse();
        messages.forEach((m) => addBubble(m.role, m.content, { voice: m.via === "voice" }));
        return messages.length > 0;
    } catch (error) {
        console.warn("Histórico do assistente indisponível:", error);
        conversationId = null;
        return false;
    }
}

/* ---------- Eventos ---------- */

form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendText(input.value);
});

messagesEl.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-suggestion]");
    if (chip) sendText(chip.dataset.suggestion);
});

micButton.addEventListener("click", () => {
    if (busy) return;
    if (recorder.recording) finishRecording();
    else startRecording();
});

cancelRecordingButton.addEventListener("click", () => {
    recorder.cancel();
    showRecording(false);
});

function renderAutoSpeak() {
    autoSpeakButton.setAttribute("aria-pressed", String(autoSpeak));
    autoSpeakButton.innerHTML = icon(autoSpeak ? "volume" : "volumeOff", 20);
    autoSpeakButton.title = autoSpeak ? "Leitura automática ligada" : "Leitura automática desligada";
    autoSpeakButton.setAttribute("aria-label", autoSpeak ? "Desligar leitura das respostas em voz alta" : "Ligar leitura das respostas em voz alta");
}

autoSpeakButton.addEventListener("click", () => {
    autoSpeak = !autoSpeak;
    if (autoSpeak) unlockSpeech();
    else stopSpeaking();
    try { localStorage.setItem(AUTO_SPEAK_KEY, autoSpeak ? "1" : "0"); } catch { /* ignore */ }
    renderAutoSpeak();
    toast(autoSpeak ? "As respostas serão lidas em voz alta." : "Leitura em voz alta desligada.", "info", 2500);
});

document.getElementById("new-chat").addEventListener("click", () => {
    conversationId = null;
    stopSpeaking();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    messagesEl.innerHTML = "";
    start(false);
});

window.addEventListener("pagehide", () => {
    recorder.cancel();
    stopSpeaking();
});

/* ---------- Início ---------- */

sendButton.innerHTML = icon("send", 20);
micButton.innerHTML = icon("mic", 20);
cancelRecordingButton.innerHTML = icon("x", 18);
if (!isRecordingSupported()) micButton.hidden = true;
if (isSpeechSupported()) renderAutoSpeak();
else autoSpeakButton.hidden = true;

async function start(withHistory = true) {
    const hadHistory = withHistory ? await loadHistory() : false;
    if (!hadHistory) {
        addBubble("assistant", `Olá, ${firstName(profile.name) || "tudo bem"}! Sou o assistente da Saúde. Você pode digitar ou tocar no microfone e falar. Posso informar o andamento das suas solicitações, agendamentos e documentos pendentes.`);
        showSuggestions();
    }
}

start();
