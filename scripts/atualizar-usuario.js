/**
 * Script para atualizar diretamente o status do usuário problemático
 * ID: usr69a96806c5e72b8847a3524adb6fcc13
 */

const AWS = require('aws-sdk');

// Configuração AWS
const awsRegion = process.env.AWS_REGION || 'us-east-1';
const USUARIOS_TABLE = process.env.USUARIOS_TABLE || 'antena-app-Users-prod';

// Inicializar AWS SDK
AWS.config.update({
  region: awsRegion,
  maxRetries: 3
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();

// ID do usuário problemático
const USUARIO_ID = 'usr69a96806c5e72b8847a3524adb6fcc13';

// Status a ser definido (pode ser passado como argumento)
const NOVO_STATUS = process.argv[2] || 'ativo';

async function atualizarUsuario() {
  console.log(`Iniciando atualização do usuário ${USUARIO_ID} para status ${NOVO_STATUS}`);
  
  try {
    // 1. Buscar o usuário
    console.log('Buscando usuário...');
    const scanResult = await dynamoDB.scan({
      TableName: USUARIOS_TABLE,
      FilterExpression: "contains(userId, :uid)",
      ExpressionAttributeValues: { ":uid": "69a96806" },
      Limit: 10
    }).promise();
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.error('❌ Usuário não encontrado!');
      return false;
    }
    
    // Encontrar o usuário específico
    const usuario = scanResult.Items.find(item => item.userId === USUARIO_ID);
    
    if (!usuario) {
      console.error('❌ Usuário específico não encontrado entre os resultados!');
      return false;
    }
    
    console.log('✅ Usuário encontrado:', JSON.stringify(usuario).substring(0, 200));
    
    // 2. Atualizar o status
    const usuarioAtualizado = {...usuario};
    usuarioAtualizado.status = NOVO_STATUS;
    usuarioAtualizado.lastUpdated = new Date().toISOString();
    
    // Adicionar campos adicionais conforme o status
    if (NOVO_STATUS === 'onboarding') {
      usuarioAtualizado.onboardingStarted = true;
    } else if (NOVO_STATUS === 'ativo') {
      usuarioAtualizado.onboardingCompleted = true;
      usuarioAtualizado.active = true;
    } else if (NOVO_STATUS === 'concluido') {
      usuarioAtualizado.journeyCompleted = true;
    }
    
    // 3. Salvar o objeto atualizado
    console.log('Salvando usuário atualizado...');
    await dynamoDB.put({
      TableName: USUARIOS_TABLE,
      Item: usuarioAtualizado
    }).promise();
    
    console.log('✅ Usuário atualizado com sucesso!');
    
    // 4. Verificar se a atualização foi aplicada
    console.log('Verificando atualização...');
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
        console.log(`✅ Verificação confirmou status = ${NOVO_STATUS}`);
        return true;
      } else {
        console.log(`⚠️ Verificação falhou: status = ${statusAtual}, esperado = ${NOVO_STATUS}`);
        return false;
      }
    } else {
      console.log('⚠️ Usuário não encontrado na verificação!');
      
      // Tentar verificação alternativa
      const verificacaoAlt = await dynamoDB.scan({
        TableName: USUARIOS_TABLE,
        FilterExpression: "contains(userId, :uid)",
        ExpressionAttributeValues: { ":uid": "69a96806" },
        Limit: 10
      }).promise();
      
      if (verificacaoAlt.Items && verificacaoAlt.Items.length > 0) {
        const usuarioVerificado = verificacaoAlt.Items.find(item => item.userId === USUARIO_ID);
        
        if (usuarioVerificado && usuarioVerificado.status === NOVO_STATUS) {
          console.log(`✅ Verificação alternativa confirmou status = ${NOVO_STATUS}`);
          return true;
        } else if (usuarioVerificado) {
          console.log(`⚠️ Verificação alternativa falhou: status = ${usuarioVerificado.status}, esperado = ${NOVO_STATUS}`);
        } else {
          console.log('⚠️ Usuário não encontrado na verificação alternativa!');
        }
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Erro:', error);
    return false;
  }
}

// Executar a atualização
atualizarUsuario()
  .then(resultado => {
    if (resultado) {
      console.log(`✅ Atualização concluída com sucesso!`);
      process.exit(0);
    } else {
      console.error(`❌ Falha na atualização.`);
      process.exit(1);
    }
  })
  .catch(erro => {
    console.error('❌ Erro fatal:', erro);
    process.exit(1);
  }); 