/**
 * Script para criar e gerenciar templates do WhatsApp Business API
 * 
 * Este script cria os templates necessários para enviar mensagens iniciais
 * através do WhatsApp Business API, que não permite o envio direto de mensagens
 * sem que o usuário tenha iniciado a conversa ou sem o uso de templates.
 */

require('dotenv').config();
const axios = require('axios');

// Configurações do WhatsApp Business API
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0/';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

// Variáveis globais para armazenar configurações validadas
let VALID_MESSAGING_ENDPOINT = null;
let VALID_TEMPLATES_ENDPOINT = null;

// Função para validar os endpoints e configurações
async function validateWhatsAppConfig() {
    console.log('🔄 Validando configurações do WhatsApp API...');
    
    if (!WHATSAPP_API_TOKEN) {
        throw new Error('WHATSAPP_API_TOKEN não definido no arquivo .env');
    }
    
    if (!WHATSAPP_PHONE_NUMBER_ID && !WHATSAPP_BUSINESS_ACCOUNT_ID) {
        throw new Error('Nenhum ID configurado. Defina WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_BUSINESS_ACCOUNT_ID no arquivo .env');
    }
    
    // Tenta validar o endpoint usando PHONE_NUMBER_ID
    if (WHATSAPP_PHONE_NUMBER_ID) {
        try {
            // Verifica se consegue obter informações do número usando o PHONE_NUMBER_ID
            const phoneUrl = `${WHATSAPP_API_URL}${WHATSAPP_PHONE_NUMBER_ID}`;
            await axios.get(phoneUrl, {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
                }
            });
            console.log(`✅ PHONE_NUMBER_ID (${WHATSAPP_PHONE_NUMBER_ID}) validado com sucesso!`);
            
            // Verifica se o endpoint de templates está correto
            try {
                const templatesUrl = `${WHATSAPP_API_URL}${WHATSAPP_PHONE_NUMBER_ID}/message_templates`;
                await axios.get(templatesUrl, {
                    headers: {
                        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
                    }
                });
                console.log('✅ Endpoint de templates usando PHONE_NUMBER_ID validado com sucesso!');
                VALID_TEMPLATES_ENDPOINT = `${WHATSAPP_API_URL}${WHATSAPP_PHONE_NUMBER_ID}/message_templates`;
            } catch (templateError) {
                console.log('⚠️ Endpoint de templates com PHONE_NUMBER_ID não é válido.');
            }
        } catch (phoneError) {
            console.log(`⚠️ PHONE_NUMBER_ID (${WHATSAPP_PHONE_NUMBER_ID}) não validado: ${phoneError.response?.data?.error?.message || phoneError.message}`);
        }
    }
    
    // Tenta validar o endpoint usando BUSINESS_ACCOUNT_ID
    if (WHATSAPP_BUSINESS_ACCOUNT_ID) {
        try {
            // Verifica se consegue obter informações da conta usando o BUSINESS_ACCOUNT_ID
            const wabaUrl = `${WHATSAPP_API_URL}${WHATSAPP_BUSINESS_ACCOUNT_ID}`;
            await axios.get(wabaUrl, {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
                }
            });
            console.log(`✅ BUSINESS_ACCOUNT_ID (${WHATSAPP_BUSINESS_ACCOUNT_ID}) validado com sucesso!`);
            
            // Verifica se o endpoint de templates está correto
            try {
                const templatesUrl = `${WHATSAPP_API_URL}${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`;
                await axios.get(templatesUrl, {
                    headers: {
                        'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
                    }
                });
                console.log('✅ Endpoint de templates usando BUSINESS_ACCOUNT_ID validado com sucesso!');
                VALID_TEMPLATES_ENDPOINT = `${WHATSAPP_API_URL}${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`;
            } catch (templateError) {
                console.log('⚠️ Endpoint de templates com BUSINESS_ACCOUNT_ID não é válido.');
            }
        } catch (wabaError) {
            console.log(`⚠️ BUSINESS_ACCOUNT_ID (${WHATSAPP_BUSINESS_ACCOUNT_ID}) não validado: ${wabaError.response?.data?.error?.message || wabaError.message}`);
        }
    }
    
    if (!VALID_TEMPLATES_ENDPOINT) {
        throw new Error('Não foi possível encontrar um endpoint válido para templates. Verifique suas credenciais e IDs.');
    } else {
        console.log(`✅ Endpoint para templates validado: ${VALID_TEMPLATES_ENDPOINT}`);
        return true;
    }
}

