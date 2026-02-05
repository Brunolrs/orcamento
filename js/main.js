/**
 * MAIN - PONTO DE ENTRADA E CONTROLE
 * Gerencia eventos, modais, lógica de negócios e interação com Firebase.
 */
import { auth, signInWithPopup, signOut, onAuthStateChanged, startRealtimeListener, saveToFirebase } from './firebase.js';
import { appState } from './state.js';
import { initViewSelector, filterAndRender, renderIncomeList, renderCategoryManager } from './ui.js';
import { parseFileContent, lockBodyScroll, unlockBodyScroll, vibrate } from './utils.js';

// --- INICIALIZAÇÃO (DOM READY) ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Configura Datas Padrão
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    
    // Define mês padrão na importação
    if(document.getElementById('import-ref-month')) document.getElementById('import-ref-month').value = `${yyyy}-${mm}`;
    
    // Define datas padrão nos inputs do modal manual
    const todayISO = today.toISOString().split('T')[0];
    if(document.getElementById('manual-date')) document.getElementById('manual-date').value = todayISO;
    if(document.getElementById('manual-invoice-date')) document.getElementById('manual-invoice-date').value = todayISO;

    // 2. Auth
    const btnLogin = document.getElementById('btn-login');
    if(btnLogin) btnLogin.addEventListener('click', () => { vibrate(); signInWithPopup(auth); });

    // 3. Controles Principais
    document.getElementById('view-month').addEventListener('change', (e) => {
        appState.currentViewMonth = e.target.value;
        filterAndRender();
    });

    // --- MÁSCARA E SALVAMENTO DE ORÇAMENTO ---
    const budgetInput = document.getElementById('month-budget');
    if (budgetInput) {
        // Máscara enquanto digita (Ex: 1000 -> 10,00)
        budgetInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, "");
            if (value === "") { e.target.value = ""; return; }
            value = (parseInt(value) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            e.target.value = value;
        });

        // Salvar ao sair do campo ou dar Enter
        budgetInput.addEventListener('change', (e) => {
            // Converte "1.000,00" para 1000.00 (float)
            const cleanValue = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.'));
            const month = appState.currentViewMonth;
            
            if (month && month !== "ALL") {
                if (isNaN(cleanValue) || cleanValue < 0) {
                    delete appState.monthlyBudgets[month];
                } else {
                    appState.monthlyBudgets[month] = cleanValue;
                }
                saveToFirebase();
                filterAndRender(); // Recalcula saldo imediatamente
            }
        });
    }

    // 4. Upload de Arquivo
    document.getElementById('fileInput').addEventListener('change', (e) => handleFileUpload(e.target.files[0]));

    // 5. Menu Dropdown
    const btnToggleMenu = document.getElementById('btn-toggle-menu');
    const dropdown = document.getElementById('main-dropdown');
    btnToggleMenu.addEventListener('click', (e) => { e.stopPropagation(); vibrate(); dropdown.classList.toggle('show'); });
    window.addEventListener('click', () => { if (dropdown.classList.contains('show')) dropdown.classList.remove('show'); });

    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    document.getElementById('btn-delete-month').addEventListener('click', () => { vibrate(100); deleteCurrentMonth(); });

    // 6. Seções Expansíveis
    document.getElementById('btn-col-chart').addEventListener('click', () => window.toggleSection('chart-wrapper', 'icon-chart'));
    document.getElementById('btn-col-cat').addEventListener('click', () => window.toggleSection('category-summary-area', 'icon-cat'));
    document.getElementById('btn-col-list').addEventListener('click', () => window.toggleSection('output', 'icon-list'));

    // 7. Botão Edição em Massa
    document.getElementById('btn-toggle-edit').addEventListener('click', () => { vibrate(); window.toggleEditMode(); });

    // 8. Configuração de Modais
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
});

// Helper de Modal
function setupModal(modalId, openBtnId, closeBtnId, openCallback) {
    const modal = document.getElementById(modalId);
    if(document.getElementById(openBtnId)) {
        document.getElementById(openBtnId).addEventListener('click', () => {
            vibrate();
            if(openCallback) openCallback();
            modal.style.display = 'flex';
            lockBodyScroll();
        });
    }
    if(document.getElementById(closeBtnId)) {
        document.getElementById(closeBtnId).addEventListener('click', () => {
            modal.style.display = 'none';
            unlockBodyScroll();
        });
    }
}

// --- AUTH LISTENER ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        appState.user = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        startRealtimeListener(user.uid, () => {
            initViewSelector();
            filterAndRender(); // Garante que a tela carregue os dados assim que chegarem
        });
    } else {
        appState.user = null;
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
    }
});

// ============================================================================
// FUNÇÕES GLOBAIS (WINDOW)
// ============================================================================

window.toggleSection = (sectionId, iconId) => {
    vibrate(20);
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(iconId);
    if (section && icon) { section.classList.toggle('collapsed-content'); icon.classList.toggle('icon-closed'); }
};

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

// ATUALIZAR TRANSAÇÃO EM MASSA (Edit Mode)
window.updateTx = (id, field, value) => {
    const tx = appState.transactions.find(t => t.id === id);
    if (!tx) return;
    
    if (field === 'amount') {
        const val = parseFloat(value);
        if (isNaN(val)) return;
        tx.amount = tx.amount < 0 ? -Math.abs(val) : Math.abs(val);
    } 
    else if (field === 'date') {
        // Atualiza Data Compra (apenas visual/histórico)
        const [y, m, d] = value.split('-');
        tx.date = `${d}.${m}.${y}`;
    } 
    else if (field === 'invoiceDate') {
        // Atualiza Data Fatura E O MÊS DE REFERÊNCIA (Filtro)
        const [y, m, d] = value.split('-');
        tx.invoiceDate = `${d}.${m}.${y}`;
        tx.billMonth = `${y}-${m}`; // Move a conta para o novo mês
    } 
    else {
        tx[field] = value;
    }
    
    saveToFirebase();
    
    // Se mudou a data da fatura, o item pode ter saído do mês atual visualizado
    if(field === 'invoiceDate') filterAndRender(); 
};

window.deleteTransaction = (id) => {
    if(confirm("Excluir item?")) {
        appState.transactions = appState.transactions.filter(t => t.id !== id);
        saveToFirebase();
        document.getElementById('manual-modal').style.display = 'none';
        unlockBodyScroll();
        filterAndRender();
    }
};

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
        if(appState.categoryColors && appState.categoryColors[cat]) delete appState.categoryColors[cat];
        saveToFirebase();
        renderCategoryManager();
    }
};
window.updateCategoryColor = (cat, newColor) => {
    vibrate();
    appState.categoryColors[cat] = newColor;
    saveToFirebase();
    filterAndRender();
};
window.renameCategory = (oldName, newName) => {
    newName = newName.trim();
    if (!newName || newName === oldName) return;
    if (appState.categoryRules[newName]) {
        alert("Já existe uma categoria com este nome.");
        renderCategoryManager();
        return;
    }
    if (confirm(`Renomear "${oldName}" para "${newName}"?`)) {
        vibrate();
        // 1. Copia dados
        appState.categoryRules[newName] = [...appState.categoryRules[oldName]];
        if (appState.categoryColors[oldName]) {
            appState.categoryColors[newName] = appState.categoryColors[oldName];
            delete appState.categoryColors[oldName];
        }
        // 2. Atualiza histórico
        appState.transactions.forEach(t => {
            if (t.category === oldName) t.category = newName;
        });
        // 3. Apaga antigo
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
        if(appState.monthlyBudgets[appState.currentViewMonth]) delete appState.monthlyBudgets[appState.currentViewMonth];
        saveToFirebase();
    }
}

