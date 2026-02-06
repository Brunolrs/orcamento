import { appState } from './state.js';
import { CHART_COLORS } from './config.js';
import { formatBRL, formatMonthLabel, vibrate } from './utils.js';

let chartInstance = null;

function getColorForCategory(cat) {
  if (appState.categoryColors && appState.categoryColors[cat]) {
    return appState.categoryColors[cat];
  }
  const index = appState.categories.indexOf(cat);
  return CHART_COLORS[index % CHART_COLORS.length] || '#8E8E93';
}

export function initViewSelector(onChangeCallback) {
  const select = document.getElementById('view-month');
  select.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = "ALL";
  optAll.text = "📊 Visão Geral (Tudo)";
  select.add(optAll);

  const months = Array.from(new Set(appState.transactions.map(t => t.billMonth))).sort().reverse();
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.text = formatMonthLabel(m);
    select.add(opt);
  });

  if (!appState.currentViewMonth) appState.currentViewMonth = months.length > 0 ? months[0] : "ALL";
  if (appState.currentViewMonth !== "ALL" && !months.includes(appState.currentViewMonth)) appState.currentViewMonth = "ALL";
  select.value = appState.currentViewMonth;
  if(onChangeCallback) onChangeCallback();
}

export function filterAndRender() {
  const view = appState.currentViewMonth;
  let txs = [];
  let currentIncome = 0;
  let labelText = "";

  if (view === "ALL") {
    txs = appState.transactions;
    Object.values(appState.incomeDetails).forEach(list => list.forEach(i => currentIncome += i.val));
    labelText = "Renda Acumulada";
  } else {
    txs = appState.transactions.filter(t => t.billMonth === view);
    (appState.incomeDetails[view] || []).forEach(i => currentIncome += i.val);
    labelText = `Renda de ${formatMonthLabel(view).split(' ')[0]}`;
  }

  const inputEl = document.getElementById('monthly-income');
  inputEl.value = currentIncome > 0 ? currentIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "0,00";
  document.getElementById('income-label-text').innerText = labelText;
  document.getElementById('btn-manage-income').style.display = (view === "ALL") ? "none" : "flex";

  const budgetInput = document.getElementById('month-budget');
  if (budgetInput) {
    if (view === "ALL") {
      budgetInput.value = "";
      budgetInput.disabled = true;
      budgetInput.placeholder = "---";
    } else {
      budgetInput.disabled = false;
      const savedBudget = appState.monthlyBudgets[view] || 0;
      budgetInput.value = savedBudget > 0 ? savedBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
      budgetInput.placeholder = "0,00";
    }
  }
  renderListsAndCharts(txs, currentIncome);
}

