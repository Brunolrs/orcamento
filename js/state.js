/**
 * ESTADO GLOBAL (SINGLE SOURCE OF TRUTH)
 */
import { DEFAULT_RULES } from './config.js';

export let appState = {
    transactions: [],
    incomeDetails: {},
    categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    categories: [...Object.keys(DEFAULT_RULES)],
    // NOVO: Armazena cores personalizadas { "Alimentação": "#FF0000" }
    categoryColors: {}, 
    currentViewMonth: null,
    user: null,
    isEditMode: false
};