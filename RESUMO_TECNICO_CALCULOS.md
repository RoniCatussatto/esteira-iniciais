# Resumo Técnico — Iniciais Calc
## Estado do Projeto para Implementação do Módulo de Cálculos

**Última atualização:** jul/2026 | **Versão estável:** `f62e96ce`
**Dev server:** https://3000-ix9zs7jeon688opnm73fi-ca1a1d8c.us2.manus.computer
**Projeto:** `/home/ubuntu/iniciais-calc`
**Stack:** React 19 + Tailwind 4 + shadcn/ui + tRPC 11 + Express 4 + Drizzle ORM + MySQL/TiDB

---

## 1. Módulos já implementados e estáveis

| Módulo | Status | Descrição |
|---|---|---|
| Upload planilha BD | ✅ Estável | Lotes + devedores no banco |
| Upload de documentos | ✅ Estável | Fuzzy matching por nome, S3 |
| Triagem automática | ✅ Estável | Por palavras-chave no nome do arquivo |
| Extração automática | ✅ Estável | regex / linhaIndice / linhaEspecial / mapeamentoCampos |
| Configurações (IA) | ✅ Estável | Chat SSE, CONFIG_FINAL auto-salvo |
| Revisão de dados | ✅ Estável | RevisaoPage com campos por contrato |
| Índices IPCA/Selic | ✅ Estável | 79 registros jan/2020–jul/2026, página /indices |

---

## 2. Schema do banco (tabelas relevantes para cálculos)

### Tabela `extracoes` — campos por contrato de cada devedor

```
id              INT PK
devedorId       INT (FK → devedores.id)
loteId          INT (FK → lotes.id)
numeroContrato  VARCHAR(100)   — número do contrato (ex: "1512619", "330525")
dadoPlanilha01  TEXT           — varia por tipo de contrato (ver seção 3)
dadoPlanilha02  TEXT           — varia por tipo de contrato
dadoPlanilha03  TEXT           — varia por tipo de contrato
dadoPlanilha04  TEXT           — varia por tipo de contrato
multa2pct       ENUM(sim|nao|branco)
moraEspecifica  TEXT           — data de vencimento para contratos de cartão/AVAIS
```

### Tabela `indicesCorrecao` — índices mensais IPCA e Selic

```
id          INT PK
mesAno      VARCHAR(7) UNIQUE  — formato "YYYY-MM" (ex: "2025-07")
dataTexto   VARCHAR(20)        — rótulo legível (ex: "jul/2025")
ipca        DECIMAL(12,6)      — índice IPCA acumulado (base 100 em algum ponto)
selic       DECIMAL(12,6)      — Selic acumulada em %
```

**Cobertura atual:** jan/2020 (`ipca=73.429228`) a jul/2026 (`ipca=105.616530`, `selic=55.27%`)

---

## 3. Semântica dos campos dp01–dp04 por tipo de contrato

Os campos são preenchidos automaticamente pelo extractor.ts a partir dos PDFs.
O **tipo de contrato** é inferido pela presença de `moraEspecifica`:

### Empréstimo Pessoal (Extrato Sisbr sem Fatura)

| Campo | Conteúdo | Exemplo |
|---|---|---|
| `dadoPlanilha01` | Número do contrato | `"1512619"` |
| `dadoPlanilha02` | Data de operação (DD/MM/AAAA) | `"17/10/2025"` |
| `dadoPlanilha03` | Data de vencimento final (DD/MM/AAAA) | `"25/11/2030"` |
| `dadoPlanilha04` | Saldo devedor (formato BR: `"12184,49"`) | `"12184,49"` |
| `multa2pct` | `"sim"` (regra: modalidade ≠ HONRA) | `"sim"` |
| `moraEspecifica` | `null` | — |

### Cartão de Crédito (Fatura + Extrato Sisbr)

| Campo | Conteúdo | Exemplo |
|---|---|---|
| `dadoPlanilha01` | Conta cartão (número longo) | `"7564493036959"` |
| `dadoPlanilha02` | Número do contrato | `"330525"` |
| `dadoPlanilha03` | Data de vencimento da fatura (DD/MM/AAAA) | `"28/04/2026"` |
| `dadoPlanilha04` | Saldo devedor (formato BR) | `"654,57"` |
| `multa2pct` | `"nao"` (regra: modalidade contém CARTÃO) | `"nao"` |
| `moraEspecifica` | Data de vencimento (igual dp03) | `"28/04/2026"` |

**Regra de identificação:** se `moraEspecifica` não é null → é contrato de cartão.

### Cheque Especial (Extrato Cheque Especial)

| Campo | Conteúdo | Exemplo |
|---|---|---|
| `dadoPlanilha01` | *(não preenchido pelo extrator)* | — |
| `dadoPlanilha02` | Conta corrente | `"310131"` |
| `dadoPlanilha03` | Saldo devedor (linha 31 do PDF) | `"5.234,00"` |
| `dadoPlanilha04` | Total da dívida (linha 43 do PDF) | `"5.234,00"` |
| `multa2pct` | `"nao"` | `"nao"` |
| `moraEspecifica` | `null` | — |

