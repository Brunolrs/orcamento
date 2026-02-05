/**
 * SERVIÇOS DO FIREBASE
 * Responsável por conectar ao Google, Autenticação e Banco de Dados.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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

// Inicialização
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

// Exporta funções de auth para serem usadas no main.js
export { signInWithPopup, signOut, onAuthStateChanged };

// ============================================================================
// FUNÇÕES DE BANCO DE DADOS
// ============================================================================

/**
 * Salva o estado atual (transações, rendas, categorias, cores) no Firestore.
 */
export async function saveToFirebase() {
    if (!appState.user) return;
    const userDocRef = doc(db, "users", appState.user.uid);
    try {
        await updateDoc(userDocRef, { 
            transactions: appState.transactions, 
            incomeDetails: appState.incomeDetails, 
            categoryRules: appState.categoryRules,
            categoryColors: appState.categoryColors || {} // Salva cores personalizadas
        });
    } catch (e) { 
        console.error("Erro ao salvar no Firebase:", e); 
    }
}

/**
 * Escuta mudanças no banco de dados em tempo real.
 * @param {string} uid - ID do usuário logado
 * @param {function} renderCallback - Função para atualizar a tela (opcional)
 */
export function startRealtimeListener(uid, renderCallback) {
    const userDocRef = doc(db, "users", uid);
    
    onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Carrega dados para a memória
            appState.transactions = data.transactions || [];
            appState.incomeDetails = data.incomeDetails || {};
            appState.categoryColors = data.categoryColors || {}; // Carrega cores
            
            // Migração de dados antigos de renda (se existir)
            if (data.monthlyIncomes && Object.keys(appState.incomeDetails).length === 0) {
                Object.keys(data.monthlyIncomes).forEach(m => {
                    if (data.monthlyIncomes[m] > 0) {
                        appState.incomeDetails[m] = [{ id: Date.now(), desc: "Renda Principal", val: data.monthlyIncomes[m] }];
                    }
                });
            }

            // Carrega regras de categoria
            if (data.categoryRules) appState.categoryRules = data.categoryRules;
            
            // Atualiza lista de categorias disponíveis
            appState.categories = [...Object.keys(appState.categoryRules)];
            if(!appState.categories.includes("Outros")) appState.categories.push("Outros");

            // IMPORTANTE: Só redesenha a tela se NÃO estiver no modo de edição.
            // Isso evita que a tela pisque ou perca o foco enquanto você digita.
            if (!appState.isEditMode && renderCallback) {
                renderCallback();
            }
        } else {
            // Cria documento inicial para novos usuários
            setDoc(userDocRef, { 
                transactions: [], 
                incomeDetails: {}, 
                categoryRules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
                categoryColors: {}
            });
        }
    });
}