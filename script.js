// --- ESTADO GLOBAL (V12) ---
let appState = JSON.parse(localStorage.getItem('financeV12')) || {
    transactions: [],
    monthlyIncomes: {}, 
    categories: ["Alimentação", "Transporte", "Lazer", "Serviços", "Saúde", "Casa", "Vestuário", "Assinaturas", "Outros"],
    currentViewMonth: null 
};
let chartInstance = null;
const CHART_COLORS = ['#1C1C1E', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#5856D6', '#AF52DE', '#8E8E93'];

// --- INICIALIZAÇÃO ---
window.onload = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    
    // Define padrão do input de importação para o mês atual
    const importInput = document.getElementById('import-ref-month');
    if (importInput) importInput.value = `${yyyy}-${mm}`;

    initViewSelector();
};

// --- VISUALIZAÇÃO ---
function initViewSelector() {
    const select = document.getElementById('view-month');
    select.innerHTML = '';
    
    // Pega todos os meses de fatura disponíveis no histórico
    const months = Array.from(new Set(appState.transactions.map(t => t.billMonth))).sort().reverse();
    
    if (months.length === 0) {
        const opt = document.createElement('option');
        opt.text = "Sem dados";
        select.add(opt);
        renderUI([]);
        return;
    }

    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.text = formatMonthLabel(m);
        select.add(opt);
    });

    if (!appState.currentViewMonth || !months.includes(appState.currentViewMonth)) {
        appState.currentViewMonth = months[0];
    }
    select.value = appState.currentViewMonth;
    
    filterAndRender();
}

function changeViewMonth(val) {
    appState.currentViewMonth = val;
    saveData();
    filterAndRender();
}

function filterAndRender() {
    const currentMonth = appState.currentViewMonth;
    
    // 1. Atualiza Input de Renda VISUALMENTE
    const savedIncome = appState.monthlyIncomes[currentMonth] || 0;
    const inputEl = document.getElementById('monthly-income');
    
    // Formata o valor salvo para exibir com pontos e virgulas
    if(savedIncome > 0) {
        inputEl.value = savedIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    } else {
        inputEl.value = "";
    }

    document.getElementById('income-label-text').innerText = `Renda de ${formatMonthLabel(currentMonth).split(' ')[0]}`;

    // 2. Filtra transações do mês selecionado
    const txs = appState.transactions.filter(t => t.billMonth === currentMonth);
    renderUI(txs);
}

// --- LÓGICA DE INPUT DE MOEDA (MÁSCARA) ---
function formatAndSetIncome(elem) {
    let value = elem.value;
    
    // Remove tudo que não for dígito
    value = value.replace(/\D/g, "");
    
    // Se estiver vazio, zera
    if(value === "") {
        updateIncome(0);
        return;
    }

    // Converte para float (divide por 100 para centavos)
    let floatVal = parseFloat(value) / 100;
    
    // Formata para visualização (ex: 1.500,00)
    elem.value = floatVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    // Salva o valor numérico real
    updateIncome(floatVal);
}

// Atualiza o estado da renda
function updateIncome(floatVal) {
    const currentMonth = appState.currentViewMonth;
    if(!currentMonth) return;
    
    appState.monthlyIncomes[currentMonth] = floatVal;
    saveData();
    
    // Atualiza apenas os cálculos da tela
    const txs = appState.transactions.filter(t => t.billMonth === currentMonth);
    renderCalculationsOnly(txs, floatVal);
}

// Função auxiliar para atualizar totais sem mexer no input (melhora UX de digitação)
function renderCalculationsOnly(transactions, currentIncome) {
     let gross = 0, refunds = 0;
     transactions.forEach(t => {
        if(!t.isBillPayment) {
            if(t.amount > 0) gross += t.amount;
            else refunds += Math.abs(t.amount);
        }
     });
     const net = gross - refunds;
     const leftover = currentIncome - net;
     const leftoverEl = document.getElementById('month-leftover');
     leftoverEl.innerText = formatBRL(leftover);
     leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';
}

function formatMonthLabel(isoMonth) {
    if(!isoMonth) return "---";
    const [y, m] = isoMonth.split('-');
    const date = new Date(y, m - 1);
    const name = date.toLocaleString('pt-BR', { month: 'long' });
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`;
}

// --- IMPORTAÇÃO ---
const fileInput = document.getElementById('fileInput');
if(fileInput) {
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if(!file) return;

        const targetMonth = document.getElementById('import-ref-month').value;
        if(!targetMonth) { alert("Selecione o mês da fatura."); return; }

        const reader = new FileReader();
        reader.readAsText(file, 'ISO-8859-1');
        reader.onload = (e) => {
            parseFile(e.target.result, targetMonth);
            saveData();
            initViewSelector();
            appState.currentViewMonth = targetMonth;
            document.getElementById('view-month').value = targetMonth;
            filterAndRender();
        };
    });
}

function parseFile(text, billMonth) {
    const lines = text.split('\n');
    let currentCategory = "Outros";
    const regexTx = /^(\d{2}\.\d{2}\.\d{4})\s*(.+?)\s+(-?[\d\.]+,\d{2})\s/;
    const regexCat = /^\s{5,}([^0-9].*?)\s*$/;

    lines.forEach(line => {
        const clean = line.replace(/\r/g, '');
        if(regexCat.test(clean) && !clean.includes("Total") && !clean.includes("Saldo")) {
            const m = clean.match(regexCat);
            if(m) {
                currentCategory = m[1].trim();
                if(!appState.categories.includes(currentCategory)) appState.categories.push(currentCategory);
            }
            return;
        }
        const m = clean.match(regexTx);
        if(m) {
            const desc = m[2].trim();
            const val = parseFloat(m[3].replace(/\./g, '').replace(',', '.'));
            
            if(desc.includes("SubTotal") || desc.includes("SALDO FATURA") || isNaN(val)) return;
            const isBillPayment = desc.includes("PGTO DEBITO CONTA");
            
            // Verifica duplicatas
            const exists = appState.transactions.some(t => t.description === desc && t.amount === val && t.date === m[1] && t.billMonth === billMonth);

            if(!exists) {
                appState.transactions.push({
                    id: Math.random().toString(36).substr(2, 9),
                    date: m[1],
                    billMonth: billMonth,
                    description: desc,
                    amount: val, 
                    category: currentCategory,
                    isBillPayment: isBillPayment
                });
            }
        }
    });
}

// --- RENDERIZAÇÃO ---
function renderUI(transactions) {
    const output = document.getElementById('output');
    output.innerHTML = '';

    let gross = 0, refunds = 0;
    const catTotals = {};
    const grouped = {};

    appState.categories.forEach(c => grouped[c] = []);

    // Ordenação por data
    transactions.sort((a,b) => {
        const [da, ma, ya] = a.date.split('.');
        const [db, mb, yb] = b.date.split('.');
        return new Date(yb, mb-1, db) - new Date(ya, ma-1, da);
    }).reverse(); 

    transactions.forEach(t => {
        if(!grouped[t.category]) grouped[t.category] = [];
        grouped[t.category].push(t);

        if(!t.isBillPayment) {
            if(t.amount > 0) {
                gross += t.amount;
                catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
            } else {
                refunds += Math.abs(t.amount);
            }
        }
    });

    const net = gross - refunds;
    const currentMonthIncome = appState.monthlyIncomes[appState.currentViewMonth] || 0;
    const leftover = currentMonthIncome - net;

    // Atualiza Dashboard
    document.getElementById('month-gross').innerText = formatBRL(gross);
    document.getElementById('month-refunds').innerText = "- " + formatBRL(refunds);
    document.getElementById('month-net').innerText = formatBRL(net);
    const leftoverEl = document.getElementById('month-leftover');
    leftoverEl.innerText = formatBRL(leftover);
    leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';

    updateChart(catTotals);

    // Atualiza Lista
    appState.categories.sort().forEach(cat => {
        const items = grouped[cat];
        if(!items || items.length === 0) return;
        if(items.every(i => i.isBillPayment)) return;

        const catGroup = document.createElement('div');
        catGroup.className = 'cat-group';
        catGroup.innerHTML = `<div class="cat-header"><span class="cat-name">${cat}</span></div>`;
        
        const listBox = document.createElement('div');
        listBox.className = 'list-box';

        items.forEach(item => {
            if(item.isBillPayment) return; 

            const isRefund = item.amount < 0;
            const options = appState.categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('');
            
            const div = document.createElement('div');
            div.className = 'tx-item';
            div.innerHTML = `
                <div class="tx-main">
                    <span class="tx-desc">${item.description}</span>
                    <span class="tx-date">${item.date}</span>
                </div>
                <div class="tx-side">
                    <span class="tx-val ${isRefund ? 'color-pos' : 'color-neg'}">
                        ${isRefund ? '+ ' : ''}${formatBRL(Math.abs(item.amount))}
                    </span>
                    <select class="cat-picker" onchange="changeCat('${item.id}', this.value)">${options}</select>
                </div>
            `;
            listBox.appendChild(div);
        });
        catGroup.appendChild(listBox);
        output.appendChild(catGroup);
    });
}

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    const labels = Object.keys(data).filter(k => data[k] > 0);
    const values = labels.map(k => data[k]);

    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } }
    });
}

// Funções globais para uso no HTML
window.changeCat = (id, newCat) => { const tx = appState.transactions.find(t => t.id === id); if(tx) { tx.category = newCat; saveData(); filterAndRender(); }};
window.clearData = () => { if(confirm("Apagar todos os dados?")) { localStorage.removeItem('financeV12'); location.reload(); }};
window.formatAndSetIncome = formatAndSetIncome; // Garante visibilidade global

function saveData() { localStorage.setItem('financeV12', JSON.stringify(appState)); }
function formatBRL(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }