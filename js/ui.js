/**
 * UI E RENDERIZAÇÃO
 * Responsável por desenhar a tela, gráficos e lidar com gestos mobile.
 */
import { appState } from './state.js';
import { CHART_COLORS } from './config.js';
import { formatBRL, formatMonthLabel, vibrate } from './utils.js';

let chartInstance = null;

// --- HELPER DE COR ---
// Retorna a cor personalizada ou a cor padrão cíclica
function getColorForCategory(cat) {
    if (appState.categoryColors && appState.categoryColors[cat]) {
        return appState.categoryColors[cat];
    }
    const index = appState.categories.indexOf(cat);
    // Fallback cíclico se não tiver cor salva
    return CHART_COLORS[index % CHART_COLORS.length] || '#8E8E93';
}

// --- SELETOR DE MÊS ---
export function initViewSelector(onChangeCallback) {
    const select = document.getElementById('view-month');
    select.innerHTML = '';
    
    const optAll = document.createElement('option');
    optAll.value = "ALL";
    optAll.text = "📊 Visão Geral (Tudo)";
    select.add(optAll);

    // Cria lista de meses únicos baseados nas transações
    const months = Array.from(new Set(appState.transactions.map(t => t.billMonth))).sort().reverse();
    months.forEach(m => { 
        const opt = document.createElement('option'); 
        opt.value = m; 
        opt.text = formatMonthLabel(m); 
        select.add(opt); 
    });

    // Seleção padrão
    if (!appState.currentViewMonth) appState.currentViewMonth = months.length > 0 ? months[0] : "ALL";
    if (appState.currentViewMonth !== "ALL" && !months.includes(appState.currentViewMonth)) appState.currentViewMonth = "ALL";
    
    select.value = appState.currentViewMonth;
    if(onChangeCallback) onChangeCallback();
}

// --- FILTRO PRINCIPAL ---
export function filterAndRender() {
    const view = appState.currentViewMonth;
    let txs = [];
    let currentIncome = 0;
    let labelText = "";

    // Filtra transações e calcula renda baseada na visão (Mês ou Tudo)
    if (view === "ALL") {
        txs = appState.transactions;
        Object.values(appState.incomeDetails).forEach(list => list.forEach(i => currentIncome += i.val));
        labelText = "Renda Acumulada";
    } else {
        txs = appState.transactions.filter(t => t.billMonth === view);
        (appState.incomeDetails[view] || []).forEach(i => currentIncome += i.val);
        labelText = `Renda de ${formatMonthLabel(view).split(' ')[0]}`;
    }

    // Atualiza input de renda
    const inputEl = document.getElementById('monthly-income');
    inputEl.value = currentIncome > 0 ? currentIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "0,00";
    document.getElementById('income-label-text').innerText = labelText;
    
    // Botão de gerenciar renda só aparece na visão mensal
    document.getElementById('btn-manage-income').style.display = (view === "ALL") ? "none" : "flex";

    renderListsAndCharts(txs, currentIncome);
}

