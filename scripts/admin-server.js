const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const path = require('path');
const bodyParser = require('body-parser');

// Inicializar o express
const app = express();
const PORT = process.env.PORT || 3000;

// ======== CONFIGURAÇÃO E VALIDAÇÃO INICIAL ========
console.log('==========================================');
console.log('Iniciando servidor admin com conexão à AWS');
console.log('==========================================');

// Validação de variáveis de ambiente críticas
const requiredEnvs = ['AWS_REGION', 'USUARIOS_TABLE', 'CONTEUDOS_TABLE'];
const missingEnvs = requiredEnvs.filter(env => !process.env[env]);

if (missingEnvs.length > 0) {
  console.warn('⚠️ ATENÇÃO: Variáveis de ambiente recomendadas não encontradas:', missingEnvs.join(', '));
  console.warn('Usando valores padrão, que podem não funcionar com sua configuração de produção.');
}

// Configuração AWS
const awsRegion = process.env.AWS_REGION || 'us-east-1';
console.log(`Região AWS configurada: ${awsRegion}`);

// Configuração DynamoDB
const dynamoConfig = {
  region: awsRegion,
  maxRetries: 3,
  httpOptions: { timeout: 5000 }
};

// Inicializar AWS SDK
AWS.config.update(dynamoConfig);
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Nomes das tabelas em produção
const USUARIOS_TABLE = process?.env?.USUARIOS_TABLE || 'antena-app-Users-prod'; // Ajuste para o nome real em produção
const CONTEUDOS_TABLE = process?.env?.CONTEUDOS_TABLE || 'antena-app-Contents-prod'; // Ajuste para o nome real em produção

console.log(`Tabela de usuários: ${USUARIOS_TABLE}`);
console.log(`Tabela de conteúdos: ${CONTEUDOS_TABLE}`);

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Servir o arquivo HTML administrativo
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-server.html'));
});

// ======== FUNÇÕES DE VALIDAÇÃO ========

// Verificar conexão com DynamoDB e tabelas
async function validateAwsConnection() {
  console.log('Verificando conexão com AWS e tabelas do DynamoDB...');
  
  try {
    // Verificar se conseguimos listar tabelas (teste de credenciais)
    const listTablesResult = await new AWS.DynamoDB().listTables().promise();
    console.log(`✅ Conexão com AWS estabelecida. ${listTablesResult.TableNames.length} tabelas encontradas.`);
    
    // Verificar existência das tabelas específicas
    const allTables = listTablesResult.TableNames;
    
    if (!allTables.includes(USUARIOS_TABLE)) {
      console.error(`❌ ERRO: Tabela de usuários '${USUARIOS_TABLE}' não encontrada.`);
      console.log('Tabelas disponíveis:', allTables.join(', '));
    return false;
  }
    
    if (!allTables.includes(CONTEUDOS_TABLE)) {
      console.error(`❌ ERRO: Tabela de conteúdos '${CONTEUDOS_TABLE}' não encontrada.`);
      console.log('Tabelas disponíveis:', allTables.join(', '));
      return false;
    }
    
    console.log('✅ Tabelas verificadas e encontradas.');
    
    // Teste de leitura na tabela de usuários
    try {
      const userTest = await dynamoDB.scan({
          TableName: USUARIOS_TABLE,
        Limit: 1
        }).promise();
        
      console.log(`✅ Leitura de tabela de usuários testada. ${userTest.Items.length} item(s) lido(s).`);
      
      if (userTest.Items.length > 0) {
        const sampleUser = userTest.Items[0];
        const idField = sampleUser.id ? 'id' : 
                        sampleUser.usuarioId ? 'usuarioId' : 
                        sampleUser.telefone ? 'telefone' : null;
        
        if (!idField) {
          console.warn('⚠️ AVISO: Não foi possível determinar o campo de ID do usuário. Verifique a estrutura da tabela.');
        } else {
          console.log(`✅ Campo de ID identificado: '${idField}'`);
        }
      }
    } catch (scanError) {
      console.error(`❌ ERRO ao ler tabela de usuários:`, scanError.message);
      return false;
    }
    
    return true;
    } catch (error) {
    console.error('❌ ERRO ao verificar conexão com AWS:', error.message);
    if (error.code === 'CredentialsError' || error.code === 'UnrecognizedClientException') {
      console.error(`
        🔑 PROBLEMA DE CREDENCIAIS AWS: Verifique se você configurou suas credenciais corretamente.
        
        Métodos para configurar credenciais:
        1. Arquivo ~/.aws/credentials
        2. Variáveis de ambiente AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY
        3. Perfil do IAM Instance se estiver rodando em uma instância EC2
      `);
    } else if (error.code === 'UnrecognizedClientException') {
      console.error(`
        ⚠️ PROBLEMA DE REGIÃO: A região ${awsRegion} pode estar incorreta ou as credenciais 
        não têm acesso a esta região.
      `);
    }
    return false;
  }
}

