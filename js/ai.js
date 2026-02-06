/**
 * AI SERVICE - Integração com Google Gemini
 */
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// ⚠️ COLE SUA API KEY ABAIXO (Mantenha as aspas)
const API_KEY = "AIzaSyCfIJzICTpP52Oh7USRwAQQH3uWdddWZgA"; 

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Classifica uma lista de transações usando IA
 */
export async function categorizeWithAI(descriptions, categories) {
    if (!descriptions || descriptions.length === 0) return {};

    // Remove duplicatas para economizar tokens
    const uniqueDesc = [...new Set(descriptions)];
    // Pega apenas as primeiras 50 para não estourar limite (fazemos em lotes se precisar futuramente)
    const batch = uniqueDesc.slice(0, 50);

    const prompt = `
    Você é um assistente financeiro. Classifique as despesas abaixo em uma das seguintes categorias:
    ${JSON.stringify(categories)}
    
    Regras:
    1. Responda APENAS um JSON válido. Sem markdown, sem aspas extras.
    2. Formato: { "NOME DA COMPRA": "CATEGORIA" }
    3. Se não souber, use "Outros".
    
    Despesas:
    ${JSON.stringify(batch)}
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();
        
        // Limpeza de segurança para garantir JSON puro
        text = text.replace(/```json|```/g, '').trim();
        
        return JSON.parse(text);
    } catch (error) {
        console.error("Erro na IA:", error);
        return {}; // Retorna vazio em caso de falha para não travar o app
    }
}