// Ponto de entrada das Cloud Functions (JavaScript / CommonJS).
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { REGION } = require("./config");

// Precisa vir ANTES de carregar as funções para valer para todas.
setGlobalOptions({ region: REGION, maxInstances: 10 });
initializeApp();

// Assistente de IA (Groq) - chamado pelo app do paciente.
exports.assistantChat = require("./ai/chat").assistantChat;

// Login por CPF: descobre o e-mail vinculado ao CPF.
exports.resolveLoginEmail = require("./auth/resolve-login").resolveLoginEmail;

// Perfil do servidor no token de login (usado pelas regras do Storage).
const staffClaims = require("./auth/sync-claims");
exports.syncStaffClaims = staffClaims.syncStaffClaims;
exports.onUserProfileWritten = staffClaims.onUserProfileWritten;

// Aviso "Solicitação recebida" + auditoria do servidor quando uma solicitação é criada.
exports.onRequestCreated = require("./requests/create-request").onRequestCreated;

// Envia push (FCM) quando um aviso é gravado em notifications/.
exports.onNotificationCreated = require("./notifications/send-notification").onNotificationCreated;

// Lembrete diário de agendamentos do dia seguinte.
exports.appointmentReminders = require("./queues/queue-manager").appointmentReminders;
