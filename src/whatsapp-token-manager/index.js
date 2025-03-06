/**
 * WhatsAppTokenManager
 * 
 * Este Lambda gerencia tokens de longa duração para a API do WhatsApp Business.
 * Funções:
 * 1. Inicialização: troca um token de curta duração por um token de longa duração
 * 2. Armazenamento seguro do token em AWS Secrets Manager
 * 3. Renovação automática do token antes da expiração
 * 4. Disponibilização do token atual para outras funções
 */

const AWS = require('aws-sdk');
const https = require('https');
const { promisify } = require('util');

// Clientes AWS
const ssm = new AWS.SSM();
const secretsManager = new AWS.SecretsManager();

// Variáveis do ambiente
const TOKEN_PARAMETER_NAME = process.env.TOKEN_PARAMETER_NAME || '/whatsapp/token';
const TOKEN_SECRET_NAME = process.env.TOKEN_SECRET_NAME || 'whatsapp/credentials';

/**
 * Faz uma requisição HTTPS usando promises
 */
async function httpsRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          reject(new Error(`Falha ao analisar resposta: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Obtém um token de longa duração usando um token de curta duração
 */
async function getLongLivedToken(appId, appSecret, userAccessToken) {
  console.log('Solicitando token de longa duração...');
  
  const options = {
    hostname: 'graph.facebook.com',
    port: 443,
    path: `/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userAccessToken}`,
    method: 'GET'
  };
  
  try {
    const response = await httpsRequest(options);
    
    if (response.statusCode !== 200) {
      throw new Error(`Falha ao obter token de longa duração: ${JSON.stringify(response.data)}`);
    }
    
    console.log('Token de longa duração obtido com sucesso');
    return response.data.access_token;
  } catch (error) {
    console.error('Erro ao obter token de longa duração:', error);
    throw error;
  }
}

/**
 * Verifica as informações do token
 */
async function getTokenInfo(token) {
  console.log('Verificando informações do token...');
  
  const options = {
    hostname: 'graph.facebook.com',
    port: 443,
    path: `/v21.0/debug_token?input_token=${token}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  try {
    const response = await httpsRequest(options);
    
    if (response.statusCode !== 200) {
      throw new Error(`Falha ao verificar token: ${JSON.stringify(response.data)}`);
    }
    
    const tokenData = response.data.data;
    console.log('Informações do token obtidas:', JSON.stringify(tokenData, null, 2));
    
    return {
      isValid: tokenData.is_valid === true,
      expiresAt: tokenData.expires_at ? new Date(tokenData.expires_at * 1000).toISOString() : null,
      scopes: tokenData.scopes || [],
      appId: tokenData.app_id,
      type: tokenData.type
    };
  } catch (error) {
    console.error('Erro ao verificar token:', error);
    throw error;
  }
}

/**
 * Verifica as permissões do aplicativo no WhatsApp Business
 */
async function verifyWhatsAppPermissions(token, systemOrPageId) {
  if (!systemOrPageId) {
    console.log('ID do sistema WhatsApp não fornecido, pulando verificação de permissões');
    return true;
  }
  
  console.log(`Verificando permissões do WhatsApp para o sistema/página ${systemOrPageId}...`);
  
  const options = {
    hostname: 'graph.facebook.com',
    port: 443,
    path: `/v21.0/${systemOrPageId}/messaging_feature_review`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  try {
    const response = await httpsRequest(options);
    
    if (response.statusCode !== 200) {
      console.warn(`Aviso: Não foi possível verificar permissões do WhatsApp: ${JSON.stringify(response.data)}`);
      return false;
    }
    
    console.log('Permissões do WhatsApp verificadas:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.warn('Aviso: Erro ao verificar permissões do WhatsApp:', error);
    return false;
  }
}

/**
 * Armazena o token e suas informações no SSM Parameter Store
 */
async function storeTokenInSSM(token, expirationDate) {
  console.log(`Armazenando token no SSM Parameter Store (${TOKEN_PARAMETER_NAME})...`);
  
  const params = {
    Name: TOKEN_PARAMETER_NAME,
    Value: token,
    Type: 'SecureString',
    Overwrite: true
  };
  
  try {
    await ssm.putParameter(params).promise();
    console.log('Token armazenado com sucesso no SSM');
    
    // Armazenar metadados em outro parâmetro
    if (expirationDate) {
      const metadataParams = {
        Name: `${TOKEN_PARAMETER_NAME}/metadata`,
        Value: JSON.stringify({
          updatedAt: new Date().toISOString(),
          expiresAt: expirationDate
        }),
        Type: 'String',
        Overwrite: true
      };
      
      await ssm.putParameter(metadataParams).promise();
      console.log('Metadados do token armazenados com sucesso no SSM');
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao armazenar token no SSM:', error);
    throw error;
  }
}

/**
 * Armazena as credenciais completas no Secrets Manager
 */
async function storeCredentialsInSecretsManager(credentials) {
  console.log(`Armazenando credenciais no Secrets Manager (${TOKEN_SECRET_NAME})...`);
  
  try {
    // Verificar se o segredo já existe
    try {
      await secretsManager.describeSecret({ SecretId: TOKEN_SECRET_NAME }).promise();
      
      // Se existe, atualizar
      await secretsManager.updateSecret({
        SecretId: TOKEN_SECRET_NAME,
        SecretString: JSON.stringify(credentials)
      }).promise();
    } catch (error) {
      // Se não existe, criar
      if (error.code === 'ResourceNotFoundException') {
        await secretsManager.createSecret({
          Name: TOKEN_SECRET_NAME,
          SecretString: JSON.stringify(credentials),
          Description: 'Credenciais do WhatsApp Business API'
        }).promise();
      } else {
        throw error;
      }
    }
    
    console.log('Credenciais armazenadas com sucesso no Secrets Manager');
    return true;
  } catch (error) {
    console.error('Erro ao armazenar credenciais no Secrets Manager:', error);
    throw error;
  }
}

/**
 * Obtém o token atual do SSM Parameter Store
 */
async function getCurrentToken() {
  console.log(`Obtendo token atual do SSM Parameter Store (${TOKEN_PARAMETER_NAME})...`);
  
  try {
    const parameter = await ssm.getParameter({
      Name: TOKEN_PARAMETER_NAME,
      WithDecryption: true
    }).promise();
    
    let metadata = {};
    try {
      const metadataParam = await ssm.getParameter({
        Name: `${TOKEN_PARAMETER_NAME}/metadata`
      }).promise();
      
      metadata = JSON.parse(metadataParam.Parameter.Value);
    } catch (error) {
      console.warn('Aviso: Não foi possível obter metadados do token:', error);
    }
    
    return {
      token: parameter.Parameter.Value,
      updatedAt: metadata.updatedAt || null,
      expiresAt: metadata.expiresAt || null
    };
  } catch (error) {
    if (error.code === 'ParameterNotFound') {
      console.warn('Token não encontrado no SSM Parameter Store');
      return null;
    }
    
    console.error('Erro ao obter token do SSM:', error);
    throw error;
  }
}

/**
 * Obtém as credenciais completas do Secrets Manager
 */
async function getCredentialsFromSecretsManager() {
  console.log(`Obtendo credenciais do Secrets Manager (${TOKEN_SECRET_NAME})...`);
  
  try {
    const secret = await secretsManager.getSecretValue({
      SecretId: TOKEN_SECRET_NAME
    }).promise();
    
    if (secret.SecretString) {
      return JSON.parse(secret.SecretString);
    }
    
    console.warn('Credenciais não encontradas no Secrets Manager');
    return null;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      console.warn('Segredo não encontrado no Secrets Manager');
      return null;
    }
    
    console.error('Erro ao obter credenciais do Secrets Manager:', error);
    throw error;
  }
}

/**
 * Renova o token existente usando as credenciais armazenadas
 */
async function renewToken() {
  console.log('Iniciando renovação do token...');
  
  try {
    // Obter credenciais armazenadas
    const credentials = await getCredentialsFromSecretsManager();
    if (!credentials || !credentials.appId || !credentials.appSecret || !credentials.longLivedToken) {
      throw new Error('Credenciais incompletas para renovação do token');
    }
    
    // Usar o token existente de longa duração para obter um novo
    const newToken = await getLongLivedToken(
      credentials.appId,
      credentials.appSecret,
      credentials.longLivedToken
    );
    
    // Verificar informações do novo token
    const tokenInfo = await getTokenInfo(newToken);
    
    // Armazenar o novo token
    await storeTokenInSSM(newToken, tokenInfo.expiresAt);
    
    // Atualizar as credenciais armazenadas
    await storeCredentialsInSecretsManager({
      ...credentials,
      longLivedToken: newToken,
      tokenUpdatedAt: new Date().toISOString(),
      tokenExpiresAt: tokenInfo.expiresAt
    });
    
    return {
      token: newToken,
      expiration: tokenInfo.expiresAt,
      renewed: true
    };
  } catch (error) {
    console.error('Falha na renovação do token:', error);
    throw error;
  }
}

/**
 * Inicializa o sistema com um novo token de longa duração
 */
async function initializeSystem(appId, appSecret, userAccessToken, pageOrSystemId) {
  console.log('Inicializando sistema com novo token de longa duração...');
  
  try {
    // Obter token de longa duração
    const longLivedToken = await getLongLivedToken(appId, appSecret, userAccessToken);
    
    // Verificar informações do token
    const tokenInfo = await getTokenInfo(longLivedToken);
    
    // Verificar permissões do WhatsApp (opcional)
    if (pageOrSystemId) {
      await verifyWhatsAppPermissions(longLivedToken, pageOrSystemId);
    }
    
    // Armazenar o token no SSM
    await storeTokenInSSM(longLivedToken, tokenInfo.expiresAt);
    
    // Armazenar credenciais completas no Secrets Manager
    await storeCredentialsInSecretsManager({
      appId,
      appSecret,
      longLivedToken,
      pageOrSystemId: pageOrSystemId || null,
      tokenUpdatedAt: new Date().toISOString(),
      tokenExpiresAt: tokenInfo.expiresAt
    });
    
    return {
      token: longLivedToken,
      expiration: tokenInfo.expiresAt,
      initialized: true
    };
  } catch (error) {
    console.error('Falha na inicialização do sistema:', error);
    throw error;
  }
}

/**
 * Handler principal da função Lambda
 */
exports.handler = async (event) => {
  console.log('Evento recebido:', JSON.stringify(event, null, 2));
  
  try {
    // Verificar se é uma regra do EventBridge para renovação automática
    if (event.source === 'aws.events' && event['detail-type'] === 'Scheduled Event') {
      console.log('Iniciando renovação automática do token via EventBridge');
      const result = await renewToken();
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Token renovado automaticamente com sucesso',
          token: `${result.token.substring(0, 10)}...${result.token.substring(result.token.length - 10)}`,
          expiration: result.expiration
        })
      };
    }
    
    // Processar ações solicitadas via invocação direta
    if (event.action === 'getToken') {
      const tokenData = await getCurrentToken();
      
      if (!tokenData) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: 'Token não encontrado. Execute a ação "initialize" primeiro.'
          })
        };
      }
      
      // Não retornar o token completo por segurança
      const maskedToken = tokenData.token.substring(0, 10) + '...' + 
                         tokenData.token.substring(tokenData.token.length - 10);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          token: maskedToken,
          updatedAt: tokenData.updatedAt,
          expiration: tokenData.expiresAt
        })
      };
    } else if (event.action === 'initialize') {
      if (!event.appId || !event.appSecret || !event.userAccessToken) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: 'Parâmetros incompletos. Forneça appId, appSecret e userAccessToken.'
          })
        };
      }
      
      const result = await initializeSystem(
        event.appId,
        event.appSecret,
        event.userAccessToken,
        event.pageOrSystemId
      );
      
      // Não retornar o token completo por segurança
      const maskedToken = result.token.substring(0, 10) + '...' + 
                         result.token.substring(result.token.length - 10);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Sistema inicializado com sucesso',
          token: maskedToken,
          expiration: result.expiration
        })
      };
    } else if (event.action === 'renewToken') {
      const result = await renewToken();
      
      // Não retornar o token completo por segurança
      const maskedToken = result.token.substring(0, 10) + '...' + 
                         result.token.substring(result.token.length - 10);
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Token renovado com sucesso',
          token: maskedToken,
          expiration: result.expiration
        })
      };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Ação desconhecida. Ações disponíveis: getToken, initialize, renewToken'
        })
      };
    }
  } catch (error) {
    console.error('Erro ao processar solicitação:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Erro interno do servidor'
      })
    };
  }
}; 