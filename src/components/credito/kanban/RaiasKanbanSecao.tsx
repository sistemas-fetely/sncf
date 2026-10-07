import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRaiasKanban, type RaiaKanban } from "@/hooks/credito/useCobrancaKanban";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { CORES_RAIA } from "./cores";

const SEM_DEP = "__sem__";

/** Código imutável: slug snake_case sem acento gerado do rótulo. */
export function slugRaia(rotulo: string): string {
  return rotulo
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

type Edicao = Omit<RaiaKanban, "departamento_nome">;

function useDepartamentosAtivos() {
  return useQuery({
    queryKey: ["departamentos-ativos-raia"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("departamentos").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
    staleTime: 5 * 60_000,
  });
}

function useContagemPorRaia() {
  return useQuery({
    queryKey: ["titulos-cobranca", "cobranca-mesa", "cobranca-kanban", "contagem-raia"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("vw_cobranca_kanban").select("raia_codigo");
      if (error) throw error;
      const m = new Map<string, number>();
      ((data ?? []) as { raia_codigo: string }[]).forEach((r) => m.set(r.raia_codigo, (m.get(r.raia_codigo) ?? 0) + 1));
      return m;
    },
    staleTime: 30_000,
  });
}

function LinhaRaia({
  raia, departamentos, qtd, podeEditar, onSalvar,
}: {
  raia: Edicao;
  departamentos: { id: string; nome: string }[];
  qtd: number;
  podeEditar: boolean;
  onSalvar: (r: Edicao, nova: boolean) => Promise<boolean>;
}) {
  const [f, setF] = useState<Edicao>(raia);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setF(raia), [raia]);
  const sujo = JSON.stringify(f) !== JSON.stringify(raia);
  const bloqueiaDesativar = !f.ativo && raia.ativo && qtd > 0;
  const set = <K extends keyof Edicao>(k: K, v: Edicao[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <TableRow>
      <TableCell className="font-mono text-[11px] text-muted-foreground">{raia.codigo}</TableCell>
      <TableCell><Input className="h-8 text-xs min-w-[140px]" value={f.rotulo} disabled={!podeEditar} onChange={(e) => set("rotulo", e.target.value)} /></TableCell>
      <TableCell><Input className="h-8 text-xs w-16" type="number" value={f.ordem} disabled={!podeEditar} onChange={(e) => set("ordem", Number(e.target.value))} /></TableCell>
      <TableCell>
        <Select value={f.cor ?? "gray"} disabled={!podeEditar} onValueChange={(v) => set("cor", v)}>
          <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{CORES_RAIA.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select value={f.departamento_id ?? SEM_DEP} disabled={!podeEditar} onValueChange={(v) => set("departamento_id", v === SEM_DEP ? null : v)}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_DEP}>—</SelectItem>
            {departamentos.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell><Switch checked={f.pausa_regua} disabled={!podeEditar} onCheckedChange={(v) => set("pausa_regua", v)} /></TableCell>
      <TableCell><Switch checked={f.exige_data_retorno} disabled={!podeEditar} onCheckedChange={(v) => set("exige_data_retorno", v)} /></TableCell>
      <TableCell>
        <Switch checked={f.ativo} disabled={!podeEditar} onCheckedChange={(v) => set("ativo", v)} />
        {bloqueiaDesativar && <p className="text-[10px] text-destructive mt-1">mova os {qtd} títulos antes</p>}
      </TableCell>
      <TableCell><Input className="h-8 text-xs min-w-[180px]" value={f.descricao ?? ""} disabled={!podeEditar} onChange={(e) => set("descricao", e.target.value)} /></TableCell>
      <TableCell>
        {podeEditar && (
          <Button size="sm" className="h-7 text-xs" disabled={!sujo || salvando || bloqueiaDesativar || !f.rotulo.trim()}
            onClick={async () => { setSalvando(true); await onSalvar(f, false); setSalvando(false); }}>
            Salvar
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function RaiasKanbanSecao() {
  const { data: raias = [], isLoading } = useRaiasKanban(true);
  const { data: departamentos = [] } = useDepartamentosAtivos();
  const { data: contagem } = useContagemPorRaia();
  const { permitido: podeEditar } = usePermissaoAcaoOuSuperAdmin("acao.credito_regras_editar");
  const invalidarRecebivel = useInvalidarRecebivel();
  const [novoRotulo, setNovoRotulo] = useState("");
  const codigoNovo = useMemo(() => slugRaia(novoRotulo), [novoRotulo]);

  const salvar = async (r: Edicao, nova: boolean): Promise<boolean> => {
    const payload = {
      rotulo: r.rotulo.trim(), ordem: r.ordem, cor: r.cor, departamento_id: r.departamento_id,
      pausa_regua: r.pausa_regua, exige_data_retorno: r.exige_data_retorno, ativo: r.ativo,
      descricao: r.descricao?.trim() || null,
    };
    const q = nova
      ? (supabase as any).from("cobranca_raia_dim").insert({ codigo: r.codigo, ...payload })
      : (supabase as any).from("cobranca_raia_dim").update(payload).eq("codigo", r.codigo);
    const { error } = await q;
    if (error) { toast.error(error.message); return false; }
    toast.success(nova ? "Raia criada." : "Raia salva.");
    await invalidarRecebivel();
    return true;
  };

  const criar = async () => {
    if (!codigoNovo) return;
    if (raias.some((r) => r.codigo === codigoNovo)) { toast.error(`Já existe a raia "${codigoNovo}".`); return; }
    const ordem = (raias.reduce((m, r) => Math.max(m, r.ordem), 0) || 0) + 10;
    const ok = await salvar({
      codigo: codigoNovo, rotulo: novoRotulo, ordem, cor: "gray", departamento_id: null,
      pausa_regua: false, exige_data_retorno: false, ativo: true, descricao: null,
    }, true);
    if (ok) setNovoRotulo("");
  };

  return (
    <section className="space-y-3 mt-8">
      <div>
        <h2 className="text-base font-semibold">Raias do kanban</h2>
        <p className="text-xs text-muted-foreground">
          {podeEditar ? "Raia não se exclui — só se desativa." : "Somente leitura."}
        </p>
      </div>
      {isLoading ? <Skeleton className="h-24 w-full" /> : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead><TableHead>Rótulo</TableHead><TableHead>Ordem</TableHead>
                <TableHead>Cor</TableHead><TableHead>Departamento</TableHead><TableHead>Pausa a régua</TableHead>
                <TableHead>Exige retorno</TableHead><TableHead>Ativo</TableHead><TableHead>Descrição</TableHead><TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {raias.map((r) => {
                const { departamento_nome: _d, ...ed } = r;
                return (
                  <LinhaRaia key={r.codigo} raia={ed} departamentos={departamentos}
                    qtd={contagem?.get(r.codigo) ?? 0} podeEditar={podeEditar} onSalvar={salvar} />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {podeEditar && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Input className="h-8 text-xs w-64" placeholder="Rótulo da nova raia" value={novoRotulo}
              onChange={(e) => setNovoRotulo(e.target.value)} />
            {codigoNovo && <p className="text-[10px] font-mono text-muted-foreground">código: {codigoNovo}</p>}
          </div>
          <Button size="sm" className="h-8 text-xs" disabled={!codigoNovo} onClick={criar}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Criar raia
          </Button>
        </div>
      )}
    </section>
  );
}