---

## 4. Configurações de extração por tipo de documento

### Fatura (id=210001) — prioridade=0 (alta, sempre sobrescreve dp01/dp02)

```json
{
  "mapeamentoCampos": {
    "dadoPlanilha01": "dadoPlanilha01",
    "dadoPlanilha02": "dadoPlanilha02",
    "multa2pct": "nao"
  }
}
```

### Extrato Sisbr (id=270001) — prioridade=undefined (normal)

Extração por `linhaIndice` (índices de linha do PDF):
- `modalidade` → linha 26
- `contrato` → linha 36
- `dataOperacao` → linha 32
- `dataVencimentoFinal` → linha 33
- `valorQuitacao` → `linhaEspecial="saldoQuitacao"` (linha 43 se numérica, senão linha 29)

```json
{
  "mapeamentoCampos": {
    "dadoPlanilha01": "contrato",
    "dadoPlanilha02": "dataOperacao",
    "dadoPlanilha03": "dataVencimentoFinal",
    "dadoPlanilha04": "valorQuitacao",
    "multa2pct": { "condicional": { "campo": "modalidade", "contem": "HONRA", "entao": "nao", "senao": "sim" } },
    "moraEspecifica": { "condicional": { "campo": "modalidade", "contemAlgum": ["CARTAO","CARTOES","AVAIS"], "entao": "dataVencimentoFinal", "senao": null } }
  }
}
```

### Extrato Cheque Especial (id=300001) — prioridade=undefined

Extração por `linhaIndice`:
- `dadoPlanilha02` → linha 12 (conta corrente)
- `dadoPlanilha03` → linha 31 (saldo devedor)
- `dadoPlanilha04` → linha 43 (total dívida)

---

## 5. Índices IPCA/Selic — estrutura e valores

O IPCA é armazenado como **índice acumulado** (não variação mensal). A fórmula de atualização monetária por IPCA é:

```
valor_atualizado = valor_original × (IPCA_mes_referencia / IPCA_mes_base)
```

Onde:
- `IPCA_mes_base` = índice do mês da data de operação do contrato
- `IPCA_mes_referencia` = índice do último mês disponível (atualmente jul/2026 = 105.616530)

**Exemplos de valores IPCA:**

| Mês | IPCA acumulado | Selic acumulada |
|---|---|---|
| jan/2020 | 73.429228 | 0.00% |
| jan/2024 | 97.000000 (aprox.) | — |
| jan/2025 | 100.000000 (aprox.) | — |
| jan/2026 | 102.178738 | 48.69% |
| jul/2026 | 105.616530 | 55.27% |

A **Selic** é armazenada como percentual acumulado (ex: 55.27 = 55,27%). O uso nos cálculos ainda não foi definido pelo usuário.

---

## 6. Arquivos-chave do projeto

| Arquivo | Função |
|---|---|
| `drizzle/schema.ts` | Schema completo do banco |
| `server/extractor.ts` | Motor de triagem e extração (807 linhas) |
| `server/routers.ts` | Todas as procedures tRPC |
| `server/db.ts` | Helpers de query (getIndicesCorrecao, upsertIndiceCorrecao, etc.) |
| `server/docConfigChat.ts` | Chat IA para configuração de documentos |
| `client/src/pages/IndicesPage.tsx` | Página /indices (visualização/edição dos índices) |
| `client/src/pages/RevisaoPage.tsx` | Página /lote/:id/revisao (dados extraídos por contrato) |
| `client/src/App.tsx` | Rotas: /, /lote/:id, /lote/:id/documentos, /lote/:id/revisao, /configuracoes, /indices |
| `todo.md` | Rastreamento de features e bugs |

---

## 7. Próximo módulo: Cálculos (a implementar)

O módulo de cálculos usará os dados das tabelas `extracoes` e `indicesCorrecao` para gerar planilhas Excel preenchidas com os dados de cada contrato. O usuário informará:

- Os **modelos de planilha Excel** com placeholders (a serem fornecidos)
- As **regras de cálculo** por tipo de contrato (IPCA vs Selic, multa, mora)
- A **data de referência** (mês do último índice disponível)

**Dados disponíveis por contrato para os cálculos:**
- Número do contrato (`numeroContrato`)
- Saldo devedor (`dadoPlanilha04`, formato BR: `"12184,49"`)
- Data de operação (`dadoPlanilha02` para empréstimos, `dadoPlanilha03` para cartões)
- Data de vencimento final (`dadoPlanilha03` para empréstimos)
- Multa 2% (`multa2pct`: sim/nao/branco)
- Mora específica (`moraEspecifica`: data de vencimento para cartões)
- Tipo inferido: cartão se `moraEspecifica != null`, cheque especial se `dadoPlanilha01 == null`
