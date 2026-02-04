import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC4g1Vh3QrqgF4Z026YdfkPH6nNSBsMFj0",
    authDomain: "orcamento-96cae.firebaseapp.com",
    projectId: "orcamento-96cae",
    storageBucket: "orcamento-96cae.firebasestorage.app",
    messagingSenderId: "984778906391",
    appId: "1:984778906391:web:b217e948a54d76bfcab552",
    measurementId: "G-5CMJTBJRX2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const DEFAULT_RULES = {
    "Alimentação": ["IFOOD", "UBER EATS", "MERCADO", "ASSAI", "CARREFOUR", "RESTAURANTE", "PADARIA", "HORTIFRUTI", "SUPER", "ATACADAO", "LANCHE", "PIZZA", "BURGER", "AÇAI", "SORVETE", "BISTRÔ", "CHURRASCARIA", "MANA PAES", "BANCHAN", "PRIMEIRO", "CAFE", "COFFEE", "BEM MAIOR", "QUARTETTO", "COCO BAMBU", "AMERICAN PIZZA"],
    "Transporte": ["UBER", "99POP", "POSTO", "IPIRANGA", "SHELL", "GASOLINA", "PEDAGIO", "ESTACIONAMENTO", "AUTO POSTO", "DRIVE", "PARKING", "PROPARK"],
    "Serviços": ["NETFLIX", "SPOTIFY", "AMAZON", "CLARO", "VIVO", "TIM", "INTERNET", "GOOGLE", "APPLE", "YOUTUBE", "ASSINATURA", "MELIMAIS", "CONTA VIVO", "CRUNCHYROLL"],
    "Saúde": ["DROGARIA", "FARMACIA", "RAIA", "MEDICO", "EXAME", "CLINICA", "ODONTO", "PETLOVE", "PET", "NATURA", "ALVIM", "DROGASIL", "HOSPITAL", "FORMULAANIMAL", "RDSAUDE", "BELEZA NA WEB"],
    "Casa": ["LUZ", "ENEL", "AGUA", "CONDOMINIO", "ALUGUEL", "LEROY", "CASA", "FERRAMENTA", "TOKSTOK", "DMAIS", "ATACADÃO DIA A DIA", "OCA WINE"],
    "Lazer": ["CINEMA", "INGRESSO", "VIAGEM", "HOTEL", "BAR", "PLAYSTATION", "XBOX", "STEAM", "NINTENDO", "GAME", "ZIG ADVENTURE", "CROSSFIT", "CINEMARK", "MC DONALDS"],
    "Vestuário": ["RENNER", "ZARA", "SHEIN", "SHOPEE", "NIKE", "ADIDAS", "ROUPA", "MODA", "AREZZO", "MYOSOTIS", "RIACHUELO"],
    "Educação": ["CURSO", "UDEMY", "ALURA", "ESCOLA", "FACULDADE", "ENSINO", "PAPELARIA", "LIVRARIA", "CONCURSOS"],
    "Outros": []
};