function renderListsAndCharts(transactions, currentIncome) {
  const output = document.getElementById('output');
  output.innerHTML = '';
  let gross = 0, refunds = 0;
  const catTotals = {};
  const grouped = {};

  appState.categories.forEach(c => grouped[c] = []);
  if(!grouped["Outros"]) grouped["Outros"] = [];

  transactions.sort((a, b) => {
    const [da, ma, ya] = a.date.split('.');
    const [db, mb, yb] = b.date.split('.');
    const ta = new Date(ya, ma - 1, da).getTime();
    const tb = new Date(yb, mb - 1, db).getTime();
    return tb - ta; 
  });

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

  document.getElementById('month-gross').innerText = formatBRL(gross);
  document.getElementById('month-refunds').innerText = "- " + formatBRL(refunds);
  document.getElementById('month-net').innerText = formatBRL(net);
  const leftoverEl = document.getElementById('month-leftover');
  leftoverEl.innerText = formatBRL(leftover);
  leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';

  const view = appState.currentViewMonth;
  const budgetEl = document.getElementById('budget-remaining');
  if (budgetEl) {
    const currentBudget = (view !== "ALL" && appState.monthlyBudgets[view]) ? appState.monthlyBudgets[view] : 0;
    const budgetRemaining = currentBudget - gross;
    if (view === "ALL" || currentBudget === 0) {
      budgetEl.innerText = "---";
      budgetEl.style.color = "var(--ios-text)";
    } else {
      budgetEl.innerText = formatBRL(budgetRemaining);
      budgetEl.style.color = budgetRemaining >= 0 ? "var(--ios-green)" : "var(--ios-red)";
    }
  }

  updateChart(catTotals);
  renderCategorySummary(catTotals, gross);

  Object.keys(grouped).sort().forEach(cat => {
    const items = grouped[cat];
    if(!items || items.length === 0) return;
    const catGroup = document.createElement('div');
    catGroup.className = 'cat-group';
    catGroup.innerHTML = `<div class="cat-header"><span class="cat-name">${cat}</span><span class="cat-name" style="color: var(--ios-text);">${formatBRL(catTotals[cat] || 0)}</span></div>`;
    const listBox = document.createElement('div');
    listBox.className = 'list-box';

    items.forEach(item => {
      const isRefund = item.amount < 0;
      const div = document.createElement('div');
      div.className = 'tx-item';
      let touchStartX = 0, touchEndX = 0;
      div.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
      div.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 100) { vibrate(50); window.deleteTransaction(item.id); }
      });

      if (appState.isEditMode) {
        const options = appState.categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('');
        const [d, m, y] = item.date.split('.');
        const dateBuyISO = `${y}-${m}-${d}`;
        let dateInvISO;
        if(item.invoiceDate) { const [di, mi, yi] = item.invoiceDate.split('.'); dateInvISO = `${yi}-${mi}-${di}`; } 
        else { const [yb, mb] = item.billMonth.split('-'); dateInvISO = `${yb}-${mb}-10`; }

        div.innerHTML = `
          <div class="tx-row-edit">
            <div style="width: 100%; margin-bottom: 5px;"><input type="text" class="edit-input" value="${item.description}" onchange="window.updateTx('${item.id}', 'description', this.value)" placeholder="Descrição"></div>
            <div style="display: flex; gap: 5px; width: 100%; margin-bottom: 5px;">
              <div style="flex:1;"><label style="font-size:10px; color:#8E8E93;">Compra</label><input type="date" class="edit-input" value="${dateBuyISO}" onchange="window.updateTx('${item.id}', 'date', this.value)"></div>
              <div style="flex:1;"><label style="font-size:10px; color:#007AFF;">Fatura</label><input type="date" class="edit-input" value="${dateInvISO}" style="color:var(--ios-blue);" onchange="window.updateTx('${item.id}', 'invoiceDate', this.value)"></div>
            </div>
            <div style="display:flex; gap: 5px; width: 100%; align-items: center;">
              <input type="number" class="edit-input" value="${Math.abs(item.amount)}" step="0.01" onchange="window.updateTx('${item.id}', 'amount', this.value)" style="flex: 1;">
              <select class="edit-select" style="flex: 1;" onchange="window.updateTx('${item.id}', 'category', this.value)">${options}</select>
              <button class="btn-row-delete" onclick="window.deleteTransaction('${item.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>`;
      } else {
        div.onclick = () => window.editTransaction(item.id);
        div.innerHTML = `<div class="tx-row-main"><div class="tx-main"><span class="tx-desc">${item.description}</span><span class="tx-date">${item.date}</span></div><div class="tx-side"><span class="tx-val ${isRefund ? 'color-pos' : 'color-neg'}">${isRefund ? '+ ' : ''}${formatBRL(Math.abs(item.amount))}</span><div class="cat-row-info"><span class="tx-cat-label">${item.category}</span></div></div></div>`;
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

function updateChart(data) {
  const ctx = document.getElementById('expenseChart').getContext('2d');
  const activeCats = Object.keys(data).filter(k => data[k] > 0);
  const values = activeCats.map(k => data[k]);
  const colors = activeCats.map(cat => getColorForCategory(cat));
  if(chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: activeCats, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
  });
}

function renderCategorySummary(catTotals, totalGross) {
  const container = document.getElementById('category-summary-area');
  if(!container) return;
  container.innerHTML = '';
  Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]).forEach(cat => {
    const val = catTotals[cat]; if (val <= 0) return;
    const percent = totalGross > 0 ? (val / totalGross) * 100 : 0;
    const color = getColorForCategory(cat);
    const div = document.createElement('div');
    div.className = 'cat-summary-card';
    div.innerHTML = `<div class="cat-sum-header"><span>${cat}</span><span>${percent.toFixed(1)}%</span></div><div class="cat-sum-val">${formatBRL(val)}</div><div class="cat-progress-bg"><div class="cat-progress-bar" style="width: ${percent}%; background-color: ${color};"></div></div>`;
    container.appendChild(div);
  });
}

export function renderIncomeList() {
  const list = appState.incomeDetails[appState.currentViewMonth] || [];
  const container = document.getElementById('income-list-area');
  container.innerHTML = '';
  let total = 0;
  list.forEach((item, index) => {
    total += item.val;
    container.innerHTML += `<div class="income-item"><div class="income-desc">${item.desc}</div><div><span class="income-val">${formatBRL(item.val)}</span><button class="btn-del-income" onclick="window.removeIncome(${index})"><i class="fa-solid fa-trash"></i></button></div></div>`;
  });
  document.getElementById('modal-income-total').innerText = formatBRL(total);
}

export function renderCategoryManager() {
  const list = document.getElementById('categories-list');
  list.innerHTML = '';
  Object.keys(appState.categoryRules).sort().forEach(cat => {
    const keywords = appState.categoryRules[cat];
    const currentColor = getColorForCategory(cat);
    const div = document.createElement('div');
    div.className = 'cat-edit-item';
    div.innerHTML = `<div class="cat-edit-header"><input type="color" value="${currentColor}" style="width:30px;height:30px;border:none;padding:0;" onchange="window.updateCategoryColor('${cat}', this.value)"><input type="text" value="${cat}" class="form-input" style="height:36px;font-weight:bold;color:var(--ios-blue);" ${cat==="Outros"?'disabled':''} onchange="window.renameCategory('${cat}', this.value)">${cat!=="Outros"?`<button class="btn-delete-cat" onclick="deleteCategory('${cat}')"><i class="fa-solid fa-trash"></i></button>`:''}</div>`;
    const keysArea = document.createElement('div');
    keysArea.className = 'keywords-area';
    keywords.forEach(word => {
        keysArea.innerHTML += `<span class="keyword-tag">${word} <span class="keyword-remove" onclick="removeKeyword('${cat}', '${word}')">×</span></span>`;
    });
    const input = document.createElement('input');
    input.className = 'keyword-add-input';
    input.placeholder = '+ Palavra';
    input.addEventListener('keypress', (e) => { if(e.key === 'Enter' && input.value.trim()) window.addKeyword(cat, input.value.trim().toUpperCase()); });
    keysArea.appendChild(input);
    div.appendChild(keysArea);
    list.appendChild(div);
  });
}

