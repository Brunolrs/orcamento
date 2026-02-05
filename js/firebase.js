import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// AQUI ESTAVA O ERRO: onAuthStateChanged precisa estar nesta lista
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firebaseConfig, DEFAULT_RULES } from './config.js';
import { appState } from './state.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged };

export async function saveToFirebase() {
    if (!appState.user) return;
    const userDocRef = doc(db, "users", appState.user.uid);
    try {
        await updateDoc(userDocRef, { 
            transactions: appState.transactions, 
            incomeDetails: appState.incomeDetails, 
            categoryRules: appState.categoryRules,
            categoryColors: appState.categoryColors || {}
        });
    } catch (e) { console.error("Erro ao salvar:", e); }
}

export function startRealtimeListener(uid, renderCallback) {
    const userDocRef = doc(db, "users", uid);
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            appState.transactions = data.transactions || [];
            appState.incomeDetails = data.incomeDetails || {};
            appState.categoryColors = data.categoryColors || {};
            
            if (data.monthlyIncomes && Object.keys(appState.incomeDetails).length === 0) {
                Object.keys(data.monthlyIncomes).forEach(m => {
                    if (data.monthlyIncomes[m] > 0) appState.incomeDetails[m] = [{ id: Date.now(), desc: "Renda Principal", val: data.monthlyIncomes[m] }];
                });
            }

            if (data.categoryRules) appState.categoryRules = data.categoryRules;
            appState.categories = [...Object.keys(appState.categoryRules)];
            if(!appState.categories.includes("Outros")) appState.categories.push("Outros");

            if (!appState.isEditMode && renderCallback) renderCallback();
        } else {
            setDoc(userDocRef, { transactions: [], incomeDetails: {}, categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)), categoryColors: {} });
        }
    });
}