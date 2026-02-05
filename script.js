/**
 * ============================================================================
 * GESTOR FINANCEIRO - SCRIPT PRINCIPAL (V37 - Correção de Escopo)
 * ============================================================================
 */

// ============================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÃO
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Configurações do Firebase
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

// ============================================================================
// 2. ESTADO GLOBAL E CONSTANTES
// ============================================================================
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

const CHART_COLORS = ['#1C1C1E', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#5856D6', '#AF52DE', '#8E8E93', '#007AFF'];

let appState = {
    transactions: [],
    incomeDetails: {},
    categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    categories: [...Object.keys(DEFAULT_RULES)],
    currentViewMonth: null,
    user: null,
    isEditMode: false
};

let chartInstance = null;

// ============================================================================
// 3. INICIALIZAÇÃO E EVENTOS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    
    if(document.getElementById('import-ref-month')) document.getElementById('import-ref-month').value = `${yyyy}-${mm}`;
    if(document.getElementById('manual-date')) document.getElementById('manual-date').value = `${yyyy}-${mm}-${String(today.getDate()).padStart(2,'0')}`;

    // Auth
    document.getElementById('btn-login').addEventListener('click', () => signInWithPopup(auth, provider));
    
    // Filtros e Inputs
    document.getElementById('view-month').addEventListener('change', (e) => changeViewMonth(e.target.value));
    document.getElementById('fileInput').addEventListener('change', (e) => handleFileUpload(e.target.files[0]));

    // Menu Dropdown
    const btnToggleMenu = document.getElementById('btn-toggle-menu');
    const dropdown = document.getElementById('main-dropdown');
    btnToggleMenu.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('show'); });
    window.addEventListener('click', () => { if (dropdown.classList.contains('show')) dropdown.classList.remove('show'); });

    // Ações do Menu
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    document.getElementById('btn-delete-month').addEventListener('click', deleteCurrentMonth);

    // Modais
    setupModal('import-modal', 'btn-open-import', 'btn-close-import', () => {
        if(appState.currentViewMonth && appState.currentViewMonth !== "ALL") {
            document.getElementById('import-ref-month').value = appState.currentViewMonth;
        }
    });
    
    setupModal('settings-modal', 'btn-open-categories', 'btn-close-settings', renderCategoryManager);
    document.getElementById('btn-add-cat').addEventListener('click', addNewCategory);

    setupModal('manual-modal', 'btn-open-manual', 'btn-close-manual', () => openManualModal());
    document.getElementById('btn-save-manual').addEventListener('click', saveManualTransaction);

    setupModal('income-modal', 'btn-manage-income', 'btn-close-income', openIncomeModal);
    document.getElementById('btn-add-income-item').addEventListener('click', addIncomeItem);

    // Botão Toggle Edição (Topo da Lista)
    document.getElementById('btn-toggle-edit').addEventListener('click', toggleEditMode);
});

// Helper para configurar Modais
function setupModal(modalId, openBtnId, closeBtnId, onOpenCallback) {
    const modal = document.getElementById(modalId);
    if(document.getElementById(openBtnId)) {
        document.getElementById(openBtnId).addEventListener('click', () => {
            if(onOpenCallback) onOpenCallback();
            modal.style.display = 'flex';
        });
    }
    if(document.getElementById(closeBtnId)) {
        document.getElementById(closeBtnId).addEventListener('click', () => modal.style.display = 'none');
    }
}

// ============================================================================
// 4. FIREBASE E DADOS
// ============================================================================
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
            appState.incomeDetails = data.incomeDetails || {};
            
            // Migração de renda antiga
            if (data.monthlyIncomes && Object.keys(appState.incomeDetails).length === 0) {
                Object.keys(data.monthlyIncomes).forEach(m => {
                    if (data.monthlyIncomes[m] > 0) appState.incomeDetails[m] = [{ id: Date.now(), desc: "Renda Principal", val: data.monthlyIncomes[m] }];
                });
            }

            if (data.categoryRules) appState.categoryRules = data.categoryRules;
            appState.categories = [...Object.keys(appState.categoryRules)];
            if(!appState.categories.includes("Outros")) appState.categories.push("Outros");

            // Só recarrega a UI se NÃO estiver editando (evita perder foco)
            if (!appState.isEditMode) {
                initViewSelector();
            }
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
            incomeDetails: appState.incomeDetails, 
            categoryRules: appState.categoryRules 
        });
    } catch (e) { console.error(e); }
}

// ============================================================================
// 5. LÓGICA DE UI E RENDERIZAÇÃO
// ============================================================================

// Expande/Recolhe seções
window.toggleSection = (sectionId, iconId) => {
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(iconId);
    if (section && icon) {
        section.classList.toggle('collapsed-content');
        icon.classList.toggle('icon-closed');
    }
};

