/**
 * UTILS - Parser Inteligente com Deduplicação Avançada (Normalização)
 * Versão: Correção "PARC" (Ignora a palavra PARC na comparação para evitar duplicatas)
 */

const DEBUG = true;

// --- Mobile First Features ---
export function vibrate(ms = 50) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

export function lockBodyScroll() {
  document.body.style.overflow = 'hidden';
}

export function unlockBodyScroll() {
  document.body.style.overflow = '';
}

// --- Formatadores ---
export function formatBRL(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatMonthLabel(isoMonth) {
  if (!isoMonth) return "---";
  const [y, m] = isoMonth.split('-');
  const date = new Date(y, m - 1);
  const name = date.toLocaleString('pt-BR', { month: 'long' });
  return `${name.charAt(0).toUpperCase() + name.slice(1)} ${y}`;
}

export function detectCategory(description, categoryRules) {
  const descUpper = (description || "").toUpperCase();
  for (const [category, keywords] of Object.entries(categoryRules || {})) {
    for (const word of keywords) {
      if (descUpper.includes(word)) return category;
    }
  }
  return "Outros";
}

// --- Helper de Data ---
function addMonthsToDate(dateStr, monthsToAdd) {
  const [d, m, y] = dateStr.split('.').map(Number);
  // Fixa dia 10 para evitar problemas de 30/31
  const newDate = new Date(y, (m - 1) + monthsToAdd, 10);
  
  const nd = String(d).padStart(2, '0');
  const nm = String(newDate.getMonth() + 1).padStart(2, '0');
  const ny = newDate.getFullYear();
  
  return {
    formattedDate: `${nd}.${nm}.${ny}`,
    billMonth: `${ny}-${nm}`
  };
}

// --- Helper de Normalização (A CORREÇÃO ESTÁ AQUI) ---
// Remove "PARC", espaços e símbolos para comparar apenas a "alma" da transação
function normalizeStr(str) {
    if (!str) return "";
    return str.toUpperCase()
        .replace(/PARC(?:ELA)?/g, "") // Remove PARC ou PARCELA
        .replace(/[^A-Z0-9]/g, "");   // Remove espaços e símbolos
}

function matchTransactionLine(line) {
  // Regex flexível para linhas com ou sem país
  const RX_FULL = /^(\d{2}[\.\/]\d{2}[\.\/]\d{4})\s*(.*?)(?:\s+(BR|US))\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/;
  const RX_SIMPLE = /^(\d{2}[\.\/]\d{2}[\.\/]\d{4})\s*(.*?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/;

  let m = RX_FULL.exec(line);
  if (!m) m = RX_SIMPLE.exec(line);

  if (m) {
    return {
      date: m[1],
      desc: m[2].trim(),
      valBRL: m[m.length - 2]
    };
  }
  return null;
}

// --- PARSER PRINCIPAL ---
export function parseFileContent(text, billMonth, existingTransactions, categoryRules) {
  const lines = text.split(/\r?\n/);
  // Regex para identificar parcelas (ex: 01/10 ou PARC 01/10)
  const regexInstallment = /(?:PARC\s*)?(\d{1,2})\/(\d{1,2})/;

  let count = 0;
  const newTransactions = [];
  const debugLog = []; 

  const [yBill, mBill] = billMonth.split('-');
  const defaultInvoiceDate = `10.${mBill}.${yBill}`;

  let currentCategory = "Outros";
  let stopParsing = false;
  
  // Auditoria
  let totalDebits = 0;
  let totalCredits = 0;
  let bankTotalTarget = null;

  const knownCategories = [
    "Educação", "Lazer", "Restaurantes", "Saúde", "Serviços", 
    "Supermercados", "Transporte", "Vestuário", "Viagens", 
    "Outros lançamentos", "Compras parceladas", "Pagamentos/Créditos"
  ];

  const stopMarkers = ["RESUMO EM REAL", "LIMITES - R$", "ENCARGOS FINANCEIROS"];

  debugLog.push({ type: 'INFO', msg: `Iniciando Parsing para: ${billMonth}` });

  for (const rawLine of lines) {
    if (stopParsing) break;
    const line = rawLine.trim();
    if (!line) continue;

    // 1. Captura Total Oficial
    if (line.includes("Total da fatura :")) {
        const parts = line.split(":");
        if (parts.length > 1) {
            const valStr = parts[1].trim().replace("R$", "").trim().replace(/\./g, "").replace(",", ".");
            bankTotalTarget = parseFloat(valStr);
            debugLog.push({ type: 'TARGET', msg: `Total Oficial: ${formatBRL(bankTotalTarget)}` });
        }
    }

    // 2. Parada
    if (stopMarkers.some(marker => line.includes(marker))) {
      stopParsing = true;
      break;
    }

    // 3. Seção
    const potentialCategory = knownCategories.find(cat => line.includes(cat));
    if (potentialCategory && line.length < 50 && !/\d{2}\.\d{2}\.\d{4}/.test(line)) {
      currentCategory = potentialCategory;
      continue;
    }

    // 4. Transação
    const match = matchTransactionLine(line);
    if (!match) continue;

    let { date, desc, valBRL } = match;
    desc = desc.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
    let val = parseFloat(valBRL.replace(/\./g, '').replace(',', '.'));
    const upperDesc = desc.toUpperCase();

    let action = "CHECKING";
    let reason = "";

    // --- REGRAS DE EXCLUSÃO ---
    if (upperDesc.includes("SALDO FATURA") || upperDesc.includes("SUBTOTAL") || upperDesc.startsWith("TOTAL ") || upperDesc === "BR") {
        action = "SKIPPED";
        reason = "Linha Informativa";
    }
    else if (val < -100 && (
        upperDesc.startsWith("PGTO ") || 
        upperDesc.includes("DEBITO CONTA") || 
        upperDesc.includes("PAGAMENTO DE TITULO") ||
        upperDesc.includes("CASH AG")
    )) {
        action = "SKIPPED";
        reason = "Pagamento Fatura Anterior";
    } 
    else {
        action = "INCLUDED";
        
        let finalCat = currentCategory;
        if (finalCat === "Compras parceladas" || finalCat === "Pagamentos/Créditos" || finalCat === "Outros") {
            finalCat = detectCategory(desc, categoryRules);
        }

        // --- PARCELAS ---
        const instMatch = desc.match(regexInstallment);
        let loops = 1;
        let currentInst = 1;
        let totalInst = 1;

        if (instMatch) {
            currentInst = parseInt(instMatch[1]);
            totalInst = parseInt(instMatch[2]);
            // Gera do atual até o final
            loops = (totalInst - currentInst) + 1;
        }

        for (let i = 0; i < loops; i++) {
            const futureInfo = addMonthsToDate(defaultInvoiceDate, i);
            
            let finalDesc = desc;
            if (instMatch && i > 0) {
                const nextInstNum = currentInst + i;
                // Ex: Transforma 01/10 em 02/10 na string
                finalDesc = desc.replace(instMatch[0], `${String(nextInstNum).padStart(2,'0')}/${String(totalInst).padStart(2,'0')}`);
            }

            // --- DEDUPLICAÇÃO ROBUSTA ---
            // 1. Normaliza strings (remove PARC, espaços, símbolos)
            const normFinalDesc = normalizeStr(finalDesc);
            
            const isDuplicate = (t) => {
                const sameDesc = normalizeStr(t.description) === normFinalDesc;
                const sameVal = Math.abs(t.amount - val) < 0.05;
                const sameMonth = t.billMonth === futureInfo.billMonth;
                // Para parcelas, ignoramos a data exata da compra porque o arquivo pode variar 
                // ou ter sido gerado em dia diferente. Confiamos na descrição da parcela + valor + mês.
                // Para compras à vista, exigimos a data para diferenciar (ex: Uber)
                const sameDate = t.date === date;
                
                if (instMatch) {
                    return sameDesc && sameVal && sameMonth;
                } else {
                    return sameDesc && sameVal && sameMonth && sameDate;
                }
            };

            const exists = existingTransactions.some(isDuplicate) || newTransactions.some(isDuplicate);

            if (!exists) {
                newTransactions.push({
                    id: Math.random().toString(36).substr(2, 9),
                    date: date,
                    invoiceDate: futureInfo.formattedDate,
                    billMonth: futureInfo.billMonth,
                    description: finalDesc,
                    amount: val,
                    category: finalCat,
                    isBillPayment: false
                });
                
                // Contabiliza apenas o mês atual importado
                if (i === 0) {
                    count++;
                    if (val > 0) totalDebits += val;
                    else totalCredits += val;
                }
            } else {
                if(i === 0) {
                    action = "SKIPPED";
                    reason = `Duplicado (${finalDesc})`;
                }
            }
        }
    }

    debugLog.push({ status: action, desc: desc, val: val, reason: reason });
  }

  const calculatedTotal = totalDebits + totalCredits;
  
  debugLog.push({ 
      type: 'SUMMARY', 
      msg: `Banco: ${bankTotalTarget ? formatBRL(bankTotalTarget) : 'N/A'} | Sistema: ${formatBRL(calculatedTotal)}` 
  });

  return { count, newTransactions, debugLog, calculatedTotal, bankTotalTarget };
}