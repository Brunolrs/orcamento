/**
 * ============================================================================
 * GESTOR FINANCEIRO V34 - SCRIPT PRINCIPAL
 * ============================================================================
 * Tecnologias: Vanilla JS, Firebase (Auth/Firestore), Chart.js
 * Funcionalidades: Importação BB, Gestão de Renda, Categorias, Gráficos.
 */

// ============================================================================
// 1. IMPORTAÇÕES E CONFIGURAÇÃO DO FIREBASE
// ============================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Configurações do Projeto Firebase
// IMPORTANTE: Substitua pelas suas chaves reais se necessário
const firebaseConfig = {
    apiKey: "AIzaSyC4g1Vh3QrqgF4Z026YdfkPH6nNSBsMFj0",
    authDomain: "orcamento-96cae.firebaseapp.com",
    projectId: "orcamento-96cae",
    storageBucket: "orcamento-96cae.firebasestorage.app",
    messagingSenderId: "984778906391",
    appId: "1:984778906391:web:b217e948a54d76bfcab552",
    measurementId: "G-5CMJTBJRX2"
};

// Inicialização dos Serviços
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ============================================================================
// 2. CONSTANTES E ESTADO GLOBAL
// ============================================================================

// Regras de categorização padrão (Palavras-chave)
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

// Cores para o gráfico (Chart.js)
const CHART_COLORS = ['#1C1C1E', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#5856D6', '#AF52DE', '#8E8E93', '#007AFF'];

// Estado da Aplicação (Single Source of Truth)
let appState = {
    transactions: [],   // Lista de todas as transações
    incomeDetails: {},  // Rendas detalhadas por mês: { "2024-02": [{desc, val}...] }
    categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)), 
    categories: [...Object.keys(DEFAULT_RULES)],
    currentViewMonth: null, // Mês selecionado no filtro (ou "ALL")
    user: null          // Usuário logado
};

let chartInstance = null; // Instância do gráfico para poder destruir/recriar

// ============================================================================
// 3. INICIALIZAÇÃO E LISTENERS DE EVENTOS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Configura inputs de data com o mês atual
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    
    if(document.getElementById('import-ref-month')) {
        document.getElementById('import-ref-month').value = `${yyyy}-${mm}`;
    }
    if(document.getElementById('manual-date')) {
        document.getElementById('manual-date').value = `${yyyy}-${mm}-${String(today.getDate()).padStart(2,'0')}`;
    }

    // --- Autenticação ---
    document.getElementById('btn-login').addEventListener('click', () => signInWithPopup(auth, provider));
    
    // --- Controles Principais ---
    document.getElementById('view-month').addEventListener('change', (e) => changeViewMonth(e.target.value));
    document.getElementById('fileInput').addEventListener('change', (e) => handleFileUpload(e.target.files[0]));

    // --- Menu Dropdown (Toggle) ---
    const btnToggleMenu = document.getElementById('btn-toggle-menu');
    const dropdown = document.getElementById('main-dropdown');

    btnToggleMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
    });

    // Fecha o menu ao clicar fora
    window.addEventListener('click', () => {
        if (dropdown.classList.contains('show')) dropdown.classList.remove('show');
    });

    // --- Itens do Menu Dropdown ---
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    
    // Abrir Importação
    const modalImport = document.getElementById('import-modal');
    document.getElementById('btn-open-import').addEventListener('click', () => {
        if(appState.currentViewMonth && appState.currentViewMonth !== "ALL") {
            document.getElementById('import-ref-month').value = appState.currentViewMonth;
        }
        modalImport.style.display = 'flex';
    });
    document.getElementById('btn-close-import').addEventListener('click', () => modalImport.style.display = 'none');

    // Abrir Categorias
    const modalSettings = document.getElementById('settings-modal');
    document.getElementById('btn-open-categories').addEventListener('click', () => { 
        renderCategoryManager(); 
        modalSettings.style.display = 'flex'; 
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => modalSettings.style.display = 'none');
    document.getElementById('btn-add-cat').addEventListener('click', addNewCategory);

    // Botão Limpar Mês
    document.getElementById('btn-delete-month').addEventListener('click', deleteCurrentMonth);

    // --- Outros Modais ---
    
    // Lançamento Manual
    const modalManual = document.getElementById('manual-modal');
    document.getElementById('btn-open-manual').addEventListener('click', () => openManualModal());
    document.getElementById('btn-close-manual').addEventListener('click', () => modalManual.style.display = 'none');
    document.getElementById('btn-save-manual').addEventListener('click', saveManualTransaction);

    // Gerenciamento de Renda
    const modalIncome = document.getElementById('income-modal');
    document.getElementById('btn-manage-income').addEventListener('click', openIncomeModal);
    document.getElementById('btn-close-income').addEventListener('click', () => modalIncome.style.display = 'none');
    document.getElementById('btn-add-income-item').addEventListener('click', addIncomeItem);
});

