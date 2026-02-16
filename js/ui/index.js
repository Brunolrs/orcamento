/**
 * UI AGGREGATOR - Ponto de entrada da UI
 */
import { appState } from '../state.js';
import { formatMonthLabel } from '../utils.js';

// Imports dos submódulos
import { renderListsAndCharts, renderIncomeList } from './lists.js';
import { renderCategoryManager, renderEtlPreview } from './modals.js';
import { initViewSelector } from './selectors.js';
// IMPORT CRÍTICO QUE FALTAVA:
import { renderConferenceModal } from './conference.js'; 

// Exportações para o main.js
export { 
    renderListsAndCharts, 
    renderIncomeList, 
    renderCategoryManager, 
    renderEtlPreview, 
    initViewSelector,
    renderConferenceModal // <--- Agora está sendo exportado corretamente
};

// --- ORQUESTRADOR PRINCIPAL DA UI ---
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
  if(inputEl) inputEl.value = currentIncome > 0 ? currentIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "0,00";
  
  const labelEl = document.getElementById('income-label-text');
  if(labelEl) labelEl.innerText = labelText;
  
  const manageBtn = document.getElementById('btn-manage-income');
  if(manageBtn) manageBtn.style.display = (view === "ALL") ? "none" : "flex";

  const budgetInput = document.getElementById('month-budget');
  if (budgetInput) {
    if (view === "ALL") {
        budgetInput.value = ""; budgetInput.disabled = true; budgetInput.placeholder = "---";
    } else {
        budgetInput.disabled = false;
        const savedBudget = appState.monthlyBudgets[view] || 0;
        budgetInput.value = savedBudget > 0 ? savedBudget.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "";
        budgetInput.placeholder = "0,00";
    }
  }

  renderListsAndCharts(txs, currentIncome);
}