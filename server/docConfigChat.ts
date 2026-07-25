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
2. **Extrair** dados específicos de cada documento
3. **Mapear** os dados extraídos para os campos do sistema:
   - dadoPlanilha01, dadoPlanilha02, dadoPlanilha03, dadoPlanilha04
   - multa2pct (se há multa de 2% — "sim", "nao" ou "branco")
   - moraEspecifica (taxa de mora específica, quando aplicável)

Durante a conversa, você deve:
- Perguntar quais dados o usuário quer extrair daquele tipo de documento
- Entender onde esses dados aparecem no documento (cabeçalho, rodapé, tabela, campo específico, etc.)
- Perguntar como identificar o documento automaticamente (palavras no nome do arquivo, texto no conteúdo, etc.)
- Mapear cada dado extraído para o campo correto do sistema

Quando tiver informações suficientes, gere uma configuração JSON estruturada assim:
\`\`\`json
{
  "regrasIdentificacao": {
    "palavrasChaveNomeArquivo": ["CCB", "cedula"],
    "palavrasChaveConteudo": ["CÉDULA DE CRÉDITO BANCÁRIO"],
    "descricao": "Identificado quando o nome do arquivo contém 'CCB' ou o conteúdo contém 'CÉDULA DE CRÉDITO BANCÁRIO'"
  },
  "camposExtracao": [
    {
      "campo": "dadoPlanilha01",
      "descricao": "Valor total da CCB",
      "localizacao": "Campo 'Valor Total' na tabela de resumo financeiro",
      "regex": "Valor Total[:\\s]+R\\$\\s*([\\d.,]+)",
      "transformacao": "remover R$ e pontos de milhar"
    }
  ],
  "mapeamentoCampos": {
    "dadoPlanilha01": "Valor total da CCB",
    "dadoPlanilha02": "Taxa de juros",
    "dadoPlanilha03": "Data de emissão",
    "dadoPlanilha04": "Número da CCB",
    "multa2pct": "Verificar se há cláusula de multa de 2%",
    "moraEspecifica": "Taxa de mora mensal se diferente do padrão"
  }
}
\`\`\`

Seja objetivo, prático e faça perguntas específicas para entender o documento. Se o usuário enviar arquivos modelo, analise-os para identificar os padrões de extração.

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
