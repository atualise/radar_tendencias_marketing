const AWS = require('aws-sdk');
const axios = require('axios');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const ssm = new AWS.SSM();
const https = require('https');
const { URL } = require('url');

// Adicionar CloudWatch para métricas
const cloudWatch = new AWS.CloudWatch();

// Variáveis de ambiente
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_API_URL = (process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/+$/, '');
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN_MANAGER_LAMBDA = process.env.TOKEN_MANAGER_LAMBDA || 'antena-app-WhatsAppTokenManager-dev';
const TOKEN_PARAMETER_NAME = process.env.TOKEN_PARAMETER_NAME || '/whatsapp/token';
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

// Configurações para retry
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // 1 segundo

// Variável para armazenar o token em memória
let cachedToken = null;
let tokenExpiresAt = null;

exports.handler = async (event) => {
    console.log('Evento recebido:', JSON.stringify(event));
    
    const startTime = new Date().getTime();
    let success = false;
    
    try {
        const { phoneNumber, message, metadata, template } = event;
        
        if (!phoneNumber || (!message && !template)) {
            await publishMetric('MensagemInvalida', 1);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Parâmetros phoneNumber e message/template são obrigatórios'
                })
            };
        }
        
        // Normalizar número de telefone (remover formatação e garantir formato padrão)
        const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
        
        // Enviar mensagem via WhatsApp API (com retry)
        let result;
        
        if (template) {
            // Enviar mensagem usando template
            result = await sendWhatsAppTemplateWithRetry(normalizedPhoneNumber, template);
            await publishMetric('TemplatesEnviados', 1);
        } else {
            // Enviar mensagem de texto normal
            result = await sendWhatsAppMessageWithRetry(normalizedPhoneNumber, message);
            await publishMetric('TextosEnviados', 1);
        }
        
        // Atualizar status da interação se houver ID
        if (metadata && metadata.interactionId) {
            try {
                await updateInteractionStatus(
                    metadata.interactionId, 
                    'delivered',
                    result.id
                );
            } catch (updateError) {
                console.error('Erro ao atualizar status da interação:', updateError);
                // Não falhar a função por causa desse erro
            }
        }
        
        // Métricas adicionais
        const endTime = new Date().getTime();
        const timeElapsed = endTime - startTime;
        
        await publishMetric('MensagensEnviadas', 1);
        await publishMetric('LatenciaEnvioMensagem', timeElapsed, 'Milliseconds');
        await publishMetric('TaxaSucessoEnvio', 1);
        
        success = true;
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Mensagem enviada com sucesso',
                messageId: result.id,
                status: result.status
            })
        };
    } catch (error) {
        console.error('Erro ao processar envio de mensagem:', error);
        
        // Publicar métrica de erro
        await publishMetric('ErrosEnvioMensagem', 1);
        
        if (success === false) {
            await publishMetric('TaxaSucessoEnvio', 0);
        }
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Erro ao enviar mensagem',
                error: error.message,
                details: error.response?.data || 'Sem detalhes adicionais'
            })
        };
    }
};

// Função para publicar métrica
async function publishMetric(metricName, value, unit = 'Count') {
    try {
        await cloudWatch.putMetricData({
            Namespace: 'Antena/WhatsApp',
            MetricData: [
                {
                    MetricName: metricName,
                    Value: value,
                    Unit: unit,
                    Dimensions: [
                        {
                            Name: 'Environment',
                            Value: process.env.ENVIRONMENT || 'prod'
                        }
                    ],
                    Timestamp: new Date()
                }
            ]
        }).promise();
    } catch (error) {
        console.error(`Erro ao publicar métrica ${metricName}:`, error);
        // Não propagar o erro para evitar falhas no processo principal
    }
}

// Função para normalizar número de telefone
function normalizePhoneNumber(phoneNumber) {
    // Remover caracteres não-numéricos
    let normalized = phoneNumber.replace(/\D/g, '');
    
    // Garantir que tenha o código do país
    if (normalized.length < 10) {
        throw new Error('Número de telefone inválido: muito curto');
    }
    
    // Se não começar com código de país, adicionar
    if (!normalized.startsWith('55') && normalized.length === 11) {
        normalized = '55' + normalized;
    }
    
    return normalized;
}

