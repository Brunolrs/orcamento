/**
 * SERVIÇO DE NOTIFICAÇÃO WHATSAPP
 */
import { formatBRL } from '../utils.js';

export function checkAndSendBudgetAlert(currentUsagePercent, budgetTotal, currentGross, currentMonth) {
    // Níveis de alerta desejados
    const thresholds = [75, 85, 90, 100];
    
    // Encontra o maior nível atingido que ainda não foi notificado
    // Ex: Se usou 87%, o maior nível atingido é 85.
    const triggeredThreshold = thresholds
        .filter(t => currentUsagePercent >= t)
        .pop(); // Pega o último (maior)

    if (!triggeredThreshold) return null;

    return triggeredThreshold;
}

export function sendWhatsAppMessage(percent, budgetTotal, currentGross, currentMonth, income, totalCredit, totalDebit) {
    const remaining = budgetTotal - currentGross;
    const status = remaining < 0 ? "⛔ ESTOURADO" : "⚠️ ATENÇÃO";
    
    // Formatação da Mensagem (Markdown do WhatsApp)
    const text = `
*${status}: Orçamento em ${percent}%* 📅 *Mês:* ${currentMonth}

📉 *Resumo do Orçamento:*
🎯 Meta: ${formatBRL(budgetTotal)}
💸 Gastos: ${formatBRL(currentGross)}
💰 Restante: ${formatBRL(remaining)}

📊 *Detalhes Financeiros:*
Renda: ${formatBRL(income)}
Cartão Crédito: ${formatBRL(totalCredit)}
Débito/Pix: ${formatBRL(totalDebit)}

_Gerado pelo Gestor Financeiro_
    `.trim();

    // Codifica para URL
    const encodedText = encodeURIComponent(text);
    
    // Abre o WhatsApp (Substitua o número abaixo pelo SEU número se quiser enviar para si mesmo, 
    // ou deixe vazio para escolher o contato na hora)
    // Exemplo com número fixo: `https://wa.me/5511999999999?text=${encodedText}`
    const url = `https://wa.me/?text=${encodedText}`;
    
    // Abre em nova aba
    window.open(url, '_blank');
}