// Templates a serem criados
const templates = [
    {
        name: 'boas_vindas_antena',
        language: 'pt_BR',
        category: 'MARKETING',
        components: [
            {
                type: 'HEADER',
                format: 'TEXT',
                text: 'Bem-vindo à Antena!'
            },
            {
                type: 'BODY',
                text: 'Olá {{1}}! 👋 Bem-vindo à Antena, sua fonte de tendências em Marketing Digital. Em breve iniciaremos nosso processo de personalização para melhorar sua experiência. Aguarde alguns instantes para nossa primeira mensagem.',
                parameters: [
                    {
                        type: 'text',
                        text: '{{1}}'
                    }
                ]
            },
            {
                type: 'FOOTER',
                text: 'Antena - captando tendências para você'
            }
        ]
    },
    {
        name: 'onboarding_inicio_antena',
        language: 'pt_BR',
        category: 'MARKETING',
        components: [
            {
                type: 'HEADER',
                format: 'TEXT',
                text: 'Hora de personalizar sua experiência'
            },
            {
                type: 'BODY',
                text: 'Olá novamente, {{1}}! 👋\n\nEstou muito feliz em ter você na *Antena*.\n\nVamos personalizar sua experiência com algumas perguntas rápidas.\n\n*Primeira pergunta:* Qual é o principal objetivo da sua estratégia de marketing digital atualmente?\n\na) Aumentar tráfego para o site\nb) Gerar mais leads qualificados\nc) Melhorar engajamento nas redes sociais\nd) Aumentar conversões e vendas\ne) Aperfeiçoar o branding e posicionamento\nf) Outro (descreva brevemente)',
                parameters: [
                    {
                        type: 'text',
                        text: '{{1}}'
                    }
                ]
            },
            {
                type: 'FOOTER',
                text: 'Antena - captando tendências para você'
            }
        ]
    },
    {
        name: 'finalizacao_onboarding_antena',
        language: 'pt_BR',
        category: 'MARKETING',
        components: [
            {
                type: 'HEADER',
                format: 'TEXT',
                text: 'Configuração concluída com sucesso!'
            },
            {
                type: 'BODY',
                text: '🎉 *Prontinho, {{1}}!*\n\nSeu perfil está configurado e começaremos a enviar conteúdos personalizados em breve.\n\n*Comandos que você pode usar:*\n\n📊 */tendencia [tópico]* - Receba tendências específicas\n🛠️ */ferramenta [tópico]* - Descubra ferramentas úteis\n📈 */case [tópico]* - Veja casos de sucesso\n❓ */ajuda* - Para mais informações\n\nEstamos muito felizes em tê-lo(a) conosco! Se tiver dúvidas, é só perguntar.',
                parameters: [
                    {
                        type: 'text',
                        text: '{{1}}'
                    }
                ]
            },
            {
                type: 'FOOTER',
                text: 'Antena - captando tendências para você'
            }
        ]
    }
];

// Função para validar e corrigir a estrutura do template conforme necessário
function validateAndFixTemplate(template) {
    const validatedTemplate = JSON.parse(JSON.stringify(template)); // Cria uma cópia profunda
    
    // Verifica e ajusta cada componente
    if (validatedTemplate.components && Array.isArray(validatedTemplate.components)) {
        validatedTemplate.components = validatedTemplate.components.map(component => {
            // Para componentes do tipo BODY, remover o campo parameters e adicionar example se necessário
            if (component.type === 'BODY') {
                const { parameters, ...componentWithoutParams } = component;
                
                // Se tinha parâmetros, criar a propriedade example com body_text para a API v21.0
                if (parameters && Array.isArray(parameters) && parameters.length > 0) {
                    // Extrair os valores de exemplo dos parâmetros e substituir marcadores {{n}} por valores de exemplo reais
                    const paramValues = parameters.map(param => {
                        // Substituir marcadores {{n}} por valores reais
                        const paramText = param.text;
                        const matches = paramText.match(/{{(\d+)}}/);
                        if (matches) {
                            // Se encontrou um marcador como {{1}}, substituir por um valor de exemplo
                            const paramIndex = parseInt(matches[1]);
                            switch (paramIndex) {
                                case 1: return "João";
                                case 2: return "123456";
                                case 3: return "Segunda-feira";
                                default: return `Exemplo ${paramIndex}`;
                            }
                        }
                        return paramText;
                    });
                    
                    // Adicionar exemplos no formato requerido pela API v21.0
                    componentWithoutParams.example = {
                        body_text: [paramValues]
                    };
                }
                
                return componentWithoutParams;
            }
            
            // Remove o campo parameters se estiver vazio
            if (component.parameters && Array.isArray(component.parameters) && component.parameters.length === 0) {
                const { parameters, ...componentWithoutEmptyParams } = component;
                return componentWithoutEmptyParams;
            }
            
            // Se é um HEADER, verifica se o formato é compatível com parameters
            if (component.type === 'HEADER') {
                // HEADER só pode ter parameters se format não for TEXT
                if (component.format === 'TEXT' && component.parameters) {
                    const { parameters, ...headerWithoutParams } = component;
                    
                    // Se tem parâmetros e é do tipo TEXT, adicionamos o example no formato correto
                    if (parameters && Array.isArray(parameters) && parameters.length > 0) {
                        const paramValues = parameters.map(param => {
                            // Substituir marcadores {{n}} por valores reais
                            const paramText = param.text;
                            const matches = paramText.match(/{{(\d+)}}/);
                            if (matches) {
                                // Se encontrou um marcador como {{1}}, substituir por um valor de exemplo
                                const paramIndex = parseInt(matches[1]);
                                switch (paramIndex) {
                                    case 1: return "João";
                                    case 2: return "123456";
                                    case 3: return "Segunda-feira";
                                    default: return `Exemplo ${paramIndex}`;
                                }
                            }
                            return paramText;
                        });
                        
                        headerWithoutParams.example = {
                            header_text: [paramValues[0]]  // Header só pode ter um parâmetro
                        };
                    }
                    
                    return headerWithoutParams;
                }
            }
            
            // Se é um FOOTER, nunca deve ter parameters segundo a documentação atual
            if (component.type === 'FOOTER' && component.parameters) {
                const { parameters, ...footerWithoutParams } = component;
                return footerWithoutParams;
            }
            
            return component;
        });
    }
    
    return validatedTemplate;
}

