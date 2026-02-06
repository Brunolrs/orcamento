/**
 * UTILS - Funções Auxiliares e Parser
 * Inclui: Formatadores, UI helpers e a função crítica 'extractKeyword' para o aprendizado da IA.
 */

const DEBUG = true; // Define como false em produção para limpar o console

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

// --- FUNÇÃO CRÍTICA PARA A IA E APRENDIZADO ---
/**
 * Extrai a "palavra-chave" de uma descrição para criar regras.
 * Remove números, parcelas e caracteres especiais.
 * Ex: "UBER *VIAGEM 1234" -> "UBER VIAGEM"
 */
export function extractKeyword(description) {
    if (!description) return "";
    
    let keyword = description.toUpperCase()
        .replace(/[0-9]/g, '')       // Remove números (datas, valores)
        .replace(/[^A-Z\s]/g, '')    // Mantém apenas letras e espaços
        .replace(/\s+/g, ' ')        // Remove espaços duplos
        .trim();

    // Limita o tamanho para evitar regras gigantescas e específicas demais
    if (keyword.length > 20) keyword = keyword.substring(0, 20).trim();
    
    return keyword;
}

/**
 * Detecta categoria por palavras-chave (Regra Local).
 */
export function detectCategory(description, categoryRules) {
  const descUpper = (description || "").toUpperCase();
  for (const [category, keywords] of Object.entries(categoryRules || {})) {
    for (const word of keywords) {
      if (descUpper.includes(word)) return category;
    }
  }
  return "Outros";
}

// --- Funções Internas do Parser (Não precisam ser exportadas se usadas só aqui) ---

function addMonthsToDate(dateStr, monthsToAdd) {
  const [d, m, y] = dateStr.split('.').map(Number);
  // Fixa dia 10 para evitar problemas de virada de mês (ex: 31/01 -> 28/02)
  const newDate = new Date(y, (m - 1) + monthsToAdd, 10);
  
  const nd = String(d).padStart(2, '0');
  const nm = String(newDate.getMonth() + 1).padStart(2, '0');
  const ny = newDate.getFullYear();
  
  return {
    formattedDate: `${nd}.${nm}.${ny}`,
    billMonth: `${ny}-${nm}`
  };
}

function matchTransactionLine(line) {
  // Regex 1: Com país (BR/US)
  const RX_WITH_COUNTRY = /^(\d{2}[\/\.]\d{2}[\/\.]\d{4})\s*(.*?)(?:\s+(BR|US))\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;
  
  // Regex 2: Sem país (Fallback)
  const RX_NO_COUNTRY = /^(\d{2}[\/\.]\d{2}[\/\.]\d{4})\s*(.*?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;

  let m = RX_WITH_COUNTRY.exec(line);
  if (m) {
    return { date: m[1], desc: m[2].trim(), valBRL: m[4] };
  }
  
  m = RX_NO_COUNTRY.exec(line);
  if (m) {
    return { date: m[1], desc: m[2].trim(), valBRL: m[3] };
  }
  
  return null;
}

/**
 * Parser Legado/Manual (Usado se não utilizar o ETL class)
 * Mantido para compatibilidade ou uso rápido.
 */
export function parseFileContent(text, billMonth, existingTransactions, categoryRules) {
  const lines = text.split(/\r?\n/);
  const regexInstallment = /(?:^|\s)(?:PARC\s*)?(\d{1,2})\/(\d{1,2})(?:\s|$|\))/i;

  let count = 0;
  const newTransactions = [];
  const [yBill, mBill] = billMonth.split('-');
  const defaultInvoiceDate = `10.${mBill}.${yBill}`;

  let currentCategory = "Outros";
  let isCreditSection = false;
  let stopParsing = false;

  const knownCategories = [
    "Educação", "Lazer", "Restaurantes", "Saúde", "Serviços", 
    "Supermercados", "Transporte", "Vestuário", "Viagens", 
    "Outros lançamentos", "Compras parceladas", "Pagamentos/Créditos"
  ];

  const hardStops = ["RESUMO EM REAL", "LIMITES", "ENCARGOS FINANCEIROS"];

  for (const rawLine of lines) {
    if (stopParsing) break;
    const line = (rawLine || "").trim();
    if (!line) continue;

    if (hardStops.some(h => line.toUpperCase().startsWith(h))) {
      stopParsing = true;
      break;
    }

    const potentialCategory = knownCategories.find(cat => line === cat);
    if (potentialCategory) {
      currentCategory = potentialCategory === "Compras parceladas" ? "Outros" : potentialCategory;
      isCreditSection = (potentialCategory === "Pagamentos/Créditos");
      continue;
    }

    const m = matchTransactionLine(line);
    if (!m) continue;

    let { date, desc, valBRL } = m;
    desc = desc.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
    let val = parseFloat(valBRL.replace(/\./g, '').replace(',', '.'));
    const upperDesc = desc.toUpperCase();

    // Filtros de Exclusão
    if (upperDesc.includes("SALDO FATURA") || upperDesc.includes("SUBTOTAL") || upperDesc.startsWith("TOTAL ")) continue;

    if (isCreditSection) {
        // Ignora pagamento de fatura, mantém estornos
        if (val < -50 && (upperDesc.startsWith("PGTO") || upperDesc.includes("DEBITO CONTA") || upperDesc.includes("CASH AG"))) continue;
    }

    let finalCat = currentCategory;
    if (["Outros", "Compras parceladas", "Pagamentos/Créditos"].includes(finalCat)) {
        finalCat = detectCategory(desc, categoryRules);
    }

    // Parcelas
    const instMatch = desc.match(regexInstallment);
    let loops = 1;
    let currentInst = 1;
    let totalInst = 1;

    if (instMatch) {
        currentInst = parseInt(instMatch[1]);
        totalInst = parseInt(instMatch[2]);
        loops = 1 + (totalInst - currentInst);
    }

    for (let i = 0; i < loops; i++) {
        const futureInfo = addMonthsToDate(defaultInvoiceDate, i);
        let finalDesc = desc;
        
        if (instMatch && i > 0) {
            const nextInstNum = currentInst + i;
            finalDesc = desc.replace(instMatch[0], `${String(nextInstNum).padStart(2,'0')}/${String(totalInst).padStart(2,'0')}`);
        }

        // Deduplicação Simples
        const exists = existingTransactions && existingTransactions.some(t => 
            t.description === finalDesc && 
            Math.abs(t.amount - val) < 0.05 && 
            t.billMonth === futureInfo.billMonth
        );

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
            if (i === 0) count++;
        }
    }
  }

  return { count, newTransactions };
}