// --- RENDERIZAÇÃO DA LISTA E DASHBOARD ---
function renderListsAndCharts(transactions, currentIncome) {
    const output = document.getElementById('output');
    output.innerHTML = '';

    let gross = 0, refunds = 0;
    const catTotals = {};
    const grouped = {};
    
    // Inicializa grupos
    appState.categories.forEach(c => grouped[c] = []);
    if(!grouped["Outros"]) grouped["Outros"] = [];

    // Ordena por data (mais recente primeiro)
    transactions.sort((a,b) => {
        const [da, ma, ya] = a.date.split('.'); 
        const [db, mb, yb] = b.date.split('.');
        return new Date(yb, mb-1, db) - new Date(ya, ma-1, da);
    }).reverse(); 

    // Calcula totais
    transactions.forEach(t => {
        let cat = appState.categories.includes(t.category) ? t.category : "Outros";
        grouped[cat].push(t);
        if(t.amount > 0) { 
            gross += t.amount; 
            catTotals[cat] = (catTotals[cat] || 0) + t.amount; 
        } else { 
            refunds += Math.abs(t.amount); 
        }
    });

    const net = gross - refunds;
    const leftover = currentIncome - net;
    
    // Atualiza Cards do Dashboard
    document.getElementById('month-gross').innerText = formatBRL(gross);
    document.getElementById('month-refunds').innerText = "- " + formatBRL(refunds);
    document.getElementById('month-net').innerText = formatBRL(net);
    const leftoverEl = document.getElementById('month-leftover');
    leftoverEl.innerText = formatBRL(leftover);
    leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';
    
    // Atualiza Gráficos
    updateChart(catTotals);
    renderCategorySummary(catTotals, gross);

    // --- RENDERIZA LISTA DETALHADA ---
    Object.keys(grouped).sort().forEach(cat => {
        const items = grouped[cat];
        if(!items || items.length === 0) return;
        
        // Cabeçalho da Categoria
        const catGroup = document.createElement('div');
        catGroup.className = 'cat-group';
        catGroup.innerHTML = `<div class="cat-header"><span class="cat-name">${cat}</span><span class="cat-name" style="color: var(--ios-text);">${formatBRL(catTotals[cat] || 0)}</span></div>`;
        
        const listBox = document.createElement('div');
        listBox.className = 'list-box';
        
        items.forEach(item => {
            const isRefund = item.amount < 0;
            const div = document.createElement('div');
            div.className = 'tx-item';

            // Lógica de Swipe (Deslizar para excluir) - Mobile First
            let touchStartX = 0;
            let touchEndX = 0;
            div.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
            div.addEventListener('touchend', e => {
                touchEndX = e.changedTouches[0].screenX;
                // Se deslizou > 100px para a esquerda
                if (touchStartX - touchEndX > 100) {
                    vibrate(50);
                    window.deleteTransaction(item.id);
                }
            });

            if (appState.isEditMode) {
                // --- MODO EDIÇÃO (INPUTS) ---
                const options = appState.categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('');
                const [d, m, y] = item.date.split('.');
                const dateISO = `${y}-${m}-${d}`;

                div.innerHTML = `
                    <div class="tx-row-edit">
                        <div style="flex:2; min-width: 120px;">
                            <input type="text" class="edit-input" value="${item.description}" 
                                onchange="window.updateTx('${item.id}', 'description', this.value)">
                            <input type="date" class="edit-input" value="${dateISO}" 
                                onchange="window.updateTx('${item.id}', 'date', this.value)">
                        </div>
                        <div style="flex:1; min-width: 100px;">
                            <input type="number" inputmode="decimal" class="edit-input" value="${Math.abs(item.amount)}" step="0.01" 
                                onchange="window.updateTx('${item.id}', 'amount', this.value)">
                            <select class="edit-select" 
                                onchange="window.updateTx('${item.id}', 'category', this.value)">${options}</select>
                        </div>
                        <button class="btn-row-delete" onclick="window.deleteTransaction('${item.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>`;
            } else {
                // --- MODO VISUALIZAÇÃO (CLEAN) ---
                div.onclick = () => window.editTransaction(item.id);
                div.innerHTML = `
                    <div class="tx-row-main">
                        <div class="tx-main">
                            <span class="tx-desc">${item.description}</span>
                            <span class="tx-date">${item.date}</span>
                        </div>
                        <div class="tx-side">
                            <span class="tx-val ${isRefund ? 'color-pos' : 'color-neg'}">
                                ${isRefund ? '+ ' : ''}${formatBRL(Math.abs(item.amount))}
                            </span>
                            <div class="cat-row-info">
                                <span class="tx-cat-label">${item.category}</span>
                            </div>
                        </div>
                    </div>`;
            }
            listBox.appendChild(div);
        });
        catGroup.appendChild(listBox);
        output.appendChild(catGroup);
    });

    // Botão "Salvar Alterações" (Aparece apenas no modo edição)
    if (appState.isEditMode) {
        const saveBar = document.createElement('div');
        saveBar.className = 'save-edit-bar';
        saveBar.innerHTML = `<button class="btn-finish-edit" onclick="window.toggleEditMode()"><i class="fa-solid fa-check"></i> Salvar Alterações</button>`;
        output.appendChild(saveBar);
    }
}

