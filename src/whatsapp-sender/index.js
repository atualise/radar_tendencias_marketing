const AWS = require('aws-sdk');
const axios = require('axios');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Adicionar CloudWatch para métricas
const cloudWatch = new AWS.CloudWatch();

// Variáveis de ambiente
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0/';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

// Configurações para retry
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // 1 segundo

exports.handler = async (event) => {
    console.log('Evento recebido:', JSON.stringify(event));
    
    const startTime = new Date().getTime();
    let success = false;
    
    try {
        const { phoneNumber, message, metadata } = event;
        
        if (!phoneNumber || !message) {
            await publishMetric('MensagemInvalida', 1);
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'Parâmetros phoneNumber e message são obrigatórios'
                })
            };
        }
        
        // Normalizar número de telefone (remover formatação e garantir formato padrão)
        const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
        
        // Enviar mensagem via WhatsApp API (com retry)
        const result = await sendWhatsAppMessageWithRetry(normalizedPhoneNumber, message);
        
        // Atualizar status da interação
        if (metadata?.interactionId) {
            await updateInteractionStatus(
                metadata.interactionId,
                'sent',
                result.id
            );
        }
        
        success = true;
        await publishMetric('MensagensEnviadas', 1);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Mensagem enviada com sucesso',
                messageId: result.id,
                metadata
            })
        };
    } catch (error) {
        console.error('Erro ao enviar mensagem WhatsApp:', error.response?.data || error.message);
        
        // Atualizar status da interação como falha
        if (event.metadata?.interactionId) {
            await updateInteractionStatus(
                event.metadata.interactionId,
                'failed',
                null,
                error.message
            );
        }
        
        await publishMetric('MensagensFalhas', 1);
        
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Erro ao enviar mensagem',
                error: error.message,
                details: error.response?.data
            })
        };
    } finally {
        // Publicar métrica de latência
        const executionTime = new Date().getTime() - startTime;
        await publishMetric('LatenciaEnvioMensagem', executionTime);
        
        // Publicar métrica de taxa de sucesso
        await publishMetric('TaxaSucessoEnvio', success ? 1 : 0);
    }
};

// Função para publicar métricas no CloudWatch
async function publishMetric(metricName, value, unit = 'Count') {
    try {
        const params = {
            MetricData: [
                {
                    MetricName: metricName,
                    Dimensions: [
                        {
                            Name: 'Environment',
                            Value: process.env.Environment || 'dev'
                        },
                        {
                            Name: 'Service',
                            Value: 'WhatsAppSender'
                        }
                    ],
                    Unit: unit,
                    Value: value
                }
            ],
            Namespace: 'RadarTendencias/WhatsApp'
        };
        
        await cloudWatch.putMetricData(params).promise();
    } catch (error) {
        console.error(`Erro ao publicar métrica ${metricName}:`, error);
        // Não lançamos o erro aqui para não interromper o fluxo principal
    }
}

// Função para normalizar números de telefone
function normalizePhoneNumber(phoneNumber) {
    // Remover todos os caracteres não numéricos
    let normalized = phoneNumber.replace(/\D/g, '');
    
    // Garantir que começa com código do país (padronizar para Brasil se não tiver)
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

// Função para enviar mensagem via WhatsApp API
async function sendWhatsAppMessage(phoneNumber, text) {
    const url = `${WHATSAPP_API_URL}${WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    const data = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
            preview_url: true,
            body: text
        }
    };
    
    try {
        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`
            }
        });
        
        return {
            id: response.data.messages[0].id,
            status: 'sent'
        };
    } catch (error) {
        console.error('Erro na API do WhatsApp:', error.response?.data || error.message);
        throw new Error(`Falha ao enviar mensagem WhatsApp: ${error.message}`);
    }
}

// Função para atualizar o status da interação
async function updateInteractionStatus(interactionId, status, messageId = null, errorMessage = null) {
    const updateParams = {
        TableName: INTERACTIONS_TABLE,
        Key: { interactionId },
        UpdateExpression: 'set metrics.deliveryStatus = :status, metrics.updatedAt = :time',
        ExpressionAttributeValues: {
            ':status': status,
            ':time': new Date().toISOString()
        }
    };
    
    // Adicionar ID da mensagem se disponível
    if (messageId) {
        updateParams.UpdateExpression += ', metrics.messageId = :messageId';
        updateParams.ExpressionAttributeValues[':messageId'] = messageId;
    }
    
    // Adicionar mensagem de erro se disponível
    if (errorMessage) {
        updateParams.UpdateExpression += ', metrics.errorMessage = :errorMessage';
        updateParams.ExpressionAttributeValues[':errorMessage'] = errorMessage;
    }
    
    try {
        await dynamoDB.update(updateParams).promise();
        await publishMetric('AtualizacaoStatusInteracao', 1);
    } catch (error) {
        console.error('Erro ao atualizar status da interação:', error);
        await publishMetric('FalhaAtualizacaoStatus', 1);
        // Não lançamos erro aqui para não interromper o fluxo principal
    }
} 