// ============================================================================
// 4. FIREBASE: AUTENTICAÇÃO E BANCO DE DADOS
// ============================================================================

// Monitora estado de login
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

// Escuta mudanças no Firestore em tempo real
function startRealtimeListener(uid) {
    const userDocRef = doc(db, "users", uid);
    
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            appState.transactions = data.transactions || [];
            appState.incomeDetails = data.incomeDetails || {};
            
            // Migração de dados legados (se existir monthlyIncomes antigo)
            if (data.monthlyIncomes && Object.keys(appState.incomeDetails).length === 0) {
                Object.keys(data.monthlyIncomes).forEach(m => {
                    if (data.monthlyIncomes[m] > 0) {
                        appState.incomeDetails[m] = [{ id: Date.now(), desc: "Renda Principal", val: data.monthlyIncomes[m] }];
                    }
                });
            }

            if (data.categoryRules) appState.categoryRules = data.categoryRules;
            
            // Atualiza lista de categorias na memória
            appState.categories = [...Object.keys(appState.categoryRules)];
            if(!appState.categories.includes("Outros")) appState.categories.push("Outros");

            initViewSelector();
        } else {
            // Cria documento inicial para novos usuários
            setDoc(userDocRef, { 
                transactions: [], 
                incomeDetails: {}, 
                categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)) 
            });
        }
    });
}

// Salva o estado atual no Firebase
async function saveToFirebase() {
    if (!appState.user) return;
    const userDocRef = doc(db, "users", appState.user.uid);
    try {
        await updateDoc(userDocRef, {
            transactions: appState.transactions,
            incomeDetails: appState.incomeDetails,
            categoryRules: appState.categoryRules
        });
    } catch (e) {
        console.error("Erro ao salvar no Firebase:", e);
    }
}

// ============================================================================
// 5. INTERFACE (UI) E RENDERIZAÇÃO
// ============================================================================

// Expande/Recolhe seções (Gráfico, Lista, etc.)
window.toggleSection = (sectionId, iconId) => {
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(iconId);
    if (section && icon) {
        section.classList.toggle('collapsed-content');
        icon.classList.toggle('icon-closed');
    }
};

// Inicializa o seletor de meses
function initViewSelector() {
    const select = document.getElementById('view-month');
    select.innerHTML = '';

    // Opção "Visão Geral"
    const optAll = document.createElement('option');
    optAll.value = "ALL";
    optAll.text = "📊 Visão Geral (Tudo)";
    select.add(optAll);

    // Extrai meses únicos das transações
    const months = Array.from(new Set(appState.transactions.map(t => t.billMonth))).sort().reverse();
    
    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.text = formatMonthLabel(m);
        select.add(opt);
    });

    // Define seleção padrão
    if (!appState.currentViewMonth) {
        appState.currentViewMonth = months.length > 0 ? months[0] : "ALL";
    }
    // Se o mês selecionado foi apagado, volta para "ALL"
    if (appState.currentViewMonth !== "ALL" && !months.includes(appState.currentViewMonth)) {
        appState.currentViewMonth = "ALL";
    }
    
    select.value = appState.currentViewMonth;
    filterAndRender();
}

// Evento de troca de mês
window.changeViewMonth = (val) => {
    appState.currentViewMonth = val;
    filterAndRender();
};