// Função para criar um template
async function createTemplate(template) {
    if (!VALID_TEMPLATES_ENDPOINT) {
        throw new Error('Endpoint para templates não validado. Execute validateWhatsAppConfig() primeiro.');
    }
    
    try {
        // Valida e corrige a estrutura do template antes de enviar
        const validatedTemplate = validateAndFixTemplate(template);
        
        // Log para debug
        console.log(`🔄 Estrutura do template ${template.name} ajustada para compatibilidade com a API.`);
        console.log(`📋 Estrutura original:`);
        console.log(JSON.stringify(template, null, 2));
        console.log(`📋 Estrutura corrigida enviada para a API:`);
        console.log(JSON.stringify(validatedTemplate, null, 2));
        
        const response = await axios.post(VALID_TEMPLATES_ENDPOINT, validatedTemplate, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
            }
        });
        
        console.log(`✅ Template ${template.name} criado com sucesso! ID: ${response.data.id}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Erro ao criar template ${template.name}:`, error.response?.data || error.message);
        if (error.response?.data?.error?.message) {
            console.log(`📋 Detalhes do erro: ${error.response.data.error.message}`);
        }
        throw error;
    }
}

// Função para listar templates existentes
async function listTemplates() {
    if (!VALID_TEMPLATES_ENDPOINT) {
        throw new Error('Endpoint para templates não validado. Execute validateWhatsAppConfig() primeiro.');
    }
    
    try {
        const response = await axios.get(VALID_TEMPLATES_ENDPOINT, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
            }
        });
        
        console.log('📋 Templates existentes:');
        if (response.data.data && response.data.data.length > 0) {
            response.data.data.forEach(template => {
                console.log(`- ${template.name} (Status: ${template.status})`);
            });
            return response.data.data;
        } else {
            console.log('Nenhum template encontrado.');
            return [];
        }
    } catch (error) {
        console.error('❌ Erro ao listar templates:', error.response?.data || error.message);
        throw error;
    }
}