// Função com retry para enviar mensagem via WhatsApp API
async function sendWhatsAppMessageWithRetry(phoneNumber, text, retryCount = 0) {
    try {
        return await sendWhatsAppMessage(phoneNumber, text);
    } catch (error) {
        // Verificar se o erro é de token expirado
        if (isTokenExpiredError(error) && cachedToken) {
            console.log('Token expirado detectado. Limpando cache e tentando novamente.');
            cachedToken = null; // Forçar atualização do token
            // Tentar novamente com novo token
            return await sendWhatsAppMessage(phoneNumber, text);
        }
        
        // Verificar se devemos tentar novamente
        if (retryCount < MAX_RETRIES) {
            console.log(`Tentativa ${retryCount + 1} falhou. Tentando novamente em ${RETRY_DELAY_MS}ms...`);
            
            // Aguardar antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
            
            // Publicar métrica de retry
            await publishMetric('MensagensRetry', 1);
            
            // Tentar novamente com contador incrementado
            return sendWhatsAppMessageWithRetry(phoneNumber, text, retryCount + 1);
        }
        
        // Se chegou aqui, todas as tentativas falharam
        await publishMetric('MensagensRetryEsgotado', 1);
        throw error;
    }
}

// Função com retry para enviar template via WhatsApp API
async function sendWhatsAppTemplateWithRetry(phoneNumber, template, retryCount = 0) {
    try {
        return await sendWhatsAppTemplate(phoneNumber, template);
    } catch (error) {
        // Verificar se o erro é de token expirado
        if (isTokenExpiredError(error) && cachedToken) {
            console.log('Token expirado detectado. Limpando cache e tentando novamente.');
            cachedToken = null; // Forçar atualização do token
            // Tentar novamente com novo token
            return await sendWhatsAppTemplate(phoneNumber, template);
        }
        
        // Verificar se devemos tentar novamente
        if (retryCount < MAX_RETRIES) {
            console.log(`Tentativa ${retryCount + 1} falhou. Tentando novamente em ${RETRY_DELAY_MS}ms...`);
            
            // Aguardar antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
            
            // Publicar métrica de retry
            await publishMetric('TemplatesRetry', 1);
            
            // Tentar novamente com contador incrementado
            return sendWhatsAppTemplateWithRetry(phoneNumber, template, retryCount + 1);
        }
        
        // Se chegou aqui, todas as tentativas falharam
        await publishMetric('TemplatesRetryEsgotado', 1);
        throw error;
    }
}

// Função auxiliar para construir URLs da API do WhatsApp
function buildWhatsAppApiUrl(endpoint) {
    return `${WHATSAPP_API_URL}/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/${endpoint}`;
}

/**
 * Obter token atual do WhatsApp
 */
async function getWhatsAppToken() {
    try {
        // Usar token em cache se ainda for válido
        if (cachedToken && tokenExpiresAt) {
            const now = new Date();
            const expirationDate = new Date(tokenExpiresAt);
            
            // Se o token expirar em mais de 24 horas, usar o cache
            if (expirationDate > now && (expirationDate - now) > 24 * 60 * 60 * 1000) {
                return cachedToken;
            }
        }
        
        // Tentar obter o token do serviço de gerenciamento de token primeiro
        try {
            console.log(`Invocando função de gerenciamento de token: ${TOKEN_MANAGER_LAMBDA}`);
            
            const response = await lambda.invoke({
                FunctionName: TOKEN_MANAGER_LAMBDA,
                Payload: JSON.stringify({ action: 'getToken' })
            }).promise();
            
            const result = JSON.parse(response.Payload);
            
            if (result.statusCode === 200) {
                const tokenData = JSON.parse(result.body);
                
                if (tokenData.expiration) {
                    console.log(`Token obtido do gerenciador com validade até ${tokenData.expiration}`);
                    tokenExpiresAt = tokenData.expiration;
                    
                    // Obter o token completo do SSM Parameter Store
                    const paramResponse = await ssm.getParameter({
                        Name: TOKEN_PARAMETER_NAME,
                        WithDecryption: true
                    }).promise();
                    
                    if (paramResponse.Parameter && paramResponse.Parameter.Value) {
                        cachedToken = paramResponse.Parameter.Value;
                        return cachedToken;
                    }
                }
            } else {
                console.warn('O gerenciador de token retornou um erro:', result);
            }
        } catch (tokenManagerError) {
            console.warn('Erro ao acessar o gerenciador de token:', tokenManagerError);
            // Continuar para os métodos alternativos
        }
        
        // Método alternativo: obter do ambiente
        if (process.env.WHATSAPP_API_TOKEN) {
            console.log('Usando token do ambiente como fallback');
            cachedToken = process.env.WHATSAPP_API_TOKEN;
            return cachedToken;
        }
        
        throw new Error('Não foi possível obter um token válido para o WhatsApp API');
    } catch (error) {
        console.error('Erro ao obter token do WhatsApp:', error);
        throw error;
    }
}

/**
 * Envia mensagem para o WhatsApp
 */
