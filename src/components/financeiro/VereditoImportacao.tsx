/**
 * VEREDITO-POR-ARQUIVO (01/09/2026)
 *
 * Um toast só para o upload inteiro escondia arquivo que falhou: três morreram
 * numa manhã e o operador não percebeu. Aqui cada arquivo deixa a própria
 * linha — parser que o leu, status, e a conta fechada
 * "N lidas = X novas + Y duplicadas + Z ignoradas".
 * Arquivo com erro fica em destaque e não desaparece sozinho.
 */

import { FileText, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { MOTIVO_ROTULO, type MotivoDescarte } from "@/lib/financeiro/contagem-importacao";

/**
 * Três estados, não dois. "neutro" é o sucesso idempotente: o arquivo já tinha
 * sido processado e nada foi lido nem reaplicado. Não é verde (não entrou nada)
 * nem vermelho (não falhou nada).
 */
export type TomVeredito = "ok" | "neutro" | "erro";

export interface VereditoArquivo {
  arquivo: string;
  parser: string;
  /** Frase curta do EFEITO do arquivo — o que ele faz, além da conta fechar. */
  efeito?: string;
  resultado: string;
  tom: TomVeredito;
  contagem?: string;
  ignoradas?: Record<string, number>;
}

/** Motivos que não são descarte de linha, e sim de arquivo inteiro. */
const MOTIVO_EXTRA: Record<string, string> = {
  arquivo_ja_processado: "Arquivo já processado (nada foi lido)",
  arquivo_redundante: "Arquivo redundante com outra porta (nada foi lido)",
};


function rotuloMotivo(k: string) {
  return MOTIVO_ROTULO[k as MotivoDescarte] ?? MOTIVO_EXTRA[k] ?? k;
}

export function VereditoImportacao({ itens }: { itens: VereditoArquivo[] }) {
  if (itens.length === 0) return null;

  return (
    <div className="rounded-md border divide-y text-xs">
      <div className="px-3 py-2 font-medium">Veredito por arquivo</div>
      {itens.map((r, i) => {
        const motivos = Object.entries(r.ignoradas ?? {}).filter(([, n]) => n > 0);
        return (
          <div
            key={`${r.arquivo}-${i}`}
            className={
              r.tom === "erro"
                ? "px-3 py-2 space-y-1 bg-destructive/10 border-l-2 border-destructive"
                : r.tom === "neutro"
                  ? "px-3 py-2 space-y-1 bg-muted/50 border-l-2 border-muted-foreground/40"
                  : "px-3 py-2 space-y-1"
            }
          >
            <div className="flex items-center gap-2">
              {r.tom === "erro" ? (
                <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
              ) : r.tom === "neutro" ? (
                <Info className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-success" />
              )}
              <FileText className="h-3 w-3 shrink-0" />
              <span className="font-medium">{r.arquivo}</span>
              <span className="text-muted-foreground">→ {r.parser}</span>
            </div>

            {r.efeito && <div className="text-muted-foreground italic">{r.efeito}</div>}

            <div
              className={
                r.tom === "erro" ? "text-destructive font-medium" : "text-muted-foreground"
              }
            >
              {r.resultado}
            </div>

            {r.contagem && <div className="font-mono text-muted-foreground">{r.contagem}</div>}

            {motivos.length > 0 && (
              <details className="text-muted-foreground">
                <summary className="cursor-pointer select-none">
                  Motivos das linhas ignoradas
                </summary>
                <ul className="mt-1 ml-4 space-y-0.5">
                  {motivos.map(([k, n]) => (
                    <li key={k}>
                      {rotuloMotivo(k)}: <span className="font-mono">{n}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}