// Função principal do script
async function main() {
    try {
        if (!WHATSAPP_API_TOKEN) {
            console.error('❌ Variável de ambiente WHATSAPP_API_TOKEN é obrigatória.');
            console.log('📝 Inclua essa variável no arquivo .env na raiz do projeto.');
            process.exit(1);
        }
        
        // Processa argumentos da linha de comando
        const args = process.argv.slice(2);
        const command = args[0] || 'all';
        const templateName = args[1];
        
        // Validar configurações antes de prosseguir
        await validateWhatsAppConfig();
        
        // Executar comando específico
        switch (command) {
            case 'list':
                await listTemplates();
                break;
                
            case 'create':
                if (!templateName) {
                    console.error('❌ Nome do template não especificado.');
                    console.log('📝 Uso: node scripts/whatsapp-templates.js create <nome_do_template>');
                    process.exit(1);
                }
                
                const templateToCreate = templates.find(t => t.name === templateName);
                if (!templateToCreate) {
                    console.error(`❌ Template "${templateName}" não encontrado na lista de templates disponíveis.`);
                    console.log('📝 Templates disponíveis:');
                    templates.forEach(t => console.log(`  - ${t.name}`));
                    process.exit(1);
                }
                
                try {
                    await createTemplate(templateToCreate);
                    console.log(`✅ Template ${templateName} criado com sucesso!`);
                } catch (error) {
                    console.error(`❌ Erro ao criar template ${templateName}:`, error.message);
                    if (error.response?.data?.error?.message) {
                        console.log(`📋 Detalhes do erro: ${error.response.data.error.message}`);
                        
                        // Mostrar mais informações para erros comuns
                        if (error.response.data.error.message.includes('Unexpected key')) {
                            console.log(`\n🔍 Analisando estrutura do template para identificar o problema...`);
                            const problemComponent = templateToCreate.components.findIndex(c => 
                                (c.type === 'HEADER' && c.parameters) || 
                                (c.type === 'FOOTER' && c.parameters)
                            );
                            
                            if (problemComponent >= 0) {
                                console.log(`⚠️ Possível problema identificado no componente ${problemComponent} (${templateToCreate.components[problemComponent].type})`);
                                console.log(`⚠️ Esta seção contém o campo "parameters" que pode não ser permitido para este tipo de componente.`);
                            }
                            
                            // Mostrar estrutura corrigida
                            const fixed = validateAndFixTemplate(templateToCreate);
                            console.log(`\n✅ Estrutura corrigida que será enviada para a API:`);
                            console.log(JSON.stringify(fixed, null, 2));
                        }
                    }
                    process.exit(1);
                }
                break;
                
            case 'debug':
                console.log(`🔍 Modo de depuração ativado`);
                console.log(`\n📋 Configurações atuais:`);
                console.log(`- WHATSAPP_API_URL: ${WHATSAPP_API_URL}`);
                console.log(`- WHATSAPP_PHONE_NUMBER_ID: ${WHATSAPP_PHONE_NUMBER_ID}`);
                console.log(`- WHATSAPP_BUSINESS_ACCOUNT_ID: ${WHATSAPP_BUSINESS_ACCOUNT_ID}`);
                console.log(`- VALID_TEMPLATES_ENDPOINT: ${VALID_TEMPLATES_ENDPOINT}`);
                
                if (templateName) {
                    const templateToDebug = templates.find(t => t.name === templateName);
                    if (templateToDebug) {
                        console.log(`\n📋 Estrutura original do template ${templateName}:`);
                        console.log(JSON.stringify(templateToDebug, null, 2));
                        
                        const fixed = validateAndFixTemplate(templateToDebug);
                        console.log(`\n📋 Estrutura corrigida do template ${templateName}:`);
                        console.log(JSON.stringify(fixed, null, 2));
                    } else {
                        console.log(`\n❌ Template "${templateName}" não encontrado na lista de templates disponíveis.`);
                    }
                }
                break;
                
            case 'all':
            default:
                console.log('🔄 Verificando templates existentes...');
                let existingTemplates = [];
                try {
                    existingTemplates = await listTemplates();
                } catch (error) {
                    console.log('⚠️ Não foi possível listar templates existentes. Continuando com a criação...');
                }
                
                let successCount = 0;
                let failureCount = 0;
                
                for (const template of templates) {
                    const exists = existingTemplates.some(t => t.name === template.name);
                    
                    if (exists) {
                        console.log(`ℹ️ Template ${template.name} já existe. Pulando...`);
                        successCount++;
                    } else {
                        console.log(`🔄 Criando template ${template.name}...`);
                        try {
                            await createTemplate(template);
                            successCount++;
                        } catch (error) {
                            console.log(`⚠️ Falha ao criar template ${template.name}. Continuando com os próximos...`);
                            failureCount++;
                        }
                    }
                }
                
                console.log(`\n📊 Resumo da operação:`);
                console.log(`- Templates bem-sucedidos: ${successCount}`);
                console.log(`- Templates com falha: ${failureCount}`);
                
                if (failureCount > 0) {
                    console.log(`\n⚠️ Alguns templates não foram criados. Para entender melhor os erros, execute:`);
                    console.log(`node scripts/whatsapp-templates.js debug <nome_do_template>`);
                }
                
                console.log('\n✅ Operação concluída com sucesso!');
                break;
        }
    } catch (error) {
        console.error('❌ Erro ao executar o script:', error.message);
        process.exit(1);
    }
}

// Executar o script
main(); 