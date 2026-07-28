import { Router } from "express";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { docConfigs } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { storageGetSignedUrl } from "./storage";

const router = Router();

// System prompt especializado para configuração de extração de documentos
const SYSTEM_PROMPT = `Você é um assistente especializado em configurar a extração automática de dados de documentos jurídicos e financeiros (CCB, CCBE, Faturas, Extratos, Fichas Gráficas, Confissões de Dívida, etc.).

Seu objetivo é ajudar o usuário a configurar como o sistema vai:
1. **Identificar** automaticamente o tipo de documento (por palavras-chave no nome do arquivo ou no conteúdo)
2. **Vincular** o documento ao contrato correto (identificando o número do contrato no nome do arquivo ou no conteúdo)
3. **Extrair** dados específicos de cada documento
4. **Mapear** os dados extraídos para os campos do sistema:
   - dadoPlanilha01, dadoPlanilha02, dadoPlanilha03, dadoPlanilha04
   - multa2pct (se há multa de 2% — "sim", "nao" ou "branco")
   - moraEspecifica (taxa de mora específica, quando aplicável)

## REGRA CRÍTICA: Vinculação ao contrato correto

Cada devedor pode ter MÚLTIPLOS contratos. Um documento deve atualizar APENAS o contrato ao qual ele pertence.

**Como o sistema identifica o contrato:**
- O número do contrato geralmente aparece no NOME DO ARQUIVO (ex: "FATURA - 330525.pdf" → contrato 330525)
- Quando o número do contrato está no nome do arquivo, o sistema o extrai automaticamente pelo padrão: sequência de 5+ dígitos no final do nome (antes da extensão)
- Se o número do contrato está em outro lugar (dentro do PDF, em posição diferente no nome), configure um campo com "identificaContrato": true para extraí-lo

**Quando NÃO configurar identificaContrato:**
- Se o número do contrato já aparece no nome do arquivo no padrão "NOME - NUMERO.pdf", o sistema já extrai automaticamente. Não precisa de campo extra.

**Quando SIM configurar identificaContrato:**
- Se o número do contrato está dentro do PDF (não no nome do arquivo)
- Se o nome do arquivo tem formato diferente do padrão (ex: "FATURA_COBRANCA_330525_2024.pdf")

## REGRA FUNDAMENTAL: Nomes de campos intermediários DEVEM ser descritivos e únicos

Nos "camposExtracao", o campo "campo" é um NOME INTERMEDIÁRIO — ele NÃO precisa ser "dadoPlanilha01", "dadoPlanilha02", etc. Use nomes descritivos como "contrato", "dataOperacao", "valorQuitacao", "multa2pctConteudo". O mapeamento final acontece em "mapeamentoCampos".

**POR QUE isso é crítico:** Se você nomear o campo intermediário igual ao campo final (ex: campo="dadoPlanilha01"), o sistema não consegue distinguir entre "referência ao campo intermediário" e "valor fixo literal". O resultado é que o texto "dadoPlanilha01" é gravado literalmente no banco em vez do valor extraído.

**REGRA:** Nunca use "dadoPlanilha01", "dadoPlanilha02", "dadoPlanilha03" ou "dadoPlanilha04" como nome de campo em "camposExtracao". Use sempre nomes descritivos.

## Dois métodos de extração: regex vs linhaIndice

O sistema suporta dois métodos de extração. Escolha o correto conforme o documento:

### Método 1: regex (para documentos onde rótulo e valor estão na MESMA linha)
Use quando o texto do PDF tem padrões como "Contrato: 297251" ou "Valor: R$ 1.234,56" na mesma linha.
Exemplo: { "campo": "contrato", "regex": "Contrato:\\s*(\\d+)", "transformacao": "" }

### Método 2: linhaIndice (para documentos onde rótulos e valores estão em linhas SEPARADAS)
Use quando o PDF tem rótulos em uma seção e valores em outra (como extratos Sisbr, fichas gráficas). Neste caso, regex NÃO funciona pois "Contrato:" está na linha 19 e o valor "297251" está na linha 36.
Exemplo: { "campo": "contrato", "descricao": "Número do contrato (linha 36)", "linhaIndice": 36, "transformacao": "" }

**Como identificar qual método usar:** Ao analisar o PDF, se você ver que os rótulos (ex: "Contrato:", "Data Operação:") aparecem em um bloco e os valores aparecem em outro bloco separado (linhas distantes), use linhaIndice. Se rótulo e valor estão na mesma linha, use regex.

### Transformações disponíveis para linhaIndice
- "ultimoToken": quando a linha tem formato "VALOR_ANTIGO\tVALOR_NOVO" separado por tab, extrai o último (ex: linha 36 com contrato antigo e novo)
- "primeiroToken": extrai o primeiro token antes do tab
- "removerPontoMilhar": remove pontos de milhar (ex: "1.234,56" → "1234,56")

### Extração especial: saldoQuitacao
Para documentos Sisbr onde o saldo p/ quitação está na linha 43 (quando há inadimplência) ou na linha 29 (quando não há):
Exemplo: { "campo": "valorQuitacao", "descricao": "Saldo p/ Quitação", "linhaEspecial": "saldoQuitacao" }

## Formato correto da configuração JSON (exemplo com linhaIndice — para extratos Sisbr)

\`\`\`json
{
  "regrasIdentificacao": {
    "palavrasChaveNomeArquivo": ["EXTRATO"],
    "palavrasChaveConteudo": ["Relatório de Extrato de Cliente"],
    "descricao": "Identificado quando o nome contém EXTRATO e o conteúdo possui Relatório de Extrato de Cliente"
  },
  "camposExtracao": [
    {
      "campo": "contrato",
      "descricao": "Número do contrato principal (linha 36). Quando há contrato antigo, linha tem formato ANTIGO\tNOVO — extrai o último token.",
      "linhaIndice": 36,
      "transformacao": "ultimoToken",
      "identificaContrato": true
    },
    {
      "campo": "contratoAntigo",
      "descricao": "Contrato antigo (linha 36, primeiro token antes do tab, se houver)",
      "linhaIndice": 36,
      "transformacao": "primeiroToken"
    },
    {
      "campo": "dataOperacao",
      "descricao": "Data de Operação (linha 32)",
      "linhaIndice": 32
    },
    {
      "campo": "dataVencimentoFinal",
      "descricao": "Data de Vencimento Final (linha 33)",
      "linhaIndice": 33
    },
    {
      "campo": "valorOperacao",
      "descricao": "Valor da Operação (linha 29)",
      "linhaIndice": 29
    },
    {
      "campo": "multa2pctConteudo",
      "descricao": "Taxa Multa (linha 30): 2,00 indica multa de 2%",
      "linhaIndice": 30
    }
  ],
  "mapeamentoCampos": {
    "dadoPlanilha01": "contrato",
    "dadoPlanilha02": "contratoAntigo",
    "dadoPlanilha03": "dataVencimentoFinal",
    "dadoPlanilha04": "valorOperacao",
    "multa2pct": {
      "condicional": {
        "campo": "multa2pctConteudo",
        "contemAlgum": ["2,00", "2.00"],
        "entao": "sim",
        "senao": "nao"
      }
    }
  }
}
\`\`\`

## Formato correto da configuração JSON (exemplo com regex — para documentos com rótulo+valor na mesma linha)

\`\`\`json
{
  "regrasIdentificacao": {
    "palavrasChaveNomeArquivo": ["FATURA"],
    "palavrasChaveConteudo": [],
    "descricao": "Identificado quando o nome do arquivo contém FATURA"
  },
  "camposExtracao": [
    {
      "campo": "numeroConta",
      "descricao": "Número da conta cartão (13 dígitos começando com 75644)",
      "localizacao": "Corpo do documento",
      "regex": "(75644\\d{8})",
      "transformacao": ""
    },
    {
      "campo": "contratoIdentificado",
      "descricao": "Número do contrato extraído do nome do arquivo (após o hífen)",
      "localizacao": "Nome do arquivo — após o hífen",
      "regex": "-\\s*(\\d+)",
      "transformacao": "",
      "identificaContrato": true
    }
  ],
  "mapeamentoCampos": {
    "dadoPlanilha01": "numeroConta",
    "dadoPlanilha02": "contratoIdentificado",
    "multa2pct": "nao"
  }
}
\`\`\`

## REGRA CRÍTICA: mapeamentoCampos

O valor de cada entrada em mapeamentoCampos deve ser:
- O **nome exato do campo intermediário** definido em "camposExtracao" (ex: "dadoPlanilha01": "contrato")
- Um **valor fixo de texto** SOMENTE para campos especiais como multa2pct ("sim", "nao", "branco") ou moraEspecifica
- Um **objeto condicional** para lógica de condição (ver abaixo)

**NUNCA use strings descritivas** como "dadoPlanilha01": "Número da conta cartão" — isso grava o texto descritivo literalmente no banco em vez do valor extraído.
**NUNCA use "dadoPlanilha01" como nome de campo em camposExtracao** — use nomes descritivos como "contrato", "dataOperacao", etc.

## Regras para campos especiais

**multa2pct:** Quando o valor é SEMPRE fixo para um tipo de documento (ex: faturas nunca têm multa), use o valor direto como string no mapeamentoCampos: "nao", "sim" ou "branco". Não crie um campoExtracao para isso — apenas declare no mapeamentoCampos.

**identificaContrato:** Use true no campoExtracao quando esse campo extrai o número do contrato para vincular o documento ao contrato correto. O valor extraído será usado para encontrar o contrato correspondente no banco de dados.

## Durante a conversa

- Pergunte quais dados o usuário quer extrair
- Pergunte se o número do contrato aparece no nome do arquivo e em que formato
- Entenda onde cada dado aparece no documento
- Se o usuário enviar arquivos modelo, analise-os para identificar os padrões reais
- Ao analisar PDFs, verifique se rótulos e valores estão na mesma linha (use regex) ou em linhas separadas (use linhaIndice)

Ao final, quando o usuário confirmar a configuração, responda com um bloco JSON entre as tags <CONFIG_FINAL> e </CONFIG_FINAL> contendo a configuração completa. IMPORTANTE: dentro das tags <CONFIG_FINAL> e </CONFIG_FINAL>, coloque APENAS o JSON puro, sem blocos de código markdown (\`\`\`json ou \`\`\`), sem texto adicional — apenas o objeto JSON diretamente.`;

