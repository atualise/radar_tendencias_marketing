# Painel Administrativo - Comunidades Online

Este documento descreve o painel administrativo desenvolvido para gerenciamento de usuários e conteúdos da plataforma Comunidades Online.

## Arquitetura

### Visão Geral

O painel administrativo é implementado como um servidor Node.js independente que se conecta diretamente ao DynamoDB da AWS para gerenciar usuários e conteúdos. A arquitetura segue um modelo cliente-servidor simples:

```
+----------------+      +----------------+      +----------------+
|                |      |                |      |                |
|  Frontend      |<---->|  Servidor      |<---->|  DynamoDB     |
|  (HTML/JS/CSS) |      |  (Express/Node)|      |  (AWS)        |
|                |      |                |      |                |
+----------------+      +----------------+      +----------------+
```

### Tecnologias Utilizadas

- **Backend**: 
  - Node.js 
  - Express.js para API REST
  - AWS SDK para integração com DynamoDB
  
- **Frontend**: 
  - HTML5, CSS3, JavaScript
  - Bootstrap 4.5.2 para UI
  - jQuery para manipulação DOM
  - Chart.js para visualizações e gráficos

### Estrutura de Dados

O sistema interage com duas tabelas principais no DynamoDB:

1. **Usuários** (`USUARIOS_TABLE`): Armazena informações sobre os usuários da plataforma
   - Chave primária: `userId` (ou detectada automaticamente)
   - Atributos principais: nome, email, telefone, status, preferências, perfil

2. **Conteúdos** (`CONTEUDOS_TABLE`): Armazena conteúdos gerados na plataforma
   - Chave primária: `contentId` (ou detectada automaticamente)
   - Atributos principais: título, conteúdo, autor, tipo, data de criação

## Funcionalidades

### Endpoints da API

#### Verificação de Saúde
- **GET /api/health**: Verifica a saúde do servidor e conexão com AWS
- **GET /api/diagnostico/aws**: Executa diagnóstico detalhado da conexão AWS

#### Usuários
- **GET /api/usuarios**: Lista todos os usuários
- **GET /api/usuarios/perfis**: Obtém estatísticas de perfis de usuários 
- **GET /api/usuarios/estatisticas**: Calcula estatísticas detalhadas dos usuários
- **GET /api/usuarios/:id**: Obtém detalhes de um usuário específico
- **PUT /api/usuarios/:id/status**: Atualiza o status de um usuário
- **PUT /api/usuarios/:id/estagio**: Atualiza o estágio de um usuário no fluxo
- **DELETE /api/usuarios/:id**: Remove um usuário
- **POST /api/usuarios/:id/anotacoes**: Adiciona anotações a um usuário

#### Conteúdos
- **GET /api/conteudos**: Lista todos os conteúdos
- **GET /api/conteudos/estatisticas**: Calcula estatísticas dos conteúdos
- **GET /api/conteudos/pesquisa/:termo**: Pesquisa conteúdos por termo
- **GET /api/conteudos/:id**: Obtém detalhes de um conteúdo específico

#### Kanban
- **GET /api/kanban/usuarios**: Obtém os usuários organizados para visualização Kanban
- **PUT /api/kanban/usuarios/:id/mover**: Move um usuário entre estágios no Kanban
- **GET /api/kanban/estatisticas**: Obtém estatísticas do Kanban

#### Dashboards
- **GET /api/dashboards**: Lista dashboards disponíveis na AWS

### Visualizações de Interface

- **Estatísticas de Usuários**: Gráficos com análises de perfis, interesses e comportamentos
- **Estatísticas de Conteúdos**: Visualização de métricas de conteúdo por tipo e engajamento
- **Kanban de Usuários**: Interface para gerenciamento de fluxo de usuários
- **Listagem de Usuários**: Visualização detalhada de todos os usuários
- **Listagem de Conteúdos**: Visualização detalhada de todos os conteúdos
- **Diagnóstico**: Ferramentas para verificação da saúde do sistema

### Funcionalidades de Diagnóstico

- Verificação automática de conexão AWS na inicialização
- Detecção automática de chaves primárias do DynamoDB
- Logging detalhado de operações críticas
- Endpoint de diagnóstico para troubleshooting

## Configuração e Execução

### Variáveis de Ambiente

```
# Obrigatórias
AWS_REGION=us-east-1
USUARIOS_TABLE=nome-da-tabela-usuarios
CONTEUDOS_TABLE=nome-da-tabela-conteudos

# Opcionais
PORT=3000 (porta padrão caso não seja definida)
```

### Credenciais AWS

É necessário configurar credenciais AWS válidas usando um dos métodos:
1. Arquivo `~/.aws/credentials`
2. Variáveis de ambiente `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`
3. Perfil IAM Instance (para execução em EC2)

### Execução

```bash
# Instalar dependências
npm install express cors aws-sdk path body-parser

# Iniciar o servidor
node scripts/admin-server.js
```

O servidor estará disponível em: http://localhost:3000

## Monitoramento e Logs

O servidor produz logs detalhados de operações críticas:
- Conexão com AWS
- Interações com DynamoDB
- Erros de operação
- Alterações de status de usuários

## Próximos Passos Sugeridos

### Melhorias de Segurança
- [ ] Implementar autenticação para acessar o painel administrativo
- [ ] Adicionar sistema de logs de auditoria para operações críticas
- [ ] Implementar rate limiting para prevenir abusos da API

### Melhorias de Interface
- [ ] Criar visualizações mais detalhadas para análise de comportamento
- [ ] Implementar filtros avançados para listagem de usuários e conteúdos
- [ ] Melhorar responsividade para dispositivos móveis

### Funcionalidades Adicionais
- [ ] Exportação de dados para CSV/Excel
- [ ] Sistema de notificações para eventos importantes
- [ ] Agendamento de tarefas automáticas (ex: limpeza de dados)
- [ ] Implementar histórico de alterações para usuários
- [ ] Adicionar capacidade de edição em massa

### Melhorias Técnicas
- [ ] Refatorar para arquitetura MVC
- [ ] Adicionar testes automatizados
- [ ] Implementar cache para consultas frequentes
- [ ] Otimizar consultas ao DynamoDB para reduzir custos
- [ ] Implementar paginação em todas as listagens

## Troubleshooting

### Problemas Comuns

1. **Erro de Conexão AWS**: 
   - Verifique credenciais AWS
   - Confirme se a região está correta
   - Use o endpoint `/api/diagnostico/aws` para diagnóstico detalhado

2. **Tabelas não encontradas**:
   - Verifique os nomes das tabelas nas variáveis de ambiente
   - Confirme se as tabelas existem na região especificada

3. **Problemas de CORS**:
   - O servidor tem CORS habilitado para todas as origens por padrão
   - Para restringir, modifique a configuração CORS no código

4. **Lentidão nas Consultas**:
   - As consultas ao DynamoDB têm limite de 1000 itens por padrão
   - Para tabelas grandes, considere implementar paginação

## Arquivos Relacionados

- `admin-server.js`: Implementação principal do servidor
- `admin-server.html`: Interface web do painel administrativo
- `admin-functions.js`: Funções JavaScript para o frontend
- `README.md`: Esta documentação

---

## Contribuição

Para contribuir com o desenvolvimento deste painel administrativo:

1. Siga os padrões de código existentes
2. Documente novos endpoints e funcionalidades
3. Teste todas as alterações em ambiente de desenvolvimento antes de enviar para produção

---

Data de última atualização: Março/2025 