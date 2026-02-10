/**
 * MAIN - PONTO DE ENTRADA E CONTROLE
 * Versão: Login Popup + Sistema de Backup e Restauração
 */
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, startRealtimeListener, saveToFirebase, resetAllData, restoreFromBackup } from './firebase.js';
import { appState } from './state.js';
import { initViewSelector, filterAndRender, renderIncomeList, renderCategoryManager, renderEtlPreview } from './ui.js';
import { lockBodyScroll, unlockBodyScroll, vibrate, extractKeyword } from './utils.js';
import { InvoiceETL } from './etl.js';
import { DEFAULT_RULES } from './config.js';

// --- CONTROLE DE UI (LOADING) ---
function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if(overlay) overlay.style.display = 'flex';
}
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if(overlay) overlay.style.display = 'none';
}

// --- APRENDIZADO ATIVO ---
function learnRule(description, category) {
    if (!description || !category || category === "Outros") return;
    const keyword = extractKeyword(description);
    if (keyword.length < 3) return;

    if (!appState.categoryRules[category]) {
        appState.categoryRules[category] = [];
        if(!appState.categories.includes(category)) appState.categories.push(category);
    }
    if (!appState.categoryRules[category].includes(keyword)) {
        appState.categoryRules[category].push(keyword);
    }
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // Começa com loading
    showLoading();

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    
    if(document.getElementById('import-ref-month')) document.getElementById('import-ref-month').value = `${yyyy}-${mm}`;
    
    const todayISO = today.toISOString().split('T')[0];
    if(document.getElementById('manual-date')) document.getElementById('manual-date').value = todayISO;
    if(document.getElementById('manual-invoice-date')) document.getElementById('manual-invoice-date').value = todayISO;

    // --- LÓGICA DE LOGIN (POPUP) ---
    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            vibrate();
            // O Popup funciona melhor em Mobile/WebViews que o Redirect
            signInWithPopup(auth, provider)
                .then((result) => {
                    console.log("Login realizado!");
                    // O onAuthStateChanged vai lidar com a tela
                })
                .catch((error) => {
                    console.error("Erro no login:", error);
                    if (error.code === 'auth/popup-blocked') {
                        alert("⚠️ Popup bloqueado. Por favor, permita popups para logar.");
                    } else if (error.code === 'auth/popup-closed-by-user') {
                        // Usuário fechou, ok.
                    } else {
                        alert("Erro ao entrar: " + error.message);
                    }
                });
        });
    }

    // --- SISTEMA DE BACKUP ---
    
    // 1. Exportar (Baixar)
    const btnExport = document.getElementById('btn-export-backup');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            vibrate();
            const backupObj = {
                savedAt: new Date().toISOString(),
                transactions: appState.transactions,
                incomeDetails: appState.incomeDetails,
                monthlyBudgets: appState.monthlyBudgets,
                categoryRules: appState.categoryRules,
                categoryColors: appState.categoryColors
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            const fileName = `Backup_Financas_${new Date().toISOString().split('T')[0]}.json`;
            downloadAnchor.setAttribute("download", fileName);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        });
    }

   // --- EXPORTAR PARA EXCEL (COM FILTRO DE MÊS) ---
    const btnExcel = document.getElementById('btn-export-excel');
    if (btnExcel) {
        btnExcel.addEventListener('click', () => {
            vibrate();

            const currentMonth = appState.currentViewMonth;
            let dataToExport = [];
            let fileName = "";

            // 1. Filtra os dados baseados na visualização atual
            if (!currentMonth || currentMonth === "ALL") {
                // Se estiver na "Visão Geral", baixa TUDO
                dataToExport = [...appState.transactions];
                fileName = `Relatorio_Geral_${new Date().toISOString().split('T')[0]}.xlsx`;
            } else {
                // Se tiver um mês selecionado, baixa SÓ AQUELE MÊS
                dataToExport = appState.transactions.filter(t => t.billMonth === currentMonth);
                fileName = `Extrato_${currentMonth}.xlsx`;
            }

            if (dataToExport.length === 0) {
                alert("Não há transações neste mês para exportar.");
                return;
            }

            // 2. Ordena por data (mais recente primeiro)
            dataToExport.sort((a, b) => {
                const [da, ma, ya] = a.date.split('.');
                const [db, mb, yb] = b.date.split('.');
                return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
            });

            // 3. Formata as colunas para o Excel
            const formattedData = dataToExport.map(item => ({
                "Data Compra": item.date,
                "Descrição": item.description,
                "Categoria": item.category,
                "Valor": item.amount, 
                // AQUI ESTAVA O ERRO:
                // Se for menor que 0 (negativo) -> É Reembolso/Crédito
                // Se for maior que 0 (positivo) -> É Despesa
                "Tipo": item.amount < 0 ? "Reembolso/Crédito" : "Despesa",
                "Mês Ref.": item.billMonth,
                "Parcelado?": item.description.includes("/") ? "Sim" : "Não"
            }));

            // 4. Gera a Planilha
            const ws = XLSX.utils.json_to_sheet(formattedData);

            // Ajuste visual das colunas
            const wscols = [
                {wch: 12}, // Data
                {wch: 30}, // Descrição
                {wch: 15}, // Categoria
                {wch: 10}, // Valor
                {wch: 10}, // Tipo
                {wch: 10}, // Mês
                {wch: 8}   // Parcelado
            ];
            ws['!cols'] = wscols;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Extrato");

            // 5. Download
            XLSX.writeFile(wb, fileName);
        });
    }

    // 2. Importar (Restaurar)
    const inputRestore = document.getElementById('restore-input');
    if (inputRestore) {
        inputRestore.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (confirm("ATENÇÃO: Isso irá SUBSTITUIR todos os dados atuais pelos dados do arquivo.\n\nDeseja continuar?")) {
                showLoading();
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const json = JSON.parse(event.target.result);
                        await restoreFromBackup(json);
                        hideLoading();
                    } catch (err) {
                        hideLoading();
                        alert("Erro ao ler arquivo: " + err.message);
                    }
                };
                reader.readAsText(file);
            }
            e.target.value = ''; // Limpa para permitir reuso
        });
    }

    // --- OUTROS LISTENERS ---
    const checkInstallment = document.getElementById('is-installment');
    if(checkInstallment) {
        checkInstallment.addEventListener('change', (e) => {
            document.getElementById('installment-options').style.display = e.target.checked ? 'block' : 'none';
        });
    }

    document.getElementById('view-month').addEventListener('change', (e) => {
        appState.currentViewMonth = e.target.value;
        filterAndRender();
    });

    const budgetInput = document.getElementById('month-budget');
    if (budgetInput) {
        budgetInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, "");
            if (value === "") { e.target.value = ""; return; }
            e.target.value = (parseInt(value) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        });
        budgetInput.addEventListener('change', (e) => {
            const cleanValue = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.'));
            const month = appState.currentViewMonth;
            if (month && month !== "ALL") {
                if (isNaN(cleanValue) || cleanValue < 0) delete appState.monthlyBudgets[month];
                else appState.monthlyBudgets[month] = cleanValue;
                saveToFirebase();
                filterAndRender();
            }
        });
    }

    document.getElementById('fileInput').addEventListener('change', (e) => handleFileUpload(e.target.files[0]));
    
    const btnToggleMenu = document.getElementById('btn-toggle-menu');
    const dropdown = document.getElementById('main-dropdown');
    btnToggleMenu.addEventListener('click', (e) => { e.stopPropagation(); vibrate(); dropdown.classList.toggle('show'); });
    window.addEventListener('click', () => { if (dropdown.classList.contains('show')) dropdown.classList.remove('show'); });

    document.getElementById('btn-logout').addEventListener('click', () => {
        showLoading();
        signOut(auth).then(() => hideLoading());
    });
    
    document.getElementById('btn-delete-month').addEventListener('click', () => { vibrate(100); deleteCurrentMonth(); });
    
    const btnReset = document.getElementById('btn-reset-all');
    if(btnReset) {
        btnReset.addEventListener('click', async () => {
            if(confirm("PERIGO: Apagar TUDO?\nDeseja continuar?")) {
                if (prompt("Digite DELETAR:") === "DELETAR") {
                    vibrate(200);
                    showLoading();
                    await resetAllData();
                    appState.transactions = [];
                    appState.incomeDetails = {};
                    appState.monthlyBudgets = {};
                    appState.categoryRules = { "Outros": [] };
                    hideLoading();
                    alert("Sistema zerado.");
                    window.location.reload();
                }
            }
        });
    }

    document.getElementById('btn-col-chart').addEventListener('click', () => window.toggleSection('chart-wrapper', 'icon-chart'));
    document.getElementById('btn-col-cat').addEventListener('click', () => window.toggleSection('category-summary-area', 'icon-cat'));
    document.getElementById('btn-col-list').addEventListener('click', () => window.toggleSection('output', 'icon-list'));
    document.getElementById('btn-toggle-edit').addEventListener('click', () => { vibrate(); window.toggleEditMode(); });

    setupModal('import-modal', 'btn-open-import', 'btn-close-import', () => {
        if(appState.currentViewMonth && appState.currentViewMonth !== "ALL") document.getElementById('import-ref-month').value = appState.currentViewMonth;
    });
    setupModal('settings-modal', 'btn-open-categories', 'btn-close-settings', renderCategoryManager);
    setupModal('manual-modal', 'btn-open-manual', 'btn-close-manual', () => openManualModal());
    setupModal('income-modal', 'btn-manage-income', 'btn-close-income', () => renderIncomeList());
    
    document.getElementById('btn-add-cat').addEventListener('click', () => { vibrate(); addNewCategory(); });
    document.getElementById('btn-save-manual').addEventListener('click', () => { vibrate(); saveManualTransaction(); });
    document.getElementById('btn-add-income-item').addEventListener('click', () => { vibrate(); addIncomeItem(); });
});

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