// --- RESUMO DE CATEGORIAS (Barras de Progresso) ---
function renderCategorySummary(catTotals, totalGross) {
    const container = document.getElementById('category-summary-area');
    if(!container) return;
    container.innerHTML = '';
    const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
    
    sortedCats.forEach(cat => {
        const val = catTotals[cat];
        if (val <= 0) return;
        const percent = totalGross > 0 ? (val / totalGross) * 100 : 0;
        
        // Usa cor personalizada
        const color = getColorForCategory(cat);
        
        const div = document.createElement('div');
        div.className = 'cat-summary-card';
        div.innerHTML = `
            <div class="cat-sum-header">
                <span>${cat}</span>
                <span>${percent.toFixed(1)}%</span>
            </div>
            <div class="cat-sum-val">${formatBRL(val)}</div>
            <div class="cat-progress-bg">
                <div class="cat-progress-bar" style="width: ${percent}%; background-color: ${color};"></div>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- GRÁFICO (Chart.js) ---
function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    const activeCats = Object.keys(data).filter(k => data[k] > 0);
    const values = activeCats.map(k => data[k]);
    
    // Mapeia cores personalizadas
    const colors = activeCats.map(cat => getColorForCategory(cat));

    if(chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels: activeCats, 
            datasets: [{ 
                data: values, 
                backgroundColor: colors, 
                borderWidth: 0 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '70%', 
            plugins: { 
                legend: { display: false }, // Legenda removida
                tooltip: { 
                    callbacks: { 
                        label: function(context) { 
                            return ` ${context.label}: ${context.parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`; 
                        } 
                    } 
                } 
            } 
        }
    });
}

// --- LISTA DE RENDAS (Modal) ---
export function renderIncomeList() {
    const month = appState.currentViewMonth;
    const list = appState.incomeDetails[month] || [];
    const container = document.getElementById('income-list-area');
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
    document.getElementById('modal-income-total').innerText = formatBRL(total);
}

// --- GERENCIADOR DE CATEGORIAS (Modal) ---
export function renderCategoryManager() {
    const list = document.getElementById('categories-list');
    list.innerHTML = '';
    const cats = Object.keys(appState.categoryRules).sort();

    cats.forEach(cat => {
        const keywords = appState.categoryRules[cat];
        const currentColor = getColorForCategory(cat);
        const isDefault = cat === "Outros";

        const div = document.createElement('div');
        div.className = 'cat-edit-item';
        
        // Cabeçalho com: Cor Picker, Nome Editável, Botão Delete
        div.innerHTML = `
            <div class="cat-edit-header" style="gap: 10px;">
                <input type="color" value="${currentColor}" 
                    style="width: 30px; height: 30px; border: none; background: none; padding: 0;"
                    onchange="window.updateCategoryColor('${cat}', this.value)">
                
                <input type="text" value="${cat}" class="form-input" 
                    style="height: 36px; font-weight: bold; color: var(--ios-blue);"
                    ${isDefault ? 'disabled' : ''}
                    onchange="window.renameCategory('${cat}', this.value)">
                
                ${!isDefault ? `<button class="btn-delete-cat" onclick="deleteCategory('${cat}')"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
        `;
        
        // Palavras-chave
        const keysArea = document.createElement('div');
        keysArea.className = 'keywords-area';
        keywords.forEach(word => {
            const tag = document.createElement('span'); tag.className = 'keyword-tag';
            tag.innerHTML = `${word} <span class="keyword-remove" onclick="removeKeyword('${cat}', '${word}')">&times;</span>`;
            keysArea.appendChild(tag);
        });
        
        const input = document.createElement('input'); input.className = 'keyword-add-input'; input.placeholder = '+ Palavra';
        input.addEventListener('keypress', (e) => { 
            if(e.key === 'Enter' && input.value.trim()) window.addKeyword(cat, input.value.trim().toUpperCase()); 
        });
        
        keysArea.appendChild(input);
        div.appendChild(keysArea);
        list.appendChild(div);
    });
}