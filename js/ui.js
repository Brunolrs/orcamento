/**
 * UI E RENDERIZAÇÃO
 * Versão: V41 (Tendências, Donut, Orçamento Visual e Separação Crédito/Débito)
 */
import { appState } from './state.js';
import { CHART_COLORS } from './config.js';
import { formatBRL, formatMonthLabel, vibrate } from './utils.js';

// Variáveis globais para controlar as instâncias dos gráficos
let chartInstance = null;      // Gráfico de Categorias (Donut)
let trendChartInstance = null; // Gráfico de Tendência (Barras)

// --- HELPER DE COR ---
function getColorForCategory(cat) {
  if (appState.categoryColors && appState.categoryColors[cat]) {
    return appState.categoryColors[cat];
  }
  const index = appState.categories.indexOf(cat);
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

  // Cria lista de meses únicos baseados nas transações existentes
  const months = Array.from(new Set(appState.transactions.map(t => t.billMonth))).sort().reverse();
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.text = formatMonthLabel(m);
    select.add(opt);
  });

  // Define padrão
  if (!appState.currentViewMonth) {
      appState.currentViewMonth = "ALL";
  }
  
  // Validação de segurança se o mês sumiu
  if (appState.currentViewMonth !== "ALL" && !months.includes(appState.currentViewMonth)) {
      appState.currentViewMonth = "ALL";
  }
  
  select.value = appState.currentViewMonth;

  if(onChangeCallback) onChangeCallback();
}

// --- FILTRO PRINCIPAL E ORQUESTRADOR ---
export function filterAndRender() {
  const view = appState.currentViewMonth;
  let txs = [];
  let currentIncome = 0;
  let labelText = "";

  // 1. Filtra as transações e calcula a renda
  if (view === "ALL") {
    txs = appState.transactions;
    Object.values(appState.incomeDetails).forEach(list => list.forEach(i => currentIncome += i.val));
    labelText = "Renda Acumulada";
  } else {
    txs = appState.transactions.filter(t => t.billMonth === view);
    (appState.incomeDetails[view] || []).forEach(i => currentIncome += i.val);
    labelText = `Renda de ${formatMonthLabel(view).split(' ')[0]}`;
  }

  // 2. Atualiza UI de Renda
  const inputEl = document.getElementById('monthly-income');
  inputEl.value = currentIncome > 0
    ? currentIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : "0,00";
  document.getElementById('income-label-text').innerText = labelText;
  
  document.getElementById('btn-manage-income').style.display = (view === "ALL") ? "none" : "flex";

  // 3. Atualiza UI de Orçamento (Input)
  const budgetInput = document.getElementById('month-budget');
  if (budgetInput) {
    if (view === "ALL") {
      budgetInput.value = "";
      budgetInput.disabled = true;
      budgetInput.placeholder = "---";
    } else {
      budgetInput.disabled = false;
      const savedBudget = appState.monthlyBudgets[view] || 0;
      budgetInput.value = savedBudget > 0
        ? savedBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "";
      budgetInput.placeholder = "0,00";
    }
  }

  // 4. Chama a renderização pesada
  renderListsAndCharts(txs, currentIncome);
}

