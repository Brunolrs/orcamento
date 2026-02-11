/**
 * UI AGGREGATOR - Ponto de entrada da UI
 */
import { appState } from '../state.js';
import { formatMonthLabel } from '../utils.js';

// Importa dos sub-módulos
import { renderListsAndCharts, renderIncomeList } from './lists.js';
import { renderCategoryManager, renderEtlPreview } from './modals.js';
import { initViewSelector } from './selectors.js';

// Re-exporta para o main.js usar
export { renderListsAndCharts, renderIncomeList, renderCategoryManager, renderEtlPreview, initViewSelector };

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

  // Atualiza Inputs Básicos (Renda e Label)
  const inputEl = document.getElementById('monthly-income');
  inputEl.value = currentIncome > 0 ? currentIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : "0,00";
  document.getElementById('income-label-text').innerText = labelText;
  document.getElementById('btn-manage-income').style.display = (view === "ALL") ? "none" : "flex";

  // Atualiza Input de Orçamento
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

  // Renderiza Gráficos e Listas (módulo lists.js)
  renderListsAndCharts(txs, currentIncome);
}