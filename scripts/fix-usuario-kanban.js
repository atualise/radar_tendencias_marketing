/**
 * Script para corrigir o problema de atualização de status do usuário específico
 * ID: usr69a96806c5e72b8847a3524adb6fcc13
 * 
 * Este script usa PutItem em vez de UpdateItem para garantir que o status seja atualizado corretamente
 */

const express = require('express');
const cors = require('cors');
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');

// Inicializar o express
const app = express();
const PORT = process.env.PORT || 3001; // Porta diferente para não conflitar

// Configuração AWS
const awsRegion = process.env.AWS_REGION || 'us-east-1';
const USUARIOS_TABLE = process.env.USUARIOS_TABLE || 'antena-app-Users-prod';

// Inicializar AWS SDK
AWS.config.update({
  region: awsRegion,
  maxRetries: 3
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Middleware
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// Endpoint para atualizar o status do usuário problemático
app.post('/api/fix-usuario/:userId/status', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { status } = req.body;
    
    if (!userId || !status) {
      return res.status(400).json({
        error: 'ID do usuário e status são obrigatórios',
        success: false
      });
    }
    
    console.log(`Solicitação para atualizar status do usuário ${userId} para ${status}`);
    
    // Buscar o usuário completo com scan
    console.log(`Buscando usuário com scan...`);
    const scanResult = await dynamoDB.scan({
      TableName: USUARIOS_TABLE,
      FilterExpression: "contains(userId, :uid)",
      ExpressionAttributeValues: { ":uid": userId.substring(3, 10) }, // Usar parte do ID para busca
      Limit: 10
    }).promise();
    
    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log(`❌ Usuário não encontrado no scan`);
      return res.status(404).json({
        error: 'Usuário não encontrado',
        success: false
      });
    }
    
    console.log(`✅ Encontrados ${scanResult.Items.length} resultados no scan`);
    
    // Encontrar o usuário específico
    const usuario = scanResult.Items.find(item => item.userId === userId);
    
    if (!usuario) {
      console.log(`❌ Usuário específico não encontrado entre os resultados`);
      return res.status(404).json({
        error: 'Usuário específico não encontrado',
        success: false
      });
    }
    
    console.log(`✅ Usuário encontrado:`, JSON.stringify(usuario).substring(0, 200));
    
    // Atualizar o status no objeto
    const usuarioAtualizado = {...usuario};
    usuarioAtualizado.status = status;
    usuarioAtualizado.lastUpdated = new Date().toISOString();
    
    // Adicionar campos adicionais conforme o status
    if (status === 'onboarding') {
      usuarioAtualizado.onboardingStarted = true;
    } else if (status === 'ativo') {
      usuarioAtualizado.onboardingCompleted = true;
      usuarioAtualizado.active = true;
    } else if (status === 'concluido') {
      usuarioAtualizado.journeyCompleted = true;
    }
    
    // Salvar o objeto completo com PutItem
    console.log(`Salvando usuário com PutItem...`);
    await dynamoDB.put({
      TableName: USUARIOS_TABLE,
      Item: usuarioAtualizado
    }).promise();
    
    console.log(`✅ Usuário atualizado com sucesso!`);
    
    // Verificar se a atualização foi aplicada
    console.log(`Verificando se a atualização foi aplicada...`);
    const verificacao = await dynamoDB.scan({
      TableName: USUARIOS_TABLE,
      FilterExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      Limit: 1
    }).promise();
    
    if (verificacao.Items && verificacao.Items.length > 0) {
      const statusAtual = verificacao.Items[0].status;
      console.log(`Status após verificação: ${statusAtual}`);
      
      if (statusAtual === status) {
        console.log(`✅ Verificação confirmou status = ${status}`);
        return res.json({
          success: true,
          message: `Status do usuário ${userId} atualizado para ${status}`,
          user: verificacao.Items[0],
          verificado: true
        });
      } else {
        console.log(`⚠️ Verificação falhou: status = ${statusAtual}, esperado = ${status}`);
        return res.json({
          success: true,
          message: `Status atualizado, mas verificação falhou`,
          user: verificacao.Items[0],
          verificado: false
        });
      }
    } else {
      console.log(`⚠️ Usuário não encontrado na verificação`);
      return res.json({
        success: true,
        message: `Status atualizado, mas usuário não encontrado na verificação`,
        verificado: false
      });
    }
  } catch (error) {
    console.error(`❌ Erro ao atualizar usuário:`, error);
    return res.status(500).json({
      error: `Erro ao atualizar usuário: ${error.message}`,
      success: false
    });
  }
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor de correção rodando na porta ${PORT}`);
  console.log(`Endpoint disponível em: http://localhost:${PORT}/api/fix-usuario/:userId/status`);
  console.log(`Para testar: curl -X POST -H "Content-Type: application/json" -d '{"status":"onboarding"}' http://localhost:${PORT}/api/fix-usuario/usr69a96806c5e72b8847a3524adb6fcc13/status`);
}); 