// --- CORE: CÁLCULOS E RENDERIZAÇÃO DA TELA ---
function renderListsAndCharts(transactions, currentIncome) {
  const output = document.getElementById('output');
  output.innerHTML = '';

  let gross = 0, refunds = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const catTotals = {};
  const grouped = {};

  // Inicializa agrupamento
  appState.categories.forEach(c => grouped[c] = []);
  if(!grouped["Outros"]) grouped["Outros"] = [];

  // Ordenação por Data de Compra (Decrescente)
  transactions.sort((a, b) => {
    const [da, ma, ya] = a.date.split('.');
    const [db, mb, yb] = b.date.split('.');
    const ta = new Date(ya, ma - 1, da).getTime();
    const tb = new Date(yb, mb - 1, db).getTime();
    return tb - ta; 
  });

  // Loop Principal de Cálculo
  transactions.forEach(t => {
    let cat = appState.categories.includes(t.category) ? t.category : "Outros";
    grouped[cat].push(t);

    if(t.amount > 0) { // É Despesa
      gross += t.amount;
      catTotals[cat] = (catTotals[cat] || 0) + t.amount;
      
      // Lógica: Crédito vs Débito
      const method = t.paymentMethod || 'credit'; // Se antigo, assume crédito
      if (method === 'debit') {
          totalDebit += t.amount;
      } else {
          totalCredit += t.amount;
      }

    } else { // É Reembolso/Pagamento
      refunds += Math.abs(t.amount);
      totalCredit -= Math.abs(t.amount); // Abate do total de fatura
    }
  });

  const net = gross - refunds;
  const leftover = currentIncome - net;

  // --- ATUALIZA CARDS DO DASHBOARD ---
  document.getElementById('month-gross').innerText = formatBRL(gross);
  document.getElementById('month-refunds').innerText = "- " + formatBRL(refunds);
  document.getElementById('month-net').innerText = formatBRL(net);

  const leftoverEl = document.getElementById('month-leftover');
  leftoverEl.innerText = formatBRL(leftover);
  leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';

  // --- ATUALIZA SUB-TOTAIS (CRÉDITO VS DÉBITO) ---
  const creditDisplay = document.getElementById('total-credit-display');
  const debitDisplay = document.getElementById('total-debit-display');
  
  if(creditDisplay) creditDisplay.innerText = formatBRL(Math.max(0, totalCredit)); // Evita negativo visual
  if(debitDisplay) debitDisplay.innerText = formatBRL(totalDebit);

  // --- BARRA DE PROGRESSO DO ORÇAMENTO ---
  const view = appState.currentViewMonth;
  const budgetEl = document.getElementById('budget-remaining');
  if (budgetEl) {
    const currentBudget = (view !== "ALL" && appState.monthlyBudgets[view]) ? appState.monthlyBudgets[view] : 0;
    
    budgetEl.innerHTML = '';

    if (view === "ALL" || currentBudget === 0) {
      budgetEl.innerText = "---";
      budgetEl.style.color = "var(--ios-text)";
    } else {
      const budgetRemaining = currentBudget - gross;
      const percent = Math.min((gross / currentBudget) * 100, 100);
      
      let barColor = '#4CD964'; // Verde
      if(percent > 75) barColor = '#FFCC00'; // Amarelo
      if(percent > 90) barColor = '#FF3B30'; // Vermelho

      budgetEl.innerHTML = `
        <div style="font-size: 18px; font-weight: 800; color: ${budgetRemaining >= 0 ? 'var(--ios-green)' : 'var(--ios-red)'}">${formatBRL(budgetRemaining)}</div>
        <div style="font-size: 11px; color: #8E8E93; margin-top: 5px; display:flex; justify-content:space-between;">
            <span>${percent.toFixed(0)}% utilizado</span>
        </div>
        <div style="height: 6px; background: #E5E5EA; border-radius: 4px; margin-top: 5px; overflow: hidden;">
            <div style="height: 100%; width: ${percent}%; background: ${barColor}; transition: width 0.5s ease;"></div>
        </div>
      `;
    }
  }

  // --- ATUALIZA GRÁFICOS ---
  // Passamos 'catTotals' para o Donut e a função cuida de gerar o de Tendência também
  updateChart(catTotals);
  
  // --- ATUALIZA RESUMO EM BARRAS ---
  renderCategorySummary(catTotals, gross);

  // --- RENDERIZA A LISTA DE TRANSAÇÕES ---
  Object.keys(grouped).sort().forEach(cat => {
    const items = grouped[cat];
    if(!items || items.length === 0) return;

    const catGroup = document.createElement('div');
    catGroup.className = 'cat-group';

    catGroup.innerHTML = `
      <div class="cat-header">
        <span class="cat-name">${cat}</span>
        <span class="cat-name" style="color: var(--ios-text);">
          ${formatBRL(catTotals[cat] || 0)}
        </span>
      </div>
    `;

    const listBox = document.createElement('div');
    listBox.className = 'list-box';

    items.forEach(item => {
      const isRefund = item.amount < 0;
      const div = document.createElement('div');
      div.className = 'tx-item';

      // Lógica Swipe-to-Delete
      let touchStartX = 0;
      let touchEndX = 0;
      div.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
      div.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 100) {
          vibrate(50);
          window.deleteTransaction(item.id);
        }
      });

      if (appState.isEditMode) {
        // --- MODO EDIÇÃO ---
        const options = appState.categories
          .map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`)
          .join('');

        const [d, m, y] = item.date.split('.');
        const dateBuyISO = `${y}-${m}-${d}`;

        let dateInvISO;
        if(item.invoiceDate) {
          const [di, mi, yi] = item.invoiceDate.split('.');
          dateInvISO = `${yi}-${mi}-${di}`;
        } else {
          const [yb, mb] = item.billMonth.split('-');
          dateInvISO = `${yb}-${mb}-10`;
        }

        div.innerHTML = `
          <div class="tx-row-edit">
            <div style="width: 100%; margin-bottom: 5px;">
              <input type="text" class="edit-input" value="${item.description}"
                onchange="window.updateTx('${item.id}', 'description', this.value)" placeholder="Descrição">
            </div>
            <div style="display: flex; gap: 5px; width: 100%; margin-bottom: 5px;">
              <div style="flex:1;">
                <label style="font-size:10px; color:#8E8E93; font-weight:600; margin-left:2px;">Compra</label>
                <input type="date" class="edit-input" value="${dateBuyISO}"
                  onchange="window.updateTx('${item.id}', 'date', this.value)">
              </div>
              <div style="flex:1;">
                <label style="font-size:10px; color:#007AFF; font-weight:700; margin-left:2px;">Fatura</label>
                <input type="date" class="edit-input" value="${dateInvISO}" style="color:var(--ios-blue); font-weight:600;"
                  onchange="window.updateTx('${item.id}', 'invoiceDate', this.value)">
              </div>
            </div>
            <div style="display:flex; gap: 5px; width: 100%; align-items: center;">
              <input type="number" inputmode="decimal" class="edit-input" value="${Math.abs(item.amount)}" step="0.01"
                onchange="window.updateTx('${item.id}', 'amount', this.value)" style="flex: 1;">
              <select class="edit-select" style="flex: 1;"
                onchange="window.updateTx('${item.id}', 'category', this.value)">${options}</select>
              <button class="btn-row-delete" onclick="window.deleteTransaction('${item.id}')">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>`;
      } else {
        // --- MODO LEITURA ---
        div.onclick = () => window.editTransaction(item.id);
        
        // Ícone se for Débito
        const iconMethod = (item.paymentMethod === 'debit') ? '<i class="fa-solid fa-money-bill-wave" style="font-size:10px; color:#34C759; margin-left:5px;" title="Débito/Pix"></i>' : '';

        div.innerHTML = `
          <div class="tx-row-main">
            <div class="tx-main">
              <span class="tx-desc">${item.description}</span>
              <span class="tx-date">${item.date} ${iconMethod}</span>
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

  if (appState.isEditMode) {
    const saveBar = document.createElement('div');
    saveBar.className = 'save-edit-bar';
    saveBar.innerHTML = `<button class="btn-finish-edit" onclick="window.toggleEditMode()"><i class="fa-solid fa-check"></i> Salvar Alterações</button>`;
    output.appendChild(saveBar);
  }
}

// --- RESUMO DE BARRAS POR CATEGORIA ---
function renderCategorySummary(catTotals, totalGross) {
  const container = document.getElementById('category-summary-area');
  if(!container) return;

  container.innerHTML = '';
  const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);

  sortedCats.forEach(cat => {
    const val = catTotals[cat];
    if (val <= 0) return;

    const percent = totalGross > 0 ? (val / totalGross) * 100 : 0;
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

// --- SISTEMA DE GRÁFICOS (DUPLO) ---
function updateChart(currentMonthData) {
  // 1. GRÁFICO DE DONUT (CATEGORIAS)
  const ctxDonut = document.getElementById('expenseChart').getContext('2d');
  const activeCats = Object.keys(currentMonthData).filter(k => currentMonthData[k] > 0);
  const values = activeCats.map(k => currentMonthData[k]);
  const colors = activeCats.map(cat => getColorForCategory(cat));

  if (chartInstance) chartInstance.destroy();
  
  chartInstance = new Chart(ctxDonut, {
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
      cutout: '65%',
      plugins: {
        legend: { display: false },
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

  // 2. GRÁFICO DE TENDÊNCIA (BARRAS - 6 MESES)
  renderTrendChart();
}

function renderTrendChart() {
    const ctxTrend = document.getElementById('trendChart');
    if(!ctxTrend) return; 

    // Agrupa gastos totais por mês (Histórico completo)
    const monthlyTotals = {};
    
    appState.transactions.forEach(t => {
        if (t.amount > 0) { // Considera apenas gastos
            if (!monthlyTotals[t.billMonth]) monthlyTotals[t.billMonth] = 0;
            monthlyTotals[t.billMonth] += t.amount;
        }
    });

    // Pega os últimos 6 meses cronologicamente
    const sortedMonths = Object.keys(monthlyTotals).sort();
    const last6Months = sortedMonths.slice(-13);
    
    // Gera Labels (Jan, Fev...) e Dados
    const labels = last6Months.map(m => {
        const [y, monthNum] = m.split('-');
        const date = new Date(y, monthNum - 1, 10);
        return date.toLocaleString('pt-BR', { month: 'short' }).replace('.','').toUpperCase();
    });

    const dataValues = last6Months.map(m => monthlyTotals[m]);
    
    // Cores: Azul para o mês selecionado, Cinza para os outros
    const barColors = last6Months.map(m => {
        return m === appState.currentViewMonth ? '#007AFF' : '#C7C7CC';
    });

    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctxTrend, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Gastos',
                data: dataValues,
                backgroundColor: barColors,
                borderRadius: 4,
                borderSkipped: false,
                barThickness: 20
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` Total: ${context.parsed.y.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { font: { size: 10 }, color: '#8E8E93' }
                },
                y: {
                    display: false, // Oculta eixo Y para limpeza visual
                    beginAtZero: true
                }
            }
        }
    });
}

// --- LISTA DE RENDAS ---
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

// --- GERENCIADOR DE CATEGORIAS (CONFIGURAÇÕES) ---
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
      </div>`;

    const keysArea = document.createElement('div');
    keysArea.className = 'keywords-area';
    keywords.forEach(word => {
      const tag = document.createElement('span'); tag.className = 'keyword-tag';
      tag.innerHTML = `${word} <span class="keyword-remove" onclick="removeKeyword('${cat}', '${word}')">×</span>`;
      keysArea.appendChild(tag);
    });

    const input = document.createElement('input');
    input.className = 'keyword-add-input';
    input.placeholder = '+ Palavra';
    input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter' && input.value.trim()) window.addKeyword(cat, input.value.trim().toUpperCase());
    });
    keysArea.appendChild(input);

    div.appendChild(keysArea);
    list.appendChild(div);
  });
}

// --- RENDERIZAR PREVIEW DO ETL (IMPORTAÇÃO) ---
export function renderEtlPreview(etlData, onConfirm) {
    let modal = document.getElementById('etl-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'etl-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-height: 90vh; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h2>Conferência da Importação</h2>
                    <button class="close-btn" onclick="document.getElementById('etl-modal').style.display='none'">&times;</button>
                </div>
                <div class="modal-body" style="overflow-y: auto; padding: 15px;">
                    <div id="etl-status-card" class="highlight-card" style="margin: 0 0 15px 0; padding: 15px;"></div>
                    <div id="etl-new-cats-alert" style="display:none; background:#FFF4CE; border:1px solid #FFCC00; border-radius:12px; padding:10px; margin-bottom:15px;">
                        <div style="font-size:12px; font-weight:700; color:#997700; margin-bottom:5px;"><i class="fa-solid fa-lightbulb"></i> Sugestões da IA (Novas Categorias):</div>
                        <div id="etl-new-cats-list" style="display:flex; gap:5px; flex-wrap:wrap;"></div>
                    </div>
                    <div id="etl-groups-area"></div>
                </div>
                <div style="padding: 15px; border-top: 1px solid #eee; background: white;">
                    <button id="btn-confirm-etl" class="btn-block btn-primary">Confirmar Importação</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    const statusCard = document.getElementById('etl-status-card');
    const diff = etlData.bankTotal - etlData.calcTotal;
    const color = etlData.isValid ? '#4CD964' : '#FF3B30';
    const icon = etlData.isValid ? '<i class="fa-solid fa-check-circle"></i>' : '<i class="fa-solid fa-triangle-exclamation"></i>';
    
    statusCard.style.background = color;
    statusCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
            <div>
                <div class="label" style="color:white; opacity:0.9;">Total Banco (TXT)</div>
                <div class="value" style="color:white; font-size:20px;">R$ ${etlData.bankTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
            </div>
            <div style="text-align:right;">
                <div class="label" style="color:white; opacity:0.9;">Total Calculado</div>
                <div class="value" style="color:white; font-size:20px;">R$ ${etlData.calcTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
            </div>
        </div>
        ${!etlData.isValid ? `<div style="margin-top:10px; color:white; font-weight:bold; font-size:12px; background:rgba(0,0,0,0.2); padding:5px; border-radius:8px;">${icon} Diferença: R$ ${diff.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>` : ''}
    `;

    // Identifica Categorias Novas
    const newCats = [];
    Object.keys(etlData.groups).forEach(cat => {
        if (!appState.categories.includes(cat) && cat !== "Outros") {
            newCats.push(cat);
        }
    });

    const alertBox = document.getElementById('etl-new-cats-alert');
    const alertList = document.getElementById('etl-new-cats-list');
    
    if(newCats.length > 0) {
        alertBox.style.display = 'block';
        alertList.innerHTML = newCats.map(c => `<span style="background:white; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; color:#333; border:1px solid #E5E5EA;">${c}</span>`).join('');
    } else {
        alertBox.style.display = 'none';
    }

    const groupsArea = document.getElementById('etl-groups-area');
    groupsArea.innerHTML = '';
    
    Object.keys(etlData.groups).sort().forEach(cat => {
        const group = etlData.groups[cat];
        const isNew = newCats.includes(cat);
        const badge = isNew ? `<span style="background:#FFCC00; color:black; padding:2px 6px; border-radius:6px; font-size:9px; margin-left:6px; vertical-align:middle;">✨ NOVA</span>` : '';

        const catHtml = `
            <div style="margin-bottom: 15px; border: 1px solid #eee; border-radius: 12px; overflow: hidden; ${isNew ? 'border: 1px solid #FFCC00;' : ''}">
                <div style="background:${isNew ? '#FFFDF5' : '#f9f9f9'}; padding:10px; display:flex; justify-content:space-between; align-items:center; font-weight:bold; font-size:13px;">
                    <div>${cat} ${badge}</div>
                    <span>R$ ${group.total.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                </div>
                <div style="padding: 5px;">
                    ${group.items.map(item => `
                        <div style="display:flex; justify-content:space-between; padding: 5px; font-size: 11px; border-bottom: 1px solid #f0f0f0;">
                            <span style="flex:1;">${item.description}</span>
                            <span style="font-weight:600; ${item.amount < 0 ? 'color:green' : ''}">R$ ${item.amount.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        groupsArea.innerHTML += catHtml;
    });

    modal.style.display = 'flex';
    
    const btnConfirm = document.getElementById('btn-confirm-etl');
    const newBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
    
    newBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        onConfirm();
    });
}