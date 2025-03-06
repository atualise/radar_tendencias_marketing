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
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'http://18.208.170.1:11434/api/generate';
const USE_CLAUDE_FALLBACK = process.env.USE_CLAUDE_FALLBACK === 'true' || true;

// Modelo Claude padrão
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-r1:14b';

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
                                { interactionId: errorInteractionId, userId: body.userId },
                                null
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
    
    // Estruturar a mensagem para a API de IA
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

IMPORTANTE: Limite sua resposta a no máximo 3000 caracteres. Seja conciso e direto, mantendo apenas as informações mais relevantes.

Obs: Se alguma das ferramentas já for utilizada pelo usuário (conforme lista), substitua por outra.
`;

    // Chamar a API de IA
    const response = await generateContent(prompt);
    
    // Armazenar o conteúdo gerado no DynamoDB
    const contentId = await storeGeneratedContent(
        userId,
        'tool_recommendation',
        topic,
        response,
        interactionId
    );
    
    // Enviar a resposta para o usuário via WhatsApp
    await sendResponseToUser(
        user.phoneNumber,
        response,
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
    
    // Estruturar a mensagem para a API de IA
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

IMPORTANTE: Limite sua resposta a no máximo 3000 caracteres. Seja conciso e direto, mantendo apenas as informações mais relevantes.

Obs: Se possível, cite um caso real e recente. Se não tiver um caso específico em mente, crie um realista baseado em tendências atuais, mas não invente estatísticas ou dados falsos - nesse caso, use estimativas conservadoras e mencione que são aproximações.
`;

    // Chamar a API de IA
    const response = await generateContent(prompt);
    
    // Armazenar o conteúdo gerado no DynamoDB
    const contentId = await storeGeneratedContent(
        userId,
        'case_study',
        topic,
        response,
        interactionId
    );
    
    // Enviar a resposta para o usuário via WhatsApp
    await sendResponseToUser(
        user.phoneNumber,
        response,
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
    
    // Estruturar a mensagem para a API de IA
    const prompt = `
Você é o assistente especializado do "Radar de Tendências em Marketing Digital", um serviço de inteligência para profissionais de marketing.

O usuário solicitou informações sobre tendências relacionadas a "${topic}".

Contexto do usuário:
- Nome: ${user.name}
- Cargo/Função: ${userProfile?.role || 'Profissional de marketing'}
- Objetivo principal: ${userProfile?.objective || 'Melhorar estratégias de marketing digital'}
- Interesses: ${userProfile?.interests ? userProfile.interests.join(', ') : 'Marketing digital em geral'}

Gere um relatório curto sobre as últimas tendências em "${topic}" com:
1. 3-4 tendências emergentes relevantes
2. Como cada tendência está impactando o mercado
3. Oportunidades para profissionais de marketing
4. Projeções futuras (próximos 6-12 meses)

Formato da resposta:
- Use linguagem direta e baseada em dados
- Estruture o relatório em seções claras
- Inclua emojis relevantes para melhorar a legibilidade
- Adapte o conteúdo ao nível de especialização do usuário
- Mencione fontes ou exemplos que dão credibilidade (se disponíveis)
- Termine com uma dica prática que o usuário possa implementar imediatamente

IMPORTANTE: Limite sua resposta a no máximo 3000 caracteres. Seja conciso e direto, mantendo apenas as informações mais relevantes.
`;

    // Chamar a API de IA
    const response = await generateContent(prompt);
    
    // Armazenar o conteúdo gerado no DynamoDB
    const contentId = await storeGeneratedContent(
        userId,
        'trend_report',
        topic,
        response,
        interactionId
    );
    
    // Enviar a resposta para o usuário via WhatsApp
    await sendResponseToUser(
        user.phoneNumber,
        response,
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

// Gerador de respostas para consultas gerais do usuário
async function generateUserResponse(data) {
    const { userId, interactionId, query, context = {} } = data;
    
    const user = await getUser(userId);
    if (!user) {
        throw new Error(`Usuário ${userId} não encontrado`);
    }
    
    // Obter interações recentes para contexto
    const recentInteractions = await getRecentInteractions(userId);
    
    // Estruturar a mensagem para a API de IA
    const prompt = `
Você é o assistente especializado do "Radar de Tendências em Marketing Digital", um serviço de inteligência para profissionais de marketing.

O usuário enviou a seguinte consulta: "${query}"

Contexto do usuário:
- Nome: ${user.name}
- Cargo/Função: ${context.role || user.profile?.role || 'Profissional de marketing'}
- Histórico: ${context.history || 'Novo na plataforma'}

Interações recentes:
${recentInteractions.map(int => `- ${int.content?.substring(0, 100)}${int.content?.length > 100 ? '...' : ''}`).join('\n')}

Responda à consulta do usuário de maneira:
- Profissional, mas amigável e conversacional
- Personalize com base no perfil e histórico do usuário
- Ofereça informações úteis e acionáveis
- Use emojis para melhorar a legibilidade
- Quando relevante, mencione fontes de informação
- Termine com uma pergunta ou sugestão para manter o engajamento

IMPORTANTE: Limite sua resposta a no máximo 3000 caracteres. Seja conciso e direto, mantendo apenas as informações mais relevantes. Se a pergunta for muito ampla, sugira especificá-la.

Se a consulta estiver fora do seu domínio de conhecimento (marketing digital e negócios), informe educadamente e direcione para um tópico relacionado a marketing.
`;

    // Chamar a API de IA
    const response = await generateContent(prompt);
    
    // Armazenar o conteúdo gerado no DynamoDB
    const contentId = await storeGeneratedContent(
        userId,
        'user_query_response',
        query.substring(0, 100),
        response,
        interactionId
    );
    
    // Enviar a resposta para o usuário via WhatsApp
    await sendResponseToUser(
        user.phoneNumber,
        response,
        userId,
        interactionId,
        contentId
    );
    
    return {
        status: 'completed',
        contentId,
        query: query.substring(0, 100)
    };
}

// Funções auxiliares

// Função para limpar as respostas da IA de tags indesejadas e formatar o texto
function cleanAIResponse(text) {
    if (!text) return '';
    
    let cleanedText = text;
    
    // Remover tags <think> e seu conteúdo (específico do DeepSeek)
    cleanedText = cleanedText.replace(/<think>[\s\S]*?<\/think>/g, '');
    
    // Remover outras tags de marcação que possam aparecer
    cleanedText = cleanedText.replace(/<[a-zA-Z]+>[\s\S]*?<\/[a-zA-Z]+>/g, '');
    
    // Remover linhas de pensamento em linguagem Python
    cleanedText = cleanedText.replace(/```python[\s\S]*?```/g, '');
    
    // Remover comentários que começam com #
    cleanedText = cleanedText.replace(/^#.*$/gm, '');
    
    // Limpar espaços extras e linhas em branco resultantes da remoção
    cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
    
    // Remover espaços em branco no início e fim
    cleanedText = cleanedText.trim();
    
    return cleanedText;
}

// Nova função para gerar conteúdo com redundância entre DeepSeek e Claude
async function generateContent(prompt) {
    console.log('Gerando conteúdo com redundância de modelos...');
    
    // Tentar primeiro com DeepSeek (opção padrão)
    try {
        console.log('Tentando gerar conteúdo com DeepSeek...');
        return await callDeepSeekAPI(prompt);
    } catch (deepseekError) {
        // Registrar o erro do DeepSeek
        console.error('Erro ao chamar a API DeepSeek:', deepseekError.message);
        
        // Se o fallback com Claude estiver habilitado, tentar com Claude
        if (USE_CLAUDE_FALLBACK) {
            console.log('Usando Claude como fallback...');
            try {
                return await callClaudeAPI(prompt);
            } catch (claudeError) {
                console.error('Erro no fallback com Claude:', claudeError.message);
                throw new Error(`Falha em ambos os modelos. DeepSeek: ${deepseekError.message}. Claude: ${claudeError.message}`);
            }
        } else {
            // Se não estiver habilitado o fallback, apenas propagar o erro original
            throw deepseekError;
        }
    }
}

// Função para chamar a API DeepSeek via Ollama
async function callDeepSeekAPI(prompt) {
    try {
        console.log(`Chamando DeepSeek (${DEEPSEEK_MODEL}) via Ollama...`);
        
        // Definir um limite razoável para evitar respostas extremamente longas
        const MAX_TOKENS = 1500;
        
        const response = await axios.post(
            DEEPSEEK_API_URL,
            {
                model: DEEPSEEK_MODEL,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    max_tokens: MAX_TOKENS,
                    stop: ["<|endoftext|>"]
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 120000 // 2 minutos de timeout
            }
        );
        
        // Verificar se a resposta tem o formato esperado
        if (!response.data || !response.data.response) {
            throw new Error('Resposta inválida do Ollama');
        }
        
        console.log('DeepSeek gerou conteúdo com sucesso');
        const rawText = response.data.response;
        
        // Registrar o tamanho da resposta bruta
        console.log(`Tamanho da resposta bruta do DeepSeek: ${rawText.length} caracteres`);
        
        // Limpar a resposta de tags e formatações indesejadas
        const cleanedText = cleanAIResponse(rawText);
        
        // Registrar o tamanho após a limpeza
        console.log(`Tamanho após limpeza: ${cleanedText.length} caracteres (${rawText.length - cleanedText.length} caracteres removidos)`);
        
        return cleanedText;
    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || 'Erro desconhecido na API do DeepSeek';
        console.error('Erro detalhado ao chamar a API DeepSeek:', errorMsg);
        throw new Error(`Falha ao gerar conteúdo com DeepSeek: ${errorMsg}`);
    }
}

// Função existente para chamar a API Claude, adaptada para ser usada como fallback
async function callClaudeAPI(prompt) {
    try {
        console.log(`Chamando Claude (${CLAUDE_MODEL})...`);
        
        // Definir um limite razoável para evitar respostas extremamente longas
        const MAX_TOKENS = 1500;
        
        const response = await axios.post(
            CLAUDE_API_URL,
            {
                model: CLAUDE_MODEL,
                max_tokens: MAX_TOKENS,
                messages: [
                    { role: 'user', content: prompt }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CLAUDE_API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                timeout: 60000 // 1 minuto de timeout
            }
        );
        
        // Extrair a resposta da Claude
        console.log('Claude gerou conteúdo com sucesso');
        const rawText = response.data.content[0].text;
        
        // Registrar o tamanho da resposta bruta
        console.log(`Tamanho da resposta bruta do Claude: ${rawText.length} caracteres`);
        
        // Limpar a resposta (por consistência, mesmo que o Claude normalmente não precise)
        const cleanedText = cleanAIResponse(rawText);
        
        // Registrar o tamanho após a limpeza
        console.log(`Tamanho após limpeza: ${cleanedText.length} caracteres (${rawText.length - cleanedText.length} caracteres removidos)`);
        
        return cleanedText;
    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || 'Erro desconhecido na API Claude';
        console.error('Erro detalhado ao chamar a API Claude:', errorMsg);
        throw new Error(`Falha ao gerar conteúdo com Claude: ${errorMsg}`);
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
    // Criar interação de saída para o conteúdo completo
    const outputInteractionId = await createOutputInteraction(
        userId,
        message,
        'ai_generated_response',
        replyToInteractionId
    );
    
    // Verificar se a mensagem está dentro do limite
    const MAX_WHATSAPP_LENGTH = 4000; // Deixando uma margem de segurança (limite real é 4096)
    
    if (message.length <= MAX_WHATSAPP_LENGTH) {
        // Mensagem dentro do limite, enviar normalmente
        await sendWhatsAppMessage(
            phoneNumber,
            message,
            {
                interactionId: outputInteractionId,
                userId,
                contentId
            },
            null
        );
    } else {
        // Mensagem muito longa, dividir e enviar em partes
        console.log(`Mensagem excede o limite do WhatsApp (${message.length} caracteres). Dividindo em partes...`);
        
        // Enviar uma mensagem inicial informando sobre a divisão
        await sendWhatsAppMessage(
            phoneNumber,
            "⚠️ A resposta é longa e será enviada em várias mensagens.",
            {
                interactionId: outputInteractionId,
                userId,
                contentId
            },
            null
        );
        
        // Dividir a mensagem
        const messageParts = splitLongMessage(message, MAX_WHATSAPP_LENGTH);
        
        // Enviar cada parte
        for (let i = 0; i < messageParts.length; i++) {
            const part = messageParts[i];
            
            // Adicionar indicador de parte
            const headerText = `Parte ${i+1}/${messageParts.length}:\n\n`;
            const messageWithHeader = headerText + part;
            
            // Enviar esta parte
            await sendWhatsAppMessage(
                phoneNumber,
                messageWithHeader,
                {
                    interactionId: outputInteractionId,
                    userId,
                    contentId,
                    partNumber: i + 1,
                    totalParts: messageParts.length
                },
                null
            );
            
            // Adicionar um pequeno delay entre as mensagens para evitar throttling
            if (i < messageParts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    
    return outputInteractionId;
}

// Função para dividir mensagens longas
function splitLongMessage(message, maxLength) {
    const parts = [];
    
    // Se a mensagem não precisar de divisão, retornar apenas uma parte
    if (message.length <= maxLength) {
        return [message];
    }
    
    // Dividir a mensagem em partes tentando preservar parágrafos ou frases
    let remainingText = message;
    
    while (remainingText.length > 0) {
        let partEndIndex;
        
        if (remainingText.length <= maxLength) {
            // O texto restante cabe em uma parte
            partEndIndex = remainingText.length;
        } else {
            // Tentar dividir no final de um parágrafo
            partEndIndex = remainingText.lastIndexOf('\n\n', maxLength);
            
            // Se não encontrou parágrafo, tentar dividir no final de uma frase
            if (partEndIndex === -1 || partEndIndex < maxLength / 2) {
                partEndIndex = remainingText.lastIndexOf('. ', maxLength);
                
                // Se não encontrou frase, dividir na última palavra completa
                if (partEndIndex === -1 || partEndIndex < maxLength / 2) {
                    partEndIndex = remainingText.lastIndexOf(' ', maxLength);
                    
                    // Se não encontrou espaço ou ficou muito curto, cortar no tamanho máximo
                    if (partEndIndex === -1 || partEndIndex < maxLength / 2) {
                        partEndIndex = maxLength;
                    }
                } else {
                    // Incluir o ponto final
                    partEndIndex += 1;
                }
            }
        }
        
        // Adicionar esta parte
        parts.push(remainingText.substring(0, partEndIndex).trim());
        
        // Atualizar o texto restante
        remainingText = remainingText.substring(partEndIndex).trim();
    }
    
    return parts;
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
async function sendWhatsAppMessage(phoneNumber, message, metadata, template) {
    await lambda.invoke({
        FunctionName: WHATSAPP_SENDER_LAMBDA,
        InvocationType: 'Event',
        Payload: JSON.stringify({
            phoneNumber,
            message,
            metadata,
            template
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