let appState = {
    transactions: [],
    // monthlyIncomes agora será apenas um cache visual ou ignorado em favor de incomeDetails
    incomeDetails: {}, // Estrutura: { "2026-01": [ {id, desc, val}, ... ] }
    categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)), 
    categories: [...Object.keys(DEFAULT_RULES)],
    currentViewMonth: null,
    user: null
};
let chartInstance = null;
const CHART_COLORS = ['#1C1C1E', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#5856D6', '#AF52DE', '#8E8E93', '#007AFF'];

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    if(document.getElementById('import-ref-month')) document.getElementById('import-ref-month').value = `${yyyy}-${mm}`;
    if(document.getElementById('manual-date')) document.getElementById('manual-date').value = `${yyyy}-${mm}-${String(today.getDate()).padStart(2,'0')}`;

    document.getElementById('btn-login').addEventListener('click', () => signInWithPopup(auth, provider));
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    document.getElementById('view-month').addEventListener('change', (e) => changeViewMonth(e.target.value));
    document.getElementById('fileInput').addEventListener('change', (e) => handleFileUpload(e.target.files[0]));
    document.getElementById('btn-delete-month').addEventListener('click', deleteCurrentMonth);

    // --- MODAIS ---
    // Categorias
    const modalSettings = document.getElementById('settings-modal');
    document.getElementById('btn-settings').addEventListener('click', () => { renderCategoryManager(); modalSettings.style.display = 'flex'; });
    document.getElementById('btn-close-settings').addEventListener('click', () => modalSettings.style.display = 'none');
    document.getElementById('btn-add-cat').addEventListener('click', addNewCategory);

    // Manual
    const modalManual = document.getElementById('manual-modal');
    document.getElementById('btn-open-manual').addEventListener('click', openManualModal);
    document.getElementById('btn-close-manual').addEventListener('click', () => modalManual.style.display = 'none');
    document.getElementById('btn-save-manual').addEventListener('click', saveManualTransaction);

    // Renda (Novo)
    const modalIncome = document.getElementById('income-modal');
    document.getElementById('btn-manage-income').addEventListener('click', openIncomeModal);
    document.getElementById('btn-close-income').addEventListener('click', () => modalIncome.style.display = 'none');
    document.getElementById('btn-add-income-item').addEventListener('click', addIncomeItem);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        appState.user = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        startRealtimeListener(user.uid);
    } else {
        appState.user = null;
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
    }
});

function startRealtimeListener(uid) {
    const userDocRef = doc(db, "users", uid);
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            appState.transactions = data.transactions || [];
            
            // Carrega detalhes de renda (ou migra antigo monthlyIncomes se existir e details não)
            appState.incomeDetails = data.incomeDetails || {};
            if (data.monthlyIncomes && Object.keys(appState.incomeDetails).length === 0) {
                // Migração simples
                Object.keys(data.monthlyIncomes).forEach(m => {
                    if (data.monthlyIncomes[m] > 0) {
                        appState.incomeDetails[m] = [{ id: Date.now(), desc: "Renda Principal", val: data.monthlyIncomes[m] }];
                    }
                });
            }

            if (data.categoryRules) appState.categoryRules = data.categoryRules;
            appState.categories = [...Object.keys(appState.categoryRules)];
            if(!appState.categories.includes("Outros")) appState.categories.push("Outros");
            initViewSelector();
        } else {
            setDoc(userDocRef, { transactions: [], incomeDetails: {}, categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)) });
        }
    });
}

async function saveToFirebase() {
    if (!appState.user) return;
    const userDocRef = doc(db, "users", appState.user.uid);
    try {
        await updateDoc(userDocRef, {
            transactions: appState.transactions,
            incomeDetails: appState.incomeDetails, // Salva estrutura nova
            categoryRules: appState.categoryRules
        });
    } catch (e) { console.error(e); }
}

// --- GERENCIAMENTO DE RENDA MÚLTIPLA ---
function openIncomeModal() {
    if(appState.currentViewMonth === "ALL") { alert("Selecione um mês específico."); return; }
    renderIncomeList();
    document.getElementById('income-modal').style.display = 'flex';
}