// SALVAR TRANSAÇÃO MANUAL (COM LÓGICA DE DATAS)
function saveManualTransaction() {
    const modal = document.getElementById('manual-modal');
    const editId = modal.dataset.editId;
    
    // Inputs
    const desc = document.getElementById('manual-desc').value.trim();
    const valStr = document.getElementById('manual-val').value;
    const dateBuyStr = document.getElementById('manual-date').value;         // Data Compra
    const dateInvStr = document.getElementById('manual-invoice-date').value; // Data Fatura
    const cat = document.getElementById('manual-cat').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;

    if(!desc || !valStr || !dateBuyStr || !dateInvStr) { 
        alert("Preencha todos os campos!"); 
        return; 
    }
    
    // Tratamento de Moeda (1.000,00 -> 1000.00)
    let amount = parseFloat(valStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount)) { alert("Valor inválido"); return; }
    if (type === 'credit') amount = -Math.abs(amount); else amount = Math.abs(amount);
    
    // Formatação Data Compra
    const [yB, mB, dB] = dateBuyStr.split('-');
    const formattedDateBuy = `${dB}.${mB}.${yB}`;

    // Formatação Data Fatura (Define o Mês de Referência)
    const [yI, mI, dI] = dateInvStr.split('-');
    const formattedDateInv = `${dI}.${mI}.${yI}`;
    const billMonth = `${yI}-${mI}`; // O Mês da Conta VEM DA FATURA

    const transactionData = {
        date: formattedDateBuy,
        invoiceDate: formattedDateInv,
        billMonth: billMonth,
        description: desc, 
        amount: amount, 
        category: cat, 
        isBillPayment: false
    };

    if(editId) {
        const index = appState.transactions.findIndex(t => t.id === editId);
        if(index > -1) appState.transactions[index] = { ...appState.transactions[index], ...transactionData };
    } else {
        appState.transactions.push({ id: "MAN_" + Date.now(), ...transactionData });
    }

    saveToFirebase();
    modal.style.display = 'none';
    unlockBodyScroll();
    
    // Se o mês da fatura for diferente da visão atual, muda a visão para lá
    if(appState.currentViewMonth !== "ALL" && appState.currentViewMonth !== billMonth && !editId) {
        appState.currentViewMonth = billMonth;
        initViewSelector();
    } else {
        filterAndRender();
    }
}

// ABRIR MODAL MANUAL (POPULA AS DUAS DATAS)
function openManualModal(txToEdit = null) {
    const modal = document.getElementById('manual-modal');
    const select = document.getElementById('manual-cat');
    const btnDelete = document.getElementById('btn-delete-manual');
    const valInput = document.getElementById('manual-val');
    
    select.innerHTML = '';
    appState.categories.sort().forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.text = cat; select.add(opt); });
    
    // Aplica Máscara de Moeda (reforço)
    valInput.oninput = (e) => {
        let value = e.target.value.replace(/\D/g, "");
        if (value === "") { e.target.value = ""; return; }
        e.target.value = (parseInt(value) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    if(btnDelete) {
        const newBtn = btnDelete.cloneNode(true);
        btnDelete.parentNode.replaceChild(newBtn, btnDelete);
        newBtn.addEventListener('click', () => { if(modal.dataset.editId) window.deleteTransaction(modal.dataset.editId); });
    }

    if(txToEdit) {
        // --- MODO EDITAR ---
        document.getElementById('manual-modal-title').innerText = "Editar";
        modal.dataset.editId = txToEdit.id;
        document.getElementById('manual-desc').value = txToEdit.description;
        valInput.value = Math.abs(txToEdit.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        // Data Compra
        const [d, m, y] = txToEdit.date.split('.');
        document.getElementById('manual-date').value = `${y}-${m}-${d}`;
        
        // Data Fatura (Com Fallback Inteligente)
        if(txToEdit.invoiceDate) {
            const [di, mi, yi] = txToEdit.invoiceDate.split('.');
            document.getElementById('manual-invoice-date').value = `${yi}-${mi}-${di}`;
        } else {
            // Se não tem fatura, usa Mês da Conta (billMonth) + dia 10
            const [yb, mb] = txToEdit.billMonth.split('-');
            document.getElementById('manual-invoice-date').value = `${yb}-${mb}-10`;
        }

        document.getElementById('manual-cat').value = txToEdit.category;
        document.querySelector(`input[name="tx-type"][value="${txToEdit.amount < 0 ? 'credit' : 'debit'}"]`).checked = true;
        if(document.getElementById('btn-delete-manual')) document.getElementById('btn-delete-manual').style.display = 'block';
    } else {
        // --- MODO NOVO ---
        document.getElementById('manual-modal-title').innerText = "Novo";
        delete modal.dataset.editId;
        document.getElementById('manual-desc').value = '';
        valInput.value = '';
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('manual-date').value = today;
        document.getElementById('manual-invoice-date').value = today;
        
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