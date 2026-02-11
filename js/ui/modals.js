import { appState } from '../state.js';
import { CHART_COLORS } from '../config.js';

// Helper local de cor
function getColorForCategory(cat) {
    if (appState.categoryColors && appState.categoryColors[cat]) {
        return appState.categoryColors[cat];
    }
    const index = appState.categories.indexOf(cat);
    return CHART_COLORS[index % CHART_COLORS.length] || '#8E8E93';
}

// --- GERENCIADOR DE CATEGORIAS ---
export function renderCategoryManager() {
    const list = document.getElementById('categories-list');
    if (!list) return;
    list.innerHTML = '';

    const cats = Object.keys(appState.categoryRules).sort();
    cats.forEach(cat => {
        const keywords = appState.categoryRules[cat];
        const currentColor = getColorForCategory(cat);
        const isDefault = cat === "Outros";

        const div = document.createElement('div');
        div.className = 'cat-edit-item';
        div.innerHTML = `
      <div class="cat-edit-header" style="gap: 10px;">
        <input type="color" value="${currentColor}"
          style="width: 30px; height: 30px; border: none; background: none; padding: 0;"
          onchange="window.updateCategoryColor('${cat}', this.value)">
        <input type="text" value="${cat}" class="form-input"
          style="height: 36px; font-weight: bold; color: var(--ios-blue);"
          ${isDefault ? 'disabled' : ''}
          onchange="window.renameCategory('${cat}', this.value)">
        ${!isDefault ? `<button class="btn-delete-cat" onclick="window.deleteCategory('${cat}')"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>`;

        const keysArea = document.createElement('div');
        keysArea.className = 'keywords-area';
        keywords.forEach(word => {
            const tag = document.createElement('span'); tag.className = 'keyword-tag';
            tag.innerHTML = `${word} <span class="keyword-remove" onclick="window.removeKeyword('${cat}', '${word}')">×</span>`;
            keysArea.appendChild(tag);
        });

        const input = document.createElement('input');
        input.className = 'keyword-add-input';
        input.placeholder = '+ Palavra';
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && input.value.trim()) window.addKeyword(cat, input.value.trim().toUpperCase());
        });
        keysArea.appendChild(input);

        div.appendChild(keysArea);
        list.appendChild(div);
    });
}

// --- RENDERIZAR PREVIEW DO ETL ---
export function renderEtlPreview(etlData, onConfirm) {
    let modal = document.getElementById('etl-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'etl-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-height: 90vh; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h2>Conferência</h2>
                    <button class="close-btn" onclick="document.getElementById('etl-modal').style.display='none'">&times;</button>
                </div>
                <div class="modal-body" style="overflow-y: auto; padding: 15px;">
                    <div id="etl-status-card" class="highlight-card" style="margin: 0 0 15px 0; padding: 15px;"></div>
                    <div id="etl-new-cats-alert" style="display:none; background:#FFF4CE; border:1px solid #FFCC00; border-radius:12px; padding:10px; margin-bottom:15px;">
                        <div style="font-size:12px; font-weight:700; color:#997700; margin-bottom:5px;"><i class="fa-solid fa-lightbulb"></i> Sugestões da IA:</div>
                        <div id="etl-new-cats-list" style="display:flex; gap:5px; flex-wrap:wrap;"></div>
                    </div>
                    <div id="etl-groups-area"></div>
                </div>
                <div style="padding: 15px; border-top: 1px solid #eee; background: white;">
                    <button id="btn-confirm-etl" class="btn-block btn-primary">Confirmar Importação</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    const statusCard = document.getElementById('etl-status-card');
    const diff = etlData.bankTotal - etlData.calcTotal;
    const color = etlData.isValid ? '#4CD964' : '#FF3B30';
    const icon = etlData.isValid ? '<i class="fa-solid fa-check-circle"></i>' : '<i class="fa-solid fa-triangle-exclamation"></i>';

    statusCard.style.background = color;
    statusCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
            <div>
                <div class="label" style="color:white; opacity:0.9;">Total Banco</div>
                <div class="value" style="color:white; font-size:20px;">R$ ${etlData.bankTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
            <div style="text-align:right;">
                <div class="label" style="color:white; opacity:0.9;">Calculado</div>
                <div class="value" style="color:white; font-size:20px;">R$ ${etlData.calcTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
        </div>
        ${!etlData.isValid ? `<div style="margin-top:10px; color:white; font-weight:bold; font-size:12px; background:rgba(0,0,0,0.2); padding:5px; border-radius:8px;">${icon} Diferença: R$ ${diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>` : ''}
    `;

    const newCats = [];
    Object.keys(etlData.groups).forEach(cat => {
        if (!appState.categories.includes(cat) && cat !== "Outros") newCats.push(cat);
    });

    const alertBox = document.getElementById('etl-new-cats-alert');
    const alertList = document.getElementById('etl-new-cats-list');

    if (newCats.length > 0) {
        alertBox.style.display = 'block';
        alertList.innerHTML = newCats.map(c => `<span style="background:white; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:600; color:#333; border:1px solid #E5E5EA;">${c}</span>`).join('');
    } else {
        alertBox.style.display = 'none';
    }

    const groupsArea = document.getElementById('etl-groups-area');
    groupsArea.innerHTML = '';

    Object.keys(etlData.groups).sort().forEach(cat => {
        const group = etlData.groups[cat];
        const isNew = newCats.includes(cat);
        const badge = isNew ? `<span style="background:#FFCC00; color:black; padding:2px 6px; border-radius:6px; font-size:9px; margin-left:6px; vertical-align:middle;">✨ NOVA</span>` : '';

        const catHtml = `
            <div style="margin-bottom: 15px; border: 1px solid #eee; border-radius: 12px; overflow: hidden; ${isNew ? 'border: 1px solid #FFCC00;' : ''}">
                <div style="background:${isNew ? '#FFFDF5' : '#f9f9f9'}; padding:10px; display:flex; justify-content:space-between; align-items:center; font-weight:bold; font-size:13px;">
                    <div>${cat} ${badge}</div>
                    <span>R$ ${group.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div style="padding: 5px;">
                    ${group.items.map(item => `
                        <div style="display:flex; justify-content:space-between; padding: 5px; font-size: 11px; border-bottom: 1px solid #f0f0f0;">
                            <span style="flex:1;">${item.description}</span>
                            <span style="font-weight:600; ${item.amount < 0 ? 'color:green' : ''}">R$ ${item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        groupsArea.innerHTML += catHtml;
    });

    modal.style.display = 'flex';

    const btnConfirm = document.getElementById('btn-confirm-etl');
    const newBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);

    newBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        onConfirm();
    });
}