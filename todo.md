# Iniciais Calc - TODO

## Etapa 1: Upload e Extração da Planilha BD
- [x] Criar tabelas no banco: lotes, devedores
- [x] Instalar dependências: xlsx (parse de Excel), multer (upload)
- [x] Criar endpoint de upload da planilha BD no backend
- [x] Parsear planilha BD: extrair cada linha como um devedor separado
- [x] Salvar lote e devedores no banco de dados
- [x] Criar página de upload da planilha BD no frontend
- [x] Exibir tabela de devedores extraídos com todos os campos
- [x] Permitir revisão/edição dos dados extraídos antes de prosseguir
- [x] Indicar status do lote (aguardando processamento, em processamento, concluído)

## Etapa 2: Identificação do Tipo de Planilha e Inicial (futuro)
- [ ] Definir regras de identificação do tipo de planilha de cálculo
- [ ] Definir regras de identificação do tipo de petição inicial
- [ ] Implementar script de classificação automática por devedor
- [ ] Permitir revisão/ajuste manual do tipo identificado

## Etapa 3: Geração das Planilhas de Cálculo (futuro)
- [ ] Upload dos modelos de planilha Excel
- [ ] Aplicar dados do devedor no modelo correto
- [ ] Gerar planilha Excel com fórmulas
- [ ] Exportar planilha em PDF
- [ ] Exportar planilha em imagem JPG

## Etapa 4: Geração das Petições Iniciais (futuro)
- [ ] Upload dos modelos de petição Word/DOCX
- [ ] Aplicar dados do devedor + valor da causa na inicial correta
- [ ] Gerar inicial em Word/DOCX editável
- [ ] Gerar inicial em PDF

## Etapa 5: Download em Lote (futuro)
- [ ] Empacotar todos os 5 arquivos por devedor (xlsx, pdf planilha, jpg planilha, docx, pdf inicial)
- [ ] Gerar ZIP do lote completo para download único
- [ ] Histórico de lotes processados
## Melhorias da Etapa 1
- [x] Paginação na lista de lotes (10 por página)
- [x] Exclusão automática de lotes com mais de 30 dias via job agendado diário (03h UTC) + botão manual
- [x] Botão "Limpar antigos" com confirmação na lista de lotes

## Etapa 2: Identificação do Tipo de Planilha e Inicial (futuro)
## Etapa 2: Upload de Documentos por Devedor
- [x] Adicionar tabela `documentos` no schema (id, loteId, devedorId, nome, fileKey, fileUrl, mimeType, tamanho, createdAt)
- [x] Criar endpoint de upload de documentos no backend (multipart, múltiplos arquivos, com nome da pasta para vinculação)
- [x] Implementar lógica de fuzzy matching: vincular pasta ao devedor pelo nome (tolerando variações)
- [x] Botão "Avançar → Subir Documentos" na tela do lote (LotePage)
- [x] Nova tela/página de upload de pastas (seleção múltipla de pastas via webkitdirectory)
- [x] Exibir progresso do upload e resultado da vinculação (vinculados vs sem vínculo, com score de confiança)
- [x] Página de revisão de documentos: listar documentos por devedor com ícone do tipo de arquivo
- [x] Permitir excluir documento individual de um devedor (com confirmação)
- [x] Permitir adicionar documento individual a um devedor específico
- [x] Clicar no documento abre em nova aba do navegador

## Etapa 3: Identificação do Tipo de Planilha e Inicial (futuro)

## Etapa 3: Revisão Completa e Extração de Dados
- [ ] Adicionar campos de extração na tabela `devedores`: dadoPlanilha01, dadoPlanilha02, dadoPlanilha03, dadoPlanilha04, multa2pct, moraEspecifica
- [ ] Criar rota tRPC para salvar campos de extração de um devedor
- [ ] Botão "Avançar — Revisar Dados" na tela de documentos (DocumentosPage)
- [ ] Nova página RevisaoPage (/lote/:id/revisao) com lista de todos os devedores
- [ ] Cada devedor expandível: dados BD + lista de docs + campos de extração editáveis
- [ ] Campos: DadoPlanilha01-04, Multa 2% (Sim/Não/branco), Mora Específica (texto)
- [ ] Salvar campos de extração por devedor (botão Salvar por devedor)
- [ ] Indicador visual: devedores com campos preenchidos vs. pendentes

## Melhoria Etapa 3: Campos de Extração por Contrato
- [ ] Criar tabela `extracoes` no schema: id, devedorId, loteId, numeroContrato, dadoPlanilha01-04, multa2pct, moraEspecifica
- [ ] Remover campos dadoPlanilha01-04, multa2pct, moraEspecifica da tabela devedores (ou manter como legado)
- [ ] Criar rotas tRPC: listar extrações por devedor, criar extração, atualizar extração, excluir extração
- [ ] Atualizar RevisaoPage: seção de extração mostra um card por contrato (pré-populado com os contratos do devedor)
- [ ] Permitir adicionar novo contrato/extração e excluir contrato/extração individualmente
- [ ] Multa 2% e Mora Específica são campos compartilhados do devedor (não por contrato) ou também por contrato?