// ======== ENDPOINTS DA API ========

// Endpoint de verificação de saúde do sistema
app.get('/api/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'online',
      timestamp: new Date().toISOString(),
      aws: await validateAwsConnectionStatus(),
      environment: {
        region: awsRegion,
        usuariosTable: USUARIOS_TABLE,
        conteudosTable: CONTEUDOS_TABLE
      }
    };
    
    res.json(healthStatus);
  } catch (error) {
    console.error('Erro ao verificar saúde do servidor:', error);
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Função rápida para validar conexão AWS
async function validateAwsConnectionStatus() {
  try {
    // Tentar listar tabelas para validar conexão
    const result = await new AWS.DynamoDB().listTables().promise();
    
    return {
      connected: true,
      tablesFound: result.TableNames.length,
      usuariosTableExists: result.TableNames.includes(USUARIOS_TABLE),
      conteudosTableExists: result.TableNames.includes(CONTEUDOS_TABLE)
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

// Endpoint para listar usuários
app.get('/api/usuarios', async (req, res) => {
  try {
    console.log(`Solicitação recebida para listar usuários da tabela ${USUARIOS_TABLE}`);
    const startTime = Date.now();
    
    // Acesso ao DynamoDB em produção
    const params = {
      TableName: USUARIOS_TABLE,
      Limit: 1000
    };
    
    let result;
    try {
      result = await dynamoDB.scan(params).promise();
      const endTime = Date.now();
      console.log(`✅ Consulta bem-sucedida: ${result.Items?.length || 0} usuários encontrados (${endTime - startTime}ms)`);
    } catch (dbError) {
      console.error('❌ Erro na consulta ao DynamoDB:', dbError);
      return res.status(500).json({
        error: `Erro ao consultar o DynamoDB: ${dbError.message}`,
        code: dbError.code,
        table: USUARIOS_TABLE,
        region: dynamoConfig.region,
        params: params
      });
    }
    
    // Contar usuários ativos (verificando diversos campos possíveis)
    const usuariosAtivos = result.Items.filter(u => 
      u.status === 'ativo' || u.ativo === true || 
      u.situacao === 'ativo' || u.active === true ||
      (typeof u.status === 'number' && u.status === 1)
    ).length;
    
            res.json({
      count: result.Items.length,
      ativos: usuariosAtivos,
      table: params.TableName,
      region: dynamoConfig.region,
      timestamp: new Date().toISOString(),
      usuarios: result.Items
    });
    
  } catch (error) {
    console.error('❌ Erro ao processar solicitação /api/usuarios:', error);
    res.status(500).json({
      error: `Erro ao processar solicitação: ${error.message}`,
      table: USUARIOS_TABLE,
      region: dynamoConfig.region,
      stack: error.stack
    });
    }
});

// Endpoint para listar conteúdos
app.get('/api/conteudos', async (req, res) => {
  try {
    console.log(`Solicitação recebida para listar conteúdos da tabela ${CONTEUDOS_TABLE}`);
    const startTime = Date.now();
    
    // Acesso ao DynamoDB
        const params = {
      TableName: CONTEUDOS_TABLE,
      Limit: 1000
    };
    
    let result;
    try {
      result = await dynamoDB.scan(params).promise();
      const endTime = Date.now();
      console.log(`✅ Consulta bem-sucedida: ${result.Items?.length || 0} conteúdos encontrados (${endTime - startTime}ms)`);
    } catch (dbError) {
      console.error('❌ Erro na consulta ao DynamoDB:', dbError);
      return res.status(500).json({
        error: `Erro ao consultar o DynamoDB: ${dbError.message}`,
        code: dbError.code,
        table: CONTEUDOS_TABLE,
        region: dynamoConfig.region
      });
    }
    
    res.json({
      count: result.Items.length,
      table: params.TableName,
      region: dynamoConfig.region,
      timestamp: new Date().toISOString(),
      conteudos: result.Items
    });
    
    } catch (error) {
    console.error('❌ Erro ao processar solicitação /api/conteudos:', error);
    res.status(500).json({
      error: `Erro ao processar solicitação: ${error.message}`,
      table: CONTEUDOS_TABLE
    });
  }
});

// Função para extrair UUID puro de um ID com prefixo
function extractUUID(id) {
  // Verificar se o ID segue o padrão de um UUID com prefixo
  const uuidRegex = /^[a-z]+([\da-f]{8}-?[\da-f]{4}-?[\da-f]{4}-?[\da-f]{4}-?[\da-f]{12})$/i;
  const match = id.match(uuidRegex);
  
  if (match && match[1]) {
    // Formatar o UUID para formato padrão com hífens
    const uuid = match[1].replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i, '$1-$2-$3-$4-$5');
    return uuid.toLowerCase();
  }
  
  // Verificar outro padrão comum onde o prefixo é seguido por um UUID sem hífens
  const uuidNoHyphensRegex = /^[a-z]+([\da-f]{32})$/i;
  const matchNoHyphens = id.match(uuidNoHyphensRegex);
  
  if (matchNoHyphens && matchNoHyphens[1]) {
    // Formatar o UUID para formato padrão com hífens
    const uuid = matchNoHyphens[1].replace(/^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i, '$1-$2-$3-$4-$5');
    return uuid.toLowerCase();
  }
  
  return null;
}

// Endpoint para remover um usuário
app.delete('/api/usuarios/:id', async (req, res) => {
  const id = req.params.id;
  console.log(`⚠️ Solicitação de remoção de usuário recebida. ID: ${id}`);
  
  try {
    // Criar variações do ID para tentar (com e sem prefixos comuns)
    let idVariations = [id];
    
    // Se o ID começa com algum prefixo conhecido, adicionar versão sem prefixo
    const knownPrefixes = ['usr', 'user', 'u-', 'user-', 'id-'];
    for (const prefix of knownPrefixes) {
      if (id.startsWith(prefix)) {
        idVariations.push(id.substring(prefix.length));
        console.log(`Adicionada variação sem prefixo '${prefix}': ${id.substring(prefix.length)}`);
      }
    }

    // Se o formato parece ser UUID com prefixo, tentar remover o prefixo
    if (/^[a-z]+[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)) {
      const uuidPart = id.replace(/^[a-z]+/i, '');
      idVariations.push(uuidPart);
      console.log(`ID parece ser UUID com prefixo. Tentando extrair parte UUID: ${uuidPart}`);
      
      // Tentar extrair e formatar UUID corretamente
      const extractedUUID = extractUUID(id);
      if (extractedUUID && !idVariations.includes(extractedUUID)) {
        idVariations.push(extractedUUID);
        console.log(`UUID extraído e formatado: ${extractedUUID}`);
      }
    }
    
    // Verificar metadados da tabela primeiro para entender a estrutura de chave
    try {
      console.log('Obtendo metadados da tabela DynamoDB:', USUARIOS_TABLE);
      // Usar AWS.DynamoDB em vez de DocumentClient para acessar o método describeTable
      const dynamoDBStandard = new AWS.DynamoDB();
      const tableData = await dynamoDBStandard.describeTable({
        TableName: USUARIOS_TABLE
      }).promise();
      
      if (tableData && tableData.Table && tableData.Table.KeySchema) {
        console.log('Esquema de chave da tabela:', JSON.stringify(tableData.Table.KeySchema));
        
        // Extrair informações sobre as chaves
        const partitionKey = tableData.Table.KeySchema.find(k => k.KeyType === 'HASH');
        const sortKey = tableData.Table.KeySchema.find(k => k.KeyType === 'RANGE');
        
        if (partitionKey) {
          console.log(`Chave de partição encontrada: ${partitionKey.AttributeName}`);
          
          if (sortKey) {
            console.log(`Chave de ordenação encontrada: ${sortKey.AttributeName}`);
            console.log('⚠️ A tabela usa uma chave composta. Tentando determinar o valor da chave de ordenação.');
          }
          
          // Obter informações sobre os usuários através de uma operação de scan
          console.log('Realizando scan para encontrar o usuário com variações de ID:', idVariations);
          
          let scanExpression = '';
          let expressionAttrValues = {};
          
          idVariations.forEach((varId, index) => {
            if (index > 0) scanExpression += ' OR ';
            
            // Priorizar o campo userId conforme identificado no diagnóstico
            scanExpression += `userId = :id${index} OR id = :id${index} OR usuarioId = :id${index} OR telefone = :id${index} OR phoneNumber = :id${index}`;
            expressionAttrValues[`:id${index}`] = varId;
          });
          
          const scanParams = {
            TableName: USUARIOS_TABLE,
            FilterExpression: scanExpression,
            ExpressionAttributeValues: expressionAttrValues
          };
          
          const scanResult = await dynamoDB.scan(scanParams).promise();
          
          if (scanResult.Items && scanResult.Items.length > 0) {
            console.log(`✅ Usuário encontrado via scan! Total: ${scanResult.Items.length}`);
            
            // Exibir os objetos de usuário encontrados para diagnóstico
            scanResult.Items.forEach((user, index) => {
              console.log(`Usuário ${index + 1}:`, JSON.stringify(user));
              console.log(`Campos disponíveis:`, Object.keys(user).join(', '));
              
              // Verificar campos que podem ser usados como ID
              const possibleIdFields = ['id', 'usuarioId', 'userId', 'telefone', 'phoneNumber', 'whatsapp', '_id', 'uid'];
              possibleIdFields.forEach(field => {
                if (user[field]) {
                  console.log(`Campo ${field} encontrado com valor: ${user[field]}`);
                }
              });
            });
            
            const user = scanResult.Items[0];
            
            // Verificar se o campo 'userId' está presente (principal campo de ID conforme diagnóstico)
            if (user.userId) {
              console.log(`Campo 'userId' encontrado, usando como chave primária: ${user.userId}`);
              const deleteParams = {
                TableName: USUARIOS_TABLE,
                Key: { userId: user.userId }
              };
              
              await dynamoDB.delete(deleteParams).promise();
              console.log(`✅ Usuário removido com sucesso usando userId=${user.userId}`);
              return res.json({ 
                message: 'Usuário removido com sucesso',
                id: id,
                keyField: 'userId',
                valueUsed: user.userId
              });
            }
            // Se não tiver userId, tentar com a chave de partição identificada
            else if (partitionKey.AttributeName in user) {
              // Configurar o objeto de chave corretamente
              let keyObj = {
                [partitionKey.AttributeName]: user[partitionKey.AttributeName]
              };
              
              // Se existe uma chave de ordenação, adicionar
              if (sortKey && sortKey.AttributeName in user) {
                keyObj[sortKey.AttributeName] = user[sortKey.AttributeName];
              }
              
              console.log('Removendo usuário com chave:', JSON.stringify(keyObj));
              
              const deleteParams = {
                TableName: USUARIOS_TABLE,
                Key: keyObj
              };
              
              await dynamoDB.delete(deleteParams).promise();
              console.log(`✅ Usuário removido com sucesso usando scan`);
              return res.json({ 
                message: 'Usuário removido com sucesso',
                id: id,
                keyStructure: Object.keys(keyObj).join(', '),
              });
            } else {
              console.log(`❌ Usuário encontrado, mas não possui o atributo da chave de partição: ${partitionKey.AttributeName}`);
              console.log('Tentando métodos alternativos de remoção...');
            }
          } else {
            console.log('❌ Scan não encontrou usuários. Tentando métodos alternativos...');
          }
        } else {
          console.log('❌ Não foi possível determinar a chave de partição a partir dos metadados da tabela');
        }
      } else {
        console.log('❌ Não foi possível obter informações sobre a estrutura da tabela');
      }
    } catch (metaError) {
      console.error('❌ Erro ao obter metadados da tabela:', metaError);
      console.log('Prosseguindo com tentativas alternativas de remoção...');
    }
    
    // Se não conseguiu remover pelo método acima, tentar métodos padrão
    return await tryStandardDelete(id, res);
  } catch (error) {
    console.error('❌ Erro geral ao remover usuário:', error);
    return res.status(500).json({
      error: `Erro na operação: ${error.message}`,
      code: error.code || 'ERROR',
      id: id
    });
  }
});

// Função auxiliar para tentar remover usuário usando os métodos padrão
async function tryStandardDelete(id, res) {
  try {
    console.log('Tentando métodos padrão de deleção para o ID:', id);
    
    // Criar variações do ID para tentar (com e sem prefixos comuns)
    let idVariations = [id];
    
    // Se o ID começa com algum prefixo conhecido, adicionar versão sem prefixo
    const knownPrefixes = ['usr', 'user', 'u-', 'user-', 'id-'];
    for (const prefix of knownPrefixes) {
      if (id.startsWith(prefix)) {
        idVariations.push(id.substring(prefix.length));
        console.log(`Adicionada variação sem prefixo '${prefix}': ${id.substring(prefix.length)}`);
      }
    }
    
    // Se o formato parece ser UUID com prefixo, tentar remover o prefixo
    if (/^[a-z]+[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)) {
      const uuidPart = id.replace(/^[a-z]+/i, '');
      idVariations.push(uuidPart);
      console.log(`ID parece ser UUID com prefixo. Tentando extrair parte UUID: ${uuidPart}`);
      
      // Tentar extrair e formatar UUID corretamente
      const extractedUUID = extractUUID(id);
      if (extractedUUID && !idVariations.includes(extractedUUID)) {
        idVariations.push(extractedUUID);
        console.log(`UUID extraído e formatado: ${extractedUUID}`);
      }
    }
    
    // Baseado no diagnóstico, identificamos que userId é o principal campo de ID na tabela
    
    // Iteração sobre todas as variações do ID
    for (const varId of idVariations) {
      console.log(`Tentando deleção com variação do ID: ${varId}`);
      
      // 0. PRIMEIRO: Tentar com userId como chave principal (conforme identificado no diagnóstico)
      try {
        const getUserIdParams = {
          TableName: USUARIOS_TABLE,
          Key: { userId: varId }
        };
        
        const usuarioByUserId = await dynamoDB.get(getUserIdParams).promise();
        
        if (usuarioByUserId.Item) {
          // Usuário encontrado, prosseguir com a remoção
          const deleteParams = {
            TableName: USUARIOS_TABLE,
            Key: { userId: varId }
          };
          
          await dynamoDB.delete(deleteParams).promise();
          console.log(`✅ Usuário ${varId} removido com sucesso (chave: userId)`);
          return res.json({ 
            message: 'Usuário removido com sucesso',
            id: id,
            keyField: 'userId',
            variationUsed: varId
          });
        }
      } catch (err) {
        console.log(`Tentativa com userId=${varId} falhou:`, err.message);
      }
      
      // 1. Tentar com id como chave simples (mantido para compatibilidade)
      try {
        const getParams = {
          TableName: USUARIOS_TABLE,
          Key: { id: varId }
        };
        
        const usuario = await dynamoDB.get(getParams).promise();
        
        if (usuario.Item) {
          // Usuário encontrado, prosseguir com a remoção
          const deleteParams = {
            TableName: USUARIOS_TABLE,
            Key: { id: varId }
          };
          
          await dynamoDB.delete(deleteParams).promise();
          console.log(`✅ Usuário ${varId} removido com sucesso (chave: id)`);
          return res.json({ 
            message: 'Usuário removido com sucesso',
            id: id,
            keyField: 'id',
            variationUsed: varId
          });
        }
      } catch (err) {
        console.log(`Tentativa com id=${varId} falhou:`, err.message);
      }
      
      // 2. Tentar com usuarioId
      try {
        const getAltParams = {
          TableName: USUARIOS_TABLE,
          Key: { usuarioId: varId }
        };
        
        const usuarioAlt = await dynamoDB.get(getAltParams).promise();
        if (usuarioAlt.Item) {
          console.log('Usuário encontrado usando "usuarioId" como chave.');
          // Deletar usando a chave correta
          const deleteParams = {
            TableName: USUARIOS_TABLE,
            Key: { usuarioId: varId }
          };
          
          await dynamoDB.delete(deleteParams).promise();
          console.log(`✅ Usuário ${varId} removido com sucesso (chave: usuarioId)`);
          return res.json({ 
            message: 'Usuário removido com sucesso',
            id: id,
            keyField: 'usuarioId',
            variationUsed: varId
          });
        }
      } catch (err) {
        console.log(`Tentativa com usuarioId=${varId} falhou:`, err.message);
      }
      
      // 3. Tentar com telefone
      try {
        const getTelParams = {
          TableName: USUARIOS_TABLE,
          Key: { telefone: varId }
        };
        
        const usuarioTel = await dynamoDB.get(getTelParams).promise();
        if (usuarioTel.Item) {
          console.log('Usuário encontrado usando "telefone" como chave.');
          // Deletar usando a chave correta
          const deleteParams = {
            TableName: USUARIOS_TABLE,
            Key: { telefone: varId }
          };
          
          await dynamoDB.delete(deleteParams).promise();
          console.log(`✅ Usuário ${varId} removido com sucesso (chave: telefone)`);
          return res.json({ 
            message: 'Usuário removido com sucesso',
            id: id,
            keyField: 'telefone',
            variationUsed: varId
          });
        }
      } catch (err) {
        console.log(`Tentativa com telefone=${varId} falhou:`, err.message);
      }
      
      // 4. Tentar com phoneNumber
      try {
        const getPhoneParams = {
          TableName: USUARIOS_TABLE,
          Key: { phoneNumber: varId }
        };
        
        const usuarioPhone = await dynamoDB.get(getPhoneParams).promise();
        if (usuarioPhone.Item) {
          console.log('Usuário encontrado usando "phoneNumber" como chave.');
          // Deletar usando a chave correta
          const deleteParams = {
            TableName: USUARIOS_TABLE,
            Key: { phoneNumber: varId }
          };
          
          await dynamoDB.delete(deleteParams).promise();
          console.log(`✅ Usuário ${varId} removido com sucesso (chave: phoneNumber)`);
          return res.json({ 
            message: 'Usuário removido com sucesso',
            id: id,
            keyField: 'phoneNumber',
            variationUsed: varId
          });
        }
      } catch (err) {
        console.log(`Tentativa com phoneNumber=${varId} falhou:`, err.message);
      }
    }
    
    // Última tentativa: usar apenas a parte numérica se houver
    const numericPart = id.replace(/\D/g, '');
    if (numericPart && numericPart !== id) {
      console.log(`Tentando com apenas a parte numérica: ${numericPart}`);
      
      try {
        const getNumParams = {
          TableName: USUARIOS_TABLE,
          Key: { telefone: numericPart }
        };
        
        const usuarioNum = await dynamoDB.get(getNumParams).promise();
        if (usuarioNum.Item) {
          console.log('Usuário encontrado usando parte numérica como telefone.');
          const deleteParams = {
            TableName: USUARIOS_TABLE,
            Key: { telefone: numericPart }
          };
          
          await dynamoDB.delete(deleteParams).promise();
          console.log(`✅ Usuário com telefone ${numericPart} removido com sucesso`);
          return res.json({ 
            message: 'Usuário removido com sucesso',
            id: id,
            keyField: 'telefone',
            variationUsed: numericPart
          });
        }
      } catch (err) {
        console.log(`Tentativa com telefone (parte numérica)=${numericPart} falhou:`, err.message);
      }
    }
    
    // Se chegou aqui, não conseguiu remover o usuário com nenhuma tentativa
    return res.status(404).json({ 
      error: 'Usuário não encontrado', 
      id: id,
      message: 'Não foi possível encontrar o usuário com o ID fornecido em nenhuma das chaves possíveis.',
      variationsTried: idVariations
    });
  } catch (dbError) {
    console.error('❌ Erro ao operar no DynamoDB:', dbError);
    return res.status(500).json({
      error: `Erro na operação: ${dbError.message}`,
      code: dbError.code,
      id: id
    });
  }
}

// Endpoint para atualizar o estágio do usuário
app.put('/api/usuarios/:id/estagio', async (req, res) => {
  const { id } = req.params;
  const { novoEstagio } = req.body;
  
  if (!id || !novoEstagio) {
    return res.status(400).json({ error: 'ID do usuário e novo estágio são obrigatórios' });
  }
  
  try {
    // Mapeamento de estágios do kanban para valores a serem armazenados
    const estagioMapping = {
      'novos': 'novo',
      'onboarding': 'onboarding',
      'em-progresso': 'ativo',
      'concluido': 'inativo'
    };
    
    const estagioAtualizado = estagioMapping[novoEstagio] || novoEstagio;
    
    // Parâmetros para atualizar o usuário
    const params = {
      TableName: USUARIOS_TABLE,
      Key: { id },
      UpdateExpression: "set estagio = :estagio, ultimaAtualizacao = :timestamp",
      ExpressionAttributeValues: {
        ":estagio": estagioAtualizado,
        ":timestamp": new Date().toISOString()
      },
      ReturnValues: "ALL_NEW"
    };
    
    // Atualizar no DynamoDB
    const result = await dynamoDB.update(params).promise();
    
    console.log(`Usuário ${id} movido para estágio: ${novoEstagio}`);
    res.json({ 
      success: true, 
      message: `Usuário movido para ${novoEstagio}`, 
      usuario: result.Attributes 
    });
  } catch (error) {
    console.error(`Erro ao atualizar estágio do usuário ${id}:`, error);
    res.status(500).json({ error: `Erro ao atualizar estágio: ${error.message}` });
  }
});

// Endpoint para dashboards
app.get('/api/dashboards', (req, res) => {
  // Obter a região da AWS para construir os links
  const region = dynamoConfig.region;
  
  res.json({
    region: region,
    dashboards: [
      {
        name: 'Painel de Usuários',
        url: `https://console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=UsuariosDashboard`
      },
      {
        name: 'Métricas de Conteúdo',
        url: `https://console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=ConteudosDashboard`
      },
      {
        name: 'Performance do Sistema',
        url: `https://console.aws.amazon.com/cloudwatch/home?region=${region}#dashboards:name=PerformanceDashboard`
      },
      {
        name: 'Console do DynamoDB',
        url: `https://console.aws.amazon.com/dynamodbv2/home?region=${region}#tables`
      },
      {
        name: 'Console do Lambda',
        url: `https://console.aws.amazon.com/lambda/home?region=${region}#/functions`
      }
    ]
  });
});

// Função para explorar a estrutura da tabela e detectar problemas
async function exploreTableStructure() {
  try {
    console.log('🔍 Explorando estrutura da tabela DynamoDB:', USUARIOS_TABLE);
    
    // Obter metadados da tabela
    // Usar AWS.DynamoDB em vez de DocumentClient para acessar o método describeTable
    const dynamoDBStandard = new AWS.DynamoDB();
    const tableData = await dynamoDBStandard.describeTable({
      TableName: USUARIOS_TABLE
    }).promise();
    
    if (tableData && tableData.Table) {
      const keySchema = tableData.Table.KeySchema;
      const attributeDefs = tableData.Table.AttributeDefinitions;
      
      console.log('📊 Esquema de chave da tabela:');
      keySchema.forEach(key => {
        console.log(`- ${key.AttributeName} (${key.KeyType === 'HASH' ? 'Partition Key' : 'Sort Key'})`);
      });
      
      console.log('📝 Definições de atributos:');
      attributeDefs.forEach(attr => {
        console.log(`- ${attr.AttributeName}: ${attr.AttributeType}`);
      });
      
      // Realizar uma consulta para obter um exemplo de item
      const scanResult = await dynamoDB.scan({
        TableName: USUARIOS_TABLE,
        Limit: 1
      }).promise();
      
      if (scanResult.Items && scanResult.Items.length > 0) {
        const sampleItem = scanResult.Items[0];
        console.log('📋 Exemplo de item na tabela:');
        console.log(JSON.stringify(sampleItem, null, 2));
        
        // Verificar se a chave primária definida está presente no item
        const partitionKey = keySchema.find(k => k.KeyType === 'HASH')?.AttributeName;
        const sortKey = keySchema.find(k => k.KeyType === 'RANGE')?.AttributeName;
        
        if (partitionKey && sampleItem[partitionKey]) {
          console.log(`✅ Chave de partição '${partitionKey}' encontrada no item com valor: ${sampleItem[partitionKey]}`);
        } else if (partitionKey) {
          console.log(`⚠️ Chave de partição '${partitionKey}' NÃO encontrada no item exemplo!`);
        }
        
        if (sortKey && sampleItem[sortKey]) {
          console.log(`✅ Chave de ordenação '${sortKey}' encontrada no item com valor: ${sampleItem[sortKey]}`);
        } else if (sortKey) {
          console.log(`⚠️ Chave de ordenação '${sortKey}' NÃO encontrada no item exemplo!`);
        }
        
        // Verificar campos que podem ser usados como IDs
        const possibleIdFields = ['id', 'usuarioId', 'userId', 'telefone', 'phoneNumber', 'whatsapp', '_id', 'uid'];
        console.log('🔑 Campos potenciais para ID encontrados no item:');
        possibleIdFields.forEach(field => {
          if (sampleItem[field]) {
            console.log(`- ${field}: ${sampleItem[field]}`);
          }
        });
      } else {
        console.log('⚠️ Nenhum item encontrado na tabela para análise');
      }
    } else {
      console.log('❌ Não foi possível obter metadados da tabela');
    }
  } catch (error) {
    console.error('❌ Erro ao explorar estrutura da tabela:', error);
  }
}

// Explorar a estrutura da tabela na inicialização
exploreTableStructure().then(() => {
  console.log('Exploração da tabela concluída');
}).catch(err => {
  console.error('Erro durante a exploração da tabela:', err);
});

// Endpoint de diagnóstico para exibir estrutura de usuários
app.get('/api/diagnostico/usuarios', async (req, res) => {
  console.log('🔍 Solicitação de diagnóstico de usuários recebida');
  
  try {
    // Realizar uma consulta para obter todos os itens da tabela
    const scanParams = {
      TableName: USUARIOS_TABLE,
      Limit: 10 // Limitar para não sobrecarregar a resposta
    };
    
    const scanResult = await dynamoDB.scan(scanParams).promise();
    
    if (scanResult.Items && scanResult.Items.length > 0) {
      // Para cada usuário, analisar a estrutura
      const usuariosAnalisados = scanResult.Items.map(usuario => {
        // Lista de campos importantes que podem ser chaves
        const camposImportantes = ['id', 'userId', 'usuarioId', 'phoneNumber', 'telefone', 'email', '_id', 'uid'];
        const detalhesCampos = {};
        
        // Verificar todos os campos disponíveis
        const todosOsCampos = Object.keys(usuario);
        
        // Para cada campo importante, verificar se existe e obter o valor
        camposImportantes.forEach(campo => {
          detalhesCampos[campo] = usuario[campo] || 'não presente';
        });
        
        return {
          camposChave: detalhesCampos,
          todosOsCampos: todosOsCampos,
          amostraDeDados: usuario
        };
      });
      
      return res.json({
        mensagem: 'Análise de estrutura de usuários',
        numeroDeUsuarios: scanResult.Items.length,
        usuariosAnalisados: usuariosAnalisados
      });
    } else {
      return res.status(404).json({
        erro: 'Nenhum usuário encontrado na tabela',
        tabela: USUARIOS_TABLE
      });
    }
  } catch (error) {
    console.error('❌ Erro ao realizar diagnóstico:', error);
    return res.status(500).json({
      erro: `Erro ao realizar diagnóstico: ${error.message}`,
      codigo: error.code || 'ERRO_DESCONHECIDO'
    });
  }
});

// ======== INICIALIZAÇÃO DO SERVIDOR ========

// Iniciar o servidor após validar a conexão
async function startServer() {
  try {
    // Realizar validação inicial de conexão
    const connectionValid = await validateAwsConnection();
    
    if (!connectionValid) {
      console.warn(`
        ⚠️ AVISO: Problemas de conexão detectados, mas iniciando servidor mesmo assim.
        Alguns recursos podem não funcionar corretamente. Verifique as mensagens acima.
      `);
    }
    
    // Inicie o servidor
    app.listen(PORT, () => {
      console.log('==========================================');
      console.log(`✅ Servidor admin rodando na porta ${PORT}`);
      console.log(`📊 Painel disponível em: http://localhost:${PORT}`);
      console.log('==========================================');
    });
  } catch (error) {
    console.error('❌ ERRO CRÍTICO ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Iniciar o servidor
startServer(); 