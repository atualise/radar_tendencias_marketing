const AWS = require('aws-sdk');
const axios = require('axios');
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const lambda = new AWS.Lambda();
const { v4: uuidv4 } = require('uuid');

// Variáveis de ambiente
const USERS_TABLE = process.env.USERS_TABLE;
const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE;
const CONTENTS_TABLE = process.env.CONTENTS_TABLE;
const WHATSAPP_SENDER_LAMBDA = process.env.WHATSAPP_SENDER_FUNCTION;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/messages';

// Modelo Claude padrão
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229';

exports.handler = async (event) => {
    console.log('Evento recebido:', JSON.stringify(event));
    
    // Processa cada registro da fila SQS
    const processResults = await Promise.all(
        event.Records.map(async (record) => {
            try {
                const body = JSON.parse(record.body);
                console.log('Processando solicitação de conteúdo:', body);
                
                // Roteamento baseado no tipo de conteúdo
                switch (body.type) {
                    case 'tool_recommendation':
                        return await generateToolRecommendation(body);
                    
                    case 'case_study':
                        return await generateCaseStudy(body);
                    
                    case 'trend_report':
                        return await generateTrendReport(body);
                    
                    case 'user_query':
                        return await generateUserResponse(body);
                    
                    default:
                        console.error(`Tipo de conteúdo desconhecido: ${body.type}`);
                        return {
                            status: 'error',
                            message: 'Tipo de conteúdo desconhecido'
                        };
                }
            } catch (error) {
                console.error('Erro ao processar solicitação:', error);
                const errorMessage = error.response?.data?.error?.message || error.message || 'Erro desconhecido';
                
                // Se houver informações do usuário e interação, envia mensagem de erro
                if (body?.userId && body?.interactionId) {
                    try {
                        const user = await getUser(body.userId);
                        
                        if (user) {
                            const errorInteractionId = await createOutputInteraction(
                                body.userId,
                                `Erro ao gerar conteúdo: ${errorMessage}`,
                                'error_message',
                                body.interactionId
                            );
                            
                            await sendWhatsAppMessage(
                                user.phoneNumber,
                                'Desculpe, encontrei um problema ao processar sua solicitação. Por favor, tente novamente mais tarde.',
                                { interactionId: errorInteractionId, userId: body.userId }
                            );
                        }
                    } catch (innerError) {
                        console.error('Erro ao enviar mensagem de erro ao usuário:', innerError);
                    }
                }
                
                return {
                    status: 'error',
                    error: errorMessage,
                    record: record.body
                };
            }
        })
    );
    
    return {
        statusCode: 200,
        body: JSON.stringify({
            results: processResults
        })
    };
};

// Funções de geração de conteúdo específico

// Gerador de recomendações de ferramentas
async function generateToolRecommendation(data) {
    const { userId, interactionId, topic, userProfile } = data;
    
    const user = await getUser(userId);
    if (!user) {
        throw new Error(`Usuário ${userId} não encontrado`);
    }
    
    // Estruturar a mensagem para a Claude API
    const prompt = `
Você é o assistente especializado do "Radar de Tendências em Marketing Digital", um serviço de inteligência para profissionais de marketing.

O usuário solicitou recomendações de ferramentas relacionadas a "${topic}".

Contexto do usuário:
- Nome: ${user.name}
- Cargo/Função: ${userProfile?.role || 'Profissional de marketing'}
- Objetivo principal: ${userProfile?.objective || 'Melhorar estratégias de marketing digital'}
- Ferramentas já utilizadas: ${userProfile?.toolsUsed ? userProfile.toolsUsed.join(', ') : 'Não informado'}
- Desafios atuais: ${userProfile?.challenges ? userProfile.challenges.join(', ') : 'Não informado'}

Forneça uma lista de 3-5 ferramentas relevantes para "${topic}" com:
1. Nome da ferramenta
2. Breve descrição (1-2 frases)
3. Principal benefício para o usuário
4. Diferencial competitivo

Formato da resposta:
- Use linguagem amigável mas profissional
- Estruture as recomendações em tópicos bem organizados
- Inclua emojis relevantes para melhorar a legibilidade
- Adapte as recomendações com base no perfil e desafios do usuário
- Se possível, mencione preços ou categorias de preço (gratuito, freemium, pago)
- Termine com uma pergunta para estimular o engajamento

Obs: Se alguma das ferramentas já for utilizada pelo usuário (conforme lista), substitua por outra.
`;

    // Chamar a Claude API
    const claudeResponse = await callClaudeAPI(prompt);
    
    // Armazenar o conteúdo gerado no DynamoDB
    const contentId = await storeGeneratedContent(
        userId,
        'tool_recommendation',
        topic,
        claudeResponse,
        interactionId
    );
    
    // Enviar a resposta para o usuário via WhatsApp
    await sendResponseToUser(
        user.phoneNumber,
        claudeResponse,
        userId,
        interactionId,
        contentId
    );
    
    return {
        status: 'completed',
        contentId,
        topic
    };
}

// Gerador de estudos de caso
async function generateCaseStudy(data) {
    const { userId, interactionId, topic, userProfile } = data;
    
    const user = await getUser(userId);
    if (!user) {
        throw new Error(`Usuário ${userId} não encontrado`);
    }
    
    // Estruturar a mensagem para a Claude API
    const prompt = `
Você é o assistente especializado do "Radar de Tendências em Marketing Digital", um serviço de inteligência para profissionais de marketing.

O usuário solicitou um caso de sucesso/estudo de caso relacionado a "${topic}".

Contexto do usuário:
- Nome: ${user.name}
- Cargo/Função: ${userProfile?.role || 'Profissional de marketing'}
- Objetivo principal: ${userProfile?.objective || 'Melhorar estratégias de marketing digital'}
- Interesses: ${userProfile?.interests ? userProfile.interests.join(', ') : 'Marketing digital em geral'}

Gere um estudo de caso relevante sobre "${topic}" com:
1. Nome da empresa ou campanha
2. Desafio inicial enfrentado
3. Estratégia implementada
4. Resultados obtidos (com números quando possível)
5. Lições aprendidas e dicas aplicáveis

Formato da resposta:
- Use linguagem envolvente e profissional
- Estruture o estudo de caso em seções bem organizadas
- Inclua emojis relevantes para melhorar a legibilidade
- Adapte o caso às necessidades do perfil do usuário
- Enfatize os resultados mensuráveis e o ROI
- Termine com uma pergunta sobre como o usuário poderia aplicar algo similar

Obs: Se possível, cite um caso real e recente. Se não tiver um caso específico em mente, crie um realista baseado em tendências atuais, mas não invente estatísticas ou dados falsos - nesse caso, use estimativas conservadoras e mencione que são aproximações.
`;

    // Chamar a Claude API
    const claudeResponse = await callClaudeAPI(prompt);
    
    // Armazenar o conteúdo gerado no DynamoDB
    const contentId = await storeGeneratedContent(
        userId,
        'case_study',
        topic,
        claudeResponse,
        interactionId
    );
    
    // Enviar a resposta para o usuário via WhatsApp
    await sendResponseToUser(
        user.phoneNumber,
        claudeResponse,
        userId,
        interactionId,
        contentId
    );
    
    return {
        status: 'completed',
        contentId,
        topic
    };
}