// Filtra dados e orquestra a renderização da tela
function filterAndRender() {
    const view = appState.currentViewMonth;
    let txs = [];
    let currentIncome = 0;
    let labelText = "";

    if (view === "ALL") {
        // Visão Geral: Todas as transações e soma de todas as rendas
        txs = appState.transactions;
        Object.values(appState.incomeDetails).forEach(list => {
            list.forEach(i => currentIncome += i.val);
        });
        labelText = "Renda Acumulada";
    } else {
        // Visão Mensal: Filtra pelo mês
        txs = appState.transactions.filter(t => t.billMonth === view);
        const incomeList = appState.incomeDetails[view] || [];
        incomeList.forEach(i => currentIncome += i.val);
        labelText = `Renda de ${formatMonthLabel(view).split(' ')[0]}`;
    }

    // Atualiza display de renda
    const inputEl = document.getElementById('monthly-income');
    if(currentIncome > 0) {
        inputEl.value = currentIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    } else {
        inputEl.value = "0,00";
    }
    
    document.getElementById('income-label-text').innerText = labelText;
    
    // Botão de gerenciar renda some na visão geral
    document.getElementById('btn-manage-income').style.display = (view === "ALL") ? "none" : "flex";

    renderUI(txs, currentIncome);
}

// Renderiza Dashboard, Gráficos e Listas
function renderUI(transactions, currentIncome) {
    const output = document.getElementById('output');
    output.innerHTML = '';

    let gross = 0;
    let refunds = 0;
    const catTotals = {};
    const grouped = {};
    
    // Inicializa grupos de categoria
    appState.categories.forEach(c => grouped[c] = []);
    if(!grouped["Outros"]) grouped["Outros"] = [];

    // Ordenação por data (decrescente)
    transactions.sort((a,b) => {
        const [da, ma, ya] = a.date.split('.'); 
        const [db, mb, yb] = b.date.split('.');
        return new Date(yb, mb-1, db) - new Date(ya, ma-1, da);
    }).reverse(); 

    // Cálculos Financeiros
    transactions.forEach(t => {
        let cat = appState.categories.includes(t.category) ? t.category : "Outros";
        grouped[cat].push(t);
        
        if(t.amount > 0) { 
            // Valor Positivo = Gasto (na nossa lógica interna)
            gross += t.amount; 
            catTotals[cat] = (catTotals[cat] || 0) + t.amount; 
        } else { 
            // Valor Negativo = Reembolso/Crédito
            refunds += Math.abs(t.amount); 
        }
    });

    const net = gross - refunds;
    const leftover = currentIncome - net;
    
    // Atualiza Cards do Topo
    document.getElementById('month-gross').innerText = formatBRL(gross);
    document.getElementById('month-refunds').innerText = "- " + formatBRL(refunds);
    document.getElementById('month-net').innerText = formatBRL(net);
    
    const leftoverEl = document.getElementById('month-leftover');
    leftoverEl.innerText = formatBRL(leftover);
    leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';
    
    // Atualiza Gráficos
    updateChart(catTotals);
    renderCategorySummary(catTotals, gross);

    // Renderiza Lista Detalhada
    Object.keys(grouped).sort().forEach(cat => {
        const items = grouped[cat];
        if(!items || items.length === 0) return;
        
        const catTotalValue = catTotals[cat] || 0;
        
        const catGroup = document.createElement('div');
        catGroup.className = 'cat-group';
        
        // Cabeçalho da Categoria com Total
        catGroup.innerHTML = `
            <div class="cat-header">
                <span class="cat-name">${cat}</span>
                <span class="cat-name" style="color: var(--ios-text);">${formatBRL(catTotalValue)}</span>
            </div>`;
            
        const listBox = document.createElement('div');
        listBox.className = 'list-box';
        
        items.forEach(item => {
            const isRefund = item.amount < 0;
            const div = document.createElement('div');
            div.className = 'tx-item';
            
            // Clique na linha abre edição
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
                            <button class="tx-edit-link"><i class="fa-solid fa-pen"></i> Editar</button>
                        </div>
                    </div>
                </div>`;
            listBox.appendChild(div);
        });
        catGroup.appendChild(listBox);
        output.appendChild(catGroup);
    });
}

// Renderiza as barras de progresso por categoria
function renderCategorySummary(catTotals, totalGross) {
    const container = document.getElementById('category-summary-area');
    if(!container) return;
    container.innerHTML = '';

    // Ordena categorias do maior gasto para o menor
    const sortedCats = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a]);

    sortedCats.forEach(cat => {
        const val = catTotals[cat];
        if (val <= 0) return;

        const percent = totalGross > 0 ? (val / totalGross) * 100 : 0;
        
        // Pega a cor correspondente no array de cores
        const catIndex = appState.categories.indexOf(cat);
        const color = CHART_COLORS[catIndex % CHART_COLORS.length] || '#8E8E93';

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

// Atualiza o Gráfico Chart.js
function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    
    const activeCats = Object.keys(data).filter(k => data[k] > 0);
    const values = activeCats.map(k => data[k]);

    if(chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels: activeCats, // Apenas nomes das categorias (Limpo)
            datasets: [{ 
                data: values, 
                backgroundColor: CHART_COLORS, 
                borderWidth: 0 
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '70%', 
            plugins: { 
                legend: { 
                    position: 'right', // Legenda Lateral
                    labels: { 
                        boxWidth: 12, 
                        usePointStyle: true,
                        font: { size: 12 },
                        padding: 15
                    } 
                },
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

// ============================================================================
// 6. FUNCIONALIDADES: LANÇAMENTO MANUAL (CRIAR/EDITAR/EXCLUIR)
// ============================================================================

// Abre modal para editar transação existente
window.editTransaction = (id) => {
    const tx = appState.transactions.find(t => t.id === id);
    if(tx) openManualModal(tx);
};

// Exclui transação
window.deleteTransaction = (id) => {
    if(confirm("Deseja realmente excluir este lançamento?")) {
        appState.transactions = appState.transactions.filter(t => t.id !== id);
        saveToFirebase();
        // Fecha modal se estiver aberto
        document.getElementById('manual-modal').style.display = 'none';
        filterAndRender();
    }
};

// Abre o modal (vazio para novo, preenchido para edição)
function openManualModal(txToEdit = null) {
    const modal = document.getElementById('manual-modal');
    const select = document.getElementById('manual-cat');
    const btnDelete = document.getElementById('btn-delete-manual');
    
    // Popula categorias
    select.innerHTML = '';
    appState.categories.sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.text = cat;
        select.add(opt);
    });
    
    // Listener do botão excluir dentro do modal
    if(btnDelete) {
        // Remove listener antigo para evitar duplicidade (clone hack)
        const newBtn = btnDelete.cloneNode(true);
        btnDelete.parentNode.replaceChild(newBtn, btnDelete);
        
        newBtn.addEventListener('click', () => {
            const id = modal.dataset.editId;
            if(id) window.deleteTransaction(id);
        });
    }

    if(txToEdit) {
        // MODO EDIÇÃO
        document.getElementById('manual-modal-title').innerText = "Editar Lançamento";
        modal.dataset.editId = txToEdit.id;
        document.getElementById('manual-desc').value = txToEdit.description;
        document.getElementById('manual-val').value = Math.abs(txToEdit.amount);
        
        const [d, m, y] = txToEdit.date.split('.');
        document.getElementById('manual-date').value = `${y}-${m}-${d}`;
        
        document.getElementById('manual-cat').value = txToEdit.category;
        
        const type = txToEdit.amount < 0 ? 'credit' : 'debit';
        document.querySelector(`input[name="tx-type"][value="${type}"]`).checked = true;
        
        // Mostra botão excluir
        if(document.getElementById('btn-delete-manual')) {
            document.getElementById('btn-delete-manual').style.display = 'block';
        }
        
    } else {
        // MODO NOVO
        document.getElementById('manual-modal-title').innerText = "Novo Lançamento";
        delete modal.dataset.editId;
        document.getElementById('manual-desc').value = '';
        document.getElementById('manual-val').value = '';
        
        const today = new Date();
        document.getElementById('manual-date').value = today.toISOString().split('T')[0];
        
        document.querySelector('input[name="tx-type"][value="debit"]').checked = true;
        
        // Esconde botão excluir
        if(document.getElementById('btn-delete-manual')) {
            document.getElementById('btn-delete-manual').style.display = 'none';
        }
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

    if(!desc || !valStr || !dateStr) {
        alert("Preencha todos os campos!");
        return;
    }

    let amount = parseFloat(valStr);
    if (type === 'credit') amount = -Math.abs(amount);
    else amount = Math.abs(amount);

    const [y, m, d] = dateStr.split('-');
    const formattedDate = `${d}.${m}.${y}`;
    const billMonth = `${y}-${m}`;

    if(editId) {
        // Atualiza transação existente
        const index = appState.transactions.findIndex(t => t.id === editId);
        if(index > -1) {
            appState.transactions[index] = {
                ...appState.transactions[index],
                date: formattedDate,
                billMonth: billMonth,
                description: desc,
                amount: amount,
                category: cat
            };
        }
    } else {
        // Cria nova transação
        appState.transactions.push({
            id: "MAN_" + Date.now(),
            date: formattedDate,
            billMonth: billMonth,
            description: desc,
            amount: amount,
            category: cat,
            isBillPayment: false
        });
    }

    saveToFirebase();
    modal.style.display = 'none';
    
    // Se mudou o mês da data, altera a visualização
    if(appState.currentViewMonth !== "ALL" && appState.currentViewMonth !== billMonth && !editId) {
        appState.currentViewMonth = billMonth;
        initViewSelector();
    } else {
        filterAndRender();
    }
}

// ============================================================================
// 7. FUNCIONALIDADES: GERENCIADOR DE RENDA
// ============================================================================
function openIncomeModal() {
    if(appState.currentViewMonth === "ALL") {
        alert("Selecione um mês específico para gerenciar a renda.");
        return;
    }
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

function addIncomeItem() {
    const desc = document.getElementById('inc-desc').value.trim();
    const val = parseFloat(document.getElementById('inc-val').value);
    
    if(!desc || isNaN(val) || val <= 0) return;
    
    const month = appState.currentViewMonth;
    if(!appState.incomeDetails[month]) appState.incomeDetails[month] = [];
    
    appState.incomeDetails[month].push({
        id: Date.now(),
        desc: desc,
        val: val
    });
    
    saveToFirebase();
    renderIncomeList();
    filterAndRender();
    
    document.getElementById('inc-desc').value = '';
    document.getElementById('inc-val').value = '';
}

window.removeIncome = (index) => {
    const month = appState.currentViewMonth;
    if(appState.incomeDetails[month]) {
        appState.incomeDetails[month].splice(index, 1);
        saveToFirebase();
        renderIncomeList();
        filterAndRender();
    }
};

// ============================================================================
// 8. FUNCIONALIDADES: IMPORTAÇÃO TXT (Banco do Brasil)
// ============================================================================
async function handleFileUpload(file) {
    if(!file) return;
    const targetMonth = document.getElementById('import-ref-month').value;
    if(!targetMonth) { alert("Selecione o mês da fatura."); return; }

    try {
        const textContent = await file.text();
        const count = parseFile(textContent, targetMonth);
        
        if(count > 0) {
            await saveToFirebase();
            alert(`Sucesso! ${count} transações importadas.`);
            appState.currentViewMonth = targetMonth;
            initViewSelector();
            document.getElementById('import-modal').style.display = 'none';
        } else {
            alert("Nenhuma transação encontrada no arquivo.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro ao ler arquivo.");
    }
    document.getElementById('fileInput').value = '';
}

function parseFile(text, billMonth) {
    // Une linhas quebradas (correção para formato BB)
    const cleanText = text.replace(/[\r\n]+/g, ' '); 

    // Regex para capturar: Data ... Descrição ... Valor
    const regexBB = /(\d{2}[\/\.]\d{2}[\/\.]\d{4})(.*?)(?:R\$\s*)?(-?[\d\.]+,\d{2})/g;
    
    let match;
    let count = 0;

    while ((match = regexBB.exec(cleanText)) !== null) {
        let dateRaw = match[1]; 
        let rawDesc = match[2].trim();
        // Converte 1.000,00 para 1000.00
        let val = parseFloat(match[3].replace(/R\$/gi, '').trim().replace(/\./g, '').replace(',', '.'));

        let desc = rawDesc.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
        const upperDesc = desc.toUpperCase();

        // Filtros de Segurança (ignora saldos e pagamentos de fatura)
        if (upperDesc.includes("SALDO FATURA") || 
            upperDesc.includes("SUBTOTAL") || 
            upperDesc.includes("TOTAL") || 
            upperDesc === "BR") continue;
        
        if (upperDesc.includes("PGTO")) continue;

        const cat = detectCategory(desc);

        // Dedupicação (Evita duplicatas exatas no mesmo mês)
        const exists = appState.transactions.some(t => 
            t.description === desc && t.amount === val && t.date === dateRaw && t.billMonth === billMonth
        );

        if(!exists) {
            appState.transactions.push({
                id: Math.random().toString(36).substr(2, 9),
                date: dateRaw, 
                billMonth: billMonth, 
                description: desc, 
                amount: val, 
                category: cat, 
                isBillPayment: false
            });
            count++;
        }
    }
    return count;
}

function detectCategory(description) {
    const descUpper = description.toUpperCase();
    for (const [category, keywords] of Object.entries(appState.categoryRules)) {
        for (const word of keywords) {
            if (descUpper.includes(word)) return category;
        }
    }
    return "Outros";
}

// ============================================================================
// 9. FUNCIONALIDADES: CATEGORIAS (Adicionar/Remover Palavras-Chave)
// ============================================================================
function renderCategoryManager() {
    const list = document.getElementById('categories-list');
    list.innerHTML = '';
    const cats = Object.keys(appState.categoryRules).sort();

    cats.forEach(cat => {
        const keywords = appState.categoryRules[cat];
        
        const div = document.createElement('div');
        div.className = 'cat-edit-item';
        div.innerHTML = `
            <div class="cat-edit-header">
                <span class="cat-name-display">${cat}</span>
                ${cat !== 'Outros' ? `<button class="btn-delete-cat" onclick="deleteCategory('${cat}')"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>`;
            
        const keysArea = document.createElement('div');
        keysArea.className = 'keywords-area';
        
        keywords.forEach(word => {
            const tag = document.createElement('span');
            tag.className = 'keyword-tag';
            tag.innerHTML = `${word} <span class="keyword-remove" onclick="removeKeyword('${cat}', '${word}')">&times;</span>`;
            keysArea.appendChild(tag);
        });

        const input = document.createElement('input');
        input.className = 'keyword-add-input';
        input.placeholder = '+ Palavra';
        input.addEventListener('keypress', (e) => {
            if(e.key === 'Enter' && input.value.trim()) {
                addKeyword(cat, input.value.trim().toUpperCase());
            }
        });
        
        keysArea.appendChild(input);
        div.appendChild(keysArea);
        list.appendChild(div);
    });
}

// Funções globais para acesso via HTML (onclick)
window.addKeyword = (cat, word) => {
    if(!appState.categoryRules[cat].includes(word)) {
        appState.categoryRules[cat].push(word);
        saveToFirebase();
        renderCategoryManager();
    }
};

window.removeKeyword = (cat, word) => {
    appState.categoryRules[cat] = appState.categoryRules[cat].filter(w => w !== word);
    saveToFirebase();
    renderCategoryManager();
};

window.deleteCategory = (cat) => {
    if(confirm(`Excluir categoria "${cat}"?`)) {
        delete appState.categoryRules[cat];
        saveToFirebase();
        renderCategoryManager();
    }
};

function addNewCategory() {
    const input = document.getElementById('new-cat-name');
    const name = input.value.trim();
    if(name && !appState.categoryRules[name]) {
        appState.categoryRules[name] = [];
        input.value = '';
        saveToFirebase();
        renderCategoryManager();
    }
}

// ============================================================================
// 10. HELPERS E UTILITÁRIOS
// ============================================================================

function deleteCurrentMonth() {
    if(appState.currentViewMonth === "ALL") {
        alert("Não é possível apagar a visão geral.");
        return;
    }
    if(!appState.currentViewMonth) return;
    
    if(confirm(`ATENÇÃO: Apagar TODOS os dados de ${appState.currentViewMonth}?`)) {
        appState.transactions = appState.transactions.filter(t => t.billMonth !== appState.currentViewMonth);
        delete appState.incomeDetails[appState.currentViewMonth];
        saveToFirebase();
    }
}

function formatMonthLabel(isoMonth) {
    if(!isoMonth) return "---";
    const [y, m] = isoMonth.split('-');
    const date = new Date(y, m - 1);
    const name = date.toLocaleString('pt-BR', { month: 'long' });
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`;
}

function formatBRL(v) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}