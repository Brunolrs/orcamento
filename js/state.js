import { DEFAULT_RULES } from './config.js';

export let appState = {
    transactions: [],
    incomeDetails: {},
    monthlyBudgets: {},
    categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
    categories: [...Object.keys(DEFAULT_RULES)],
    categoryColors: {},
    currentViewMonth: null,
    user: null,
    isEditMode: false,
    selectedCategory: null,
    sentNotifications: [] // NOVO: Controle de notificações enviadas (resetar ao mudar de mês)
};