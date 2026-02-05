/**
 * MAIN - PONTO DE ENTRADA E CONTROLE
 * Gerencia eventos, modais e funções globais (window).
 */
import { auth, signInWithPopup, signOut, onAuthStateChanged, startRealtimeListener, saveToFirebase } from './firebase.js';
import { appState } from './state.js';
import { initViewSelector, filterAndRender, renderIncomeList, renderCategoryManager } from './ui.js';
import { parseFileContent, lockBodyScroll, unlockBodyScroll, vibrate } from './utils.js';

// --- INICIALIZAÇÃO (DOM READY) ---
document.addEventListener('DOMContentLoaded', () => {
    // Configura Datas Iniciais
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    if(document.getElementById('import-ref-month')) document.getElementById('import-ref-month').value = `${yyyy}-${mm}`;
    if(document.getElementById('manual-date')) document.getElementById('manual-date').value = `${yyyy}-${mm}-${String(today.getDate()).padStart(2,'0')}`;

    // Eventos de Autenticação
    document.getElementById('btn-login').addEventListener('click', () => { vibrate(); signInWithPopup(auth); });
    
    // Filtros e Inputs
    document.getElementById('view-month').addEventListener('change', (e) => {
        appState.currentViewMonth = e.target.value;
        filterAndRender();
    });
    document.getElementById('fileInput').addEventListener('change', (e) => handleFileUpload(e.target.files[0]));

    // Menu Dropdown (Cabeçalho)
    const btnToggleMenu = document.getElementById('btn-toggle-menu');
    const dropdown = document.getElementById('main-dropdown');
    btnToggleMenu.addEventListener('click', (e) => { e.stopPropagation(); vibrate(); dropdown.classList.toggle('show'); });
    window.addEventListener('click', () => { if (dropdown.classList.contains('show')) dropdown.classList.remove('show'); });

    // Ações do Menu
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    document.getElementById('btn-delete-month').addEventListener('click', () => { vibrate(100); deleteCurrentMonth(); });

    // --- CONFIGURAÇÃO DE MODAIS (Com Scroll Lock) ---
    setupModal('import-modal', 'btn-open-import', 'btn-close-import', () => {
        if(appState.currentViewMonth && appState.currentViewMonth !== "ALL") document.getElementById('import-ref-month').value = appState.currentViewMonth;
    });
    
    setupModal('settings-modal', 'btn-open-categories', 'btn-close-settings', renderCategoryManager);
    document.getElementById('btn-add-cat').addEventListener('click', () => { vibrate(); addNewCategory(); });

    setupModal('manual-modal', 'btn-open-manual', 'btn-close-manual', () => openManualModal());
    document.getElementById('btn-save-manual').addEventListener('click', () => { vibrate(); saveManualTransaction(); });

    setupModal('income-modal', 'btn-manage-income', 'btn-close-income', () => {
        if(appState.currentViewMonth === "ALL") { alert("Selecione um mês específico."); return; }
        renderIncomeList();
    });
    document.getElementById('btn-add-income-item').addEventListener('click', () => { vibrate(); addIncomeItem(); });

    // Botão Toggle Edição em Massa
    document.getElementById('btn-toggle-edit').addEventListener('click', () => { vibrate(); window.toggleEditMode(); });
});

// Helper para configurar eventos de modal
function setupModal(modalId, openBtnId, closeBtnId, openCallback) {
    const modal = document.getElementById(modalId);
    if(document.getElementById(openBtnId)) {
        document.getElementById(openBtnId).addEventListener('click', () => {
            vibrate();
            if(openCallback) openCallback();
            modal.style.display = 'flex';
            lockBodyScroll(); // Mobile First: Trava rolagem do fundo
        });
    }
    if(document.getElementById(closeBtnId)) {
        document.getElementById(closeBtnId).addEventListener('click', () => {
            modal.style.display = 'none';
            unlockBodyScroll(); // Destrava rolagem
        });
    }
}

// --- LISTENER DE AUTH ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        appState.user = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        startRealtimeListener(user.uid, () => initViewSelector());
    } else {
        appState.user = null;
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
    }
});

