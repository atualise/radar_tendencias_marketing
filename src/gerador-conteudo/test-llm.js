// Script para testar a nova ordem de LLMs no gerador-conteudo
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Importar apenas a função generateContent do index.js
const { generateContent } = require('./index');

// Função principal de teste
async function testLLMOrder() {
    console.log('Testando a nova ordem de uso dos LLMs (Claude -> DeepSeek)');
    
    const prompt = `
    Por favor, forneça uma breve descrição (1-2 parágrafos) sobre as tendências 
    atuais em marketing de conteúdo para e-commerce em 2024.
    `;
    
    try {
        console.log('Enviando prompt para geração de conteúdo...');
        const result = await generateContent(prompt);
        console.log('\n--- Resultado da geração ---');
        console.log(result);
        console.log('\n--- Fim do resultado ---');
    } catch (error) {
        console.error('Erro ao testar a geração de conteúdo:', error.message);
    }
}

// Executar o teste
testLLMOrder().then(() => {
    console.log('Teste concluído');
}).catch(error => {
    console.error('Erro no teste:', error);
}); 