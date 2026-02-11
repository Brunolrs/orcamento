import { formatBRL } from '../utils.js';
import { TELEGRAM_CONFIG } from '../config.js';

/**
 * Verifica se atingiu um nível de alerta (75, 85, 90, 100)
 */
export function checkBudgetThreshold(currentPercent) {
    const thresholds = [75, 85, 90, 100];
    // Retorna o maior limiar atingido (ex: se 87%, retorna 85)
    return thresholds.filter(t => currentPercent >= t).pop();
}

/**
 * Envia mensagem automática para o Telegram
 */
export async function sendTelegramAlert(percent, budgetTotal, currentGross, currentMonth, income, totalCredit, totalDebit) {
    // 1. Validação de Segurança
    if (!TELEGRAM_CONFIG.botToken || !TELEGRAM_CONFIG.chatId) {
        console.warn("⚠️ Telegram não configurado em config.js");
        return;
    }

    // 2. Cálculos e Ícones
    const remaining = budgetTotal - currentGross;
    const statusIcon = remaining < 0 ? "🚨" : "⚠️";
    const statusText = remaining < 0 ? "ORÇAMENTO ESTOURADO" : "ALERTA DE CONSUMO";

    // 3. Monta a mensagem (Markdown)
    const message = `
${statusIcon} *${statusText}: ${percent}%*
📅 *Mês:* ${currentMonth}

📉 *Resumo do Orçamento*
🎯 Meta: \`${formatBRL(budgetTotal)}\`
💸 Gastos: \`${formatBRL(currentGross)}\`
💰 Restante: \`${formatBRL(remaining)}\`

📊 *Detalhes Financeiros*
Renda: ${formatBRL(income)}
💳 Cartão: ${formatBRL(totalCredit)}
💸 Débito: ${formatBRL(totalDebit)}

_Enviado automaticamente pelo Gestor Financeiro_
    `.trim();

    // 4. Envia para a API do Telegram
    const url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.botToken}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CONFIG.chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        const data = await response.json();
        if (data.ok) {
            console.log(`✅ Telegram enviado: Alerta de ${percent}%`);
        } else {
            console.error("Erro Telegram API:", data);
        }
    } catch (error) {
        console.error("Erro de conexão Telegram:", error);
    }
}