export function renderEtlPreview(etlData, onConfirm) {
    let modal = document.getElementById('etl-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'etl-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-height: 90vh; display: flex; flex-direction: column;">
                <div class="modal-header"><h2>Conferência</h2><button class="close-btn" onclick="document.getElementById('etl-modal').style.display='none'">&times;</button></div>
                <div class="modal-body" style="overflow-y: auto; padding: 15px;">
                    <div id="etl-status-card" class="highlight-card" style="margin: 0 0 15px 0; padding: 15px;"></div>
                    <div id="etl-new-cats-alert" style="display:none; background:#FFF4CE; border:1px solid #FFCC00; border-radius:12px; padding:10px; margin-bottom:15px;">
                        <div style="font-size:12px; font-weight:700; color:#997700;"><i class="fa-solid fa-lightbulb"></i> Nova(s) categoria(s) detectada(s):</div>
                        <div id="etl-new-cats-list" style="display:flex; gap:5px; flex-wrap:wrap; margin-top:5px;"></div>
                    </div>
                    <div id="etl-groups-area"></div>
                </div>
                <div style="padding: 15px; border-top: 1px solid #eee; background: white;"><button id="btn-confirm-etl" class="btn-block btn-primary">Confirmar Importação</button></div>
            </div>`;
        document.body.appendChild(modal);
    }

    const statusCard = document.getElementById('etl-status-card');
    const diff = etlData.bankTotal - etlData.calcTotal;
    const color = etlData.isValid ? '#4CD964' : '#FF3B30';
    statusCard.style.background = color;
    statusCard.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; width:100%;"><div><div class="label" style="color:white; opacity:0.9;">Total Banco</div><div class="value" style="color:white; font-size:20px;">${formatBRL(etlData.bankTotal)}</div></div><div style="text-align:right;"><div class="label" style="color:white; opacity:0.9;">Calculado</div><div class="value" style="color:white; font-size:20px;">${formatBRL(etlData.calcTotal)}</div></div></div>${!etlData.isValid ? `<div style="margin-top:10px; color:white; font-weight:bold; font-size:12px; background:rgba(0,0,0,0.2); padding:5px; border-radius:8px;">Diferença: ${formatBRL(diff)}</div>` : ''}`;

    const newCats = [];
    Object.keys(etlData.groups).forEach(cat => {
        if (!appState.categories.includes(cat) && cat !== "Outros") newCats.push(cat);
    });

    const alertBox = document.getElementById('etl-new-cats-alert');
    if(newCats.length > 0) {
        alertBox.style.display = 'block';
        document.getElementById('etl-new-cats-list').innerHTML = newCats.map(c => `<span style="background:white; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; color:#333; border:1px solid #E5E5EA;">${c}</span>`).join('');
    } else {
        alertBox.style.display = 'none';
    }

    const groupsArea = document.getElementById('etl-groups-area');
    groupsArea.innerHTML = '';
    Object.keys(etlData.groups).sort().forEach(cat => {
        const group = etlData.groups[cat];
        const isNew = newCats.includes(cat);
        const badge = isNew ? `<span style="background:#FFCC00; color:black; padding:2px 6px; border-radius:6px; font-size:9px; margin-left:6px;">NOVA</span>` : '';
        groupsArea.innerHTML += `<div style="margin-bottom: 15px; border: 1px solid #eee; border-radius: 12px; overflow: hidden; ${isNew ? 'border: 1px solid #FFCC00;' : ''}"><div style="background:${isNew ? '#FFFDF5' : '#f9f9f9'}; padding:10px; display:flex; justify-content:space-between; align-items:center; font-weight:bold; font-size:13px;"><div>${cat} ${badge}</div><span>${formatBRL(group.total)}</span></div><div style="padding: 5px;">${group.items.map(item => `<div style="display:flex; justify-content:space-between; padding: 5px; font-size: 11px; border-bottom: 1px solid #f0f0f0;"><span style="flex:1;">${item.description}</span><span style="font-weight:600; ${item.amount < 0 ? 'color:green' : ''}">${formatBRL(item.amount)}</span></div>`).join('')}</div></div>`;
    });

    modal.style.display = 'flex';
    const btnConfirm = document.getElementById('btn-confirm-etl');
    const newBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
    newBtn.addEventListener('click', () => { modal.style.display = 'none'; onConfirm(); });
}