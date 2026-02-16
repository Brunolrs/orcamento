/**
 * MAIN - PONTO DE ENTRADA E CONTROLE
 * Versão: V47 (Modularizado + Telegram + Conferência + Automação iOS)
 */
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged, startRealtimeListener, saveToFirebase, resetAllData, restoreFromBackup } from './services/firebase.js';
import { appState } from './state.js';
import { initViewSelector, filterAndRender, renderIncomeList, renderCategoryManager, renderEtlPreview, renderConferenceModal } from './ui/index.js';
import { lockBodyScroll, unlockBodyScroll, vibrate, extractKeyword } from './utils.js';
import { InvoiceETL } from './services/etl.js';

// --- CONTROLE DE UI (LOADING) ---
function showLoading() {
    const overlay = document.getElementById('loading-overlay');
    if(overlay) overlay.style.display = 'flex';
}
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if(overlay) overlay.style.display = 'none';
}

// --- APRENDIZADO ATIVO (CATEGORIZAÇÃO) ---
function learnRule(description, category) {
    if (!description || !category || category === "Outros") return;
    const keyword = extractKeyword(description);
    if (keyword.length < 3) return;

    if (!appState.categoryRules[category]) {
        appState.categoryRules[category] = [];
        if(!appState.categories.includes(category)) appState.categories.push(category);
    }
    
    // Evita duplicatas nas regras
    let exists = false;
    for (const cat in appState.categoryRules) {
        if (appState.categoryRules[cat].includes(keyword)) exists = true;
    }

    if (!exists) {
        appState.categoryRules[category].push(keyword);
        console.log(`🧠 Aprendido: "${keyword}" -> ${category}`);
    }
}

