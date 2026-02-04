// --- IMPORTAÇÕES DO FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURAÇÃO DO PDF.JS ---
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// --- SUAS CONFIGURAÇÕES (COLE SUAS CHAVES AQUI) ---
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

// --- ESTADO GLOBAL ---
let appState = {
    transactions: [],
    monthlyIncomes: {}, 
    categories: ["Alimentação", "Transporte", "Lazer", "Serviços", "Saúde", "Casa", "Vestuário", "Assinaturas", "Outros"],
    currentViewMonth: null,
    user: null
};
let chartInstance = null;
const CHART_COLORS = ['#1C1C1E', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#5856D6', '#AF52DE', '#8E8E93'];

// --- EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const importInput = document.getElementById('import-ref-month');
    if(importInput) importInput.value = `${yyyy}-${mm}`;

    document.getElementById('btn-login').addEventListener('click', () => signInWithPopup(auth, provider));
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));
    document.getElementById('view-month').addEventListener('change', (e) => changeViewMonth(e.target.value));
    document.getElementById('monthly-income').addEventListener('input', function() { formatAndSetIncome(this); });
    
    document.getElementById('fileInput').addEventListener('change', function(e) {
        handleFileUpload(e.target.files[0]);
    });

    const btnDel = document.getElementById('btn-delete-month');
    if(btnDel) btnDel.addEventListener('click', deleteCurrentMonth);
});

onAuthStateChanged(auth, (user) => {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    if (user) {
        appState.user = user;
        loginScreen.style.display = 'none';
        appScreen.style.display = 'block';
        startRealtimeListener(user.uid);
    } else {
        appState.user = null;
        appState.transactions = [];
        loginScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }
});

function startRealtimeListener(uid) {
    const userDocRef = doc(db, "users", uid);
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            appState.transactions = data.transactions || [];
            appState.monthlyIncomes = data.monthlyIncomes || {};
            initViewSelector();
        } else {
            setDoc(userDocRef, { transactions: [], monthlyIncomes: {} });
        }
    });
}

async function saveToFirebase() {
    if (!appState.user) return;
    const userDocRef = doc(db, "users", appState.user.uid);
    try {
        await updateDoc(userDocRef, {
            transactions: appState.transactions,
            monthlyIncomes: appState.monthlyIncomes
        });
    } catch (e) {
        console.error("Erro ao salvar:", e);
    }
}

// --- IMPORTAÇÃO ROBUSTA ---
async function handleFileUpload(file) {
    if(!file) return;
    const targetMonth = document.getElementById('import-ref-month').value;
    if(!targetMonth) {
        alert("Selecione o mês referente a esta fatura.");
        document.getElementById('fileInput').value = ''; 
        return;
    }

    let textContent = "";
    try {
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
            textContent = await extractTextFromPDF(file);
        } else {
            textContent = await file.text();
        }

        // --- DEBUG: Mostra no console o que foi lido para ajudar a encontrar erros ---
        console.log("TEXTO EXTRAÍDO DO ARQUIVO:\n", textContent);
        // -------------------------------------------------------------------------

        const count = parseFile(textContent, targetMonth);
        
        if (count > 0) {
            await saveToFirebase();
            alert(`SUCESSO! ${count} transações importadas.`);
            appState.currentViewMonth = targetMonth;
            initViewSelector();
        } else {
            alert("ERRO: Nenhuma transação identificada.\n\nAbra o Console (F12) para ver o texto que foi lido e verifique se o formato é compatível.");
        }
        document.getElementById('fileInput').value = '';

    } catch (error) {
        console.error(error);
        alert("Erro crítico: " + error.message);
    }
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Ordena itens para tentar reconstruir as linhas corretamente
        const items = textContent.items.sort((a, b) => {
            const dy = b.transform[5] - a.transform[5];
            if (Math.abs(dy) > 5) return dy; 
            return a.transform[4] - b.transform[4];
        });

        let lastY = -1;
        for (const item of items) {
            // Se a quebra for grande, nova linha. Senão, espaço.
            if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 10) fullText += "\n";
            else if (lastY !== -1) fullText += " ";
            
            fullText += item.str;
            lastY = item.transform[5];
        }
        fullText += "\n";
    }
    return fullText;
}

