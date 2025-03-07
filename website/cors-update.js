// Função para fazer um backup da função Lambda atual
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda({
    region: 'us-east-1'
});

const FUNCTION_NAME = 'antena-app-ProcessadorLeads-prod';

// Primeiro, baixamos o código da função atual
lambda.getFunction({ FunctionName: FUNCTION_NAME }, (err, data) => {
    if (err) {
        console.error('Erro ao obter função Lambda:', err);
        return;
    }
    
    // O código está disponível como um objeto S3, então precisamos fazer download
    const s3Location = data.Code.Location;
    
    // Agora fazemos o upload do código atualizado
    const fs = require('fs');
    const path = require('path');
    const https = require('https');
    const { execSync } = require('child_process');
    
    // Baixar o código atual
    https.get(s3Location, (res) => {
        const writeStream = fs.createWriteStream('./backup.zip');
        res.pipe(writeStream);
        
        writeStream.on('finish', () => {
            console.log('Backup do código Lambda feito com sucesso');
            
            // Extrair o código para um diretório
            const extractDir = './lambda-extract';
            if (!fs.existsSync(extractDir)) {
                fs.mkdirSync(extractDir);
            }
            
            execSync(`unzip -o backup.zip -d ${extractDir}`);
            console.log('Código extraído para:', extractDir);
            
            // Ler o arquivo index.js
            const indexPath = path.join(extractDir, 'index.js');
            let codeContent = fs.readFileSync(indexPath, 'utf8');
            
            // Modificar o código para garantir os cabeçalhos CORS
            codeContent = codeContent.replace(
                // Definindo headers comuns para CORS
                /const headers = \{[^}]*\}/s,
                `const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://antena.atualise.com',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Origin,X-Requested-With,Accept',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Access-Control-Allow-Credentials': 'true'
    }`
            );
            
            // Escrever o código modificado de volta
            fs.writeFileSync(indexPath, codeContent);
            console.log('Código Lambda atualizado com cabeçalhos CORS');
            
            // Criar um novo arquivo zip com o código atualizado
            execSync(`cd ${extractDir} && zip -r ../updated-lambda.zip *`);
            console.log('Novo arquivo ZIP criado: updated-lambda.zip');
            
            // Fazer upload do código atualizado para o Lambda
            const zipContent = fs.readFileSync('./updated-lambda.zip');
            
            lambda.updateFunctionCode({
                FunctionName: FUNCTION_NAME,
                ZipFile: zipContent
            }, (updateErr, updateData) => {
                if (updateErr) {
                    console.error('Erro ao atualizar função Lambda:', updateErr);
                    return;
                }
                
                console.log('Função Lambda atualizada com sucesso:', updateData.FunctionName);
            });
        });
    });
}); 