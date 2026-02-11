/**
 * AI SERVICE - Integração com Google Gemini
 */
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ⚠️ Mantenha sua chave API segura
const API_KEY = "AIzaSyCfIJzICTpP52Oh7USRwAQQH3uWdddWZgA"; 

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Classifica uma lista de descrições usando IA
 * @param {Array<string>} descriptions - Lista de nomes de transações
 * @param {Array<string>} categories - Categorias disponíveis
 */
export async function categorizeWithAI(descriptions, categories) {
    if (!descriptions || descriptions.length === 0) return {};

    // Otimização: Remove duplicatas e limita lote
    const uniqueDesc = [...new Set(descriptions)].slice(0, 50);

    const prompt = `
    Você é um assistente financeiro. Classifique as despesas abaixo em uma das seguintes categorias:
    ${JSON.stringify(categories)}
    
    Regras:
    1. Responda APENAS um JSON válido.
    2. Formato: { "NOME DA COMPRA": "CATEGORIA" }
    3. Se não tiver certeza, use "Outros".
    
    Despesas:
    ${JSON.stringify(uniqueDesc)}
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        // Limpeza de markdown caso a IA devolva ```json ... ```
        text = text.replace(/```json|```/g, '').trim();
        return JSON.parse(text);
    } catch (error) {
        console.error("Erro na IA:", error);
        return {}; // Retorna vazio em caso de erro para não travar o fluxo
    }
}