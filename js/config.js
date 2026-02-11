// CONFIGURAÇÃO DO FIREBASE
export const firebaseConfig = {
    apiKey: "AIzaSyC4g1Vh3QrqgF4Z026YdfkPH6nNSBsMFj0",
    authDomain: "orcamento-96cae.firebaseapp.com",
    projectId: "orcamento-96cae",
    storageBucket: "orcamento-96cae.firebasestorage.app",
    messagingSenderId: "984778906391",
    appId: "1:984778906391:web:b217e948a54d76bfcab552",
    measurementId: "G-5CMJTBJRX2"
};

// CATEGORIAS PADRÃO E PALAVRAS-CHAVE
export const DEFAULT_RULES = {
    "Alimentação": ["IFOOD", "UBER EATS", "MERCADO", "ASSAI", "CARREFOUR", "RESTAURANTE", "PADARIA", "HORTIFRUTI", "SUPER", "ATACADAO", "LANCHE", "PIZZA", "BURGER", "AÇAI", "SORVETE", "BISTRÔ", "CHURRASCARIA", "MANA PAES", "BANCHAN", "PRIMEIRO", "CAFE", "COFFEE", "BEM MAIOR", "QUARTETTO", "COCO BAMBU", "AMERICAN PIZZA"],
    "Transporte": ["UBER", "99POP", "POSTO", "IPIRANGA", "SHELL", "GASOLINA", "PEDAGIO", "ESTACIONAMENTO", "AUTO POSTO", "DRIVE", "PARKING", "PROPARK"],
    "Serviços": ["NETFLIX", "SPOTIFY", "AMAZON", "CLARO", "VIVO", "TIM", "INTERNET", "GOOGLE", "APPLE", "YOUTUBE", "ASSINATURA", "MELIMAIS", "CONTA VIVO", "CRUNCHYROLL"],
    "Saúde": ["DROGARIA", "FARMACIA", "RAIA", "MEDICO", "EXAME", "CLINICA", "ODONTO", "PETLOVE", "PET", "NATURA", "ALVIM", "DROGASIL", "HOSPITAL", "FORMULAANIMAL", "RDSAUDE", "BELEZA NA WEB"],
    "Casa": ["LUZ", "ENEL", "AGUA", "CONDOMINIO", "ALUGUEL", "LEROY", "CASA", "FERRAMENTA", "TOKSTOK", "DMAIS", "SANEAGO", "ENERGISA"],
    "Educação": ["CURSO", "UDEMY", "ALURA", "ESCOLA", "FACULDADE", "LIVRARIA", "LIVRO", "LEITURA"],
    "Lazer": ["CINEMA", "INGRESSO", "GAME", "STEAM", "PLAYSTATION", "XBOX", "NINTENDO", "SHOPPING", "PASSEIO", "BAR", "SHOW"],
    "Viagens": ["HOTEL", "BOOKING", "AIRBNB", "PASSAGEM", "LATAM", "GOL", "AZUL", "CVC", "DECOLAR", "BUSER"],
    "Vestuário": ["RENNER", "C&A", "ZARA", "RIACHUELO", "CENTAURO", "NIKE", "ADIDAS", "ROUPA", "CALÇADO", "MODA", "SHEIN"]
};

// CORES DOS GRÁFICOS (Faltava isso!)
export const CHART_COLORS = [
    "#007AFF", // Azul iOS
    "#34C759", // Verde iOS
    "#FF9500", // Laranja iOS
    "#FF3B30", // Vermelho iOS
    "#AF52DE", // Roxo iOS
    "#5856D6", // Indigo iOS
    "#5AC8FA", // Azul Claro iOS
    "#FFCC00", // Amarelo iOS
    "#FF2D55", // Rosa iOS
    "#8E8E93"  // Cinza iOS
];

// CONFIGURAÇÃO DO TELEGRAM (Seus dados atualizados)
export const TELEGRAM_CONFIG = {
    botToken: "8331098260:AAFY8nhanHrOfpZLleedbMYUPqu4_YON4xI", 
    chatId: "153352662"
};