// ============================================================================
// FUNÇÕES GLOBAIS (EXPOSTAS PARA O HTML - ONCLICK)
// ============================================================================

// Expandir/Recolher Seções
window.toggleSection = (sectionId, iconId) => {
    vibrate(20);
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(iconId);
    if (section && icon) { section.classList.toggle('collapsed-content'); icon.classList.toggle('icon-closed'); }
};

// Alternar Modo Edição
window.toggleEditMode = () => {
    appState.isEditMode = !appState.isEditMode;
    const btn = document.getElementById('btn-toggle-edit');
    if(appState.isEditMode) {
        btn.classList.add('active');
        document.getElementById('output').classList.remove('collapsed-content');
    } else {
        btn.classList.remove('active');
    }
    filterAndRender();
};

// Atualização em Linha (Inputs)
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
    saveToFirebase();
};

// Excluir Transação
window.deleteTransaction = (id) => {
    if(confirm("Excluir item?")) {
        appState.transactions = appState.transactions.filter(t => t.id !== id);
        saveToFirebase();
        document.getElementById('manual-modal').style.display = 'none';
        unlockBodyScroll();
        filterAndRender();
    }
};

// Abrir Modal de Edição (se não estiver em modo massa)
window.editTransaction = (id) => {
    if(appState.isEditMode) return;
    const tx = appState.transactions.find(t => t.id === id);
    if(tx) { 
        vibrate();
        openManualModal(tx); 
        document.getElementById('manual-modal').style.display = 'flex';
        lockBodyScroll();
    }
};

// Remover Renda
window.removeIncome = (index) => {
    const month = appState.currentViewMonth;
    if(appState.incomeDetails[month]) {
        vibrate();
        appState.incomeDetails[month].splice(index, 1);
        saveToFirebase();
        renderIncomeList();
        filterAndRender();
    }
};

// --- GESTÃO DE CATEGORIAS ---

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
        // Se tinha cor personalizada, apaga também
        if(appState.categoryColors && appState.categoryColors[cat]) delete appState.categoryColors[cat];
        
        saveToFirebase();
        renderCategoryManager();
    }
};

// Atualizar Cor
window.updateCategoryColor = (cat, newColor) => {
    vibrate();
    appState.categoryColors[cat] = newColor;
    saveToFirebase();
    filterAndRender(); // Atualiza fundo em tempo real
};

// Renomear Categoria (Atualiza histórico)
window.renameCategory = (oldName, newName) => {
    newName = newName.trim();
    if (!newName || newName === oldName) return;
    
    if (appState.categoryRules[newName]) {
        alert("Já existe uma categoria com este nome.");
        renderCategoryManager();
        return;
    }

    if (confirm(`Renomear "${oldName}" para "${newName}"? Isso atualizará o histórico.`)) {
        vibrate();
        // 1. Copia regras
        appState.categoryRules[newName] = [...appState.categoryRules[oldName]];
        
        // 2. Transfere cor
        if (appState.categoryColors[oldName]) {
            appState.categoryColors[newName] = appState.categoryColors[oldName];
            delete appState.categoryColors[oldName];
        }

        // 3. Atualiza transações antigas
        appState.transactions.forEach(t => {
            if (t.category === oldName) t.category = newName;
        });

        // 4. Apaga antiga
        delete appState.categoryRules[oldName];

        saveToFirebase();
        renderCategoryManager();
        filterAndRender();
    } else {
        renderCategoryManager();
    }
};

// ============================================================================
// LÓGICA DE NEGÓCIO INTERNA
// ============================================================================

async function handleFileUpload(file) {
    if(!file) return;
    const targetMonth = document.getElementById('import-ref-month').value;
    if(!targetMonth) { alert("Selecione o mês."); return; }
    try {
        const textContent = await file.text();
        const { count, newTransactions } = parseFileContent(textContent, targetMonth, appState.transactions, appState.categoryRules);
        if(count > 0) {
            appState.transactions.push(...newTransactions);
            await saveToFirebase();
            alert(`Sucesso! ${count} importados.`);
            appState.currentViewMonth = targetMonth;
            initViewSelector();
            document.getElementById('import-modal').style.display = 'none';
            unlockBodyScroll();
        } else { alert("Nada encontrado."); }
    } catch (e) { console.error(e); }
    document.getElementById('fileInput').value = '';
}

