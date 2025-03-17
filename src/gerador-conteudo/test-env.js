// Script para testar a leitura das variáveis de ambiente
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Variáveis de ambiente que o index.js está tentando ler
const envVars = [
    'USERS_TABLE',
    'INTERACTIONS_TABLE',
    'CONTENTS_TABLE',
    'WHATSAPP_SENDER_FUNCTION',
    'CLAUDE_API_KEY',
    'CLAUDE_API_URL',
    'DEEPSEEK_API_URL',
    'USE_CLAUDE_FALLBACK',
    'CLAUDE_MODEL'
];

console.log('Verificando variáveis de ambiente:');
console.log('=================================');

envVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`${varName}: ${value ? 'DEFINIDA' : 'NÃO DEFINIDA'}`);
    
    // Mostra o início da string para confirmar que o valor está sendo lido corretamente
    // sem expor totalmente valores sensíveis
    if (value) {
        const previewValue = value.length > 10 ? `${value.substring(0, 10)}...` : value;
        console.log(`    Valor: ${previewValue}`);
    }
}); 