// Gerador de relatórios de tendências
async function generateTrendReport(data) {
    const { userId, interactionId, topic, userProfile } = data;
    
    const user = await getUser(userId);
    if (!user) {
        throw new Error(`Usuário ${userId} não encontrado`);
    }
    
    // Estruturar a mensagem para a Claude API
    const prompt = `
Você é o assistente especializado do "Radar de Tendências em Marketing Digital", um serviço de inteligência para profissionais de marketing.

O usuário solicitou informações sobre tendências relacionadas a "${topic}".

Contexto do usuário:
- Nome: ${user.name}
- Cargo/Função: ${userProfile?.role || 'Profissional de marketing'}
- Objetivo principal: ${userProfile?.objective || 'Melhorar estratégias de marketing digital'}
- Interesses: ${userProfile?.interests ? userProfile.interests.join(', ') : 'Marketing digital em geral'}

Gere um mini-relatório sobre tendências atuais em "${topic}" com:
1. 3-4 tendências emergentes específicas e relevantes
2. Por que cada tendência está ganhando força agora
3. Como cada tendência pode impactar a estratégia de marketing
4. Exemplos de marcas ou empresas aplicando essas tendências
5. Dicas práticas para implementação

Formato da resposta:
- Use linguagem envolvente, profissional e baseada em insights
- Estruture as tendências em tópicos bem organizados
- Inclua emojis relevantes para melhorar a legibilidade
- Adapte o relatório ao perfil do usuário
- Enfatize oportunidades práticas de aplicação
- Termine com uma pergunta sobre qual tendência mais despertou o interesse

Obs: Foque em tendências atuais e emergentes (último ano), não em práticas já estabelecidas. Se não tiver certeza sobre datas específicas, use linguagem mais genérica como "tendências emergentes" ou "tendências recentes".
`;

    // Chamar a Claude API
    const claudeResponse = await callClaudeAPI(prompt);
    
    // Armazenar o conteúdo gerado no DynamoDB
    const contentId = await storeGeneratedContent(
        userId,
        'trend_report',
        topic,
        claudeResponse,
        interactionId
    );
    
    // Enviar a resposta para o usuário via WhatsApp
    await sendResponseToUser(
        user.phoneNumber,
        claudeResponse,
        userId,
        interactionId,
        contentId
    );
    
    return {
        status: 'completed',
        contentId,
        topic
    };
}

// Gerador de respostas para perguntas gerais
async function generateUserResponse(data) {
    const { userId, interactionId, content, context } = data;
    
    const user = await getUser(userId);
    if (!user) {
        throw new Error(`Usuário ${userId} não encontrado`);
    }
    
    // Obter histórico recente das interações (últimas 5)
    const recentInteractions = await getRecentInteractions(userId, 5);
    
    // Estruturar o histórico da conversa
    const conversationHistory = recentInteractions.map(interaction => {
        if (interaction.direction === 'incoming') {
            return `Usuário: ${interaction.content}`;
        } else {
            return `Assistente: ${interaction.content}`;
        }
    }).join('\n\n');
    
    // Estruturar a mensagem para a Claude API
    const prompt = `
Você é o assistente especializado do "Radar de Tendências em Marketing Digital", um serviço de inteligência para profissionais de marketing.

O usuário está fazendo a seguinte pergunta ou comentário: "${content}"

Contexto do usuário:
- Nome: ${user.name}
- Cargo/Função: ${user.profile?.role || 'Profissional de marketing'}
- Objetivo principal: ${user.profile?.objective || 'Melhorar estratégias de marketing digital'}
- Interesses: ${user.preferences?.interests ? user.preferences.interests.map(i => i.category).join(', ') : 'Marketing digital em geral'}

Histórico recente da conversa:
${conversationHistory}

Responda à pergunta do usuário levando em consideração:
1. O contexto do usuário e seus interesses
2. O histórico recente da conversa para manter a continuidade
3. Informações precisas e atualizadas sobre marketing digital
4. Insights práticos e acionáveis sempre que possível

Formato da resposta:
- Use linguagem amigável, profissional e conversacional
- Use parágrafos curtos e bem estruturados
- Inclua emojis relevantes com moderação para melhorar a legibilidade
- Seja conciso porém completo (ideal entre 150-300 palavras)
- Adapte o tom para ser útil e informativo

Quando apropriado, lembre ao usuário que ele pode usar comandos específicos:
- /tendencia [tópico] para relatórios de tendências
- /ferramenta [tópico] para recomendações de ferramentas
- /case [tópico] para estudos de caso

Não mencione esses comandos se não forem relevantes para a conversa atual.
`;

    // Chamar a Claude API
    const claudeResponse = await callClaudeAPI(prompt);
    
    // Armazenar o conteúdo gerado no DynamoDB
    const contentId = await storeGeneratedContent(
        userId,
        'user_response',
        content.substring(0, 50),
        claudeResponse,
        interactionId
    );
    
    // Enviar a resposta para o usuário via WhatsApp
    await sendResponseToUser(
        user.phoneNumber,
        claudeResponse,
        userId,
        interactionId,
        contentId
    );
    
    return {
        status: 'completed',
        contentId
    };
}

// Funções auxiliares

// Chama a API Claude para gerar texto
async function callClaudeAPI(prompt) {
    try {
        const response = await axios.post(
            CLAUDE_API_URL,
            {
                model: CLAUDE_MODEL,
                max_tokens: 1500,
                messages: [
                    { role: 'user', content: prompt }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CLAUDE_API_KEY,
                    'anthropic-version': '2023-06-01'
                }
            }
        );
        
        // Extrair a resposta da Claude
        return response.data.content[0].text;
    } catch (error) {
        console.error('Erro ao chamar a API Claude:', error.response?.data || error.message);
        throw new Error(`Falha ao gerar conteúdo: ${error.message}`);
    }
}

// Armazena o conteúdo gerado no DynamoDB
async function storeGeneratedContent(userId, contentType, topic, content, interactionId) {
    const contentId = `cnt${uuidv4().replace(/-/g, '')}`;
    
    const contentItem = {
        contentId,
        userId,
        timestamp: new Date().toISOString(),
        contentType,
        topic,
        content,
        interactionId,
        metadata: {
            model: CLAUDE_MODEL,
            source: 'claude_api',
            length: content.length
        }
    };
    
    await dynamoDB.put({
        TableName: CONTENTS_TABLE,
        Item: contentItem
    }).promise();
    
    return contentId;
}

// Envia a resposta para o usuário via WhatsApp
async function sendResponseToUser(phoneNumber, message, userId, replyToInteractionId, contentId) {
    // Criar interação de saída
    const outputInteractionId = await createOutputInteraction(
        userId,
        message,
        'ai_generated_response',
        replyToInteractionId
    );
    
    // Enviar mensagem via WhatsApp
    await sendWhatsAppMessage(
        phoneNumber,
        message,
        {
            interactionId: outputInteractionId,
            userId,
            contentId
        }
    );
    
    return outputInteractionId;
}

// Cria uma interação de saída (resposta do sistema)
async function createOutputInteraction(userId, content, contentType, replyTo) {
    const interactionId = `int${uuidv4().replace(/-/g, '')}`;
    
    const interaction = {
        interactionId,
        userId,
        timestamp: new Date().toISOString(),
        channel: 'whatsapp',
        direction: 'outgoing',
        type: 'message',
        contentType,
        content,
        replyTo,
        metrics: {
            deliveryStatus: 'pending'
        },
        context: {
            triggerType: 'ai_generated'
        }
    };
    
    await dynamoDB.put({
        TableName: INTERACTIONS_TABLE,
        Item: interaction
    }).promise();
    
    return interactionId;
}

// Envia mensagem via WhatsApp
async function sendWhatsAppMessage(phoneNumber, message, metadata) {
    await lambda.invoke({
        FunctionName: WHATSAPP_SENDER_LAMBDA,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            phoneNumber,
            message,
            metadata
        })
    }).promise();
}

// Busca informações do usuário
async function getUser(userId) {
    const result = await dynamoDB.get({
        TableName: USERS_TABLE,
        Key: { userId }
    }).promise();
    
    return result.Item;
}

// Obtém interações recentes do usuário
async function getRecentInteractions(userId, limit = 5) {
    const result = await dynamoDB.query({
        TableName: INTERACTIONS_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
            ':userId': userId
        },
        IndexName: 'UserTimestampIndex',
        ScanIndexForward: false, // ordem decrescente (mais recente primeiro)
        Limit: limit
    }).promise();
    
    return result.Items || [];
} 