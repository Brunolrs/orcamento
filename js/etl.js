/**
 * ETL Processor - Extract, Transform, Load
 * Versão: Dinâmica Pura (Usa cabeçalhos do banco como categorias)
 */

import { detectCategory } from './utils.js';

function addMonthsToDate(dateStr, monthsToAdd) {
    const [d, m, y] = dateStr.split('.').map(Number);
    const newDate = new Date(y, (m - 1) + monthsToAdd, 10);
    const nd = String(d).padStart(2, '0');
    const nm = String(newDate.getMonth() + 1).padStart(2, '0');
    const ny = newDate.getFullYear();
    return { formattedDate: `${nd}.${nm}.${ny}`, billMonth: `${ny}-${nm}` };
}

export class InvoiceETL {
    constructor() {
        this.rawLines = [];
        this.extractedData = [];
        this.transformedData = [];
        this.bankTotalTarget = 0;
        this.calculatedTotal = 0;
        this.debugLog = [];
        this.newLearnedRules = {}; 

        this.knownHeaders = [
            "Educação", "Lazer", "Restaurantes", "Saúde", "Serviços", 
            "Supermercados", "Transporte", "Vestuário", "Viagens", 
            "Outros lançamentos", "Compras parceladas", "Pagamentos/Créditos"
        ];
    }

    extract(textContent) {
        this.rawLines = textContent.split(/\r?\n/);
        let currentSection = "Outros"; 
        let stopReading = false;
        const regexTransaction = /^(\d{2}[\.\/]\d{2}[\.\/]\d{4})\s*(.*?)(?:\s+(BR|US))?\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})?/;

        for (const line of this.rawLines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.includes("Total da fatura :")) {
                const parts = trimmed.split(":");
                if (parts.length > 1) {
                    const valStr = parts[1].trim().replace("R$", "").trim().replace(/\./g, "").replace(",", ".");
                    this.bankTotalTarget = parseFloat(valStr);
                }
            }

            if (trimmed.includes("RESUMO EM REAL") || trimmed.includes("LIMITES - R$")) { stopReading = true; break; }
            if (stopReading) continue;

            const isHeader = this.knownHeaders.some(h => trimmed.includes(h) && trimmed.length < 40 && !/\d/.test(trimmed));
            if (isHeader) {
                if (trimmed.includes("Compras parceladas")) currentSection = "Detectar"; 
                else if (trimmed.includes("Pagamentos/Créditos")) currentSection = "Pagamentos";
                else {
                    const match = this.knownHeaders.find(h => trimmed.includes(h));
                    if (match) currentSection = match;
                }
                continue;
            }

            const match = regexTransaction.exec(trimmed);
            if (match) {
                let desc = match[2].trim().replace(/\*/g, ' ').replace(/\s+/g, ' ');
                let valStr = match[4] || match[3]; 
                if (!valStr) {
                    const parts = trimmed.split(/\s+/);
                    valStr = parts[parts.length - 2]; 
                }
                if(valStr) {
                    let val = parseFloat(valStr.replace(/\./g, '').replace(',', '.'));
                    this.extractedData.push({
                        rawDate: match[1], description: desc, value: val, section: currentSection
                    });
                }
            }
        }
    }

    learn(currentRules) {
        const rulesDelta = {};
        for (const item of this.extractedData) {
            if (["Detectar", "Pagamentos", "Outros", "Outros lançamentos"].includes(item.section)) continue;
            
            const targetCat = item.section;
            let keyword = item.description.toUpperCase().replace(/[0-9]/g, '').trim();
            if(keyword.length > 20) keyword = keyword.substring(0, 20).trim();
            if(keyword.length < 3) continue;

            if (!rulesDelta[targetCat]) rulesDelta[targetCat] = [];
            const existsInSystem = currentRules[targetCat] && currentRules[targetCat].some(r => keyword.includes(r));
            const existsInDelta = rulesDelta[targetCat].includes(keyword);

            if (!existsInSystem && !existsInDelta) rulesDelta[targetCat].push(keyword);
        }
        this.newLearnedRules = rulesDelta;
        return rulesDelta;
    }

    transform(billMonth, categoryRules) {
        const activeRules = JSON.parse(JSON.stringify(categoryRules));
        Object.keys(this.newLearnedRules).forEach(cat => {
            if(!activeRules[cat]) activeRules[cat] = []; 
            activeRules[cat].push(...this.newLearnedRules[cat]);
        });

        const [yBill, mBill] = billMonth.split('-');
        const defaultInvoiceDate = `10.${mBill}.${yBill}`;
        const regexInstallment = /(?:PARC\s*)?(\d{1,2})\/(\d{1,2})/;
        
        let sumDebits = 0, sumCredits = 0;

        for (const item of this.extractedData) {
            const upperDesc = item.description.toUpperCase();
            
            if (upperDesc.includes("SALDO FATURA") || upperDesc.includes("SUBTOTAL") || upperDesc.startsWith("TOTAL ")) continue;
            if (item.section === "Pagamentos" || upperDesc.includes("PGTO")) {
                if (item.value < -50 && (upperDesc.startsWith("PGTO") || upperDesc.includes("DEBITO CONTA") || upperDesc.includes("CASH AG"))) continue;
            }

            let finalCategory = item.section;
            if (["Detectar", "Pagamentos", "Outros", "Outros lançamentos"].includes(finalCategory)) {
                finalCategory = detectCategory(item.description, activeRules);
            }

            const instMatch = item.description.match(regexInstallment);
            let isInstallment = false, loops = 1, currentInst = 1, totalInst = 1;

            if (instMatch) {
                isInstallment = true;
                currentInst = parseInt(instMatch[1]);
                totalInst = parseInt(instMatch[2]);
                loops = (totalInst - currentInst) + 1;
            }

            for (let i = 0; i < loops; i++) {
                const futureInfo = addMonthsToDate(defaultInvoiceDate, i);
                let finalDesc = item.description;
                if (isInstallment && i > 0) {
                    const nextInstNum = currentInst + i;
                    finalDesc = item.description.replace(instMatch[0], `${String(nextInstNum).padStart(2,'0')}/${String(totalInst).padStart(2,'0')}`);
                }

                const transaction = {
                    id: Math.random().toString(36).substr(2, 9),
                    date: item.rawDate,
                    invoiceDate: futureInfo.formattedDate,
                    billMonth: futureInfo.billMonth,
                    description: finalDesc,
                    amount: item.value,
                    category: finalCategory,
                    type: isInstallment ? 'Parcelado' : 'À Vista',
                    isFuture: i > 0
                };

                this.transformedData.push(transaction);
                if (i === 0) {
                    if (item.value > 0) sumDebits += item.value; else sumCredits += item.value;
                }
            }
        }
        this.calculatedTotal = sumDebits + sumCredits;
    }

    getPreviewData() {
        const currentMonthData = this.transformedData.filter(t => !t.isFuture);
        const groups = {};
        currentMonthData.forEach(t => {
            if (!groups[t.category]) groups[t.category] = { total: 0, items: [] };
            groups[t.category].total += t.amount;
            groups[t.category].items.push(t);
        });
        
        let learnedCount = 0;
        Object.values(this.newLearnedRules).forEach(arr => learnedCount += arr.length);

        return {
            bankTotal: this.bankTotalTarget,
            calcTotal: this.calculatedTotal,
            isValid: Math.abs(this.bankTotalTarget - this.calculatedTotal) < 0.10,
            groups: groups,
            learnedRules: this.newLearnedRules,
            learnedCount: learnedCount,
            totalItems: currentMonthData.length
        };
    }
}