async function sendWhatsAppMessage(to, message) {
    try {
        const token = await getWhatsAppToken();
        
        if (!token) {
            throw new Error('Token do WhatsApp não disponível');
        }
        
        if (!WHATSAPP_PHONE_NUMBER_ID) {
            throw new Error('ID do número de telefone do WhatsApp não configurado');
        }
        
        const url = new URL(buildWhatsAppApiUrl('messages'));
        
        // Preparar mensagem conforme o tipo
        let messageData;
        
        if (typeof message === 'string') {
            // Mensagem de texto simples
            messageData = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: {
                    preview_url: true,
                    body: message
                }
            };
        } else if (message.type === 'template') {
            // Mensagem com template
            messageData = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'template',
                template: message.template
            };
        } else {
            // Outros tipos de mensagem
            messageData = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                ...message
            };
        }
        
        console.log(`Enviando mensagem para ${to}:`, JSON.stringify(messageData));
        
        // Usar a função auxiliar para fazer a requisição HTTP
        const response = await makeWhatsAppApiRequest(url, messageData, token);
        
        console.log('Resposta da API do WhatsApp:', JSON.stringify(response.body));
        
        return {
            id: response.body.messages[0].id,
            status: 'sent'
        };
    } catch (error) {
        console.error('Erro ao enviar mensagem para o WhatsApp:', error);
        throw error;
    }
}

// Função para enviar template via WhatsApp API
async function sendWhatsAppTemplate(phoneNumber, template) {
    try {
        // Obter token válido
        const token = await getWhatsAppToken();
        
        const url = new URL(buildWhatsAppApiUrl('messages'));
        
        // Verificar se o template contém componentes ou se é apenas o nome do template
        let messageData;
        
        if (typeof template === 'string') {
            // Se for apenas o nome do template, sem parâmetros
            messageData = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'template',
                template: {
                    name: template,
                    language: {
                        code: 'pt_BR'
                    }
                }
            };
        } else {
            // Se for um objeto completo com componentes
            messageData = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'template',
                template: template
            };
        }
        
        console.log(`Enviando template para ${phoneNumber}:`, JSON.stringify(messageData));
        
        // Usar a função auxiliar para fazer a requisição HTTP
        const response = await makeWhatsAppApiRequest(url, messageData, token);
        
        console.log('Resposta da API do WhatsApp:', JSON.stringify(response.body));
        
        return {
            id: response.body.messages[0].id,
            status: 'sent'
        };
    } catch (error) {
        console.error('Erro ao enviar template para o WhatsApp:', error);
        throw error;
    }
}

// Função para atualizar o status da interação
async function updateInteractionStatus(interactionId, status, messageId = null, errorMessage = null) {
    const updateParams = {
        TableName: INTERACTIONS_TABLE,
        Key: { interactionId },
        UpdateExpression: 'set #metrics.deliveryStatus = :status, #metrics.updatedAt = :time',
        ExpressionAttributeValues: {
            ':status': status,
            ':time': new Date().toISOString()
        },
        ExpressionAttributeNames: {
            '#metrics': 'metrics'
        }
    };
    
    // Adicionar ID da mensagem se disponível
    if (messageId) {
        updateParams.UpdateExpression += ', #metrics.messageId = :messageId';
        updateParams.ExpressionAttributeValues[':messageId'] = messageId;
    }
    
    // Adicionar mensagem de erro se disponível
    if (errorMessage) {
        updateParams.UpdateExpression += ', #metrics.errorMessage = :errorMessage';
        updateParams.ExpressionAttributeValues[':errorMessage'] = errorMessage;
    }
    
    try {
        await dynamoDB.update(updateParams).promise();
        await publishMetric('AtualizacaoStatusInteracao', 1);
        return true;
    } catch (error) {
        console.error('Erro ao atualizar status da interação:', error);
        await publishMetric('ErrosAtualizacaoStatusInteracao', 1);
        throw error;
    }
}

/**
 * Verifica se um erro é causado por token expirado
 */
function isTokenExpiredError(error) {
    // Verificar resposta da API do WhatsApp/Facebook para identificar erros de token
    if (error.response?.data?.error) {
        const fbError = error.response.data.error;
        
        // Verificar códigos comuns de erro de token expirado
        if (
            (fbError.code === 190) || // Token inválido ou expirado
            (fbError.message && fbError.message.includes('token')) || // Mensagem contém "token"
            (fbError.type === 'OAuthException') // Erro de autenticação OAuth
        ) {
            return true;
        }
    }
    
    return false;
}

// Função auxiliar para fazer requisições HTTP à API do WhatsApp
async function makeWhatsAppApiRequest(url, data, token) {
    const requestOptions = {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    
    return new Promise((resolve, reject) => {
        const req = https.request(requestOptions, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const jsonResponse = JSON.parse(responseData);
                        resolve({ statusCode: res.statusCode, body: jsonResponse });
                    } catch (error) {
                        resolve({ statusCode: res.statusCode, body: responseData });
                    }
                } else {
                    reject(new Error(`Erro na API do WhatsApp: ${res.statusCode} - ${responseData}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.write(JSON.stringify(data));
        req.end();
    });
} 