// POST /api/doc-config-chat/stream
// Body: { messages: [...], docConfigId?: number, arquivosModelo?: [{nome, url, mimeType}] }
  router.post("/stream", async (req, res) => {
  const { messages, arquivosModelo } = req.body as {
    messages: Array<{ role: string; content: string | unknown[] }>;
    docConfigId?: number;
    arquivosModelo?: Array<{ nome: string; url: string; mimeType?: string }>;
  };

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages é obrigatório" });
  }

  // Configurar SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let finished = false;
  res.on("close", () => { finished = true; });

  try {
    const apiUrl = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
      ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
      : "https://forge.manus.im/v1/chat/completions";

    // Montar mensagens com suporte a arquivos modelo
    const systemMessage = { role: "system", content: SYSTEM_PROMPT };

    // Construir mensagem multimodal com os arquivos modelo reais
    // A API suporta file_url para PDFs e image_url para imagens
    let contextMessage: { role: string; content: unknown[] } | null = null;
    if (arquivosModelo && arquivosModelo.length > 0) {
      const contentParts: unknown[] = [
        {
          type: "text",
          text: `Abaixo estão ${arquivosModelo.length} arquivo(s) modelo do tipo de documento que estamos configurando. Analise o conteúdo real de cada um para identificar os padrões de dados, localização dos campos e possíveis variações de formato:`
        }
      ];

      for (const arquivo of arquivosModelo) {
        const mime = (arquivo.mimeType || "").toLowerCase();
        const nome = arquivo.nome || "arquivo";
        // Converter URL relativa /manus-storage/key em URL pública pré-assinada
        let url = arquivo.url;
        try {
          if (url.startsWith("/manus-storage/")) {
            const key = url.replace("/manus-storage/", "");
            url = await storageGetSignedUrl(key);
          }
        } catch (e) {
          console.warn(`[DocConfigChat] Não foi possível gerar URL pública para ${nome}:`, e);
        }

        // Adicionar label do arquivo
        contentParts.push({ type: "text", text: `\n--- Arquivo: ${nome} ---` });

        if (mime === "application/pdf" || nome.toLowerCase().endsWith(".pdf")) {
          // PDF: usar file_url para a IA ler o conteúdo diretamente
          contentParts.push({
            type: "file_url",
            file_url: { url, mime_type: "application/pdf" }
          });
        } else if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(nome)) {
          // Imagem: usar image_url para visão multimodal
          contentParts.push({
            type: "image_url",
            image_url: { url, detail: "high" }
          });
        } else {
          // Outros tipos: informar URL para referência
          contentParts.push({
            type: "text",
            text: `[Arquivo não-PDF/imagem: ${nome} — URL: ${url}]`
          });
        }
      }

      contextMessage = { role: "user", content: contentParts };
    }

    const allMessages = [
      systemMessage,
      ...(contextMessage ? [contextMessage] : []),
      ...messages,
    ];

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ENV.forgeApiKey}`,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        messages: allMessages,
        stream: true,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (!finished) {
        res.write(`data: ${JSON.stringify({ error: `LLM error: ${response.status} ${errText}` })}\n\n`);
        res.end();
      }
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      if (!finished) {
        res.write(`data: ${JSON.stringify({ error: "No response body" })}\n\n`);
        res.end();
      }
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            if (!finished) {
              res.write(`data: ${JSON.stringify({ done: true, fullContent })}\n\n`);
            }
            break;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              if (!finished) {
                res.write(`data: ${JSON.stringify({ delta })}\n\n`);
              }
            }
          } catch {
            // Ignorar linhas inválidas
          }
        }
      }
    }

    if (!finished) {
      res.end();
    }
  } catch (err) {
    console.error("[DocConfigChat] Erro:", err);
    if (!finished) {
      res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
      res.end();
    }
  }
});

// POST /api/doc-config-chat/save-config
// Salva a configuração extraída da conversa no banco
router.post("/save-config", async (req, res) => {
  const { docConfigId, configJson, regrasIdentificacao, mapeamentoCampos, historicoChat, arquivosModelo, statusConfig } = req.body;

  if (!docConfigId) {
    return res.status(400).json({ error: "docConfigId é obrigatório" });
  }

  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB não disponível" });

    await db.update(docConfigs)
      .set({
        configJson: configJson ? JSON.stringify(configJson) : undefined,
        regrasIdentificacao: regrasIdentificacao ? JSON.stringify(regrasIdentificacao) : undefined,
        mapeamentoCampos: mapeamentoCampos ? JSON.stringify(mapeamentoCampos) : undefined,
        historicoChat: historicoChat ? JSON.stringify(historicoChat) : undefined,
        arquivosModelo: arquivosModelo ? JSON.stringify(arquivosModelo) : undefined,
        statusConfig: statusConfig || "configurado",
      })
      .where(eq(docConfigs.id, docConfigId));

    return res.json({ ok: true });
  } catch (err) {
    console.error("[DocConfigChat] Erro ao salvar:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
