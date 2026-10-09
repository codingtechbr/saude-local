import { resetPassword } from "../auth.js";
import { hydrateIcons, setButtonLoading, showFormError } from "../ui.js";
import { friendlyError } from "../utils.js";

hydrateIcons();

const form = document.getElementById("recover-form");
const submit = document.getElementById("recover-submit");
const errorBox = document.getElementById("form-error");
const success = document.getElementById("recover-success");

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(errorBox, "");
    const identifier = form.identifier.value.trim();
    if (!identifier) {
        showFormError(errorBox, "Informe seu e-mail ou CPF.");
        return;
    }
    setButtonLoading(submit, true, "Enviando...");
    try {
        await resetPassword(identifier);
        form.hidden = true;
        success.hidden = false;
    } catch (error) {
        console.error(error);
        // Não revela se o e-mail existe: mostra sucesso também para "usuário não encontrado".
        if (error.code === "auth/user-not-found") {
            form.hidden = true;
            success.hidden = false;
            return;
        }
        showFormError(errorBox, friendlyError(error, "Não foi possível enviar o e-mail. Tente novamente."));
        setButtonLoading(submit, false);
    }
});
