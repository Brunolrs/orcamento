import { appState } from '../state.js';
import { formatBRL, formatMonthLabel } from '../utils.js';

export function renderConferenceModal() {
    let modal = document.getElementById('conference-modal');
    
    // Cria o modal dinamicamente se não existir
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'conference-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-height: 90vh; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h2>🧮 Auditoria de Cálculos</h2>
                    <button class="close-btn" onclick="document.getElementById('conference-modal').style.display='none'">&times;</button>
                </div>
                <div class="modal-body" id="conference-body" style="background: var(--input-bg);">
                    </div>
                <div style="padding: 15px; background: var(--ios-card); border-top: 1px solid var(--border-color);">
                    <button class="btn-block" onclick="document.getElementById('conference-modal').style.display='none'" style="background: var(--border-color); color: var(--ios-text);">Fechar</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    const body = document.getElementById('conference-body');
    const view = appState.currentViewMonth;
    
    // --- 1. FILTRAGEM DE DADOS ---
    let txs = [];
    let incomes = [];
    
    if (view === "ALL") {
        txs = appState.transactions;
        Object.values(appState.incomeDetails).forEach(arr => incomes.push(...arr));
    } else {
        txs = appState.transactions.filter(t => t.billMonth === view);
        incomes = appState.incomeDetails[view] || [];
    }

    // --- 2. CÁLCULOS DETALHADOS ---
    // Renda
    const totalIncome = incomes.reduce((sum, item) => sum + item.val, 0);

    // Gastos e Estornos
    let grossExpense = 0; // Soma de tudo que é positivo (Gasto)
    let totalRefunds = 0; // Soma de tudo que é negativo (Estorno)
    
    // Métodos de Pagamento
    let creditTotal = 0; // Fatura do Cartão
    let debitTotal = 0;  // Saiu da Conta/Pix

    txs.forEach(t => {
        if (t.amount > 0) {
            grossExpense += t.amount;
            if (t.paymentMethod === 'debit') debitTotal += t.amount;
            else creditTotal += t.amount;
        } else {
            totalRefunds += Math.abs(t.amount);
            // Se foi estorno no crédito, abate do total de crédito
            if (t.paymentMethod === 'debit') debitTotal -= Math.abs(t.amount);
            else creditTotal -= Math.abs(t.amount);
        }
    });

    const netExpense = grossExpense - totalRefunds;
    const finalBalance = totalIncome - netExpense;

    // Orçamento
    const budgetConfigured = (view !== "ALL" && appState.monthlyBudgets[view]) ? appState.monthlyBudgets[view] : 0;
    const budgetDiff = budgetConfigured - grossExpense; 

    // --- 3. GERAÇÃO DO HTML (ESTILO "RECIBO") ---
    
    const rowStyle = "display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #ccc; font-size: 14px;";
    const headerStyle = "font-weight: 800; color: var(--ios-text-sec); font-size: 11px; text-transform: uppercase; margin-top: 20px; margin-bottom: 5px;";
    const totalStyle = "display: flex; justify-content: space-between; padding: 12px 0; font-weight: 800; font-size: 16px; color: var(--ios-text);";

    body.innerHTML = `
        <div style="background: var(--ios-card); padding: 20px; border-radius: 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <div style="text-align:center; margin-bottom: 15px; font-weight: 600; color: var(--ios-blue);">
                ${view === 'ALL' ? 'RELATÓRIO GERAL' : formatMonthLabel(view).toUpperCase()}
            </div>

            <div style="${headerStyle}">FLUXO DE CAIXA</div>
            <div style="${rowStyle}">
                <span>(+) Entradas (Renda)</span>
                <span style="color: var(--ios-green);">${formatBRL(totalIncome)}</span>
            </div>
            <div style="${rowStyle}">
                <span>(-) Saídas Brutas</span>
                <span style="color: var(--ios-red);">${formatBRL(grossExpense)}</span>
            </div>
            <div style="${rowStyle}">
                <span>(+) Estornos/Devoluções</span>
                <span style="color: var(--ios-green);">${formatBRL(totalRefunds)}</span>
            </div>
            <div style="${totalStyle}; border-top: 2px solid var(--ios-text);">
                <span>(=) SALDO FINAL</span>
                <span style="color: ${finalBalance >= 0 ? 'var(--ios-green)' : 'var(--ios-red)'}">${formatBRL(finalBalance)}</span>
            </div>

            <div style="${headerStyle}">MÉTODOS DE PAGAMENTO (LÍQUIDO)</div>
             <div style="${rowStyle}">
                <span>💳 Cartão de Crédito</span>
                <span>${formatBRL(creditTotal)}</span>
            </div>
            <div style="${rowStyle}">
                <span>💸 Débito / Pix / Dinheiro</span>
                <span>${formatBRL(debitTotal)}</span>
            </div>
            <div style="${totalStyle}">
                <span>(=) TOTAL GASTO REAL</span>
                <span>${formatBRL(creditTotal + debitTotal)}</span>
            </div>

            ${budgetConfigured > 0 ? `
                <div style="${headerStyle}">ORÇAMENTO (METAS)</div>
                <div style="${rowStyle}">
                    <span>Meta Definida</span>
                    <span>${formatBRL(budgetConfigured)}</span>
                </div>
                 <div style="${rowStyle}">
                    <span>Total Gasto (Bruto)</span>
                    <span>${formatBRL(grossExpense)}</span>
                </div>
                 <div style="${totalStyle}">
                    <span>(=) DIFERENÇA</span>
                    <span style="color: ${budgetDiff >= 0 ? 'var(--ios-green)' : 'var(--ios-red)'}">${formatBRL(budgetDiff)}</span>
                </div>
            ` : ''}

            <div style="${headerStyle}">ESTATÍSTICAS</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                <div style="background: var(--input-bg); padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: 800;">${txs.length}</div>
                    <div style="font-size: 10px; color: #8E8E93;">TRANSAÇÕES</div>
                </div>
                 <div style="background: var(--input-bg); padding: 10px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 20px; font-weight: 800;">${incomes.length}</div>
                    <div style="font-size: 10px; color: #8E8E93;">FONTES DE RENDA</div>
                </div>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}