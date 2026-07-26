import { getDb } from './server/db.ts';
import { docConfigs } from './drizzle/schema.ts';
import { like } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('DB não disponível'); return; }

  const newConfig = {
    regrasIdentificacao: {
      palavrasChaveNomeArquivo: ["CHEQUE ESPECIAL"],
      palavrasExclusaoNomeArquivo: [],
      palavrasChaveConteudo: [],
      descricao: "Identificado quando o nome do arquivo contém 'CHEQUE ESPECIAL'"
    },
    camposExtracao: [
      {
        campo: "numeroContratoParaVinculacao",
        descricao: "Número do contrato extraído do nome do arquivo para vinculação",
        localizacao: "Nome do arquivo — após o hífen",
        regex: "-\\s*(\\d+)\\.PDF$",
        transformacao: "",
        identificaContrato: true
      },
      {
        campo: "dadoPlanilha02",
        descricao: "Número da Conta Corrente (linha 12)",
        localizacao: "Linha 12 do texto extraído",
        linhaIndice: 12
      },
      {
        campo: "dadoPlanilha03",
        descricao: "Valor Contratado / Saldo Devedor (linha 31)",
        localizacao: "Linha 31 do texto extraído",
        linhaIndice: 31
      },
      {
        campo: "dadoPlanilha04",
        descricao: "Total da dívida incluindo encargos (linha 43)",
        localizacao: "Linha 43 do texto extraído",
        linhaIndice: 43
      }
    ],
    mapeamentoCampos: {
      dadoPlanilha02: "dadoPlanilha02",
      dadoPlanilha03: "dadoPlanilha03",
      dadoPlanilha04: "dadoPlanilha04",
      multa2pct: "nao"
    }
  };

  const rows = await db.select({ id: docConfigs.id, nomeDocumento: docConfigs.nomeDocumento })
    .from(docConfigs)
    .where(like(docConfigs.nomeDocumento, '%Cheque%'));

  for (const r of rows) {
    await db.update(docConfigs)
      .set({ configJson: JSON.stringify(newConfig) })
      .where(like(docConfigs.nomeDocumento, r.nomeDocumento));
    console.log('Atualizado:', r.id, r.nomeDocumento);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
