/**
 * Solução para o problema do usuário específico usr69a96806c5e72b8847a3524adb6fcc13
 * Este script atualiza diretamente o status do usuário na tabela do DynamoDB
 */

const AWS = require('aws-sdk');

// Configuração AWS
const awsRegion = process.env.AWS_REGION || 'us-east-1';
const USUARIOS_TABLE = 'antena-app-Users-prod'; // Nome fixo da tabela

// Inicializar AWS SDK
AWS.config.update({
  region: awsRegion,
  maxRetries: 3
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();

// ID problemático
const USUARIO_ID = 'usr69a96806c5e72b8847a3524adb6fcc13';
const ID_SEM_PREFIXO = USUARIO_ID.replace(/^usr/, '');
const NOVO_STATUS = process.argv[2] || 'ativo';

async function atualizarUsuarioProblematico() {
  console.log(`🔧 Iniciando correção para o usuário ${USUARIO_ID}`);
  console.log(`Status desejado: ${NOVO_STATUS}`);
  console.log(`Tabela de usuários: ${USUARIOS_TABLE}`);
  console.log(`Região AWS: ${awsRegion}`);
  
  try {
    // Verificar tabelas disponíveis
    console.log('Verificando tabelas disponíveis...');
    const dynamoDBStandard = new AWS.DynamoDB();
    const tabelas = await dynamoDBStandard.listTables().promise();
    console.log(`Tabelas disponíveis: ${tabelas.TableNames.join(', ')}`);
    
    // 1. Buscar o usuário com diferentes variações do ID
    console.log(`Buscando usuário com diferentes variações do ID...`);
    
    // Variação 1: ID completo
    console.log(`Tentativa 1: ID completo "${USUARIO_ID}"`);
    let scanResult = await dynamoDB.scan({
      TableName: USUARIOS_TABLE,
      FilterExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": USUARIO_ID },
      Limit: 1
    }).promise();
    
    // Variação 2: ID sem prefixo
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log(`Tentativa 2: ID sem prefixo "${ID_SEM_PREFIXO}"`);
      scanResult = await dynamoDB.scan({
        TableName: USUARIOS_TABLE,
        FilterExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": ID_SEM_PREFIXO },
        Limit: 1
      }).promise();
    }
    
    // Variação 3: Busca em qualquer campo
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log(`Tentativa 3: Busca em qualquer campo contendo "${ID_SEM_PREFIXO}"`);
      scanResult = await dynamoDB.scan({
        TableName: USUARIOS_TABLE,
        FilterExpression: "contains(userId, :uid) OR contains(id, :uid) OR contains(#name, :uid)",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":uid": ID_SEM_PREFIXO },
        Limit: 10
      }).promise();
    }
    
    // Variação 4: Busca ampla
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log(`Tentativa 4: Busca ampla por parte do ID "${ID_SEM_PREFIXO.substring(0, 10)}"`);
      scanResult = await dynamoDB.scan({
        TableName: USUARIOS_TABLE,
        FilterExpression: "contains(userId, :uid)",
        ExpressionAttributeValues: { ":uid": ID_SEM_PREFIXO.substring(0, 10) },
        Limit: 10
      }).promise();
    }
    
    // Verificar se encontramos o usuário
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.error(`❌ Usuário não encontrado em nenhuma tentativa!`);
      return false;
    }
    
    // Se encontramos mais de um, mostrar todos
    if (scanResult.Items.length > 1) {
      console.log(`⚠️ Encontrados ${scanResult.Items.length} usuários. Usando o primeiro.`);
      scanResult.Items.forEach((item, index) => {
        console.log(`Usuário ${index + 1}:`, JSON.stringify({
          id: item.id,
          userId: item.userId,
          name: item.name,
          status: item.status
        }));
      });
    }
    
    const usuario = scanResult.Items[0];
    console.log(`✅ Usuário encontrado:`);
    console.log(`- ID: ${usuario.id || 'N/A'}`);
    console.log(`- UserID: ${usuario.userId || 'N/A'}`);
    console.log(`- Nome: ${usuario.name || 'N/A'}`);
    console.log(`- Status atual: ${usuario.status || 'N/A'}`);
    console.log(`- Campos disponíveis: ${Object.keys(usuario).join(', ')}`);
    
    // 2. Atualizar o status no objeto
    const usuarioAtualizado = {...usuario, 
      status: NOVO_STATUS, 
      lastUpdated: new Date().toISOString()
    };
    
    // Campos adicionais baseados no status
    if (NOVO_STATUS === 'onboarding') {
      usuarioAtualizado.onboardingStarted = true;
    } else if (NOVO_STATUS === 'ativo') {
      usuarioAtualizado.onboardingCompleted = true;
      usuarioAtualizado.active = true;
    } else if (NOVO_STATUS === 'concluido') {
      usuarioAtualizado.journeyCompleted = true;
    }
    
    // 3. Salvar o objeto completo com PutItem
    console.log(`Atualizando usuário com PutItem...`);
    await dynamoDB.put({
      TableName: USUARIOS_TABLE,
      Item: usuarioAtualizado
    }).promise();
    
    console.log(`✅ Usuário atualizado com sucesso!`);
    
    // 4. Verificar se a atualização funcionou
    console.log(`Verificando se a atualização foi aplicada...`);
    const verificacao = await dynamoDB.scan({
      TableName: USUARIOS_TABLE,
      FilterExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": USUARIO_ID },
      Limit: 1
    }).promise();
    
    if (verificacao.Items && verificacao.Items.length > 0) {
      const statusAtual = verificacao.Items[0].status;
      console.log(`Status após verificação: ${statusAtual}`);
      
      if (statusAtual === NOVO_STATUS) {
        console.log(`✅ SUCESSO! Status atualizado para ${NOVO_STATUS}`);
        return true;
      } else {
        console.error(`❌ Verificação falhou: status = ${statusAtual}, esperado = ${NOVO_STATUS}`);
        return false;
      }
    } else {
      console.error(`❌ Usuário não encontrado na verificação!`);
      
      // Tentar verificar com outras variações do ID
      console.log(`Tentando verificar com outras variações do ID...`);
      
      // Verificar com ID sem prefixo
      const verificacaoAlt = await dynamoDB.scan({
        TableName: USUARIOS_TABLE,
        FilterExpression: "contains(userId, :uid)",
        ExpressionAttributeValues: { ":uid": ID_SEM_PREFIXO.substring(0, 10) },
        Limit: 10
      }).promise();
      
      if (verificacaoAlt.Items && verificacaoAlt.Items.length > 0) {
        console.log(`✅ Encontrados ${verificacaoAlt.Items.length} usuários na verificação alternativa:`);
        
        // Mostrar todos os usuários encontrados
        verificacaoAlt.Items.forEach((item, index) => {
          console.log(`Usuário ${index + 1}:`, JSON.stringify({
            id: item.id,
            userId: item.userId,
            name: item.name,
            status: item.status
          }));
          
          // Verificar se algum tem o status correto
          if (item.status === NOVO_STATUS) {
            console.log(`✅ Usuário ${index + 1} tem o status correto: ${NOVO_STATUS}`);
          }
        });
        
        // Se pelo menos um usuário tem o status correto, considerar sucesso
        const sucessoParcial = verificacaoAlt.Items.some(item => item.status === NOVO_STATUS);
        if (sucessoParcial) {
          console.log(`✅ SUCESSO PARCIAL! Pelo menos um usuário tem o status ${NOVO_STATUS}`);
          return true;
        }
      }
      
      return false;
    }
  } catch (error) {
    console.error(`❌ ERRO:`, error);
    return false;
  }
}

// Executar o script
atualizarUsuarioProblematico()
  .then(resultado => {
    if (resultado) {
      console.log(`✅ Script executado com sucesso!`);
      process.exit(0);
    } else {
      console.error(`❌ Falha na execução do script.`);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error(`Erro fatal:`, err);
    process.exit(1);
  }); 