// Alterna Modo Edição
// IMPORTANTE: Exposto para window para o botão "Salvar" funcionar
window.toggleEditMode = () => {
    appState.isEditMode = !appState.isEditMode;
    const btn = document.getElementById('btn-toggle-edit');
    
    if(appState.isEditMode) {
        btn.classList.add('active');
        document.getElementById('output').classList.remove('collapsed-content'); // Abre lista se estiver fechada
    } else {
        btn.classList.remove('active');
    }
    
    filterAndRender(); // Recarrega a lista com os novos controles
};

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

    // Ordenação
    transactions.sort((a,b) => {
        const [da, ma, ya] = a.date.split('.'); 
        const [db, mb, yb] = b.date.split('.');
        return new Date(yb, mb-1, db) - new Date(ya, ma-1, da);
    }).reverse(); 

    // Cálculos
    transactions.forEach(t => {
        let cat = appState.categories.includes(t.category) ? t.category : "Outros";
        grouped[cat].push(t);
        if(t.amount > 0) { gross += t.amount; catTotals[cat] = (catTotals[cat] || 0) + t.amount; }
        else { refunds += Math.abs(t.amount); }
    });

    const net = gross - refunds;
    const leftover = currentIncome - net;
    
    // Atualiza Dashboard
    document.getElementById('month-gross').innerText = formatBRL(gross);
    document.getElementById('month-refunds').innerText = "- " + formatBRL(refunds);
    document.getElementById('month-net').innerText = formatBRL(net);
    const leftoverEl = document.getElementById('month-leftover');
    leftoverEl.innerText = formatBRL(leftover);
    leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';
    
    updateChart(catTotals);
    renderCategorySummary(catTotals, gross);

    // Renderiza Lista
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

            if (appState.isEditMode) {
                // --- MODO EDIÇÃO ---
                const options = appState.categories.map(c => `<option value="${c}" ${c === item.category ? 'selected' : ''}>${c}</option>`).join('');
                const [d, m, y] = item.date.split('.');
                const dateISO = `${y}-${m}-${d}`;

                div.innerHTML = `
                    <div class="tx-row-edit">
                        <div style="flex:2;">
                            <input type="text" class="edit-input" value="${item.description}" onchange="window.updateTx('${item.id}', 'description', this.value)">
                            <input type="date" class="edit-input" value="${dateISO}" onchange="window.updateTx('${item.id}', 'date', this.value)">
                        </div>
                        <div style="flex:1;">
                            <input type="number" class="edit-input" value="${Math.abs(item.amount)}" step="0.01" onchange="window.updateTx('${item.id}', 'amount', this.value)">
                            <select class="edit-select" onchange="window.updateTx('${item.id}', 'category', this.value)">${options}</select>
                        </div>
                        <button class="btn-row-delete" onclick="window.deleteTransaction('${item.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>`;
            } else {
                // --- MODO LEITURA ---
                div.onclick = () => window.editTransaction(item.id);
                div.innerHTML = `
                    <div class="tx-row-main">
                        <div class="tx-main"><span class="tx-desc">${item.description}</span><span class="tx-date">${item.date}</span></div>
                        <div class="tx-side">
                            <span class="tx-val ${isRefund ? 'color-pos' : 'color-neg'}">${isRefund ? '+ ' : ''}${formatBRL(Math.abs(item.amount))}</span>
                            <div class="cat-row-info"><span class="tx-cat-label">${item.category}</span></div>
                        </div>
                    </div>`;
            }
            listBox.appendChild(div);
        });
        catGroup.appendChild(listBox);
        output.appendChild(catGroup);
    });

    // Botão "Salvar Alterações" no final da lista
    if (appState.isEditMode) {
        const saveBar = document.createElement('div');
        saveBar.className = 'save-edit-bar';
        saveBar.innerHTML = `<button class="btn-finish-edit" onclick="window.toggleEditMode()"><i class="fa-solid fa-check"></i> Salvar Alterações</button>`;
        output.appendChild(saveBar);
    }
}

// --- Funções de Edição (Expostas globalmente) ---
window.updateTx = (id, field, value) => {
    const tx = appState.transactions.find(t => t.id === id);
    if (!tx) return;

    if (field === 'amount') {
        const val = parseFloat(value);
        if (isNaN(val)) return;
        tx.amount = tx.amount < 0 ? -Math.abs(val) : Math.abs(val);
    } else if (field === 'date') {
        const [y, m, d] = value.split('-');
        tx.date = `${d}.${m}.${y}`;
    } else {
        tx[field] = value;
    }
    saveToFirebase(); // Salva sem recarregar a UI
};

window.editTransaction = (id) => {
    if(appState.isEditMode) return;
    const tx = appState.transactions.find(t => t.id === id);
    if(tx) openManualModal(tx);
};