## Módulo Configurações (Clientes + DocConfigs)
- [x] Criar tabelas `clientes` e `docConfigs` no schema
- [x] Seed com 46 clientes do JSON
- [x] Rotas tRPC para CRUD de clientes e docConfigs
- [x] ConfiguracoesPage: lista de clientes com busca, expand para ver documentos configurados
- [x] DocConfigPage: chat com IA (SSE streaming) para configurar regras de extração
- [x] Upload de arquivos modelo para a IA analisar (PDFs/imagens)
- [x] Auto-salvar CONFIG_FINAL quando IA emite o bloco JSON
- [x] Histórico de chat persistido no banco
- [x] Corrigir erro de sintaxe em docConfigChat.ts (backtick em template literal)

## Extração Automática de Dados dos Documentos
- [x] Criar módulo extractor.ts: identificar tipo de documento e extrair campos via regex
- [x] Integrar extração automática ao upload de documentos (endpoint batch e direto)
- [x] Adicionar botão "Extrair Dados" na RevisaoPage por devedor
- [x] Rota tRPC documentos.extrairDevedor para disparar extração manual
- [x] Corrigir toast "undefined arquivo(s)" no upload individual
- [ ] Testar extração com documentos reais configurados
- [ ] Adicionar feedback visual na RevisaoPage mostrando qual documento foi identificado

## Módulo Índices de Correção
- [x] Criar tabela `indicesCorrecao` no banco (mesAno, dataTexto, ipca, selic)
- [x] Seed com 79 registros históricos (jan/2020 a jul/2026) do JSON fornecido
- [x] Procedures tRPC: list, ultimoIndice, upsert, update, delete
- [x] Página /indices com tabela, filtro por ano, cards de resumo e edição inline
- [x] Link "Índices" no header da Home ao lado de Configurações

## Etapa Definir Inicial (/lote/:id/definir-inicial)
- [x] Adicionar campo `indiceCorrecao` (enum: ipca|selic) na tabela `extracoes`
- [x] Adicionar campo `modeloInicial` (varchar 100) na tabela `devedores`
- [x] Migrar schema e aplicar no banco
- [x] Procedure tRPC: salvar modeloInicial de um devedor
- [x] Procedure tRPC: salvar indiceCorrecao de uma extração
- [x] Botão "Avançar — Definir Inicial" na RevisaoPage
- [x] Criar página DefinirInicialPage (/lote/:id/definir-inicial)
- [x] Header com botão Voltar, título e contador de devedores
- [x] Para cada devedor: card com nome, documentos (chips clicáveis), campo Modelo da Inicial (pré-preenchido com modeloPadrao da cliente)
- [x] Para cada devedor: tabela de contratos com dp01, dp02, dp03, dp04, multa (2% ou 0%), índice (IPCA/Selic toggle)
- [x] Índice pré-preenchido automaticamente: cartão/cheque especial → Selic, demais → IPCA
- [x] Salvar automaticamente ao alterar índice (toggle) e botão Salvar por devedor para o modelo
- [x] Registrar rota /lote/:id/definir-inicial no App.tsx

## Etapa Gerar Planilhas (/lote/:id/gerar-planilhas)
- [x] Endpoint /api/gerar-pacote/:loteId que monta ZIP com dados calculados + modelos + script gerar.js
- [x] GerarPlanilhasPage com botão de download e instruções
- [x] Botão "Próximo passo" navega para UploadPlanilhasPdfPage

## Etapa Upload PDFs das Planilhas (/lote/:id/upload-planilhas-pdf)
- [x] UploadPlanilhasPdfPage com drag-and-drop de PDFs
- [x] Extração do Total Geral (maior valor monetário) via pdftotext
- [x] Identificação automática do devedor pelo nome do arquivo
- [x] Campos editáveis para revisão/correção do valor extraído
- [x] Salva valorCausa no banco (tabela devedores)
- [ ] Botão "Próximo passo" navega para GerarPeticoesPage

## Etapa Gerar Petições (/lote/:id/gerar-peticoes)
- [x] Backend server/gerarPeticoes.ts: extrairPlaceholders, getDadosPeticoes, gerarPeticoes
- [x] Procedures tRPC: peticoes.getDados, peticoes.gerar
- [x] GerarPeticoesPage: carrossel com dados cliente / devedor / tabela contratos / campos placeholders
- [x] Rota /lote/:id/gerar-peticoes no App.tsx
- [x] Botão "Próximo passo" na UploadPlanilhasPdfPage → GerarPeticoesPage

## Autenticação Própria (Email/Senha)
- [x] Criar tabela `localUsers` no schema (id, email, passwordHash, name, createdAt)
- [x] Instalar bcryptjs para hash de senha
- [x] Criar procedures tRPC: auth.localLogin, auth.localMe, auth.localLogout
- [x] Criar middleware de sessão própria (JWT separado do Manus OAuth)
- [x] Criar página LoginPage (/login) com email/senha e link "Esqueci minha senha" → Manus OAuth
- [x] Proteger todas as rotas do frontend com verificação de sessão local
- [x] Criar script seed-admin.mjs para cadastrar usuário admin via linha de comando
- [x] Remover dependência do Manus OAuth do fluxo principal (manter apenas como fallback de recuperação)
