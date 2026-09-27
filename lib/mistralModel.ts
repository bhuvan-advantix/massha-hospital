// Keep report formatting and analysis on the same default model as the chatbot.
// Deployments can select another enabled model through MISTRAL_MODEL.
export function getMistralModel() {
    return process.env.MISTRAL_MODEL || 'open-mistral-7b';
}