// --- AUTOMAÇÃO (URL/SMS/IOS) ---
function checkUrlAutomation() {
    const params = new URLSearchParams(window.location.search);
    const smsContent = params.get('sms'); 
    const urlDesc = params.get('desc');   
    const urlVal = params.get('val');     

    if (smsContent || urlDesc) {
        document.getElementById('manual-modal').style.display = 'flex';
        
        let finalDesc = "";
        let finalVal = "";

        if (smsContent) {
            // Regex básico para extrair valor e limpar texto
            const valorMatch = smsContent.match(/R\$\s?(\d+([.,]\d{1,2})?)/i) || smsContent.match(/(\d+([.,]\d{1,2})?)/);
            if (valorMatch) finalVal = valorMatch[1].replace('.', '').replace(',', '.');

            let cleanText = smsContent.replace(/Compra aprovada/gi, '')
                                      .replace(/R\$\s?\d+([.,]\d{1,2})?/gi, '')
                                      .replace(/\d{2}\/\d{2}/g, '')
                                      .replace(/em\s/gi, '')
                                      .trim();
            finalDesc = cleanText.substring(0, 25);
        } else {
            finalDesc = urlDesc || "";
            finalVal = urlVal || "";
        }

        document.getElementById('manual-desc').value = finalDesc;
        document.getElementById('manual-val').value = finalVal;
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('manual-date').value = today;
        document.getElementById('manual-invoice-date').value = today;

        const btnSave = document.getElementById('btn-save-manual');
        btnSave.innerText = "Confirmar SMS";
        btnSave.onclick = saveManualTransaction;

        // Limpa a URL para evitar duplicação ao atualizar
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// --- FUNÇÕES GLOBAIS (Expostas para o HTML) ---

// 1. Transações
window.deleteTransaction = (id) => {
    if(confirm("Excluir transação?")) {
        appState.transactions = appState.transactions.filter(t => t.id != id);
        saveToFirebase();
        filterAndRender();
    }
};

window.editTransaction = (id) => {
    const tx = appState.transactions.find(t => t.id == id);
    if(!tx) return;

    // Popula o modal manual com os dados
    document.getElementById('manual-desc').value = tx.description;
    document.getElementById('manual-val').value = Math.abs(tx.amount);
    
    const [d, m, y] = tx.date.split('.');
    document.getElementById('manual-date').value = `${y}-${m}-${d}`;
    
    if(tx.invoiceDate) {
         const [di, mi, yi] = tx.invoiceDate.split('.');
         document.getElementById('manual-invoice-date').value = `${yi}-${mi}-${di}`;
    } else {
         document.getElementById('manual-invoice-date').value = `${tx.billMonth}-10`;
    }

    if (tx.amount < 0) document.querySelector('input[name="tx-type"][value="debit"]').checked = true;
    else document.querySelector('input[name="tx-type"][value="credit"]').checked = true;

    if (tx.paymentMethod === 'debit') document.querySelector('input[name="pay-method"][value="debit"]').checked = true;
    else document.querySelector('input[name="pay-method"][value="credit"]').checked = true;

    const catSelect = document.getElementById('manual-cat');
    catSelect.innerHTML = appState.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    catSelect.value = tx.category;

    const btnSave = document.getElementById('btn-save-manual');
    btnSave.innerText = "Atualizar";
    btnSave.onclick = () => {
        // Atualização Inline
        tx.description = document.getElementById('manual-desc').value;
        const val = parseFloat(document.getElementById('manual-val').value);
        const isExpense = document.querySelector('input[name="tx-type"]:checked').value === 'debit';
        tx.amount = isExpense ? -Math.abs(val) : Math.abs(val);
        
        const dateRaw = document.getElementById('manual-date').value;
        const [yy, mm, dd] = dateRaw.split('-');
        tx.date = `${dd}.${mm}.${yy}`;

        const invDateRaw = document.getElementById('manual-invoice-date').value;
        if(invDateRaw) {
             const [yi, mi, di] = invDateRaw.split('-');
             tx.invoiceDate = `${di}.${mi}.${yi}`;
             tx.billMonth = `${yi}-${mi}`;
        }
        
        tx.category = document.getElementById('manual-cat').value;
        tx.paymentMethod = document.querySelector('input[name="pay-method"]:checked').value;
        
        learnRule(tx.description, tx.category);
        saveToFirebase();
        filterAndRender();
        document.getElementById('manual-modal').style.display = 'none';
        
        btnSave.innerText = "Salvar";
        btnSave.onclick = saveManualTransaction;
    };

    const btnDel = document.getElementById('btn-delete-manual');
    btnDel.style.display = 'block';
    btnDel.onclick = () => {
        window.deleteTransaction(id);
        document.getElementById('manual-modal').style.display = 'none';
    };

    document.getElementById('manual-modal').style.display = 'flex';
};

window.toggleEditMode = () => {
    appState.isEditMode = !appState.isEditMode;
    const btn = document.getElementById('btn-toggle-edit');
    if(appState.isEditMode) btn.classList.add('active');
    else btn.classList.remove('active');
    filterAndRender();
};

window.updateTx = (id, field, value) => {
    const tx = appState.transactions.find(t => t.id == id);
    if (!tx) return;

    if (field === 'amount') {
        const val = parseFloat(value);
        tx.amount = tx.amount < 0 ? -Math.abs(val) : Math.abs(val);
    } else if (field === 'date') {
        const [y, m, d] = value.split('-');
        tx.date = `${d}.${m}.${y}`;
    } else if (field === 'invoiceDate') {
        const [y, m, d] = value.split('-');
        tx.invoiceDate = `${d}.${m}.${y}`;
        tx.billMonth = `${y}-${m}`;
    } else {
        tx[field] = value;
    }
    
    if(field === 'category') learnRule(tx.description, value);
    saveToFirebase();
};

// 2. Rendas
window.removeIncome = (index) => {
    const month = appState.currentViewMonth;
    if(appState.incomeDetails[month]) {
        appState.incomeDetails[month].splice(index, 1);
        saveToFirebase();
        renderIncomeList();
        filterAndRender();
    }
};

// 3. Categorias (Gerenciador)
window.updateCategoryColor = (cat, color) => {
    appState.categoryColors[cat] = color;
    saveToFirebase();
};

window.renameCategory = (oldName, newName) => {
    if (!newName || newName === oldName || appState.categories.includes(newName)) return;
    
    const idx = appState.categories.indexOf(oldName);
    if(idx !== -1) appState.categories[idx] = newName;
    
    appState.categoryRules[newName] = appState.categoryRules[oldName];
    delete appState.categoryRules[oldName];
    
    appState.transactions.forEach(t => {
        if(t.category === oldName) t.category = newName;
    });

    saveToFirebase();
    renderCategoryManager();
};

window.deleteCategory = (cat) => {
    if(confirm(`Excluir categoria "${cat}"? Itens virarão "Outros".`)) {
        appState.categories = appState.categories.filter(c => c !== cat);
        delete appState.categoryRules[cat];
        appState.transactions.forEach(t => {
            if(t.category === cat) t.category = "Outros";
        });
        saveToFirebase();
        renderCategoryManager();
    }
};

window.addKeyword = (cat, keyword) => {
    if(!appState.categoryRules[cat].includes(keyword)) {
        appState.categoryRules[cat].push(keyword);
        saveToFirebase();
        renderCategoryManager();
    }
};

window.removeKeyword = (cat, keyword) => {
    appState.categoryRules[cat] = appState.categoryRules[cat].filter(k => k !== keyword);
    saveToFirebase();
    renderCategoryManager();
};

// --- LOGICA DE SALVAMENTO MANUAL ---
function saveManualTransaction() {
    const desc = document.getElementById('manual-desc').value;
    const valStr = document.getElementById('manual-val').value;
    const dateRaw = document.getElementById('manual-date').value;
    const invDateRaw = document.getElementById('manual-invoice-date').value;
    const cat = document.getElementById('manual-cat').value;
    const type = document.querySelector('input[name="tx-type"]:checked').value;
    const payMethod = document.querySelector('input[name="pay-method"]:checked').value;

    const isInst = document.getElementById('is-installment').checked;
    const instCount = isInst ? parseInt(document.getElementById('installments-count').value) : 1;

    if (!desc || !valStr || !dateRaw) { alert("Preencha os campos obrigatórios."); return; }

    const val = parseFloat(valStr.replace(',', '.'));
    const finalAmount = (type === 'debit') ? -Math.abs(val) : Math.abs(val);

    const [y, m, d] = dateRaw.split('-');
    const formattedDate = `${d}.${m}.${y}`;

    let baseInvY, baseInvM, baseInvD;
    if(invDateRaw) {
        [baseInvY, baseInvM, baseInvD] = invDateRaw.split('-').map(Number);
    } else {
        [baseInvY, baseInvM, baseInvD] = [parseInt(y), parseInt(m), 10];
    }

    for (let i = 0; i < instCount; i++) {
        const targetDate = new Date(baseInvY, (baseInvM - 1) + i, baseInvD);
        const ny = targetDate.getFullYear();
        const nm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const nd = String(targetDate.getDate()).padStart(2, '0');
        
        const billMonth = `${ny}-${nm}`;
        const invoiceDate = `${nd}.${nm}.${ny}`;
        
        let finalDesc = desc;
        if (instCount > 1) {
            finalDesc = `${desc} (${i + 1}/${instCount})`;
        }

        const tx = {
            id: Math.random().toString(36).substr(2, 9),
            date: formattedDate,
            invoiceDate: invoiceDate,
            billMonth: billMonth,
            description: finalDesc,
            amount: finalAmount,
            category: cat,
            paymentMethod: payMethod,
            type: isInst ? 'Parcelado' : 'À Vista',
            isFuture: i > 0
        };

        appState.transactions.push(tx);
    }

    learnRule(desc, cat);
    saveToFirebase();
    filterAndRender();
    document.getElementById('manual-modal').style.display = 'none';
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
    document.getElementById('inc-desc').value = ''; 
    document.getElementById('inc-val').value = '';
}

function addNewCategory() {
    const input = document.getElementById('new-cat-name');
    const name = input.value.trim();
    if(name && !appState.categories.includes(name)) {
        appState.categories.push(name);
        appState.categoryRules[name] = [];
        saveToFirebase();
        renderCategoryManager();
        input.value = '';
    }
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Verifica automação ao carregar (SMS/iOS)
    checkUrlAutomation();

    // 1. Auth Listeners
    document.getElementById('btn-login').addEventListener('click', () => {
        document.getElementById('btn-login').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';
        signInWithPopup(auth, provider).catch(e => {
            alert("Erro no login: " + e.message);
            document.getElementById('btn-login').innerHTML = 'Entrar com Google';
        });
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        if(confirm("Sair da conta?")) signOut(auth).then(() => window.location.reload());
    });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            appState.user = user;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app-screen').style.display = 'block';
            showLoading();
            startRealtimeListener(user.uid, () => {
                initViewSelector(() => filterAndRender());
                filterAndRender();
                hideLoading();
            });
        } else {
            hideLoading();
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('app-screen').style.display = 'none';
        }
    });

    // 2. Theme & Privacy
    const btnTheme = document.getElementById('btn-theme');
    if(btnTheme) btnTheme.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        btnTheme.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    });

    const btnPrivacy = document.getElementById('btn-privacy');
    if(btnPrivacy) btnPrivacy.addEventListener('click', () => {
        document.body.classList.toggle('blur-values');
        const isBlur = document.body.classList.contains('blur-values');
        btnPrivacy.innerHTML = isBlur ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });

    // 3. Menus e Modais
    document.getElementById('btn-toggle-menu').addEventListener('click', () => {
        document.getElementById('main-dropdown').classList.toggle('show');
    });

    document.getElementById('view-month').addEventListener('change', (e) => {
        appState.currentViewMonth = e.target.value;
        filterAndRender();
    });

    // Import Modal
    document.getElementById('btn-open-import').addEventListener('click', () => {
        document.getElementById('main-dropdown').classList.remove('show');
        document.getElementById('import-modal').style.display = 'flex';
    });
    document.getElementById('btn-close-import').addEventListener('click', () => {
        document.getElementById('import-modal').style.display = 'none';
    });

    // Settings Modal
    document.getElementById('btn-open-categories').addEventListener('click', () => {
        document.getElementById('main-dropdown').classList.remove('show');
        renderCategoryManager();
        document.getElementById('settings-modal').style.display = 'flex';
    });
    document.getElementById('btn-close-settings').addEventListener('click', () => {
        document.getElementById('settings-modal').style.display = 'none';
    });

    // Conferência (NEW)
    const btnConf = document.getElementById('btn-open-conference');
    if(btnConf) {
        btnConf.addEventListener('click', () => {
            document.getElementById('main-dropdown').classList.remove('show');
            renderConferenceModal();
        });
    }

    // Manual Transaction Modal
    document.getElementById('btn-open-manual').addEventListener('click', () => {
        const catSelect = document.getElementById('manual-cat');
        catSelect.innerHTML = appState.categories.map(c => `<option value="${c}">${c}</option>`).join('');
        
        // Reset Inputs
        document.getElementById('manual-desc').value = '';
        document.getElementById('manual-val').value = '';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('manual-date').value = today;
        document.getElementById('manual-invoice-date').value = today;
        
        document.getElementById('btn-delete-manual').style.display = 'none';
        document.getElementById('btn-save-manual').onclick = saveManualTransaction;
        document.getElementById('btn-save-manual').innerText = "Salvar";
        document.getElementById('manual-modal').style.display = 'flex';
    });
    document.getElementById('btn-close-manual').addEventListener('click', () => {
        document.getElementById('manual-modal').style.display = 'none';
    });
    document.getElementById('is-installment').addEventListener('change', (e) => {
        document.getElementById('installment-options').style.display = e.target.checked ? 'block' : 'none';
    });

    // Income Modal
    document.getElementById('btn-manage-income').addEventListener('click', () => {
        renderIncomeList();
        document.getElementById('income-modal').style.display = 'flex';
    });
    document.getElementById('btn-close-income').addEventListener('click', () => {
        document.getElementById('income-modal').style.display = 'none';
    });
    document.getElementById('btn-add-income-item').addEventListener('click', addIncomeItem);

    document.getElementById('btn-toggle-edit').addEventListener('click', () => window.toggleEditMode());

    // 4. Input Events
    document.getElementById('month-budget').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value.replace('.', '').replace(',', '.'));
        if (!isNaN(val) && appState.currentViewMonth !== "ALL") {
            appState.monthlyBudgets[appState.currentViewMonth] = val;
            saveToFirebase();
            filterAndRender();
        }
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const view = appState.currentViewMonth;
        let txs = (view === "ALL") ? appState.transactions : appState.transactions.filter(t => t.billMonth === view);
        
        if (term) {
            txs = txs.filter(t => t.description.toLowerCase().includes(term) || t.category.toLowerCase().includes(term));
        }
        
        import('./ui/index.js').then(ui => {
             let currentIncome = 0;
             if (view === "ALL") Object.values(appState.incomeDetails).forEach(list => list.forEach(i => currentIncome += i.val));
             else (appState.incomeDetails[view] || []).forEach(i => currentIncome += i.val);
             ui.renderListsAndCharts(txs, currentIncome);
        });
    });

    document.getElementById('new-cat-name').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') addNewCategory();
    });
    document.getElementById('btn-add-cat').addEventListener('click', addNewCategory);

    // Actions
    document.getElementById('btn-delete-month').addEventListener('click', () => {
        if(confirm("Apagar TODAS as transações deste mês?")) {
            appState.transactions = appState.transactions.filter(t => t.billMonth !== appState.currentViewMonth);
            saveToFirebase();
            filterAndRender();
        }
    });

    document.getElementById('btn-reset-all').addEventListener('click', () => {
        if(confirm("ATENÇÃO: Isso apagará TUDO. Continuar?")) resetAllData().then(() => window.location.reload());
    });

    // Backup & Restore
    document.getElementById('btn-export-backup').addEventListener('click', () => {
        const dataStr = JSON.stringify({
            transactions: appState.transactions,
            incomeDetails: appState.incomeDetails,
            monthlyBudgets: appState.monthlyBudgets,
            categoryRules: appState.categoryRules,
            categoryColors: appState.categoryColors
        });
        const blob = new Blob([dataStr], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `backup_financas_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    });

    document.getElementById('restore-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                restoreFromBackup(data);
            } catch(err) { alert("Erro ao ler arquivo: " + err); }
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-export-excel').addEventListener('click', () => {
        const ws = XLSX.utils.json_to_sheet(appState.transactions);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transações");
        XLSX.writeFile(wb, "relatorio_financeiro.xlsx");
    });

    // 5. IMPORTAÇÃO (ETL)
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showLoading();
            const text = await file.text();
            
            const etl = new InvoiceETL();
            etl.extract(text);
            etl.learn(appState.categoryRules);
            
            const refMonth = document.getElementById('import-ref-month').value; 
            const targetMonth = refMonth ? refMonth : (appState.currentViewMonth !== "ALL" ? appState.currentViewMonth : new Date().toISOString().slice(0,7));

            await etl.transform(targetMonth, appState.categoryRules, appState.categories);
            
            const previewData = etl.getPreviewData();
            
            hideLoading();
            document.getElementById('import-modal').style.display = 'none';

            renderEtlPreview(previewData, () => {
                etl.transformedData.forEach(t => appState.transactions.push(t));
                
                Object.keys(etl.newLearnedRules).forEach(cat => {
                   if(!appState.categoryRules[cat]) appState.categoryRules[cat] = [];
                   appState.categoryRules[cat].push(...etl.newLearnedRules[cat]);
                });

                saveToFirebase();
                alert(`✅ Importado com sucesso!\n${previewData.totalItems} transações adicionadas.`);
                document.getElementById('etl-modal').style.display = 'none';
                
                appState.currentViewMonth = targetMonth;
                initViewSelector();
                filterAndRender();
            });
        });
    }
});