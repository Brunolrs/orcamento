import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// Ajuste de caminho: sobe um nível para pegar config e state
import { firebaseConfig, DEFAULT_RULES } from '../config.js';
import { appState } from '../state.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

export { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged };

// --- SALVAR DADOS (Modo Pessoal) ---
export async function saveToFirebase() {
    if (!appState.user) return;
    const userDocRef = doc(db, "users", appState.user.uid);
    try {
        await updateDoc(userDocRef, { 
            transactions: appState.transactions, 
            incomeDetails: appState.incomeDetails, 
            monthlyBudgets: appState.monthlyBudgets || {},
            categoryRules: appState.categoryRules,
            categoryColors: appState.categoryColors || {}
        });
    } catch (e) { console.error("Erro ao salvar:", e); }
}

// --- RESETAR DADOS (Zerar Conta) ---
export async function resetAllData() {
    if (!appState.user) return;
    const userDocRef = doc(db, "users", appState.user.uid);
    try {
        await updateDoc(userDocRef, { 
            transactions: [], 
            incomeDetails: {}, 
            monthlyBudgets: {},
            categoryRules: { "Outros": [] },
            categoryColors: {} 
        });
    } catch (e) { console.error("Erro ao resetar:", e); }
}

// --- RESTAURAR BACKUP ---
export async function restoreFromBackup(backupData) {
    if (!appState.user) return;
    
    if (!backupData.transactions || !backupData.incomeDetails) {
        throw new Error("Arquivo de backup inválido ou incompatível.");
    }

    const userDocRef = doc(db, "users", appState.user.uid);
    try {
        await setDoc(userDocRef, {
            transactions: backupData.transactions,
            incomeDetails: backupData.incomeDetails,
            monthlyBudgets: backupData.monthlyBudgets || {},
            categoryRules: backupData.categoryRules || { "Outros": [] },
            categoryColors: backupData.categoryColors || {}
        });
        
        alert("✅ Backup restaurado com sucesso! A página será recarregada.");
        window.location.reload();
    } catch (e) {
        console.error("Erro ao restaurar:", e);
        alert("Erro ao restaurar backup: " + e.message);
    }
}

// --- ESCUTAR DADOS EM TEMPO REAL ---
export function startRealtimeListener(uid, renderCallback) {
    const userDocRef = doc(db, "users", uid);
    
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            appState.transactions = data.transactions || [];
            
            // Lógica de Migração (Renda Antiga)
            let loadedIncomes = data.incomeDetails || {};
            if (Object.keys(loadedIncomes).length === 0 && data.monthlyIncomes) {
                console.log("♻️ Convertendo dados antigos de renda...");
                Object.keys(data.monthlyIncomes).forEach(month => {
                    const val = data.monthlyIncomes[month];
                    if (val > 0) {
                        loadedIncomes[month] = [{ 
                            id: Date.now() + Math.random(), 
                            desc: "Renda Recuperada", 
                            val: parseFloat(val) 
                        }];
                    }
                });
                appState.incomeDetails = loadedIncomes;
                saveToFirebase(); 
            } else {
                appState.incomeDetails = loadedIncomes;
            }

            appState.monthlyBudgets = data.monthlyBudgets || {};
            appState.categoryColors = data.categoryColors || {};
            
            if (data.categoryRules) appState.categoryRules = data.categoryRules;
            appState.categories = [...Object.keys(appState.categoryRules)];
            if(!appState.categories.includes("Outros")) appState.categories.push("Outros");

            if (!appState.isEditMode && renderCallback) renderCallback();
        } else {
            // Novo usuário
            setDoc(userDocRef, { 
                transactions: [], 
                incomeDetails: {}, 
                monthlyBudgets: {},
                categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)), 
                categoryColors: {} 
            });
        }
    });
}