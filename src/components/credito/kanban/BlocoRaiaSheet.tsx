import { useEffect, useState } from "react";
import { Pause } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useMovimentosRaia, ORIGEM_MOVIMENTO_LABEL,
  type CardKanban, type PessoaKanban, type RaiaKanban,
} from "@/hooks/credito/useCobrancaKanban";
import { fmtDataHora, fmtDiaMes, hojeIsoLocal } from "./cores";
import { SEM_PESSOA } from "./RaiaDialog";

export function BlocoRaiaSheet({
  card, raias, pessoas, salvando, onSalvar,
}: {
  card: CardKanban;
  raias: RaiaKanban[];
  pessoas: PessoaKanban[];
  salvando: boolean;
  onSalvar: (v: { responsavel?: string | null; retornoEm?: string; observacao?: string }) => Promise<boolean>;
}) {
  const k = card._kanban;
  const { data: movimentos, isLoading } = useMovimentosRaia(card.id);
  const [data, setData] = useState(k.retorno_em ?? "");
  const [obs, setObs] = useState("");
  useEffect(() => { setData(k.retorno_em ?? ""); }, [k.retorno_em]);

  const rotulo = (c: string | null) => (c ? raias.find((r) => r.codigo === c)?.rotulo ?? c : "—");
  const nome = (u: string | null) => (u ? pessoas.find((p) => p.user_id === u)?.full_name ?? "—" : "—");
  const hoje = hojeIsoLocal();

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="text-sm">
        <p className="font-medium flex items-center gap-1">
          {k.raia_rotulo}
          {k.pausa_regua && <Pause className="h-3.5 w-3.5 text-muted-foreground" aria-label="Pausa a régua" />}
        </p>
        <p className="text-xs text-muted-foreground">
          {k.departamento_nome ?? "—"} · desde {fmtDataHora(k.na_raia_desde)} ({k.dias_na_raia ?? 0}d)
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Responsável</Label>
        <Select
          value={k.responsavel_user_id ?? SEM_PESSOA}
          disabled={salvando}
          onValueChange={(v) => onSalvar({ responsavel: v === SEM_PESSOA ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_PESSOA}>Sem responsável</SelectItem>
            {pessoas.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {k.exige_data_retorno && (
        <div className="space-y-1">
          <Label className="text-xs" htmlFor="sheet-retorno">Data de retorno</Label>
          <div className="flex gap-2">
            <Input id="sheet-retorno" type="date" min={hoje} value={data} className="h-8 text-xs"
              onChange={(e) => setData(e.target.value)} />
            <Button size="sm" variant="outline" className="h-8 text-xs"
              disabled={salvando || !data || data < hoje || data === k.retorno_em}
              onClick={() => onSalvar({ retornoEm: data })}>
              Salvar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs" htmlFor="sheet-obs">Observação</Label>
        <Textarea id="sheet-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} className="text-xs" />
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={salvando || !obs.trim()}
            onClick={async () => { if (await onSalvar({ observacao: obs.trim() })) setObs(""); }}>
            Registrar observação
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">Histórico</p>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : !movimentos || movimentos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem movimentos.</p>
        ) : (
          <ul className="space-y-1.5">
            {movimentos.map((m) => (
              <li key={m.id} className="text-[11px] border-l-2 pl-2">
                <p>
                  <span className="font-medium">{rotulo(m.raia_de)} → {rotulo(m.raia_para)}</span>
                  {" · "}{ORIGEM_MOVIMENTO_LABEL[m.origem] ?? m.origem}
                </p>
                <p className="text-muted-foreground">
                  {m.responsavel_para && <>pessoa: {nome(m.responsavel_para)} · </>}
                  {m.retorno_em && <>retorno {fmtDiaMes(m.retorno_em)} · </>}
                  {m.executado_por ? nome(m.executado_por) : "sistema"} · {fmtDataHora(m.executado_em)}
                </p>
                {m.observacao && <p className="text-muted-foreground italic">{m.observacao}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
