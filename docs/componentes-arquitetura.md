# Componentes da Arquitetura Serverless - Radar de Tendências

## 1. Canais de Entrada e Processamento

### Site/Landing Page
- **Tecnologia**: Site estático hospedado no S3 + CloudFront
- **Função**: Captura inicial de leads, formulário de cadastro, página de informações
- **Custo estimado**: ~$1-5/mês (tráfego baixo)

### WhatsApp Business API
- **Tecnologia**: Sua conta existente do WhatsApp Business API
- **Função**: Canal principal de comunicação com usuários
- **Integração**: Webhooks para Lambda via API Gateway

### API Gateway
- **Função**: Endpoint seguro para todas as integrações externas
- **Configuração**: Autenticação via API Key, throttling para controle de custos
- **Custo estimado**: ~$3-7/mês (depende do volume)

### Lambdas de Processamento
- **Processador de Leads**: Recebe registros do site, valida, enriquece e armazena
- **Processador de Mensagens**: Analisa, categoriza e roteia mensagens dos usuários
- **Orquestrador de Respostas**: Determina o tipo de resposta e coordena a geração
- **Custo estimado**: ~$5-10/mês (com otimização de memória/timeout)

## 2. Armazenamento e Dados

### DynamoDB
- **Tabelas principais**:
  - `usuarios`: Perfis, preferências e metadados
  - `interacoes`: Histórico de mensagens e respostas
  - `conteudos`: Biblioteca de conteúdos pré-gerados
- **Indexação**: GSIs para consultas eficientes por preferência, engajamento, etc.
- **Custo estimado**: ~$5-10/mês (modo sob demanda)

### S3 Data Lake
- **Estrutura**:
  - `/raw`: Dados brutos de interações
  - `/processed`: Dados processados para análise
  - `/reports`: Relatórios gerados automaticamente
- **Custo estimado**: ~$1-3/mês

### Athena + QuickSight
- **Função**: Consultas ad-hoc e dashboards para análise
- **Uso**: Monitoramento de tendências, comportamento de usuários, eficácia de conteúdo
- **Custo estimado**: ~$10-20/mês (uso limitado inicialmente)

## 3. Orquestração e Mensagens

### SQS
- **Filas**:
  - `incoming-messages`: Mensagens recebidas para processamento
  - `outgoing-messages`: Mensagens a serem enviadas
  - `content-generation`: Solicitações para geração de conteúdo
- **Configuração**: Políticas de retry, dead-letter queues para falhas
- **Custo estimado**: ~$0-1/mês (volume inicial baixo)

### EventBridge
- **Função**: Agendamento de mensagens e gatilhos baseados em eventos
- **Regras**:
  - Envio de conteúdo diário/periódico
  - Reengajamento de usuários inativos
  - Sincronização de dados entre serviços
- **Custo estimado**: ~$0-1/mês

## 4. Inteligência Artificial e Personalização

### Claude API (Anthropic)
- **Uso**:
  - Personalização de mensagens
  - Geração de conteúdo baseado em tendências
  - Análise de feedback e interações
  - Categorização de usuários
- **Otimização**: Prompts padronizados e reutilizáveis para reduzir tokens
- **Custo estimado**: ~R$150-200/mês (seu limite mencionado)

### Lambda de Geração de Conteúdo
- **Função**: Interface com Claude API para geração eficiente
- **Otimização**: Cache de respostas comuns, reutilização de templates
- **Funcionalidades**:
  - Geração de dicas personalizadas
  - Curadoria de notícias
  - Respostas a perguntas frequentes
  - Recomendações de ferramentas
- **Custo estimado**: Incluído nas estimativas de Lambda

## 5. Integrações Externas

### APIs de Notícias e Tendências
- **Opções gratuitas/econômicas**:
  - RSS feeds de blogs especializados
  - APIs gratuitas: HackerNews, Reddit, Product Hunt
  - Web scraping controlado (com Lambda)
- **Custo estimado**: $0 (fontes gratuitas)

### APIs de Afiliados (Eduzz, Hotmart)
- **Função**: Integração para recomendações de produtos e rastreamento de conversões
- **Implementação**: Webhooks ou chamadas periódicas para sincronização

### Serviço de Enriquecimento de Leads
- **Opção econômica**: Integration com Hunter.io ou Clearbit (camada gratuita)
- **Função**: Enriquecer perfis com dados profissionais e de contato
- **Custo estimado**: $0-10/mês (plano gratuito inicialmente)

## 6. Monitoramento e Logging

### CloudWatch
- **Métricas principais**:
  - Tempo de resposta
  - Taxa de erro
  - Volume de mensagens
  - Custo por usuário
- **Alarmes**: Para limites de custo e problemas operacionais
- **Custo estimado**: ~$5-10/mês

### X-Ray
- **Função**: Rastreamento distribuído para diagnóstico de problemas
- **Uso**: Ativado apenas em ambiente de desenvolvimento/teste
- **Custo estimado**: ~$0-5/mês

## 7. CI/CD e Infraestrutura como Código

### AWS SAM
- **Uso**: Definição de toda a infraestrutura como código
- **Benefícios**: Versionamento, implantação reproduzível, testes automatizados
- **Integração**: GitHub Actions para CI/CD automático

### Repositório de Código
- **Estrutura**:
  - `/template.yaml`: Definição SAM da infraestrutura
  - `/src/lambdas`: Código das funções Lambda
  - `/src/layers`: Camadas comuns (bibliotecas, utilidades)
  - `/lib`: Código compartilhado
  - `/tests`: Testes automatizados

## Custo Total Estimado
- **MVP Inicial**: ~R$250-350/mês (incluindo R$200 para IA)
- **Potencial de crescimento**: Arquitetura escala com pouco aumento de custo até centenas de usuários
