// Upload e leitura de documentos no Firebase Storage.
import { storage } from "../firebase-config.js";
import { ref, uploadBytesResumable, getDownloadURL } from "../lib/storage.js";
import { userError } from "../utils.js";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // precisa bater com storage.rules
const MAX_IMAGE_SIDE = 2000;

const EXTENSION_TYPES = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif"
};

function extensionOf(name) {
    const match = /\.([a-z0-9]+)$/i.exec(name || "");
    return match ? match[1].toLowerCase() : "";
}

// Alguns celulares não informam o tipo do arquivo; deduz pela extensão.
export function contentTypeOf(file) {
    return file.type || EXTENSION_TYPES[extensionOf(file.name)] || "application/octet-stream";
}

export function isAllowedFile(file) {
    const type = contentTypeOf(file);
    return type.startsWith("image/") || type === "application/pdf";
}

export function validateFile(file) {
    if (!file) return "Selecione um arquivo.";
    if (!isAllowedFile(file)) return "Envie uma foto ou um arquivo PDF.";
    if (file.size > MAX_FILE_SIZE) return "O arquivo tem mais de 10 MB. Tire uma nova foto ou envie um PDF menor.";
    if (file.size === 0) return "O arquivo está vazio.";
    return "";
}

// Reduz fotos grandes da câmera antes do envio (economiza dados móveis).
export async function prepareFile(file) {
    const type = contentTypeOf(file);
    if (!type.startsWith("image/") || type === "image/gif" || file.size < 1.2 * 1024 * 1024) return file;
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
        if (!blob || blob.size >= file.size) return file;
        const baseName = (file.name || "foto").replace(/\.[^.]+$/, "");
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    } catch (error) {
        console.warn("Não foi possível otimizar a imagem; enviando original.", error);
        return file;
    }
}

export function buildRequestFilePath({ municipalityId, patientId, requestId, documentType, file, index = 0 }) {
    const extension = extensionOf(file.name) || (contentTypeOf(file) === "application/pdf" ? "pdf" : "jpg");
    const slug = documentType.toLowerCase().replace(/_/g, "-");
    return `municipalities/${municipalityId}/patients/${patientId}/requests/${requestId}/${slug}-${Date.now()}-${index}.${extension}`;
}

export function uploadFile(path, file, onProgress) {
    const problem = validateFile(file);
    if (problem) return Promise.reject(userError(problem));

    return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, path), file, { contentType: contentTypeOf(file) });
        task.on(
            "state_changed",
            (snapshot) => onProgress?.(snapshot.bytesTransferred, snapshot.totalBytes),
            reject,
            () => resolve({ path, size: file.size, contentType: contentTypeOf(file) })
        );
    });
}

export function getFileUrl(path) {
    return getDownloadURL(ref(storage, path));
}

export function isImagePath(path) {
    return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(path || "");
}
