import { appState } from '../state.js';
import { formatMonthLabel } from '../utils.js';

export function initViewSelector(onChangeCallback) {
  const select = document.getElementById('view-month');
  if(!select) return; // Proteção caso o elemento não exista
  select.innerHTML = '';

  const optAll = document.createElement('option');
  optAll.value = "ALL";
  optAll.text = "📊 Visão Geral (Tudo)";
  select.add(optAll);

  // Pega meses únicos das transações
  const months = Array.from(new Set(appState.transactions.map(t => t.billMonth))).sort().reverse();
  
  months.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.text = formatMonthLabel(m);
    select.add(opt);
  });

  // Garante que a seleção atual é válida
  if (!appState.currentViewMonth || (appState.currentViewMonth !== "ALL" && !months.includes(appState.currentViewMonth))) {
      appState.currentViewMonth = "ALL";
  }
  
  select.value = appState.currentViewMonth;

  if(onChangeCallback) onChangeCallback();
}