function deleteCurrentMonth() {
    if(appState.currentViewMonth === "ALL") { alert("Selecione um mês específico."); return; }
    if(!appState.currentViewMonth) return;
    if(confirm(`ATENÇÃO: Apagar dados de ${appState.currentViewMonth}?`)) {
        appState.transactions = appState.transactions.filter(t => t.billMonth !== appState.currentViewMonth);
        delete appState.incomeDetails[appState.currentViewMonth];
        saveToFirebase();
    }
}

function saveManualTransaction() {
    const modal = document.getElementById('manual-modal');
    const editId = modal.dataset.editId;
    const desc = document.getElementById('manual-desc').value.trim();
    const valStr = document.getElementById('manual-val').value;
    const dateStr = document.getElementById('manual-date').value;
    const cat = document.getElementById('manual-cat').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;

    if(!desc || !valStr || !dateStr) { alert("Preencha todos os campos!"); return; }
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
    unlockBodyScroll();
    
    if(appState.currentViewMonth !== "ALL" && appState.currentViewMonth !== billMonth && !editId) {
        appState.currentViewMonth = billMonth;
        initViewSelector();
    } else {
        filterAndRender();
    }
}

function openManualModal(txToEdit = null) {
    const modal = document.getElementById('manual-modal');
    const select = document.getElementById('manual-cat');
    const btnDelete = document.getElementById('btn-delete-manual');
    select.innerHTML = '';
    appState.categories.sort().forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.text = cat; select.add(opt); });
    
    if(btnDelete) {
        // Clone para remover listeners antigos
        const newBtn = btnDelete.cloneNode(true);
        btnDelete.parentNode.replaceChild(newBtn, btnDelete);
        newBtn.addEventListener('click', () => { if(modal.dataset.editId) window.deleteTransaction(modal.dataset.editId); });
    }

    if(txToEdit) {
        document.getElementById('manual-modal-title').innerText = "Editar";
        modal.dataset.editId = txToEdit.id;
        document.getElementById('manual-desc').value = txToEdit.description;
        document.getElementById('manual-val').value = Math.abs(txToEdit.amount);
        const [d, m, y] = txToEdit.date.split('.');
        document.getElementById('manual-date').value = `${y}-${m}-${d}`;
        document.getElementById('manual-cat').value = txToEdit.category;
        document.querySelector(`input[name="tx-type"][value="${txToEdit.amount < 0 ? 'credit' : 'debit'}"]`).checked = true;
        if(document.getElementById('btn-delete-manual')) document.getElementById('btn-delete-manual').style.display = 'block';
    } else {
        document.getElementById('manual-modal-title').innerText = "Novo";
        delete modal.dataset.editId;
        document.getElementById('manual-desc').value = '';
        document.getElementById('manual-val').value = '';
        const today = new Date();
        document.getElementById('manual-date').value = today.toISOString().split('T')[0];
        document.querySelector('input[name="tx-type"][value="debit"]').checked = true;
        if(document.getElementById('btn-delete-manual')) document.getElementById('btn-delete-manual').style.display = 'none';
    }
}

function addIncomeItem() {
    const desc = document.getElementById('inc-desc').value.trim();
    const val = parseFloat(document.getElementById('inc-val').value);
    if(!desc || isNaN(val) || val <= 0) return;
    const month = appState.currentViewMonth;
    if(!appState.incomeDetails[month]) appState.incomeDetails[month] = [];
    appState.incomeDetails[month].push({ id: Date.now(), desc: desc, val: val });
    saveToFirebase();
    renderIncomeList();
    filterAndRender();
    document.getElementById('inc-desc').value = ''; document.getElementById('inc-val').value = '';
}

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