// Configuração central das Cloud Functions.

// IMPORTANTE: use a MESMA região do banco Firestore (Console > Firestore > aba "Dados", local do banco)
// e a mesma constante FUNCTIONS_REGION de js/firebase-config.js.
//  - Banco em "southamerica-east1" (São Paulo) -> "southamerica-east1"
//  - Banco em "nam5" (Estados Unidos)          -> "us-central1"
// Gatilhos do Firestore falham no deploy se a região não for compatível com o banco.
const REGION = "southamerica-east1";

const TIMEZONE = "America/Sao_Paulo";

// Modelos da Groq em ordem de preferência. Se um for desativado ou não estiver
// liberado para a sua conta, a função tenta o próximo automaticamente.
const GROQ_MODELS = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Transcrição de voz (Whisper). Mesma lógica: tenta o próximo se um for desativado.
const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_WHISPER_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3"];

// Vozes do Google Cloud Text-to-Speech, em ordem de preferência (pt-BR).
// Chirp 3 HD é a mais natural; Neural2 e WaveNet ficam de reserva.
// Para voz masculina, troque a primeira por "pt-BR-Chirp3-HD-Charon".
const TTS_VOICES = [
    { name: "pt-BR-Chirp3-HD-Aoede" },
    { name: "pt-BR-Neural2-C", pitch: 1.0, speakingRate: 1.02 },
    { name: "pt-BR-Wavenet-C", pitch: 1.0, speakingRate: 1.02 }
];

// Endereço público do app (usado no link das notificações push).
const APP_URL = "https://chamados-hopital.web.app";

module.exports = { REGION, TIMEZONE, GROQ_MODELS, GROQ_URL, GROQ_TRANSCRIBE_URL, GROQ_WHISPER_MODELS, TTS_VOICES, APP_URL };
