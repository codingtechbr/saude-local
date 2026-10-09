// Assistente de IA. A chave da Groq NUNCA fica no navegador:
// a pergunta vai para a Cloud Function "assistantChat", que valida o usuário,
// busca somente os dados dele e chama a Groq no servidor.
import { initPatientPage } from "./shell.js";
import { functions, db } from "../firebase-config.js";
import { httpsCallable } from "../lib/functions.js";
import { collection, getDocs, query, orderBy, limit } from "../lib/firestore.js";
import { icon } from "../ui.js";
import { escapeHtml, firstName, friendlyError } from "../utils.js";

const { user, profile } = await initPatientPage("home", { nav: false });

const messagesEl = document.getElementById("messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("chat-input");
const sendButton = document.getElementById("chat-send");
const chat = httpsCallable(functions, "assistantChat", { timeout: 60000 });
const STORAGE_KEY = `assistant-conversation-${user.uid}`;

const SUGGESTIONS = ["Como está meu exame?", "Quando é minha consulta?", "Tenho documento pendente?", "Quais documentos preciso enviar?"];

let conversationId = null;
let busy = false;

try { conversationId = localStorage.getItem(STORAGE_KEY); } catch { conversationId = null; }

function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = `bubble bubble--${role === "user" ? "user" : "bot"}`;
    if (role !== "user") bubble.innerHTML = `<span class="sr-only">Assistente: </span>`;
    bubble.append(document.createTextNode(text));
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

function showTyping() {
    const typing = document.createElement("div");
    typing.className = "bubble bubble--bot typing";
    typing.setAttribute("role", "status");
    typing.innerHTML = '<span class="sr-only">O assistente está digitando</span><span></span><span></span><span></span>';
    messagesEl.appendChild(typing);
    typing.scrollIntoView({ block: "end" });
    return typing;
}

async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    busy = true;
    sendButton.disabled = true;
    input.value = "";
    messagesEl.querySelector(".chips")?.remove();
    addBubble("user", message);
    const typing = showTyping();

    try {
        const { data } = await chat({ message, conversationId });
        conversationId = data.conversationId;
        try { localStorage.setItem(STORAGE_KEY, conversationId); } catch { /* armazenamento indisponível */ }
        typing.remove();
        addBubble("assistant", data.reply);
    } catch (error) {
        console.error("Assistente:", error);
        typing.remove();
        const fallback = error.code === "functions/not-found" || error.code === "functions/internal"
            ? "O assistente está indisponível no momento. Você pode acompanhar tudo pela tela Pedidos."
            : friendlyError(error, "Não consegui responder agora. Tente novamente em instantes.");
        addBubble("assistant", fallback);
    } finally {
        busy = false;
        sendButton.disabled = false;
        input.focus();
    }
}

async function loadHistory() {
    if (!conversationId) return false;
    try {
        const snapshot = await getDocs(query(
            collection(db, "aiConversations", conversationId, "messages"),
            orderBy("createdAt", "desc"),
            limit(20)
        ));
        const messages = snapshot.docs.map((d) => d.data()).reverse();
        messages.forEach((m) => addBubble(m.role, m.content));
        return messages.length > 0;
    } catch (error) {
        console.warn("Histórico do assistente indisponível:", error);
        conversationId = null;
        return false;
    }
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    send(input.value);
});

messagesEl.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-suggestion]");
    if (chip) send(chip.dataset.suggestion);
});

document.getElementById("new-chat").addEventListener("click", () => {
    conversationId = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    messagesEl.innerHTML = "";
    start(false);
});

sendButton.innerHTML = icon("send", 20);

async function start(withHistory = true) {
    const hadHistory = withHistory ? await loadHistory() : false;
    if (!hadHistory) {
        addBubble("assistant", `Olá, ${firstName(profile.name) || "tudo bem"}! Sou o assistente da Saúde. Posso informar o andamento das suas solicitações, agendamentos e documentos pendentes. Como posso ajudar?`);
        showSuggestions();
    }
}

start();