window.deleteTransaction = (id) => {
    if(confirm("Excluir item?")) {
        appState.transactions = appState.transactions.filter(t => t.id !== id);
        saveToFirebase();
        document.getElementById('manual-modal').style.display = 'none';
        
        // Se estiver no modo edição, remove visualmente ou recarrega
        if(appState.isEditMode) {
            filterAndRender();
        } else {
            filterAndRender();
        }
    }
};

function renderCategorySummary(catTotals, totalGross) {
    const container = document.getElementById('category-summary-area');
    if(!container) return;
    container.innerHTML = '';
    const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);
    sortedCats.forEach(cat => {
        const val = catTotals[cat];
        if (val <= 0) return;
        const percent = totalGross > 0 ? (val / totalGross) * 100 : 0;
        const catIndex = appState.categories.indexOf(cat);
        const color = CHART_COLORS[catIndex % CHART_COLORS.length] || '#8E8E93';
        const div = document.createElement('div');
        div.className = 'cat-summary-card';
        div.innerHTML = `<div class="cat-sum-header"><span>${cat}</span><span>${percent.toFixed(1)}%</span></div><div class="cat-sum-val">${formatBRL(val)}</div><div class="cat-progress-bg"><div class="cat-progress-bar" style="width: ${percent}%; background-color: ${color};"></div></div>`;
        container.appendChild(div);
    });
}

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    const activeCats = Object.keys(data).filter(k => data[k] > 0);
    const values = activeCats.map(k => data[k]);
    if(chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: activeCats, datasets: [{ data: values, backgroundColor: CHART_COLORS, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, usePointStyle: true, font: { size: 12 }, padding: 15 } }, tooltip: { callbacks: { label: function(context) { return ` ${context.label}: ${context.parsed.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`; } } } } }
    });
}

// ============================================================================
// 6. LANÇAMENTO MANUAL (MODAL)
// ============================================================================
function openManualModal(txToEdit = null) {
    const modal = document.getElementById('manual-modal');
    const select = document.getElementById('manual-cat');
    const btnDelete = document.getElementById('btn-delete-manual');
    
    select.innerHTML = '';
    appState.categories.sort().forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.text = cat; select.add(opt); });
    
    // Configura botão de excluir dinamicamente
    if(btnDelete) {
        const newBtn = btnDelete.cloneNode(true);
        btnDelete.parentNode.replaceChild(newBtn, btnDelete);
        newBtn.addEventListener('click', () => {
            const id = modal.dataset.editId;
            if(id) window.deleteTransaction(id);
        });
    }

    if(txToEdit) {
        document.getElementById('manual-modal-title').innerText = "Editar Lançamento";
        modal.dataset.editId = txToEdit.id;
        document.getElementById('manual-desc').value = txToEdit.description;
        document.getElementById('manual-val').value = Math.abs(txToEdit.amount);
        const [d, m, y] = txToEdit.date.split('.');
        document.getElementById('manual-date').value = `${y}-${m}-${d}`;
        document.getElementById('manual-cat').value = txToEdit.category;
        const type = txToEdit.amount < 0 ? 'credit' : 'debit';
        document.querySelector(`input[name="tx-type"][value="${type}"]`).checked = true;
        if(document.getElementById('btn-delete-manual')) document.getElementById('btn-delete-manual').style.display = 'block';
    } else {
        document.getElementById('manual-modal-title').innerText = "Novo Lançamento";
        delete modal.dataset.editId;
        document.getElementById('manual-desc').value = '';
        document.getElementById('manual-val').value = '';
        const today = new Date();
        document.getElementById('manual-date').value = today.toISOString().split('T')[0];
        document.querySelector('input[name="tx-type"][value="debit"]').checked = true;
        if(document.getElementById('btn-delete-manual')) document.getElementById('btn-delete-manual').style.display = 'none';
    }
    modal.style.display = 'flex';
}

function saveManualTransaction() {
    const modal = document.getElementById('manual-modal');
    const editId = modal.dataset.editId;
    const desc = document.getElementById('manual-desc').value.trim();
    const valStr = document.getElementById('manual-val').value;
    const dateStr = document.getElementById('manual-date').value;
    const cat = document.getElementById('manual-cat').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;

    if(!desc || !valStr || !dateStr) { alert("Preencha tudo!"); return; }
    let amount = parseFloat(valStr);
    if (type === 'credit') amount = -Math.abs(amount); else amount = Math.abs(amount);
    const [y, m, d] = dateStr.split('-');
    const formattedDate = `${d}.${m}.${y}`;
    const billMonth = `${y}-${m}`;

    if(editId) {
        const index = appState.transactions.findIndex(t => t.id === editId);
        if(index > -1) appState.transactions[index] = { ...appState.transactions[index], date: formattedDate, billMonth: billMonth, description: desc, amount: amount, category: cat };
    } else {
        appState.transactions.push({ id: "MAN_" + Date.now(), date: formattedDate, billMonth: billMonth, description: desc, amount: amount, category: cat, isBillPayment: false });
    }
    saveToFirebase();
    modal.style.display = 'none';
    if(appState.currentViewMonth !== "ALL" && appState.currentViewMonth !== billMonth && !editId) {
        appState.currentViewMonth = billMonth;
        initViewSelector();
    } else {
        filterAndRender();
    }
}