// 4. MONITOR DE AUTENTICAÇÃO
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Logado
        appState.user = user;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        
        startRealtimeListener(user.uid, () => {
            initViewSelector();
            filterAndRender();
            hideLoading(); 
        });
    } else {
        // Deslogado
        appState.user = null;
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
        hideLoading();
    }
});

// GLOBALS
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

window.updateTx = (id, field, value) => {
    const tx = appState.transactions.find(t => t.id === id);
    if (!tx) return;
    if (field === 'amount') {
        const val = parseFloat(value);
        if (isNaN(val)) return;
        tx.amount = tx.amount < 0 ? -Math.abs(val) : Math.abs(val);
    } else if (field === 'date') {
        const [y, m, d] = value.split('-'); tx.date = `${d}.${m}.${y}`;
    } else if (field === 'invoiceDate') {
        const [y, m, d] = value.split('-'); tx.invoiceDate = `${d}.${m}.${y}`; tx.billMonth = `${y}-${m}`;
    } else if (field === 'category') {
        if (tx.category !== value) learnRule(tx.description, value);
        tx.category = value;
    } else {
        tx[field] = value;
    }
    saveToFirebase();
    if(field === 'invoiceDate') filterAndRender(); 
};

window.deleteTransaction = (id) => {
    if(confirm("Excluir item?")) {
        appState.transactions = appState.transactions.filter(t => t.id !== id);
        saveToFirebase();
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
    if (appState.categoryRules[newName]) { alert("Já existe."); return; }
    if (confirm(`Renomear "${oldName}" para "${newName}"?`)) {
        vibrate();
        appState.categoryRules[newName] = [...appState.categoryRules[oldName]];
        if (appState.categoryColors[oldName]) {
            appState.categoryColors[newName] = appState.categoryColors[oldName];
            delete appState.categoryColors[oldName];
        }
        appState.transactions.forEach(t => { if (t.category === oldName) t.category = newName; });
        delete appState.categoryRules[oldName];
        saveToFirebase();
        renderCategoryManager();
        filterAndRender();
    }
};

async function handleFileUpload(file) {
    if(!file) return;
    const targetMonth = document.getElementById('import-ref-month').value;
    if(!targetMonth) { alert("Selecione o mês."); return; }
    
    document.body.style.cursor = 'wait';
    showLoading();
    
    try {
        const textContent = await file.text();
        const etl = new InvoiceETL();
        etl.extract(textContent);
        const newRulesDelta = etl.learn(appState.categoryRules);
        const defaultCats = Object.keys(DEFAULT_RULES);
        const learnedCats = Object.keys(newRulesDelta);
        const allCategories = [...new Set([...appState.categories, ...defaultCats, ...learnedCats])];

        await etl.transform(targetMonth, appState.categoryRules, allCategories);
        const previewData = etl.getPreviewData();
        
        document.body.style.cursor = 'default';
        hideLoading();

        renderEtlPreview(previewData, async () => {
            let addedCount = 0;
            etl.transformedData.forEach(tx => {
                const cat = tx.category;
                if (!appState.categoryRules[cat]) {
                    appState.categoryRules[cat] = [];
                    if(!appState.categories.includes(cat)) appState.categories.push(cat);
                }
            });

            if (previewData.learnedCount > 0) {
                Object.keys(newRulesDelta).forEach(cat => {
                    if (appState.categoryRules[cat]) {
                        newRulesDelta[cat].forEach(rule => {
                            if (!appState.categoryRules[cat].includes(rule)) {
                                appState.categoryRules[cat].push(rule);
                            }
                        });
                    }
                });
            }

            const keptTransactions = appState.transactions.filter(t => {
                return t.billMonth !== targetMonth || t.id.startsWith('MAN_');
            });

            const currentItems = etl.transformedData.filter(t => t.billMonth === targetMonth);
            const futureItems = etl.transformedData.filter(t => t.billMonth > targetMonth);
            const finalTransactions = [...keptTransactions, ...currentItems];
            const normalize = (s) => s.toUpperCase().replace(/PARC(?:ELA)?/g, "").replace(/[^A-Z0-9]/g, "");
            
            futureItems.forEach(newTx => {
                const exists = finalTransactions.some(existing => 
                    existing.billMonth === newTx.billMonth &&
                    normalize(existing.description) === normalize(newTx.description) &&
                    Math.abs(existing.amount - newTx.amount) < 0.05
                );
                if (!exists) {
                    finalTransactions.push(newTx);
                    addedCount++;
                }
            });

            appState.transactions = finalTransactions;
            await saveToFirebase();
            
            alert(`Importação Concluída!\n\nDados de ${targetMonth} atualizados e ${addedCount} projeções futuras criadas.`);
            
            appState.currentViewMonth = targetMonth;
            const { initViewSelector, filterAndRender } = await import('./ui.js');
            initViewSelector(); 
            filterAndRender();
            document.getElementById('import-modal').style.display = 'none';
            unlockBodyScroll();
        });

    } catch (e) { 
        document.body.style.cursor = 'default';
        hideLoading();
        console.error(e); 
        alert("Erro na importação: " + e.message); 
    }
    
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

function saveManualTransaction() {
    const modal = document.getElementById('manual-modal');
    const editId = modal.dataset.editId;
    const desc = document.getElementById('manual-desc').value.trim();
    const valStr = document.getElementById('manual-val').value;
    const dateBuyStr = document.getElementById('manual-date').value;
    const dateInvStr = document.getElementById('manual-invoice-date').value;
    const cat = document.getElementById('manual-cat').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;
    const isInstallment = document.getElementById('is-installment') ? document.getElementById('is-installment').checked : false;
    const totalInstallments = parseInt(document.getElementById('installments-count').value) || 2;

    if(!desc || !valStr || !dateBuyStr || !dateInvStr) { alert("Preencha todos os campos!"); return; }
    let amount = parseFloat(valStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount)) { alert("Valor inválido"); return; }
    if (type === 'credit') amount = -Math.abs(amount); else amount = Math.abs(amount);
    
    const [yB, mB, dB] = dateBuyStr.split('-').map(Number);
    const formattedDateBuy = `${String(dB).padStart(2,'0')}.${String(mB).padStart(2,'0')}.${yB}`;
    const [yI, mI, dI] = dateInvStr.split('-').map(Number);

    if(editId) {
        const index = appState.transactions.findIndex(t => t.id === editId);
        if(index > -1) {
            const formattedDateInv = `${String(dI).padStart(2,'0')}.${String(mI).padStart(2,'0')}.${yI}`;
            const billMonth = `${yI}-${String(mI).padStart(2,'0')}`;
            if (appState.transactions[index].category !== cat) learnRule(desc, cat);
            appState.transactions[index] = { ...appState.transactions[index], date: formattedDateBuy, invoiceDate: formattedDateInv, billMonth: billMonth, description: desc, amount: amount, category: cat };
        }
    } else {
        learnRule(desc, cat);
        const loops = isInstallment ? totalInstallments : 1;
        for (let i = 0; i < loops; i++) {
            let currentInvDate = new Date(yI, mI - 1 + i, dI);
            const curY = currentInvDate.getFullYear();
            const curM = String(currentInvDate.getMonth() + 1).padStart(2, '0');
            const curD = String(currentInvDate.getDate()).padStart(2, '0');
            const formattedDateInv = `${curD}.${curM}.${curY}`;
            const billMonth = `${curY}-${curM}`;
            let finalDesc = desc;
            if (isInstallment) finalDesc = `${desc} (${i + 1}/${totalInstallments})`;
            appState.transactions.push({ id: "MAN_" + Date.now() + "_" + i, date: formattedDateBuy, invoiceDate: formattedDateInv, billMonth: billMonth, description: finalDesc, amount: amount, category: cat, isBillPayment: false });
        }
        if (isInstallment) alert(`${loops} parcelas geradas.`);
    }
    saveToFirebase();
    modal.style.display = 'none';
    unlockBodyScroll();
    if(appState.currentViewMonth !== "ALL" && !editId) initViewSelector();
    filterAndRender();
}

function openManualModal(txToEdit = null) {
    const modal = document.getElementById('manual-modal');
    const select = document.getElementById('manual-cat');
    const btnDelete = document.getElementById('btn-delete-manual');
    const valInput = document.getElementById('manual-val');
    select.innerHTML = '';
    appState.categories.sort().forEach(cat => { const opt = document.createElement('option'); opt.value = cat; opt.text = cat; select.add(opt); });
    valInput.oninput = (e) => {
        let value = e.target.value.replace(/\D/g, "");
        if (value === "") { e.target.value = ""; return; }
        e.target.value = (parseInt(value) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const checkInstallment = document.getElementById('is-installment');
    const divOptions = document.getElementById('installment-options');
    const inputCount = document.getElementById('installments-count');
    if(checkInstallment) {
        checkInstallment.checked = false;
        checkInstallment.disabled = !!txToEdit;
        divOptions.style.display = 'none';
        inputCount.value = 2;
    }
    if(btnDelete) {
        const newBtn = btnDelete.cloneNode(true);
        btnDelete.parentNode.replaceChild(newBtn, btnDelete);
        newBtn.addEventListener('click', () => { if(modal.dataset.editId) window.deleteTransaction(modal.dataset.editId); });
    }
    if(txToEdit) {
        document.getElementById('manual-modal-title').innerText = "Editar";
        modal.dataset.editId = txToEdit.id;
        document.getElementById('manual-desc').value = txToEdit.description;
        valInput.value = Math.abs(txToEdit.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const [d, m, y] = txToEdit.date.split('.');
        document.getElementById('manual-date').value = `${y}-${m}-${d}`;
        if(txToEdit.invoiceDate) {
            const [di, mi, yi] = txToEdit.invoiceDate.split('.');
            document.getElementById('manual-invoice-date').value = `${yi}-${mi}-${di}`;
        } else {
            const [yb, mb] = txToEdit.billMonth.split('-');
            document.getElementById('manual-invoice-date').value = `${yb}-${mb}-10`;
        }
        document.getElementById('manual-cat').value = txToEdit.category;
        document.querySelector(`input[name="tx-type"][value="${txToEdit.amount < 0 ? 'credit' : 'debit'}"]`).checked = true;
        if(document.getElementById('btn-delete-manual')) document.getElementById('btn-delete-manual').style.display = 'block';
    } else {
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
    renderIncomeList(); filterAndRender();
    document.getElementById('inc-desc').value = ''; document.getElementById('inc-val').value = '';
}

function addNewCategory() {
    const input = document.getElementById('new-cat-name');
    const name = input.value.trim();
    if(name && !appState.categoryRules[name]) {
        appState.categoryRules[name] = [];
        input.value = '';
        saveToFirebase(); renderCategoryManager();
    }
}