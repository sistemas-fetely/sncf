import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, HelpCircle, Info, Loader2 } from "lucide-react";
import { useEmpurrarXpm } from "@/hooks/pedidos/useEmpurrarXpm";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { DialogoAbrirProblema } from "@/components/chamados/DialogoAbrirProblema";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DialogoDeclaracaoB2B,
  invalidarSaidasB2B,
  useB2bSaidaPermitida,
  type DeclaracaoB2B,
} from "@/components/pedidos/DialogoDeclaracaoB2B";

type MotivoTravado = {
  pedido_id: string;
  motivo: string;
  ordem: number | null;
  desde: string | null;
  acao: string | null;
  o_que_fazer: string | null;
  classe?: string | null;
  chave?: string | null;
  ref: Record<string, unknown> | null;
};

export const ID_BLOCO_TRAVADO = "bloco-travado";
export const ID_BLOCO_ALERTAS = "alertas-auditoria";

const fmtDdMm = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

async function invalidarTudo(qc: ReturnType<typeof useQueryClient>, pedidoId: string) {
  await Promise.all([
    invalidarSaidasB2B(qc),
    qc.invalidateQueries({ queryKey: ["pedido-travado-motivos", pedidoId] }),
    qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(pedidoId) }),
  ]);
}

/** Vincula a NF candidata ao pedido (RPC do banco) — usado no bloco e no Dash. */
export function useVincularNfCandidata(pedidoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (nfId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("fn_pedido_vincular_nf_candidata", {
        p_pedido_id: pedidoId,
        p_nf_id: nfId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("NF vinculada ao pedido");
      await invalidarTudo(qc, pedidoId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function AcoesMotivo({ m, pedidoId, idExterno }: { m: MotivoTravado; pedidoId: string; idExterno?: string | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: permitido } = useB2bSaidaPermitida();
  const [declaracao, setDeclaracao] = useState<DeclaracaoB2B | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [obs, setObs] = useState("");
  const vincular = useVincularNfCandidata(pedidoId);
  const ref = m.ref ?? {};

  const cobrar = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_pedido_b2b_cobrar_transportadora", {
        p_pedido_id: pedidoId,
        p_obs: obs.trim(),
      });
      if (error) throw error;
      return data as { volta_em?: string } | null;
    },
    onSuccess: async (d) => {
      const volta = fmtDdMm(d?.volta_em);
      toast.success(volta ? `Cobrança registrada · volta em ${volta}` : "Cobrança registrada");
      setCobrando(false);
      setObs("");
      await invalidarTudo(qc, pedidoId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const btn = "h-7 text-xs";
  const pode = permitido === true;

  if (m.acao === "abrir_chamado" && ref.chamado_id) {
    return (
      <Button size="sm" variant="outline" className={btn}
        onClick={() => navigate(`/chamados/${String(ref.chamado_id)}`, { state: { from: location.pathname + location.search, fromLabel: "Pedido" } })}>
        Abrir {String(ref.numero ?? "chamado")}
      </Button>
    );
  }
  const ehAuditoria = typeof ref.regra_slug === "string" && !!ref.regra_slug;
  if (ehAuditoria && ref.regra_slug === "pedido-em-separacao-sem-expedicao-xpm") {
    return <BotaoEmpurrarXpm pedidoId={pedidoId} />;
  }
  if (ehAuditoria && ref.responsavel === "ti") {
    return <BotaoAcionarTi pedidoRef={idExterno ?? pedidoId} titulo={m.motivo} />;
  }
  if (m.acao === "ver_auditoria" || ehAuditoria) {
    return (
      <Button size="sm" variant="outline" className={btn}
        onClick={() => document.getElementById(ID_BLOCO_ALERTAS)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        Ver alertas
      </Button>
    );
  }
  if (!pode) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {m.acao === "vincular_nf" && ref.nf_candidata_id && (
          <Button size="sm" variant="outline" className={btn} disabled={vincular.isPending}
            onClick={() => vincular.mutate(String(ref.nf_candidata_id))}>
            Vincular NF {String(ref.nf_candidata_numero ?? "")}
          </Button>
        )}
        {m.acao === "cobrar_ou_declarar_entrega" && (
          <Button size="sm" variant="outline" className={btn} onClick={() => setCobrando((v) => !v)}>
            Cobrei a transportadora
          </Button>
        )}
        {m.acao === "declarar_embarque_ou_entrega" && (
          <Button size="sm" variant="outline" className={btn} onClick={() => setDeclaracao("embarque")}>
            Declarar embarque
          </Button>
        )}
        {(m.acao === "cobrar_ou_declarar_entrega" || m.acao === "declarar_embarque_ou_entrega") && (
          <Button size="sm" variant="outline" className={btn} onClick={() => setDeclaracao("entrega")}>
            Declarar entrega
          </Button>
        )}
      </div>
      {cobrando && (
        <div className="flex gap-2">
          <Input className="h-8 text-xs" placeholder="O que a transportadora respondeu (mín. 10 caracteres)"
            value={obs} onChange={(e) => setObs(e.target.value)} />
          <Button size="sm" disabled={obs.trim().length < 10 || cobrar.isPending} onClick={() => cobrar.mutate()}>
            Registrar cobrança
          </Button>
        </div>
      )}
      {declaracao && (
        <DialogoDeclaracaoB2B tipo={declaracao} pedidoId={pedidoId} idExterno={idExterno}
          open={!!declaracao}
          onOpenChange={(v) => {
            if (!v) {
              setDeclaracao(null);
              invalidarTudo(qc, pedidoId);
            }
          }} />
      )}
    </div>
  );
}

function BotaoEmpurrarXpm({ pedidoId }: { pedidoId: string }) {
  const empurrar = useEmpurrarXpm();
  const { permitido } = usePermissaoAcaoOuSuperAdmin("acao.empurrar_xpm");
  return (
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
      disabled={empurrar.isPending || !permitido}
      title={permitido ? undefined : "Sem permissão para empurrar pra XPM"}
      onClick={() => empurrar.mutate({ pedido_id: pedidoId })}>
      {empurrar.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      Empurrar pra XPM
    </Button>
  );
}

function BotaoAcionarTi({ pedidoRef, titulo }: { pedidoRef: string; titulo: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAberto(true)}>
        Acionar TI
      </Button>
      <DialogoAbrirProblema open={aberto} onOpenChange={setAberto}
        contexto={{ pedidoRef, descricao: titulo }} />
    </>
  );
}

function LinhaMotivo({ m, pedidoId, idExterno }: { m: MotivoTravado; pedidoId: string; idExterno?: string | null }) {
  const ref = m.ref ?? {};
  const ehAuditoria = typeof ref.regra_slug === "string" && !!ref.regra_slug;
  const detalhe = typeof ref.detalhe === "string" && ref.detalhe.trim() ? ref.detalhe : null;
  const respRotulo = typeof ref.responsavel_rotulo === "string" ? ref.responsavel_rotulo : null;
  const comoAcionar = typeof ref.como_acionar === "string" && ref.como_acionar.trim() ? ref.como_acionar : null;
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{m.motivo}</span>
        {fmtDdMm(m.desde) && <span className="text-xs text-muted-foreground">desde {fmtDdMm(m.desde)}</span>}
      </div>
      {ehAuditoria ? (
        <>
          {m.o_que_fazer && <p className="text-sm font-medium text-foreground">{m.o_que_fazer}</p>}
          {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
          {respRotulo && (
            <p className="text-xs text-muted-foreground">
              Quem resolve: <span className="font-medium text-foreground">{respRotulo}</span>
              {ref.responsavel !== "operador" && comoAcionar && <> · {comoAcionar}</>}
            </p>
          )}
        </>
      ) : (
        m.o_que_fazer && <p className="text-xs text-muted-foreground">{m.o_que_fazer}</p>
      )}
      <AcoesMotivo m={m} pedidoId={pedidoId} idExterno={idExterno} />
    </div>
  );
}

/** Bloco "Travado" no topo do pedido B2B: motivo, desde quando, o que fazer e a saída. */
export function BlocoTravadoB2B({ pedidoId, idExterno }: { pedidoId: string; idExterno?: string | null }) {
  const location = useLocation();
  const { data: motivos = [] } = useQuery({
    queryKey: ["pedido-travado-motivos", pedidoId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_b2b_travado_motivo")
        .select("*")
        .eq("pedido_id", pedidoId)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MotivoTravado[];
    },
  });

  useEffect(() => {
    if (location.hash === `#${ID_BLOCO_TRAVADO}` && motivos.length > 0) {
      document.getElementById(ID_BLOCO_TRAVADO)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash, motivos.length]);

  if (motivos.length === 0) return null;

  const travados = motivos.filter((m) => m.classe === "travado");
  const parados = motivos.filter((m) => m.classe === "parado");
  const sugestoes = motivos.filter((m) => m.classe === "sugestao");

  return (
    <div id={ID_BLOCO_TRAVADO} className="mx-6 mb-3 scroll-mt-24 space-y-3">
      {travados.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Travado
          </div>
          {travados.map((m, i) => <LinhaMotivo key={`${m.motivo}-${i}`} m={m} pedidoId={pedidoId} idExterno={idExterno} />)}
        </div>
      )}
      {parados.length > 0 && (
        <div className="rounded-lg border border-info/30 bg-info/5 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-info">
            <Info className="h-4 w-4" />
            Parado
          </div>
          {parados.map((m, i) => <LinhaMotivo key={`${m.motivo}-${i}`} m={m} pedidoId={pedidoId} idExterno={idExterno} />)}
        </div>
      )}
      {sugestoes.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <HelpCircle className="h-4 w-4" />
            Parece travado?
          </div>
          {sugestoes.map((m, i) => <LinhaSugestao key={`${m.chave ?? m.motivo}-${i}`} m={m} pedidoId={pedidoId} idExterno={idExterno} />)}
        </div>
      )}
    </div>
  );
}

/** Sinal automático: não é travado até alguém declarar (abrir problema) ou descartar. */
function LinhaSugestao({ m, pedidoId, idExterno }: { m: MotivoTravado; pedidoId: string; idExterno?: string | null }) {
  const qc = useQueryClient();
  const [declarando, setDeclarando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const descartar = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("fn_travado_sugestao_descartar", {
        p_pedido_id: pedidoId,
        p_chave: m.chave,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Sugestão descartada");
      setDescartando(false);
      setMotivo("");
      await invalidarTudo(qc, pedidoId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{m.motivo}</span>
        {fmtDdMm(m.desde) && <span className="text-xs text-muted-foreground">desde {fmtDdMm(m.desde)}</span>}
      </div>
      {m.o_que_fazer && <p className="text-xs text-muted-foreground">{m.o_que_fazer}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDeclarando(true)}>
          Declarar travado
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!m.chave}
          onClick={() => setDescartando((v) => !v)}>
          Não está travado
        </Button>
      </div>
      {descartando && (
        <div className="flex gap-2">
          <Input className="h-8 text-xs" placeholder="Por que não está travado? (mín. 3 caracteres)"
            value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Button size="sm" disabled={motivo.trim().length < 3 || descartar.isPending} onClick={() => descartar.mutate()}>
            {descartar.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Confirmar
          </Button>
        </div>
      )}
      <DialogoAbrirProblema open={declarando}
        onOpenChange={(v) => { setDeclarando(v); if (!v) invalidarTudo(qc, pedidoId); }}
        contexto={{ pedidoRef: idExterno ?? pedidoId, descricao: m.motivo }} />
    </div>
  );
}