// ============================================================================
// 7. GERENCIAMENTO DE RENDA
// ============================================================================
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
        container.innerHTML += `<div class="income-item"><div class="income-desc">${item.desc}</div><div style="display:flex; align-items:center;"><span class="income-val">${formatBRL(item.val)}</span><button class="btn-del-income" onclick="window.removeIncome(${index})"><i class="fa-solid fa-trash"></i></button></div></div>`;
    });
    document.getElementById('modal-income-total').innerText = formatBRL(total);
}
function addIncomeItem() {
    const desc = document.getElementById('inc-desc').value.trim();
    const val = parseFloat(document.getElementById('inc-val').value);
    if(!desc || isNaN(val) || val <= 0) return;
    const month = appState.currentViewMonth;
    if(!appState.incomeDetails[month]) appState.incomeDetails[month] = [];
    appState.incomeDetails[month].push({ id: Date.now(), desc: desc, val: val });
    saveToFirebase(); renderIncomeList(); filterAndRender();
    document.getElementById('inc-desc').value = ''; document.getElementById('inc-val').value = '';
}
window.removeIncome = (index) => { const month = appState.currentViewMonth; if(appState.incomeDetails[month]) { appState.incomeDetails[month].splice(index, 1); saveToFirebase(); renderIncomeList(); filterAndRender(); } };

// ============================================================================
// 8. IMPORTAÇÃO
// ============================================================================
async function handleFileUpload(file) {
    if(!file) return;
    const targetMonth = document.getElementById('import-ref-month').value;
    if(!targetMonth) { alert("Selecione o mês."); return; }
    try {
        const textContent = await file.text();
        const count = parseFile(textContent, targetMonth);
        if(count > 0) { await saveToFirebase(); alert(`Sucesso! ${count} importados.`); appState.currentViewMonth = targetMonth; initViewSelector(); document.getElementById('import-modal').style.display = 'none'; } 
        else { alert("Nada encontrado."); }
    } catch (e) { console.error(e); }
    document.getElementById('fileInput').value = '';
}
function parseFile(text, billMonth) {
    const cleanText = text.replace(/[\r\n]+/g, ' '); 
    const regexBB = /(\d{2}[\/\.]\d{2}[\/\.]\d{4})(.*?)(?:R\$\s*)?(-?[\d\.]+,\d{2})/g;
    let match; let count = 0;
    while ((match = regexBB.exec(cleanText)) !== null) {
        let dateRaw = match[1]; let rawDesc = match[2].trim();
        let val = parseFloat(match[3].replace(/R\$/gi, '').trim().replace(/\./g, '').replace(',', '.'));
        let desc = rawDesc.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
        const upperDesc = desc.toUpperCase();
        if (upperDesc.includes("SALDO FATURA") || upperDesc.includes("SUBTOTAL") || upperDesc.includes("TOTAL") || upperDesc === "BR") continue;
        if (upperDesc.includes("PGTO")) continue;
        const cat = detectCategory(desc);
        const exists = appState.transactions.some(t => t.description === desc && t.amount === val && t.date === dateRaw && t.billMonth === billMonth);
        if(!exists) { appState.transactions.push({ id: Math.random().toString(36).substr(2, 9), date: dateRaw, billMonth: billMonth, description: desc, amount: val, category: cat, isBillPayment: false }); count++; }
    }
    return count;
}
function detectCategory(description) {
    const descUpper = description.toUpperCase();
    for (const [category, keywords] of Object.entries(appState.categoryRules)) { for (const word of keywords) { if (descUpper.includes(word)) return category; } }
    return "Outros";
}

// ============================================================================
// 9. CONFIGURAÇÃO (CATEGORIAS)
// ============================================================================
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

function deleteCurrentMonth() { if(appState.currentViewMonth === "ALL") { alert("Não é possível apagar a visão geral."); return; } if(!appState.currentViewMonth) return; if(confirm(`Apagar dados?`)) { appState.transactions = appState.transactions.filter(t => t.billMonth !== appState.currentViewMonth); delete appState.incomeDetails[appState.currentViewMonth]; saveToFirebase(); } }
function formatMonthLabel(isoMonth) { if(!isoMonth) return "---"; const [y, m] = isoMonth.split('-'); const date = new Date(y, m - 1); const name = date.toLocaleString('pt-BR', { month: 'long' }); return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`; }
function formatBRL(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }