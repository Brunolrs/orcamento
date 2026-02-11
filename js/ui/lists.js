import { appState } from '../state.js';
import { formatBRL, vibrate } from '../utils.js';
import { updateCharts, getColorForCategory } from './charts.js';
// Importa o serviço do Telegram
import { checkBudgetThreshold, sendTelegramAlert } from '../services/telegram.js';

export function renderListsAndCharts(transactions, currentIncome) {
    const output = document.getElementById('output');
    if(output) output.innerHTML = '';

    let gross = 0, refunds = 0, totalDebit = 0, totalCredit = 0;
    const catTotals = {};
    const grouped = {};

    appState.categories.forEach(c => grouped[c] = []);
    if (!grouped["Outros"]) grouped["Outros"] = [];

    // Ordenação
    transactions.sort((a, b) => {
        const [da, ma, ya] = a.date.split('.'); const [db, mb, yb] = b.date.split('.');
        return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
    });

    // Cálculos
    transactions.forEach(t => {
        let cat = appState.categories.includes(t.category) ? t.category : "Outros";
        grouped[cat].push(t);

        if (t.amount > 0) { // Despesa
            gross += t.amount;
            catTotals[cat] = (catTotals[cat] || 0) + t.amount;
            if (t.paymentMethod === 'debit') totalDebit += t.amount;
            else totalCredit += t.amount;
        } else { // Reembolso
            refunds += Math.abs(t.amount);
            totalCredit -= Math.abs(t.amount);
        }
    });

    // Atualizações Visuais
    updateDashboardCards(gross, refunds, currentIncome, totalCredit, totalDebit);
    
    // Barra de Orçamento (AQUI ESTÁ A LÓGICA DO TELEGRAM)
    renderBudgetBar(gross, currentIncome, totalCredit, totalDebit);
    
    updateCharts(catTotals); 
    renderCategorySummary(catTotals, gross);
    renderTransactionList(grouped, catTotals, output);
}

function updateDashboardCards(gross, refunds, income, credit, debit) {
    const net = gross - refunds;
    const leftover = income - net;
    
    const grossEl = document.getElementById('month-gross');
    if(grossEl) grossEl.innerText = formatBRL(gross);
    
    const refEl = document.getElementById('month-refunds');
    if(refEl) refEl.innerText = "- " + formatBRL(refunds);
    
    const netEl = document.getElementById('month-net');
    if(netEl) netEl.innerText = formatBRL(net);
    
    const leftoverEl = document.getElementById('month-leftover');
    if(leftoverEl) {
        leftoverEl.innerText = formatBRL(leftover);
        leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';
    }

    const creditDisplay = document.getElementById('total-credit-display');
    const debitDisplay = document.getElementById('total-debit-display');
    if(creditDisplay) creditDisplay.innerText = formatBRL(Math.max(0, credit));
    if(debitDisplay) debitDisplay.innerText = formatBRL(debit);
}

function renderBudgetBar(gross, income, totalCredit, totalDebit) {
    const view = appState.currentViewMonth;
    const budgetEl = document.getElementById('budget-remaining');
    if (!budgetEl) return;

    const currentBudget = (view !== "ALL" && appState.monthlyBudgets[view]) ? appState.monthlyBudgets[view] : 0;
    budgetEl.innerHTML = '';

    // Reseta notificações se o usuário mudou de mês na visualização
    // (Para garantir que ele receba alertas do mês que está olhando se editar algo)
    if (appState.lastCheckedMonth !== view) {
        appState.sentNotifications = [];
        appState.lastCheckedMonth = view;
    }

    if (view === "ALL" || currentBudget === 0) {
        budgetEl.innerText = "---";
        budgetEl.style.color = "var(--ios-text)";
    } else {
        const budgetRemaining = currentBudget - gross;
        const percent = Math.min((gross / currentBudget) * 100, 100);
        let barColor = percent > 90 ? '#FF3B30' : percent > 75 ? '#FFCC00' : '#4CD964';

        // --- AUTOMAÇÃO TELEGRAM (SEM CONFIRMAÇÃO) ---
        const alertLevel = checkBudgetThreshold(percent);
        
        // Se atingiu um nível crítico E ainda não enviou aviso hoje/sessão
        if (alertLevel && !appState.sentNotifications.includes(alertLevel)) {
            
            // 1. Marca como enviado IMEDIATAMENTE (evita loop infinito de envios)
            appState.sentNotifications.push(alertLevel);
            
            // 2. Dispara o envio silencioso
            sendTelegramAlert(alertLevel, currentBudget, gross, view, income, totalCredit, totalDebit);
            
            // 3. Feedback visual no console e vibração
            console.log(`🚀 Enviando alerta de ${alertLevel}% para o Telegram...`);
            vibrate(200); 
        }
        // ----------------------------------------------

        budgetEl.innerHTML = `
            <div style="font-size: 18px; font-weight: 800; color: ${budgetRemaining >= 0 ? 'var(--ios-green)' : 'var(--ios-red)'}">${formatBRL(budgetRemaining)}</div>
            <div style="font-size: 11px; color: #8E8E93; margin-top: 5px; display:flex; justify-content:space-between;"><span>${percent.toFixed(0)}% utilizado</span></div>
            <div style="height: 6px; background: #E5E5EA; border-radius: 4px; margin-top: 5px; overflow: hidden;">
                <div style="height: 100%; width: ${percent}%; background: ${barColor}; transition: width 0.5s ease;"></div>
            </div>`;
    }
}

function renderCategorySummary(catTotals, totalGross) {
    const container = document.getElementById('category-summary-area');
    if (!container) return;
    container.innerHTML = '';
    
    Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]).forEach(cat => {
        const val = catTotals[cat];
        if (val <= 0) return;
        const percent = totalGross > 0 ? (val / totalGross) * 100 : 0;
        const color = getColorForCategory(cat);
        
        const isSelected = appState.selectedCategory === cat;
        const opacity = (appState.selectedCategory && !isSelected) ? '0.3' : '1';
        const border = isSelected ? `2px solid ${color}` : 'none';
        
        const div = document.createElement('div');
        div.className = 'cat-summary-card';
        div.style.cursor = 'pointer';
        div.style.opacity = opacity;
        div.style.border = border;
        div.style.transition = 'all 0.2s ease';

        div.innerHTML = `
            <div class="cat-sum-header"><span>${cat}</span><span>${percent.toFixed(1)}%</span></div>
            <div class="cat-sum-val">${formatBRL(val)}</div>
            <div class="cat-progress-bg"><div class="cat-progress-bar" style="width: ${percent}%; background-color: ${color};"></div></div>
        `;
        
        div.onclick = () => {
            vibrate(30);
            appState.selectedCategory = isSelected ? null : cat;
            import('./index.js').then(mod => mod.filterAndRender());
        };

        container.appendChild(div);
    });
}

function renderTransactionList(grouped, catTotals, output) {
    if(!output) return;
    
    if (appState.selectedCategory) {
        const filterHeader = document.createElement('div');
        filterHeader.style.cssText = "padding: 12px 20px; background: var(--input-bg); margin-bottom: 20px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--ios-blue); animation: fadeIn 0.3s ease;";
        
        filterHeader.innerHTML = `
            <span style="font-weight: 600; color: var(--ios-blue); font-size: 14px;">
                <i class="fa-solid fa-filter"></i> Filtrado por: <strong>${appState.selectedCategory}</strong>
            </span>
            <button id="btn-clear-filter" style="background:none; border:none; color: var(--ios-text-sec); font-size: 12px; cursor: pointer; font-weight:700; padding: 5px;">LIMPAR ✕</button>
        `;
        output.appendChild(filterHeader);
        
        filterHeader.querySelector('#btn-clear-filter').addEventListener('click', () => {
            vibrate(30);
            appState.selectedCategory = null;
            import('./index.js').then(mod => mod.filterAndRender());
        });
    }

    Object.keys(grouped).sort().forEach(cat => {
        if (appState.selectedCategory && appState.selectedCategory !== cat) return;

        const items = grouped[cat];
        if (!items || items.length === 0) return;

        const catGroup = document.createElement('div');
        catGroup.className = 'cat-group';
        catGroup.innerHTML = `<div class="cat-header"><span class="cat-name">${cat}</span><span class="cat-name" style="color: var(--ios-text);">${formatBRL(catTotals[cat] || 0)}</span></div>`;

        const listBox = document.createElement('div');
        listBox.className = 'list-box';

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'tx-item';
            
            let touchStartX = 0;
            div.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, {passive: true});
            div.addEventListener('touchend', e => {
                if (touchStartX - e.changedTouches[0].screenX > 100) { vibrate(50); window.deleteTransaction(item.id); }
            });

            if (appState.isEditMode) {
               const options = appState.categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('');
               const [d, m, y] = item.date.split('.');
               const dateBuyISO = `${y}-${m}-${d}`;
               let dateInvISO = item.invoiceDate ? `${item.invoiceDate.split('.')[2]}-${item.invoiceDate.split('.')[1]}-${item.invoiceDate.split('.')[0]}` : `${item.billMonth}-10`;

               div.innerHTML = `
                  <div class="tx-row-edit">
                    <div style="width: 100%; margin-bottom: 5px;"><input type="text" class="edit-input" value="${item.description}" onchange="window.updateTx('${item.id}', 'description', this.value)"></div>
                    <div style="display: flex; gap: 5px; width: 100%; margin-bottom: 5px;">
                      <div style="flex:1;"><input type="date" class="edit-input" value="${dateBuyISO}" onchange="window.updateTx('${item.id}', 'date', this.value)"></div>
                      <div style="flex:1;"><input type="date" class="edit-input" value="${dateInvISO}" style="color:var(--ios-blue);" onchange="window.updateTx('${item.id}', 'invoiceDate', this.value)"></div>
                    </div>
                    <div style="display:flex; gap: 5px; width: 100%; align-items: center;">
                      <input type="number" class="edit-input" value="${Math.abs(item.amount)}" step="0.01" onchange="window.updateTx('${item.id}', 'amount', this.value)" style="flex: 1;">
                      <select class="edit-select" style="flex: 1;" onchange="window.updateTx('${item.id}', 'category', this.value)">${options}</select>
                      <button class="btn-row-delete" onclick="window.deleteTransaction('${item.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                  </div>`;
            } else {
               div.onclick = () => window.editTransaction(item.id);
               const iconMethod = (item.paymentMethod === 'debit') ? '<i class="fa-solid fa-money-bill-wave" style="font-size:10px; color:#34C759; margin-left:5px;"></i>' : '';
               const isRefund = item.amount < 0;
               div.innerHTML = `
                  <div class="tx-row-main">
                    <div class="tx-main"><span class="tx-desc">${item.description}</span><span class="tx-date">${item.date} ${iconMethod}</span></div>
                    <div class="tx-side"><span class="tx-val ${isRefund ? 'color-pos' : 'color-neg'}">${isRefund ? '+ ' : ''}${formatBRL(Math.abs(item.amount))}</span>
                    <div class="cat-row-info"><span class="tx-cat-label">${item.category}</span></div></div>
                  </div>`;
            }
            listBox.appendChild(div);
        });
        catGroup.appendChild(listBox);
        output.appendChild(catGroup);
    });

    if (appState.isEditMode) {
        const saveBar = document.createElement('div');
        saveBar.className = 'save-edit-bar';
        saveBar.innerHTML = `<button class="btn-finish-edit" onclick="window.toggleEditMode()"><i class="fa-solid fa-check"></i> Salvar Alterações</button>`;
        output.appendChild(saveBar);
    }
}

export function renderIncomeList() {
    const month = appState.currentViewMonth;
    const list = appState.incomeDetails[month] || [];
    const container = document.getElementById('income-list-area');
    if(!container) return;
    
    container.innerHTML = '';
    let total = 0;
    list.forEach((item, index) => {
        total += item.val;
        container.innerHTML += `
            <div class="income-item">
                <div class="income-desc">${item.desc}</div>
                <div style="display:flex; align-items:center;">
                    <span class="income-val">${formatBRL(item.val)}</span>
                    <button class="btn-del-income" onclick="window.removeIncome(${index})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>`;
    });
    
    const totalEl = document.getElementById('modal-income-total');
    if(totalEl) totalEl.innerText = formatBRL(total);
}