function parseFile(text, billMonth) {
    const lines = text.split('\n');
    let currentCategory = "Outros";
    let addedCount = 0;

    // --- NOVA REGEX SUPER FLEXÍVEL ---
    // Procura: 
    // 1. Data no início (dd/mm, dd.mm ou dd/mm/aaaa)
    // 2. Qualquer coisa no meio (Descrição)
    // 3. Valor no final (ex: 120,00 ou -50,00)
    const regexLine = /^\s*(\d{2}[\/\.]\d{2}(?:[\/\.]\d{2,4})?)\s+(.*?)\s+(-?[\d\.]+,\d{2})/;
    
    // Regex auxiliar para identificar categorias
    const regexCat = /^\s{3,}([^0-9].*?)\s*$/;

    lines.forEach(line => {
        let clean = line.trim();

        // Tenta detectar Categoria (linhas soltas sem números)
        if(regexCat.test(line) && !clean.includes("Total") && !clean.match(/\d/)) {
            currentCategory = clean;
            if(!appState.categories.includes(currentCategory)) appState.categories.push(currentCategory);
            return;
        }

        // Tenta detectar Transação
        const m = clean.match(regexLine);
        if(m) {
            // Se achou, limpa os dados
            let dateRaw = m[1];
            let desc = m[2].trim();
            let valStr = m[3].replace(/\./g, '').replace(',', '.');
            let val = parseFloat(valStr);

            // Ajuste de Data: Se vier só "25/01", adiciona o ano atual
            if(dateRaw.length <= 5) {
                const year = new Date().getFullYear();
                dateRaw = `${dateRaw}.${year}`; // Padroniza para dd.mm.yyyy
            }
            // Padroniza separadores para ponto
            dateRaw = dateRaw.replace(/\//g, '.');

            // Filtros de segurança
            if(desc.toUpperCase().includes("SALDO") || desc.toUpperCase().includes("SUBTOTAL") || isNaN(val)) return;

            // Ignora pagamento de fatura
            const isBillPayment = desc.toUpperCase().includes("PGTO") || desc.toUpperCase().includes("PAGAMENTO");

            // Verifica duplicatas
            const exists = appState.transactions.some(t => 
                t.description === desc && 
                t.amount === val && 
                t.date === dateRaw && 
                t.billMonth === billMonth
            );

            if(!exists) {
                appState.transactions.push({
                    id: Math.random().toString(36).substr(2, 9),
                    date: dateRaw, 
                    billMonth: billMonth, 
                    description: desc, 
                    amount: val, 
                    category: currentCategory, 
                    isBillPayment: isBillPayment
                });
                addedCount++;
            }
        }
    });

    return addedCount;
}

// --- VISUALIZAÇÃO E UI (Padrão) ---
function initViewSelector() {
    const select = document.getElementById('view-month');
    select.innerHTML = '';
    const months = Array.from(new Set(appState.transactions.map(t => t.billMonth))).sort().reverse();
    
    if (months.length === 0) {
        const opt = document.createElement('option'); opt.text = "Sem dados"; select.add(opt);
        renderUI([]); return;
    }

    months.forEach(m => {
        const opt = document.createElement('option'); opt.value = m; opt.text = formatMonthLabel(m); select.add(opt);
    });

    if (!appState.currentViewMonth || !months.includes(appState.currentViewMonth)) {
        appState.currentViewMonth = months[0];
    }
    select.value = appState.currentViewMonth;
    filterAndRender();
}

window.changeViewMonth = (val) => {
    appState.currentViewMonth = val;
    filterAndRender();
}

function filterAndRender() {
    const currentMonth = appState.currentViewMonth;
    if(!currentMonth) return;

    const savedIncome = appState.monthlyIncomes[currentMonth] || 0;
    const inputEl = document.getElementById('monthly-income');
    if(savedIncome > 0) inputEl.value = savedIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    else inputEl.value = "";
    
    document.getElementById('income-label-text').innerText = `Renda de ${formatMonthLabel(currentMonth).split(' ')[0]}`;
    const txs = appState.transactions.filter(t => t.billMonth === currentMonth);
    renderUI(txs);
}

document.getElementById('monthly-income').addEventListener('input', function() {
    let value = this.value.replace(/\D/g, "");
    if(value === "") { updateIncome(0); return; }
    let floatVal = parseFloat(value) / 100;
    this.value = floatVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    updateIncome(floatVal);
});

function updateIncome(floatVal) {
    const currentMonth = appState.currentViewMonth;
    if(!currentMonth) return;
    appState.monthlyIncomes[currentMonth] = floatVal;
    saveToFirebase();
    const txs = appState.transactions.filter(t => t.billMonth === currentMonth);
    renderCalculationsOnly(txs, floatVal);
}

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
     if(leftoverEl) {
         leftoverEl.innerText = formatBRL(leftover);
         leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';
     }
}

function deleteCurrentMonth() {
    if(!appState.currentViewMonth) return;
    if(confirm(`Apagar dados de ${appState.currentViewMonth}?`)) {
        appState.transactions = appState.transactions.filter(t => t.billMonth !== appState.currentViewMonth);
        saveToFirebase();
    }
}

function renderUI(transactions) {
    const output = document.getElementById('output');
    if(!output) return;
    output.innerHTML = '';

    let gross = 0, refunds = 0;
    const catTotals = {};
    const grouped = {};
    appState.categories.forEach(c => grouped[c] = []);

    transactions.sort((a,b) => {
        const [da, ma, ya] = a.date.split('.'); const [db, mb, yb] = b.date.split('.');
        return new Date(yb, mb-1, db) - new Date(ya, ma-1, da);
    }).reverse(); 

    transactions.forEach(t => {
        if(!grouped[t.category]) grouped[t.category] = [];
        grouped[t.category].push(t);
        if(!t.isBillPayment) {
            if(t.amount > 0) { gross += t.amount; catTotals[t.category] = (catTotals[t.category] || 0) + t.amount; }
            else { refunds += Math.abs(t.amount); }
        }
    });

    const net = gross - refunds;
    const currentMonthIncome = appState.monthlyIncomes[appState.currentViewMonth] || 0;
    const leftover = currentMonthIncome - net;

    document.getElementById('month-gross').innerText = formatBRL(gross);
    document.getElementById('month-refunds').innerText = "- " + formatBRL(refunds);
    document.getElementById('month-net').innerText = formatBRL(net);
    const leftoverEl = document.getElementById('month-leftover');
    if(leftoverEl) {
        leftoverEl.innerText = formatBRL(leftover);
        leftoverEl.style.color = leftover >= 0 ? '#4CD964' : '#FF3B30';
    }

    updateChart(catTotals);

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
            if(tx) {
                tx.category = this.value;
                saveToFirebase(); 
            }
        });
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

function formatMonthLabel(isoMonth) {
    if(!isoMonth) return "---";
    const [y, m] = isoMonth.split('-');
    const date = new Date(y, m - 1);
    const name = date.toLocaleString('pt-BR', { month: 'long' });
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`;
}
function formatBRL(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }