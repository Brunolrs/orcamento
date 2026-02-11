import { appState } from '../state.js';
import { CHART_COLORS } from '../config.js';

let chartInstance = null;      // Gráfico de Categorias (Donut)
let trendChartInstance = null; // Gráfico de Tendência (Barras)

// Helper de cor (Exportado para uso no lists.js)
export function getColorForCategory(cat) {
  if (appState.categoryColors && appState.categoryColors[cat]) {
    return appState.categoryColors[cat];
  }
  const index = appState.categories.indexOf(cat);
  return CHART_COLORS[index % CHART_COLORS.length] || '#8E8E93';
}

// Helper matemático: Regressão Linear
function calculateLinearRegression(values) {
    const n = values.length;
    if (n < 2) return Array(n).fill(null); 

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return values.map((_, i) => slope * i + intercept);
}

// Função Principal de Atualização
export function updateCharts(currentMonthData) {
  const ctxDonut = document.getElementById('expenseChart');
  if(!ctxDonut) return;

  // 1. Gráfico de Rosca
  const activeCats = Object.keys(currentMonthData).filter(k => currentMonthData[k] > 0);
  const values = activeCats.map(k => currentMonthData[k]);
  const colors = activeCats.map(cat => getColorForCategory(cat));

  // Lógica Visual: Se houver seleção, ofusca os não selecionados
  const backgroundColors = appState.selectedCategory 
      ? colors.map((c, i) => activeCats[i] === appState.selectedCategory ? c : c + '40') // '40' = transparência
      : colors;

  if (chartInstance) chartInstance.destroy();
  
  chartInstance = new Chart(ctxDonut.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: activeCats,
      datasets: [{
        data: values,
        backgroundColor: backgroundColors,
        borderWidth: 0,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { legend: { display: false } },
      // --- EVENTO DE CLIQUE ---
      onClick: (e, elements) => {
        if (elements.length > 0) {
            const index = elements[0].index;
            const clickedCat = activeCats[index];
            
            // Alterna seleção (se clicar no mesmo, desmarca)
            appState.selectedCategory = appState.selectedCategory === clickedCat ? null : clickedCat;
            
            // Recarrega a interface
            import('./index.js').then(mod => mod.filterAndRender());
        } else {
            // Clique fora do gráfico limpa o filtro
            if(appState.selectedCategory) {
                appState.selectedCategory = null;
                import('./index.js').then(mod => mod.filterAndRender());
            }
        }
      }
    }
  });

  // 2. Gráfico de Tendência
  renderTrendChart();
}

function renderTrendChart() {
    const ctxTrend = document.getElementById('trendChart');
    if(!ctxTrend) return; 

    const monthlyTotals = {};
    appState.transactions.forEach(t => {
        if (t.amount > 0) { 
            if (!monthlyTotals[t.billMonth]) monthlyTotals[t.billMonth] = 0;
            monthlyTotals[t.billMonth] += t.amount;
        }
    });

    let monthsToShow = [];

    if (appState.currentViewMonth && appState.currentViewMonth !== "ALL") {
        const [y, m] = appState.currentViewMonth.split('-').map(Number);
        for (let i = 0; i < 6; i++) {
            let nextM = m + i;
            let nextY = y;
            while(nextM > 12) { nextM -= 12; nextY++; }
            monthsToShow.push(`${nextY}-${String(nextM).padStart(2,'0')}`);
        }
    } else {
        const sorted = Object.keys(monthlyTotals).sort();
        monthsToShow = sorted.slice(-6);
        if(monthsToShow.length === 0) {
            const d = new Date();
            monthsToShow.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
        }
    }

    const labels = monthsToShow.map(m => {
        const [y, monthNum] = m.split('-');
        const date = new Date(y, monthNum - 1, 10);
        return date.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }).toUpperCase().replace('.','');
    });

    const dataValues = monthsToShow.map(m => monthlyTotals[m] || 0);
    const barColors = monthsToShow.map(m => m === appState.currentViewMonth ? '#007AFF' : '#C7C7CC');
    const trendValues = calculateLinearRegression(dataValues);

    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctxTrend, {
        data: {
            labels: labels,
            datasets: [
                { type: 'bar', label: 'Gastos', data: dataValues, backgroundColor: barColors, borderRadius: 4, order: 2 },
                { type: 'line', label: 'Tendência', data: trendValues, borderColor: '#FF9500', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0, order: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false } }, y: { display: false } }
        }
    });
}