function renderIncomeList() {
    const month = appState.currentViewMonth;
    const list = appState.incomeDetails[month] || [];
    const container = document.getElementById('income-list-area');
    container.innerHTML = '';
    
    let total = 0;

    list.forEach((item, index) => {
        total += item.val;
        const div = document.createElement('div');
        div.className = 'income-item';
        div.innerHTML = `
            <div>
                <div class="income-desc">${item.desc}</div>
            </div>
            <div style="display:flex; align-items:center;">
                <span class="income-val">${formatBRL(item.val)}</span>
                <button class="btn-del-income" onclick="window.removeIncome(${index})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(div);
    });

    document.getElementById('modal-income-total').innerText = formatBRL(total);
}

function addIncomeItem() {
    const desc = document.getElementById('inc-desc').value.trim();
    const val = parseFloat(document.getElementById('inc-val').value);
    
    if(!desc || isNaN(val) || val <= 0) { alert("Informe descrição e valor válido."); return; }
    
    const month = appState.currentViewMonth;
    if(!appState.incomeDetails[month]) appState.incomeDetails[month] = [];
    
    appState.incomeDetails[month].push({ id: Date.now(), desc: desc, val: val });
    
    saveToFirebase();
    renderIncomeList(); // Atualiza modal
    filterAndRender();  // Atualiza tela principal em background
    
    // Limpa campos
    document.getElementById('inc-desc').value = '';
    document.getElementById('inc-val').value = '';
}

window.removeIncome = (index) => {
    const month = appState.currentViewMonth;
    if(!appState.incomeDetails[month]) return;
    
    appState.incomeDetails[month].splice(index, 1);
    saveToFirebase();
    renderIncomeList();
    filterAndRender();
};

// --- MANUAL E IMPORTAÇÃO (MANTER IGUAL) ---
function openManualModal() {
    const modal = document.getElementById('manual-modal');
    const select = document.getElementById('manual-cat');
    select.innerHTML = '';
    appState.categories.sort().forEach(cat => {
        const opt = document.createElement('option'); opt.value = cat; opt.text = cat; select.add(opt);
    });
    modal.style.display = 'flex';
}

function saveManualTransaction() {
    const desc = document.getElementById('manual-desc').value.trim();
    const valStr = document.getElementById('manual-val').value;
    const dateStr = document.getElementById('manual-date').value;
    const cat = document.getElementById('manual-cat').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;

    if(!desc || !valStr || !dateStr) return;

    let amount = parseFloat(valStr);
    if (type === 'credit') amount = -Math.abs(amount);
    else amount = Math.abs(amount);

    const [y, m, d] = dateStr.split('-');
    const formattedDate = `${d}.${m}.${y}`;
    const billMonth = `${y}-${m}`;

    appState.transactions.push({
        id: "MAN_" + Date.now(),
        date: formattedDate,
        billMonth: billMonth,
        description: desc,
        amount: amount,
        category: cat,
        isBillPayment: false
    });

    saveToFirebase();
    alert("Salvo!");
    document.getElementById('manual-modal').style.display = 'none';
    if(appState.currentViewMonth !== "ALL" && appState.currentViewMonth !== billMonth) {
        appState.currentViewMonth = billMonth;
        initViewSelector(); 
    } else {
        filterAndRender();
    }
}

async function handleFileUpload(file) {
    if(!file) return;
    const targetMonth = document.getElementById('import-ref-month').value;
    if(!targetMonth) { alert("Selecione o mês."); return; }
    try {
        const textContent = await file.text();
        const count = parseFile(textContent, targetMonth);
        if(count > 0) {
            await saveToFirebase();
            alert(`Sucesso: ${count} itens.`);
            appState.currentViewMonth = targetMonth;
            initViewSelector();
        } else { alert("Nada encontrado."); }
    } catch (e) { console.error(e); }
    document.getElementById('fileInput').value = '';
}

function parseFile(text, billMonth) {
    const cleanText = text.replace(/[\r\n]+/g, ' '); 
    const regexBB = /(\d{2}[\/\.]\d{2}[\/\.]\d{4})(.*?)(?:R\$\s*)?(-?[\d\.]+,\d{2})/g;
    let match; let count = 0;
    while ((match = regexBB.exec(cleanText)) !== null) {
        let dateRaw = match[1]; 
        let rawDesc = match[2].trim();
        let val = parseFloat(match[3].replace(/R\$/gi, '').trim().replace(/\./g, '').replace(',', '.'));
        let desc = rawDesc.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
        const upperDesc = desc.toUpperCase();
        if (upperDesc.includes("SALDO FATURA") || upperDesc.includes("SUBTOTAL") || upperDesc.includes("TOTAL") || upperDesc === "BR") continue;
        if (upperDesc.includes("PGTO")) continue; // Filtro de Pagamento
        const cat = detectCategory(desc);
        const exists = appState.transactions.some(t => t.description === desc && t.amount === val && t.date === dateRaw && t.billMonth === billMonth);
        if(!exists) {
            appState.transactions.push({
                id: Math.random().toString(36).substr(2, 9),
                date: dateRaw, billMonth: billMonth, description: desc, amount: val, category: cat, isBillPayment: false
            });
            count++;
        }
    }
    return count;
}

function detectCategory(description) {
    const descUpper = description.toUpperCase();
    for (const [category, keywords] of Object.entries(appState.categoryRules)) {
        for (const word of keywords) { if (descUpper.includes(word)) return category; }
    }
    return "Outros";
}

// --- VISUALIZAÇÃO ---
function initViewSelector() {
    const select = document.getElementById('view-month');
    select.innerHTML = '';
    const optAll = document.createElement('option'); optAll.value = "ALL"; optAll.text = "📊 Visão Geral"; select.add(optAll);
    const months = Array.from(new Set(appState.transactions.map(t => t.billMonth))).sort().reverse();
    months.forEach(m => { const opt = document.createElement('option'); opt.value = m; opt.text = formatMonthLabel(m); select.add(opt); });
    if (!appState.currentViewMonth) appState.currentViewMonth = months.length > 0 ? months[0] : "ALL";
    if (appState.currentViewMonth !== "ALL" && !months.includes(appState.currentViewMonth)) appState.currentViewMonth = "ALL";
    select.value = appState.currentViewMonth;
    filterAndRender();
}
window.changeViewMonth = (val) => { appState.currentViewMonth = val; filterAndRender(); };

function filterAndRender() {
    const view = appState.currentViewMonth;
    let txs = []; let currentIncome = 0; let labelText = "";

    if (view === "ALL") {
        txs = appState.transactions;
        // Soma todas as rendas de todos os meses
        Object.values(appState.incomeDetails).forEach(list => {
            list.forEach(i => currentIncome += i.val);
        });
        labelText = "Renda Acumulada";
    } else {
        txs = appState.transactions.filter(t => t.billMonth === view);
        // Soma rendas do mês atual
        const incomeList = appState.incomeDetails[view] || [];
        incomeList.forEach(i => currentIncome += i.val);
        labelText = `Renda de ${formatMonthLabel(view).split(' ')[0]}`;
    }

    const inputEl = document.getElementById('monthly-income');
    if(currentIncome > 0) inputEl.value = currentIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    else inputEl.value = "0,00";
    
    document.getElementById('income-label-text').innerText = labelText;
    // O botão de gerenciar renda só funciona em mês específico
    document.getElementById('btn-manage-income').style.display = (view === "ALL") ? "none" : "flex";

    renderUI(txs, currentIncome);
}

function renderUI(transactions, currentIncome) {
    const output = document.getElementById('output');
    output.innerHTML = '';
    let gross = 0, refunds = 0;
    const catTotals = {};
    const grouped = {};
    appState.categories.forEach(c => grouped[c] = []);
    if(!grouped["Outros"]) grouped["Outros"] = [];

    transactions.sort((a,b) => {
        const [da, ma, ya] = a.date.split('.'); const [db, mb, yb] = b.date.split('.');
        return new Date(yb, mb-1, db) - new Date(ya, ma-1, da);
    }).reverse(); 

    transactions.forEach(t => {
        let cat = appState.categories.includes(t.category) ? t.category : "Outros";
        grouped[cat].push(t);
        if(t.amount > 0) { gross += t.amount; catTotals[cat] = (catTotals[cat] || 0) + t.amount; }
        else { refunds += Math.abs(t.amount); }
    });

    const net = gross - refunds;
    const leftover = currentIncome - net;
    document.getElementById('month-gross').innerText = formatBRL(gross);
    document.getElementById('month-refunds').innerText = "- " + formatBRL(refunds);
    document.getElementById('month-net').innerText = formatBRL(net);
    const leftoverEl = document.getElementById('month-leftover');
    leftoverEl.innerText = formatBRL(leftover);
    leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';
    updateChart(catTotals);

    Object.keys(grouped).sort().forEach(cat => {
        const items = grouped[cat];
        if(!items || items.length === 0) return;
        const catGroup = document.createElement('div');
        catGroup.className = 'cat-group';
        catGroup.innerHTML = `<div class="cat-header"><span class="cat-name">${cat}</span></div>`;
        const listBox = document.createElement('div');
        listBox.className = 'list-box';
        items.forEach(item => {
            const isRefund = item.amount < 0;
            const options = appState.categories.map(c => `<option value="${c}" ${c === cat ? 'selected' : ''}>${c}</option>`).join('');
            const div = document.createElement('div');
            div.className = 'tx-item';
            div.innerHTML = `
                <div class="tx-main"><span class="tx-desc">${item.description}</span><span class="tx-date">${item.date}</span></div>
                <div class="tx-side">
                    <span class="tx-val ${isRefund ? 'color-pos' : 'color-neg'}">${isRefund ? '+ ' : ''}${formatBRL(Math.abs(item.amount))}</span>
                    <select class="cat-picker" data-id="${item.id}">${options}</select>
                </div>`;
            listBox.appendChild(div);
        });
        catGroup.appendChild(listBox);
        output.appendChild(catGroup);
    });
    
    document.querySelectorAll('.cat-picker').forEach(sel => {
        sel.addEventListener('change', function() {
            const id = this.getAttribute('data-id');
            const tx = appState.transactions.find(t => t.id === id);
            if(tx) { tx.category = this.value; saveToFirebase(); setTimeout(() => filterAndRender(), 100); }
        });
    });
}

// Helpers
function renderCategoryManager() {
    const list = document.getElementById('categories-list');
    list.innerHTML = '';
    const cats = Object.keys(appState.categoryRules).sort();
    cats.forEach(cat => {
        const keywords = appState.categoryRules[cat];
        const div = document.createElement('div');
        div.className = 'cat-edit-item';
        div.innerHTML = `<div class="cat-edit-header"><span class="cat-name-display">${cat}</span>${cat !== 'Outros' ? `<button class="btn-delete-cat" onclick="deleteCategory('${cat}')"><i class="fa-solid fa-trash"></i></button>` : ''}</div>`;
        const keysArea = document.createElement('div');
        keysArea.className = 'keywords-area';
        keywords.forEach(word => {
            const tag = document.createElement('span'); tag.className = 'keyword-tag';
            tag.innerHTML = `${word} <span class="keyword-remove" onclick="removeKeyword('${cat}', '${word}')">&times;</span>`;
            keysArea.appendChild(tag);
        });
        const input = document.createElement('input'); input.className = 'keyword-add-input'; input.placeholder = '+ Palavra';
        input.addEventListener('keypress', (e) => { if(e.key === 'Enter' && input.value.trim()) addKeyword(cat, input.value.trim().toUpperCase()); });
        keysArea.appendChild(input);
        div.appendChild(keysArea);
        list.appendChild(div);
    });
}
window.addKeyword = (cat, word) => { if(!appState.categoryRules[cat].includes(word)) { appState.categoryRules[cat].push(word); saveToFirebase(); renderCategoryManager(); } };
window.removeKeyword = (cat, word) => { appState.categoryRules[cat] = appState.categoryRules[cat].filter(w => w !== word); saveToFirebase(); renderCategoryManager(); };
window.deleteCategory = (cat) => { if(confirm(`Excluir ${cat}?`)) { delete appState.categoryRules[cat]; saveToFirebase(); renderCategoryManager(); } };
function addNewCategory() { const input = document.getElementById('new-cat-name'); const name = input.value.trim(); if(name && !appState.categoryRules[name]) { appState.categoryRules[name] = []; input.value = ''; saveToFirebase(); renderCategoryManager(); } }
function updateChart(data) { const ctx = document.getElementById('expenseChart').getContext('2d'); const labels = Object.keys(data).filter(k => data[k] > 0); const values = labels.map(k => data[k]); if(chartInstance) chartInstance.destroy(); chartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } } }); }
function formatAndSetIncome(elem) { return; } // Desabilitado pois agora é automático
function deleteCurrentMonth() { if(appState.currentViewMonth === "ALL") return; if(confirm(`Apagar dados?`)) { appState.transactions = appState.transactions.filter(t => t.billMonth !== appState.currentViewMonth); delete appState.incomeDetails[appState.currentViewMonth]; saveToFirebase(); } }
function formatMonthLabel(isoMonth) { if(!isoMonth) return "---"; const [y, m] = isoMonth.split('-'); const date = new Date(y, m - 1); const name = date.toLocaleString('pt-BR', { month: 'long' }); return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`; }
function formatBRL(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }