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
const USUARIOS_TABLE = process?.env?.USUARIOS_TABLE || 'antena-app-Users-prod';
const CONTEUDOS_TABLE = process?.env?.CONTEUDOS_TABLE || 'antena-app-Contents-prod';

console.log(`Tabela de usuários: ${USUARIOS_TABLE}`);
console.log(`Tabela de conteúdos: ${CONTEUDOS_TABLE}`);

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(bodyParser.json());

// Servir o arquivo HTML administrativo
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-server.html'));
});

// ======== FUNÇÕES AUXILIARES ========

// Função para validar conexão AWS
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

// Função para detectar chave primária da tabela
async function detectPrimaryKey(tableName) {
  try {
    const result = await dynamoDB.scan({
      TableName: tableName,
      Limit: 1
    }).promise();

    if (result.Items && result.Items.length > 0) {
      const item = result.Items[0];
      const possibleKeys = ['id', 'usuarioId', 'userId', 'telefone', 'phoneNumber', 'whatsapp', '_id', 'uid'];
      
      for (const key of possibleKeys) {
        if (item[key]) {
          return key;
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`Erro ao detectar chave primária da tabela ${tableName}:`, error);
    return null;
  }
}

// Função para extrair UUID
function extractUUID(id) {
  if (!id) return null;
  
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

// Função para registrar mudança de status
async function logStatusChange(userId, previousStatus, newStatus, keyObj) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Alteração de status para usuário ${userId}:`);
  console.log(`Status anterior: ${previousStatus}`);
  console.log(`Novo status: ${newStatus}`);
  console.log('Chaves utilizadas:', keyObj);
}

// Função para explorar a estrutura da tabela
async function exploreTableStructure() {
  try {
    console.log('🔍 Explorando estrutura da tabela DynamoDB:', USUARIOS_TABLE);
    
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
      
      const scanResult = await dynamoDB.scan({
        TableName: USUARIOS_TABLE,
        Limit: 1
      }).promise();
      
      if (scanResult.Items && scanResult.Items.length > 0) {
        const sampleItem = scanResult.Items[0];
        console.log('📋 Exemplo de item na tabela:');
        console.log(JSON.stringify(sampleItem, null, 2));
        
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
        
        const possibleIdFields = ['id', 'usuarioId', 'userId', 'telefone', 'phoneNumber', 'whatsapp', '_id', 'uid'];
        console.log('🔑 Campos potenciais para ID encontrados no item:');
        possibleIdFields.forEach(field => {
          if (sampleItem[field]) {
            console.log(`- ${field}: ${sampleItem[field]}`);
          }
        });
      }
    }
  } catch (error) {
    console.error('❌ Erro ao explorar estrutura da tabela:', error);
  }
}

// ======== ENDPOINTS DA API ========

// Endpoint de verificação de saúde
app.get('/api/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'online',
      timestamp: new Date().toISOString(),
      aws: await validateAwsConnection(),
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

// Endpoint para listar usuários
app.get('/api/usuarios', async (req, res) => {
  try {
    console.log(`Solicitação recebida para listar usuários da tabela ${USUARIOS_TABLE}`);
    const startTime = Date.now();
    
    const params = {
      TableName: USUARIOS_TABLE,
      Limit: 1000
    };
    
    const result = await dynamoDB.scan(params).promise();
    const endTime = Date.now();
    
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

// IMPORTANTE: Endpoint específico para perfis (deve vir antes do endpoint com parâmetro :id)
app.get('/api/usuarios/perfis', async (req, res) => {
  try {
    console.log('Solicitação recebida para obter perfis de usuários');
    
    const params = {
      TableName: USUARIOS_TABLE,
      Limit: 1000
    };
    
    const result = await dynamoDB.scan(params).promise();
    
    // Verificar se temos resultados
    if (!result || !result.Items || result.Items.length === 0) {
      console.log('⚠️ Nenhum usuário encontrado na tabela');
      return res.json({
        count: 0,
        timestamp: new Date().toISOString(),
        perfis: [],
        message: 'Nenhum usuário encontrado'
      });
    }
    
    console.log(`✅ Encontrados ${result.Items.length} usuários`);
    
    // Extrair apenas informações de perfil básicas para cada usuário
    const perfis = result.Items.map(usuario => {
      // Garantir que teremos um ID
      const usuarioId = usuario.id || usuario.usuarioId || usuario.userId || 
                       usuario.telefone || usuario.phoneNumber || 
                       usuario._id || usuario.uid || 'sem-id';
      
      // Extrair campos relevantes para o perfil
      const { 
        nome, email, telefone, phoneNumber, 
        status, ativo, estagio, dataCriacao, dataAtualizacao,
        perfil, tipo, papel, role, name
      } = usuario;
      
      // Criar objeto de perfil com valores padrão para campos que podem estar ausentes
      return {
        id: usuarioId,
        nome: nome || name || 'Sem nome',
        email: email || 'Não informado',
        telefone: telefone || phoneNumber || 'Não informado',
        status: status || (ativo ? 'ativo' : 'inativo') || 'desconhecido',
        estagio: estagio || 'novo',
        dataCriacao: dataCriacao || dataAtualizacao || new Date().toISOString(),
        dataAtualizacao: dataAtualizacao || dataCriacao || new Date().toISOString(),
        perfil: perfil || {},
        tipo: tipo || 'usuário',
        papel: papel || role || 'membro'
      };
    });
    
    // Garantir que todos os perfis tenham os campos necessários
    const perfisValidados = perfis.filter(p => p && p.id !== 'sem-id');
    
    console.log(`✅ Retornando ${perfisValidados.length} perfis válidos`);
    
    res.json({
      count: perfisValidados.length,
      timestamp: new Date().toISOString(),
      perfis: perfisValidados,
      usuarios: result.Items, // Incluir dados originais para depuração
      status: 'success'
    });
    
  } catch (error) {
    console.error('❌ Erro ao processar solicitação de perfis:', error);
    
    // Responder com erro mais detalhado
    res.status(500).json({
      error: `Erro ao processar perfis: ${error.message}`,
      timestamp: new Date().toISOString(),
      perfis: [],
      count: 0,
      status: 'error',
      errorDetails: {
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        stack: error.stack
      }
    });
  }
});

// Endpoint específico para análise estatística de perfis
app.get('/api/usuarios/estatisticas', async (req, res) => {
  try {
    console.log('Solicitação recebida para análise estatística de perfis de usuários');
    console.log('Endpoint: /api/usuarios/estatisticas - Iniciando processamento');
    
    // Log do ambiente
    console.log(`Ambiente de execução: Tabela=${USUARIOS_TABLE}, Região=${awsRegion}`);
    
    const params = {
      TableName: USUARIOS_TABLE,
      Limit: 1000
    };
    
    console.log('Iniciando scan da tabela de usuários...');
    const result = await dynamoDB.scan(params).promise();
    console.log(`Scan concluído: ${result && result.Items ? result.Items.length : 0} itens encontrados`);
    
    // Verificar se temos resultados
    if (!result || !result.Items || result.Items.length === 0) {
      console.log('⚠️ Nenhum usuário encontrado na tabela para análise estatística');
      return res.json({
        status: 'warning',
        message: 'Nenhum dado de usuário disponível para análise',
        timestamp: new Date().toISOString(),
        estatisticas: {}
      });
    }
    
    console.log(`✅ Analisando ${result.Items.length} usuários para estatísticas`);
    
    const usuarios = result.Items;
    
    // Contador de status
    const statusCount = {};
    usuarios.forEach(usuario => {
      let status = usuario.status;
      if (usuario.ativo === true && !status) status = 'ativo';
      if (usuario.ativo === false && !status) status = 'inativo';
      status = status || 'desconhecido';
      
      statusCount[status] = (statusCount[status] || 0) + 1;
    });
    
    // Contador de estágios
    const estagioCount = {};
    usuarios.forEach(usuario => {
      const estagio = usuario.estagio || 'sem-estagio';
      estagioCount[estagio] = (estagioCount[estagio] || 0) + 1;
    });
    
    // Contador por data de cadastro (mês)
    const cadastrosPorMes = {};
    usuarios.forEach(usuario => {
      if (usuario.dataCriacao) {
        const mes = usuario.dataCriacao.substring(0, 7); // YYYY-MM
        cadastrosPorMes[mes] = (cadastrosPorMes[mes] || 0) + 1;
      }
    });
    
    // Contador por tipo de perfil
    const tipoPerfilCount = {};
    usuarios.forEach(usuario => {
      const tipo = usuario.tipo || usuario.perfil?.tipo || 'padrao';
      tipoPerfilCount[tipo] = (tipoPerfilCount[tipo] || 0) + 1;
    });
    
    // Mapear campos mais comuns
    const camposComuns = {};
    usuarios.forEach(usuario => {
      Object.keys(usuario).forEach(campo => {
        camposComuns[campo] = (camposComuns[campo] || 0) + 1;
      });
    });
    
    // Campos mais frequentes (top 10)
    const camposFrequentes = Object.entries(camposComuns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
    
    const estatisticas = {
      totalUsuarios: usuarios.length,
      porStatus: statusCount,
      porEstagio: estagioCount,
      cadastrosPorMes,
      tiposPerfil: tipoPerfilCount,
      camposFrequentes,
      ultimaAtualizacao: new Date().toISOString()
    };
    
    console.log(`✅ Estatísticas geradas com sucesso: ${Object.keys(estatisticas).length} categorias`);
    console.log('Preparando resposta JSON...');
    
    // Adicionando dados simplificados para debug
    const dadosSimplificados = {
      total: usuarios.length,
      statusCount,
      estagioCount
    };
    
    console.log('Dados simplificados:', JSON.stringify(dadosSimplificados));
    
    return res.json({
      status: 'success',
      estatisticas,
      message: 'Análise estatística concluída',
      timestamp: new Date().toISOString(),
      debug: dadosSimplificados
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar estatísticas de perfis:', error);
    console.error('Stack trace:', error.stack);
    
    // Responder com erro mais detalhado
    return res.status(500).json({
      status: 'error',
      error: `Erro ao gerar estatísticas: ${error.message}`,
      message: 'Nenhum dado de usuário disponível para análise: ' + (error.code || 'Erro desconhecido'),
      timestamp: new Date().toISOString(),
      estatisticas: {},
      errorStack: error.stack
    });
  }
});

// Endpoint para obter perfil de usuário específico
app.get('/api/usuarios/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    console.log(`Solicitação recebida para obter perfil do usuário ${id}`);
    
    // Tentar diferentes variações do ID
    let idVariations = [id];
    
    // Se o ID começa com algum prefixo conhecido, adicionar versão sem prefixo
    const knownPrefixes = ['usr', 'user', 'u-', 'user-', 'id-'];
    for (const prefix of knownPrefixes) {
      if (id.startsWith(prefix)) {
        idVariations.push(id.substring(prefix.length));
      }
    }

    // Se o formato parece ser UUID com prefixo, tentar remover o prefixo
    if (/^[a-z]+[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)) {
      const uuidPart = id.replace(/^[a-z]+/i, '');
      idVariations.push(uuidPart);
      
      const extractedUUID = extractUUID(id);
      if (extractedUUID && !idVariations.includes(extractedUUID)) {
        idVariations.push(extractedUUID);
      }
    }
    
    // Possíveis chaves primárias
    const possibleKeys = ['id', 'usuarioId', 'userId', 'telefone', 'phoneNumber', 'whatsapp', '_id', 'uid'];
    
    // Tentar cada combinação de ID e chave primária
    for (const varId of idVariations) {
      for (const key of possibleKeys) {
        try {
          const params = {
            TableName: USUARIOS_TABLE,
            Key: { [key]: varId }
          };
          
          const result = await dynamoDB.get(params).promise();
          
          if (result.Item) {
            // Adicionar informações extras ao perfil
            const perfil = {
              ...result.Item,
              _meta: {
                tabela: USUARIOS_TABLE,
                chavePrimaria: key,
                idUtilizado: varId,
                idOriginal: id,
                timestamp: new Date().toISOString()
              }
            };
            
            // Calcular há quanto tempo o usuário foi criado/modificado
            if (perfil.dataCriacao) {
              const dataRegistro = new Date(perfil.dataCriacao);
              const agora = new Date();
              const diasDesdeRegistro = Math.floor((agora - dataRegistro) / (1000 * 60 * 60 * 24));
              perfil._meta.diasDesdeRegistro = diasDesdeRegistro;
            }
            
            console.log(`✅ Usuário ${id} encontrado usando chave ${key}=${varId}`);
            return res.json({ perfil, status: 'success' });
          }
        } catch (err) {
          // Continuar tentando com outras combinações
          console.log(`Tentativa com ${key}=${varId} falhou:`, err.message);
        }
      }
    }
    
    // Se chegou aqui, não encontrou o usuário
    console.log(`❌ Usuário ${id} não encontrado após tentar ${idVariations.length} variações de ID`);
    return res.status(404).json({ 
      error: 'Usuário não encontrado',
      id: id,
      message: 'Não foi possível encontrar o usuário com o ID fornecido em nenhuma das chaves possíveis',
      variacoesTentadas: idVariations,
      status: 'error'
    });
    
  } catch (error) {
    console.error(`❌ Erro ao buscar perfil do usuário ${id}:`, error);
    res.status(500).json({
      error: `Erro ao buscar perfil: ${error.message}`,
      id: id,
      stack: error.stack,
      status: 'error'
    });
  }
});

// Endpoint para listar conteúdos
app.get('/api/conteudos', async (req, res) => {
  try {
    console.log(`Solicitação recebida para listar conteúdos da tabela ${CONTEUDOS_TABLE}`);
    const startTime = Date.now();
    
    const params = {
      TableName: CONTEUDOS_TABLE,
      Limit: 1000
    };
    
    const result = await dynamoDB.scan(params).promise();
    const endTime = Date.now();
    
    res.json({
      count: result.Items.length,
      table: params.TableName,
      region: dynamoConfig.region,
      timestamp: new Date().toISOString(),
      conteudos: result.Items,
      status: 'success'
    });
    
  } catch (error) {
    console.error('❌ Erro ao processar solicitação /api/conteudos:', error);
    res.status(500).json({
      error: `Erro ao processar solicitação: ${error.message}`,
      table: CONTEUDOS_TABLE,
      status: 'error'
    });
  }
});

// Endpoints específicos de conteúdos (devem vir antes do endpoint com :id)
app.get('/api/conteudos/pesquisa/:termo', async (req, res) => {
  const termo = req.params.termo;
  
  if (!termo || termo.length < 3) {
    return res.status(400).json({
      error: 'Termo de pesquisa muito curto',
      message: 'Forneça um termo de pesquisa com pelo menos 3 caracteres',
      status: 'error'
    });
  }
  
  try {
    console.log(`Pesquisando conteúdos com termo: "${termo}"`);
    
    const params = {
      TableName: CONTEUDOS_TABLE,
      FilterExpression: 'contains(#titulo, :termo) OR contains(#descricao, :termo) OR contains(#tags, :termo)',
      ExpressionAttributeNames: {
        '#titulo': 'titulo',
        '#descricao': 'descricao',
        '#tags': 'tags'
      },
      ExpressionAttributeValues: {
        ':termo': termo.toLowerCase()
      }
    };
    
    const result = await dynamoDB.scan(params).promise();
    
    console.log(`✅ Pesquisa concluída. ${result.Items.length} resultados encontrados.`);
    res.json({
      count: result.Items.length,
      termo,
      resultados: result.Items,
      status: 'success'
    });
    
  } catch (error) {
    console.error('❌ Erro ao pesquisar conteúdos:', error);
    res.status(500).json({
      error: `Erro ao pesquisar conteúdos: ${error.message}`,
      termo,
      status: 'error'
    });
  }
});

// Endpoint para estatísticas de conteúdos
app.get('/api/conteudos/estatisticas', async (req, res) => {
  try {
    console.log('Gerando estatísticas de conteúdos...');
    
    const params = {
      TableName: CONTEUDOS_TABLE
    };
    
    const result = await dynamoDB.scan(params).promise();
    const conteudos = result.Items || [];
    
    // Calcular estatísticas básicas
    const totalConteudos = conteudos.length;
    
    // Contar por tipo
    const contagemPorTipo = {};
    conteudos.forEach(item => {
      const tipo = item.tipo || 'sem-tipo';
      contagemPorTipo[tipo] = (contagemPorTipo[tipo] || 0) + 1;
    });
    
    // Contar por status
    const contagemPorStatus = {};
    conteudos.forEach(item => {
      const status = item.status || 'sem-status';
      contagemPorStatus[status] = (contagemPorStatus[status] || 0) + 1;
    });
    
    // Contagem por data (mês)
    const contagemPorMes = {};
    conteudos.forEach(item => {
      const data = item.dataCriacao || item.dataPublicacao || item.dataAtualizacao;
      if (data) {
        const mes = data.substring(0, 7); // Formato YYYY-MM
        contagemPorMes[mes] = (contagemPorMes[mes] || 0) + 1;
      }
    });
    
    res.json({
      status: 'success',
      totalConteudos,
      contagemPorTipo,
      contagemPorStatus,
      contagemPorMes,
      ultimaAtualizacao: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar estatísticas de conteúdos:', error);
    res.status(500).json({
      status: 'error',
      error: `Erro ao gerar estatísticas: ${error.message}`,
      message: 'Falha ao gerar estatísticas'
    });
  }
});

// Endpoint para obter conteúdo específico
app.get('/api/conteudos/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    console.log(`Buscando conteúdo com ID: ${id}`);
    
    // Detectar chave primária da tabela de conteúdos
    let primaryKey = 'id'; // Chave padrão
    
    try {
      const testScan = await dynamoDB.scan({
        TableName: CONTEUDOS_TABLE,
        Limit: 1
      }).promise();
      
      if (testScan.Items && testScan.Items.length > 0) {
        const item = testScan.Items[0];
        const possibleKeys = ['id', 'conteudoId', 'contentId', 'slug', 'url', '_id'];
        
        for (const key of possibleKeys) {
          if (item[key]) {
            primaryKey = key;
            break;
          }
        }
      }
    } catch (scanError) {
      console.error(`Erro ao detectar chave primária de conteúdos:`, scanError.message);
    }
    
    // Buscar conteúdo pelo ID
    const params = {
      TableName: CONTEUDOS_TABLE,
      Key: { [primaryKey]: id }
    };
    
    const result = await dynamoDB.get(params).promise();
    
    if (result.Item) {
      res.json({
        status: 'success',
        conteudo: result.Item,
        table: CONTEUDOS_TABLE,
        primaryKey
      });
    } else {
      res.status(404).json({
        status: 'error',
        error: 'Conteúdo não encontrado',
        message: `Conteúdo com ID ${id} não encontrado`,
        id,
        table: CONTEUDOS_TABLE,
        primaryKey
      });
    }
  } catch (error) {
    console.error(`❌ Erro ao buscar conteúdo ${id}:`, error);
    res.status(500).json({
      status: 'error',
      error: `Erro ao buscar conteúdo: ${error.message}`,
      id
    });
  }
});

// ======== ENDPOINTS DO KANBAN DE USUÁRIOS ========

// Endpoint para obter o quadro Kanban de usuários
app.get('/api/kanban/usuarios', async (req, res) => {
  try {
    console.log('Gerando dados do Kanban de usuários...');
    
    const params = {
      TableName: USUARIOS_TABLE
    };
    
    const result = await dynamoDB.scan(params).promise();
    const usuarios = result.Items;
    
    // Agrupar usuários por estágio/status
    const estagios = {
      novos: [],
      onboarding: [],
      emProgresso: [],
      concluido: [],
      inativo: []
    };
    
    usuarios.forEach(usuario => {
      // Determinar o estágio do usuário
      let estagio = usuario.estagio || 'novos';
      
      // Mapeamento de diferentes formatos de estágio
      if (usuario.status === 'ativo' || usuario.ativo === true) {
        estagio = 'emProgresso';
      } else if (usuario.status === 'inativo' || usuario.ativo === false) {
        estagio = 'inativo';
      } else if (usuario.status === 'pendente' || usuario.estagio === 'onboarding') {
        estagio = 'onboarding';
      } else if (usuario.status === 'completo' || usuario.estagio === 'concluido') {
        estagio = 'concluido';
      }
      
      // Adicionar ao grupo apropriado
      if (estagios.hasOwnProperty(estagio)) {
        estagios[estagio].push(usuario);
      } else {
        estagios.novos.push(usuario);
      }
    });
    
    res.json({
      kanban: {
        totalUsuarios: usuarios.length,
        estagios
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar dados do Kanban:', error);
    res.status(500).json({
      error: `Erro ao gerar dados do Kanban: ${error.message}`
    });
  }
});

// Endpoint para mover usuário entre estágios no Kanban
app.put('/api/kanban/usuarios/:id/mover', async (req, res) => {
  const id = req.params.id;
  const { origem, destino } = req.body;
  
  if (!origem || !destino) {
    return res.status(400).json({
      error: 'Dados insuficientes',
      message: 'É necessário informar os estágios de origem e destino'
    });
  }
  
  try {
    console.log(`Movendo usuário ${id} de "${origem}" para "${destino}"`);
    
    // Mapeamento de estágios do kanban para valores no banco
    const estagioParaStatusMap = {
      'novos': 'novo',
      'onboarding': 'pendente',
      'emProgresso': 'ativo',
      'concluido': 'completo',
      'inativo': 'inativo'
    };
    
    // Detectar chave primária
    const primaryKey = await detectPrimaryKey(USUARIOS_TABLE);
    if (!primaryKey) {
      return res.status(500).json({ error: 'Não foi possível detectar a chave primária da tabela' });
    }
    
    // Obter usuário atual
    const getParams = {
      TableName: USUARIOS_TABLE,
      Key: { [primaryKey]: id }
    };
    
    const usuarioAtual = await dynamoDB.get(getParams).promise();
    
    if (!usuarioAtual.Item) {
      return res.status(404).json({
        error: 'Usuário não encontrado',
        id
      });
    }
    
    // Atualizar estágio e status
    const updateParams = {
      TableName: USUARIOS_TABLE,
      Key: { [primaryKey]: id },
      UpdateExpression: 'SET estagio = :estagio, #status = :status, ultimaAtualizacao = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':estagio': destino,
        ':status': estagioParaStatusMap[destino] || 'ativo',
        ':timestamp': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamoDB.update(updateParams).promise();
    
    // Registrar a transição
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Usuário ${id} movido de "${origem}" para "${destino}"`);
    
    res.json({
      message: `Usuário movido com sucesso para ${destino}`,
      usuario: result.Attributes,
      transicao: {
        de: origem,
        para: destino,
        timestamp
      }
    });
    
  } catch (error) {
    console.error(`❌ Erro ao mover usuário ${id} no Kanban:`, error);
    res.status(500).json({
      error: `Erro ao mover usuário: ${error.message}`,
      id
    });
  }
});

// Endpoint para estatísticas do Kanban
app.get('/api/kanban/estatisticas', async (req, res) => {
  try {
    console.log('Gerando estatísticas do Kanban...');
    
    const result = await dynamoDB.scan({ TableName: USUARIOS_TABLE }).promise();
    const usuarios = result.Items;
    
    // Contar usuários por estágio
    const contagemPorEstagio = {
      novos: 0,
      onboarding: 0,
      emProgresso: 0,
      concluido: 0,
      inativo: 0
    };
    
    // Média de tempo em cada estágio (em dias)
    const tempoMedioPorEstagio = {
      novos: 0,
      onboarding: 0,
      emProgresso: 0,
      concluido: 0
    };
    
    // Contagens para calcular as médias
    const contagens = {
      novos: 0,
      onboarding: 0,
      emProgresso: 0,
      concluido: 0
    };
    
    // Analisar cada usuário
    usuarios.forEach(usuario => {
      // Determinar estágio
      let estagio = usuario.estagio || 'novos';
      
      if (usuario.status === 'ativo' || usuario.ativo === true) {
        estagio = 'emProgresso';
      } else if (usuario.status === 'inativo' || usuario.ativo === false) {
        estagio = 'inativo';
      } else if (usuario.status === 'pendente' || usuario.estagio === 'onboarding') {
        estagio = 'onboarding';
      } else if (usuario.status === 'completo' || usuario.estagio === 'concluido') {
        estagio = 'concluido';
      }
      
      // Incrementar contagem
      if (contagemPorEstagio.hasOwnProperty(estagio)) {
        contagemPorEstagio[estagio]++;
      }
      
      // Calcular tempo no estágio atual, se tiver datas
      if (usuario.dataEntradaEstagio && contagens.hasOwnProperty(estagio)) {
        const dataEntrada = new Date(usuario.dataEntradaEstagio);
        const agora = new Date();
        const diasNoEstagio = Math.floor((agora - dataEntrada) / (1000 * 60 * 60 * 24));
        
        tempoMedioPorEstagio[estagio] += diasNoEstagio;
        contagens[estagio]++;
      }
    });
    
    // Calcular médias finais
    Object.keys(tempoMedioPorEstagio).forEach(estagio => {
      if (contagens[estagio] > 0) {
        tempoMedioPorEstagio[estagio] = Math.round(tempoMedioPorEstagio[estagio] / contagens[estagio]);
      }
    });
    
    // Calcular taxas de conversão
    const taxasConversao = {
      'novos_para_onboarding': contagemPorEstagio.novos > 0 ? 
        (contagemPorEstagio.onboarding / contagemPorEstagio.novos * 100).toFixed(1) + '%' : '0%',
      'onboarding_para_emProgresso': contagemPorEstagio.onboarding > 0 ? 
        (contagemPorEstagio.emProgresso / contagemPorEstagio.onboarding * 100).toFixed(1) + '%' : '0%',
      'emProgresso_para_concluido': contagemPorEstagio.emProgresso > 0 ? 
        (contagemPorEstagio.concluido / contagemPorEstagio.emProgresso * 100).toFixed(1) + '%' : '0%'
    };
    
    res.json({
      totalUsuarios: usuarios.length,
      contagemPorEstagio,
      tempoMedioPorEstagio,
      taxasConversao,
      ultimaAtualizacao: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar estatísticas do Kanban:', error);
    res.status(500).json({
      error: `Erro ao gerar estatísticas: ${error.message}`
    });
  }
});

// Endpoint para adicionar uma anotação a um usuário
app.post('/api/usuarios/:id/anotacoes', async (req, res) => {
  const id = req.params.id;
  const { texto, autor } = req.body;
  
  if (!texto) {
    return res.status(400).json({ error: 'O texto da anotação é obrigatório' });
  }
  
  try {
    // Detectar chave primária
    const primaryKey = await detectPrimaryKey(USUARIOS_TABLE);
    if (!primaryKey) {
      return res.status(500).json({ error: 'Não foi possível detectar a chave primária da tabela' });
    }
    
    // Obter o usuário primeiro
    const getParams = {
      TableName: USUARIOS_TABLE,
      Key: { [primaryKey]: id }
    };
    
    const usuarioAtual = await dynamoDB.get(getParams).promise();
    
    if (!usuarioAtual.Item) {
      return res.status(404).json({
        error: 'Usuário não encontrado',
        id
      });
    }
    
    // Criar a anotação
    const anotacao = {
      id: Date.now().toString(),
      texto,
      autor: autor || 'Sistema',
      data: new Date().toISOString()
    };
    
    // Adicionar a anotação ao usuário
    const anotacoes = usuarioAtual.Item.anotacoes || [];
    anotacoes.push(anotacao);
    
    // Atualizar o usuário
    const updateParams = {
      TableName: USUARIOS_TABLE,
      Key: { [primaryKey]: id },
      UpdateExpression: 'SET anotacoes = :anotacoes, ultimaAtualizacao = :timestamp',
      ExpressionAttributeValues: {
        ':anotacoes': anotacoes,
        ':timestamp': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamoDB.update(updateParams).promise();
    
    console.log(`✅ Anotação adicionada ao usuário ${id}`);
    res.status(201).json({
      message: 'Anotação adicionada com sucesso',
      anotacao,
      usuario: result.Attributes
    });
    
  } catch (error) {
    console.error(`❌ Erro ao adicionar anotação ao usuário ${id}:`, error);
    res.status(500).json({
      error: `Erro ao adicionar anotação: ${error.message}`,
      id
    });
  }
});

// Endpoint para atualizar status do usuário
app.put('/api/usuarios/:id/status', async (req, res) => {
  try {
    const userId = req.params.id;
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status não fornecido' });
    }
    
    // Detectar chave primária
    const primaryKey = await detectPrimaryKey(USUARIOS_TABLE);
    if (!primaryKey) {
      return res.status(500).json({ error: 'Não foi possível detectar a chave primária da tabela' });
    }
    
    // Tentar atualizar com a chave primária detectada
    const updateParams = {
      TableName: USUARIOS_TABLE,
      Key: { [primaryKey]: userId },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status
      },
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamoDB.update(updateParams).promise();
    
    await logStatusChange(userId, result.Attributes.status, status, { primaryKey });
    
    res.json({
      message: 'Status atualizado com sucesso',
      usuario: result.Attributes,
      status: 'success'
    });
    
  } catch (error) {
    console.error('Erro ao atualizar status do usuário:', error);
    res.status(500).json({
      error: `Erro ao atualizar status: ${error.message}`,
      stack: error.stack,
      status: 'error'
    });
  }
});

// Endpoint para remover usuário
app.delete('/api/usuarios/:id', async (req, res) => {
  const id = req.params.id;
  console.log(`⚠️ Solicitação de remoção de usuário recebida. ID: ${id}`);
  
  try {
    // Criar variações do ID para tentar
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
      
      const extractedUUID = extractUUID(id);
      if (extractedUUID && !idVariations.includes(extractedUUID)) {
        idVariations.push(extractedUUID);
        console.log(`UUID extraído e formatado: ${extractedUUID}`);
      }
    }
    
    // Tentar remover com cada variação do ID
    for (const varId of idVariations) {
      console.log(`Tentando deleção com variação do ID: ${varId}`);
      
      // Tentar com userId
      try {
        const getUserIdParams = {
          TableName: USUARIOS_TABLE,
          Key: { userId: varId }
        };
        
        const usuarioByUserId = await dynamoDB.get(getUserIdParams).promise();
        
        if (usuarioByUserId.Item) {
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
            variationUsed: varId,
            status: 'success'
          });
        }
      } catch (err) {
        console.log(`Tentativa com userId=${varId} falhou:`, err.message);
      }
      
      // Tentar com id
      try {
        const getParams = {
          TableName: USUARIOS_TABLE,
          Key: { id: varId }
        };
        
        const usuario = await dynamoDB.get(getParams).promise();
        
        if (usuario.Item) {
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
            variationUsed: varId,
            status: 'success'
          });
        }
      } catch (err) {
        console.log(`Tentativa com id=${varId} falhou:`, err.message);
      }
      
      // Tentar com usuarioId
      try {
        const getAltParams = {
          TableName: USUARIOS_TABLE,
          Key: { usuarioId: varId }
        };
        
        const usuarioAlt = await dynamoDB.get(getAltParams).promise();
        if (usuarioAlt.Item) {
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
            variationUsed: varId,
            status: 'success'
          });
        }
      } catch (err) {
        console.log(`Tentativa com usuarioId=${varId} falhou:`, err.message);
      }
      
      // Tentar com telefone
      try {
        const getTelParams = {
          TableName: USUARIOS_TABLE,
          Key: { telefone: varId }
        };
        
        const usuarioTel = await dynamoDB.get(getTelParams).promise();
        if (usuarioTel.Item) {
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
            variationUsed: varId,
            status: 'success'
          });
        }
      } catch (err) {
        console.log(`Tentativa com telefone=${varId} falhou:`, err.message);
      }
    }
    
    // Se chegou aqui, não conseguiu remover o usuário
    return res.status(404).json({ 
      error: 'Usuário não encontrado', 
      id: id,
      message: 'Não foi possível encontrar o usuário com o ID fornecido em nenhuma das chaves possíveis.',
      variationsTried: idVariations,
      status: 'error'
    });
    
  } catch (error) {
    console.error('❌ Erro ao remover usuário:', error);
    return res.status(500).json({
      error: `Erro na operação: ${error.message}`,
      code: error.code || 'ERROR',
      id: id,
      status: 'error'
    });
  }
});

// Endpoint para atualizar estágio do usuário
app.put('/api/usuarios/:id/estagio', async (req, res) => {
  const { id } = req.params;
  const { novoEstagio } = req.body;
  
  if (!id || !novoEstagio) {
    return res.status(400).json({ 
      error: 'ID do usuário e novo estágio são obrigatórios',
      status: 'error'
    });
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
    
    // Detectar chave primária
    const primaryKey = await detectPrimaryKey(USUARIOS_TABLE);
    if (!primaryKey) {
      return res.status(500).json({ 
        error: 'Não foi possível detectar a chave primária da tabela',
        status: 'error'
      });
    }
    
    // Parâmetros para atualizar o usuário
    const params = {
      TableName: USUARIOS_TABLE,
      Key: { [primaryKey]: id },
      UpdateExpression: "set estagio = :estagio, ultimaAtualizacao = :timestamp",
      ExpressionAttributeValues: {
        ":estagio": estagioAtualizado,
        ":timestamp": new Date().toISOString()
      },
      ReturnValues: "ALL_NEW"
    };
    
    const result = await dynamoDB.update(params).promise();
    
    console.log(`Usuário ${id} movido para estágio: ${novoEstagio}`);
    res.json({ 
      success: true, 
      message: `Usuário movido para ${novoEstagio}`, 
      usuario: result.Attributes,
      status: 'success'
    });
  } catch (error) {
    console.error(`Erro ao atualizar estágio do usuário ${id}:`, error);
    res.status(500).json({ 
      error: `Erro ao atualizar estágio: ${error.message}`,
      status: 'error'
    });
  }
});

// Endpoint para dashboards
app.get('/api/dashboards', (req, res) => {
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
    ],
    status: 'success'
  });
});

// Explorar a estrutura da tabela na inicialização
exploreTableStructure().then(() => {
  console.log('Exploração da tabela concluída');
}).catch(err => {
  console.error('Erro durante a exploração da tabela:', err);
});

// Iniciar servidor
async function startServer() {
  try {
    const connectionValid = await validateAwsConnection();
    
    if (!connectionValid) {
      console.warn(`
        ⚠️ AVISO: Problemas de conexão detectados, mas iniciando servidor mesmo assim.
        Alguns recursos podem não funcionar corretamente. Verifique as mensagens acima.
      `);
    }
    
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

startServer(); 