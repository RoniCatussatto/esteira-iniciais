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
