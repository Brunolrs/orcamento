// js/utils.js

// ... (funções de vibração e scroll mantidas) ...
export function vibrate(ms = 50) { if (navigator.vibrate) navigator.vibrate(ms); }
export function lockBodyScroll() { document.body.style.overflow = 'hidden'; }
export function unlockBodyScroll() { document.body.style.overflow = ''; }

// ... (formatBRL e formatMonthLabel mantidos) ...
export function formatBRL(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
export function formatMonthLabel(isoMonth) {
    if(!isoMonth) return "---";
    const [y, m] = isoMonth.split('-');
    const date = new Date(y, m - 1);
    const name = date.toLocaleString('pt-BR', { month: 'long' });
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`;
}

export function detectCategory(description, categoryRules) {
    const descUpper = description.toUpperCase();
    for (const [category, keywords] of Object.entries(categoryRules)) {
        for (const word of keywords) {
            if (descUpper.includes(word)) return category;
        }
    }
    return "Outros";
}

// --- Parser de Arquivo (CORRIGIDO) ---
export function parseFileContent(text, billMonth, existingTransactions, categoryRules) {
    const cleanText = text.replace(/[\r\n]+/g, ' '); 
    const regexBB = /(\d{2}[\/\.]\d{2}[\/\.]\d{4})(.*?)(?:R\$\s*)?(-?[\d\.]+,\d{2})/g;
    let match;
    let count = 0;
    const newTransactions = [];

    // Define a Data de Fatura Padrão baseada no Mês Selecionado (Dia 10)
    // Se billMonth for "2026-02", defaultInvoiceDate vira "10.02.2026"
    const [yBill, mBill] = billMonth.split('-');
    const defaultInvoiceDate = `10.${mBill}.${yBill}`;

    while ((match = regexBB.exec(cleanText)) !== null) {
        let dateRaw = match[1]; // Data da Compra (ex: 25.01.2026)
        let rawDesc = match[2].trim();
        let val = parseFloat(match[3].replace(/R\$/gi, '').trim().replace(/\./g, '').replace(',', '.'));
        let desc = rawDesc.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
        const upperDesc = desc.toUpperCase();

        if (upperDesc.includes("SALDO FATURA") || upperDesc.includes("SUBTOTAL") || upperDesc.includes("TOTAL") || upperDesc === "BR") continue;
        if (upperDesc.includes("PGTO")) continue;

        const cat = detectCategory(desc, categoryRules);
        
        // Verificação de duplicidade
        const exists = existingTransactions.some(t => t.description === desc && t.amount === val && t.date === dateRaw && t.billMonth === billMonth) ||
                       newTransactions.some(t => t.description === desc && t.amount === val && t.date === dateRaw);

        if(!exists) {
            newTransactions.push({
                id: Math.random().toString(36).substr(2, 9),
                date: dateRaw,             // Data Compra (ex: 25.01)
                invoiceDate: defaultInvoiceDate, // Data Fatura (ex: 10.02) -> FIXO NO MÊS DA FATURA
                billMonth: billMonth,      // Mês Filtro (ex: 2026-02)
                description: desc, 
                amount: val, 
                category: cat, 
                isBillPayment: false
            });
            count++;
        }
    }
    return { count, newTransactions };
}