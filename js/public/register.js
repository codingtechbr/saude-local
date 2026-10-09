// Cadastro do paciente em duas etapas: dados pessoais e acesso.
import { registerPatient } from "../auth.js";
import {
    hydrateIcons, setButtonLoading, bindPasswordToggles, showFormError, setFieldError, clearFieldErrors
} from "../ui.js";
import {
    go, friendlyError, formatCPF, formatPhone, formatCNS, formatCEP, isValidCPF, onlyDigits, bindMask
} from "../utils.js";

hydrateIcons();
bindPasswordToggles();

const form = document.getElementById("register-form");
const steps = [...document.querySelectorAll("[data-step]")];
const stepLabel = document.getElementById("step-label");
const progressBar = document.getElementById("register-progress");
const errorBox = document.getElementById("form-error");
const submit = document.getElementById("register-submit");
let current = 0;

// form.name é o atributo "name" do <form>, não o campo; por isso os campos são lidos via namedItem.
const field = (name) => form.elements.namedItem(name);

bindMask(field("cpf"), formatCPF);
bindMask(field("phone"), formatPhone);
bindMask(field("cns"), formatCNS);
bindMask(field("zipCode"), formatCEP);

function showStep(index) {
    current = index;
    steps.forEach((step, i) => { step.hidden = i !== index; });
    stepLabel.textContent = `Etapa ${index + 1} de ${steps.length}`;
    progressBar.style.width = `${((index + 1) / steps.length) * 100}%`;
    steps[index].querySelector("input")?.focus();
    window.scrollTo(0, 0);
}

function validateStep(index) {
    clearFieldErrors(form);
    const errors = [];
    const check = (input, condition, message) => {
        if (!condition) {
            setFieldError(input, message);
            errors.push(input);
        }
    };

    if (index === 0) {
        check(field("fullName"), field("fullName").value.trim().split(/\s+/).length >= 2, "Informe seu nome completo.");
        check(field("cpf"), isValidCPF(field("cpf").value), "CPF inválido. Confira os números.");
        check(field("birthDate"), Boolean(field("birthDate").value) && new Date(field("birthDate").value) < new Date(), "Informe sua data de nascimento.");
        check(field("cns"), !field("cns").value || onlyDigits(field("cns").value).length === 15, "O Cartão SUS tem 15 números.");
        check(field("phone"), onlyDigits(field("phone").value).length >= 10, "Informe um celular com DDD.");
    } else {
        check(field("email"), /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field("email").value.trim()), "Informe um e-mail válido.");
        check(field("password"), field("password").value.length >= 8, "A senha precisa ter pelo menos 8 caracteres.");
        check(field("passwordConfirm"), field("password").value === field("passwordConfirm").value, "As senhas não conferem.");
        check(field("terms"), field("terms").checked, "É preciso aceitar para continuar.");
    }
    errors[0]?.focus();
    return errors.length === 0;
}

document.getElementById("next-step").addEventListener("click", () => {
    if (validateStep(0)) showStep(1);
});

document.getElementById("prev-step").addEventListener("click", () => showStep(0));

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFormError(errorBox, "");
    if (current === 0) {
        if (validateStep(0)) showStep(1);
        return;
    }
    if (!validateStep(1)) return;

    setButtonLoading(submit, true, "Criando conta...");
    try {
        const data = Object.fromEntries(new FormData(form));
        await registerPatient({ ...data, name: data.fullName });
        go("app/home.html");
    } catch (error) {
        console.error(error);
        showFormError(errorBox, friendlyError(error, "Não foi possível criar a conta. Tente novamente."));
        setButtonLoading(submit, false);
    }
});

showStep(0);
