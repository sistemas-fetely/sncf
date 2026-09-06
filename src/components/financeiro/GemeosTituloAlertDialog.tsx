import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

/** Item devolvido por fn_titulo_pagar_gemeos */
export interface TituloGemeo {
  cpr_id: string;
  descricao: string | null;
  status: string | null;
  origem: string | null;
  data_vencimento: string | null;
  valor: number | string | null;
  cita_esta_nf: boolean;
  ja_amarrado_a_outra_nf: boolean;
}

function fmtValor(v: number | string | null): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(d: string | null): string {
  if (!d) return "—";
  const [a, m, dia] = d.slice(0, 10).split("-");
  if (!a || !m || !dia) return d;
  return `${dia}/${m}/${a}`;
}

interface Props {
  open: boolean;
  gemeos: TituloGemeo[];
  processando?: boolean;
  onCancelar: () => void;
  onCriarMesmoAssim: () => void;
}

/**
 * Sistema sugere, humano decide: nunca bloqueia a criação — avisa que já existe
 * título vivo com mesmo fornecedor, mesmo valor e mesmo vencimento.
 */
export function GemeosTituloAlertDialog({
  open,
  gemeos,
  processando,
  onCancelar,
  onCriarMesmoAssim,
}: Props) {
  const algumCitaEstaNF = gemeos.some((g) => g.cita_esta_nf);

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancelar(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Essa obrigação pode já existir
          </AlertDialogTitle>
          <AlertDialogDescription>
            Encontramos {gemeos.length === 1 ? "1 título" : `${gemeos.length} títulos`} em
            aberto com o mesmo fornecedor, o mesmo valor e o mesmo vencimento.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {algumCitaEstaNF && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium">
            Um dos títulos existentes CITA esta NF — provavelmente é a mesma conta.
          </p>
        )}

        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {gemeos.map((g) => (
            <li key={g.cpr_id} className="rounded-md border bg-card px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{g.descricao || "(sem descrição)"}</span>
                <span className="whitespace-nowrap font-medium">{fmtValor(g.valor)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px] font-normal">
                  {g.status || "—"}
                </Badge>
                <span>vence {fmtData(g.data_vencimento)}</span>
                {g.cita_esta_nf && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    cita esta NF
                  </Badge>
                )}
                {g.ja_amarrado_a_outra_nf && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    já tem outra NF
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={processando} onClick={onCancelar}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction disabled={processando} onClick={onCriarMesmoAssim}>
            Criar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
