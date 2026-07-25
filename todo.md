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
