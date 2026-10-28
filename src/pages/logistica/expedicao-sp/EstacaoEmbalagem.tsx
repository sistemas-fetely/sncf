import { CodProduto } from "@/components/produto/CodProduto";
import { useEffect, useMemo, useState } from "react";
import { Box, Loader2, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type CaixaSugerida, type ItemChecklistEmbalagem, type ItemPedidoMesa, type ModalEntrega, type ModalRegra,
} from "./tipos";
import { useModalSugerido, usePesoEstimado } from "./useMesaSp";
import { SeloServicoCorreios } from "./SeloServicoCorreios";

/**
 * Estação 4 — Embalagem. Peso REAL e volumes reais: a RPC recusa peso <= 0
 * justamente para não deixar entrar estimativa disfarçada de medição.
 *
 * O modal vem sugerido pela regra de CEP (`b2c_modal_regra`), mas o operador
 * manda: a sugestão é ponto de partida, não trava.
 *
 * O aviso fixo sobre etiqueta deu lugar à ROTINA DO MODAL (`b2c_embalagem_checklist`):
 * a lista é do banco, muda com o modal, e a MARCAÇÃO TAMBÉM É DO BANCO
 * (`b2c_embalagem_marcacao`) — a rotina atravessa o Bling, então marcar é ato
 * gravado, não estado de tela: o operador sai, volta e encontra o que marcou.
 */
interface Props {
  pedidoId: string;
  enderecoEntrega: unknown;
  /** Preenchido somente para venda direta; nos demais pedidos vale a regra de CEP. */
  modoVendaDireta: string | null;
  modalVendaDireta: string | null;
  /** Modal pré-selecionado fora da venda direta (ex.: B2B → TRANSPORTADORA). Operador pode trocar. */
  modalPreferido?: string | null;
  /** MESA-SP-SERVICO-CORREIOS: PAC/SEDEX e frete do banco, mostrado quando o modal escolhido é Correios. */
  servicoCorreios?: { servico: string | null; freteValor: number | null; freteGratis: boolean | null };
  itens: ItemPedidoMesa[];
  modais: ModalEntrega[];
  regras: ModalRegra[];
  checklist: ItemChecklistEmbalagem[];
  /** `id` dos itens de rotina JÁ marcados no banco para este pedido. */
  marcados: string[];
  /** Item cuja marcação está em voo — o checkbox dele espera o banco. */
  marcandoItemId: string | null;
  onAlternarMarcacao: (itemId: string, marcado: boolean) => void;
  caixas: CaixaSugerida[];
  carregandoCaixas: boolean;
  /** Mensagem real da RPC de sugestão, quando falhou. Não trava o registro. */
  erroCaixas: string | null;
  salvando: boolean;
  /** Cancelamento solicitado: não embala. */
  bloqueado?: boolean;
  /** `motivoTroca` preenchido = modal diferente do sugerido; a tela registra a troca antes de embalar. */
  onEmbalar: (pesoKg: number, volumes: number, modal: string, checklist: string[], caixaCodigo: string | null, motivoTroca: string | null) => void;
}


export function EstacaoEmbalagem({
  pedidoId, itens, modais, checklist,
  marcados, marcandoItemId, onAlternarMarcacao,
  caixas, carregandoCaixas, erroCaixas, salvando, onEmbalar, bloqueado = false, servicoCorreios,
}: Props) {
  const [peso, setPeso] = useState("");
  const [pesoEditado, setPesoEditado] = useState(false);
  const [volumes, setVolumes] = useState("1");
  const [volumesEditado, setVolumesEditado] = useState(false);
  const [modal, setModal] = useState<string>("");
  const [motivoTroca, setMotivoTroca] = useState("");
  const [caixa, setCaixa] = useState<string | null>(null);

  const marcadosSet = useMemo(() => new Set(marcados), [marcados]);

  const sugeridaCodigo = caixas.find((c) => c.sugerida)?.codigo ?? null;

  // Ao trocar de pedido, zera o que o operador digitou. Declarado ANTES da
  // pré-seleção da caixa, para o estado novo nascer limpo e a sugerida vir.
  useEffect(() => {
    setPeso("");
    setPesoEditado(false);
    setVolumes("1");
    setVolumesEditado(false);
    setCaixa(null);
  }, [pedidoId]);

  // A sugerida vem pré-selecionada uma vez; depois disso a escolha é do operador
  // (SISTEMA SUGERE / HUMANO DECIDE) — recalcular por cima seria roubo de foco.
  useEffect(() => {
    if (caixa !== null || !sugeridaCodigo) return;
    setCaixa(sugeridaCodigo);
  }, [pedidoId, sugeridaCodigo, caixa]);

  const sugestaoQ = useModalSugerido(pedidoId);
  const sugestao = sugestaoQ.data ?? null;
  const sugerido = sugestao?.modal ?? null;
  const modaisAtivos = useMemo(() => modais.filter((m) => m.ativo), [modais]);

  const nenhumaCabe = caixas.length > 0 && caixas.every((c) => !c.cabe);
  const caixaDiferenteDaSugerida =
    caixa !== null && sugeridaCodigo !== null && caixa !== sugeridaCodigo;

  // Modal acompanha pedido e sugestão; refetch de modais não apaga a caixa nem
  // o que o operador já digitou.
  useEffect(() => {
    setModal(sugerido && modaisAtivos.some((m) => m.codigo === sugerido) ? sugerido : "");
    setMotivoTroca("");
  }, [pedidoId, sugerido, modaisAtivos]);

  const trocou = sugerido !== null && modal !== "" && modal !== sugerido;

  const itensDoModal = useMemo(
    () => checklist.filter((i) => i.modal_codigo === modal),
    [checklist, modal],
  );

  // Volumes seguem a caixa escolhida, com a mesma regra do peso: só sobrescreve
  // enquanto o operador não editou o campo.
  const volumesSugestao = caixas.find((c) => c.codigo === caixa)?.volumes ?? null;
  useEffect(() => {
    if (volumesEditado || volumesSugestao === null) return;
    setVolumes(String(volumesSugestao));
  }, [volumesSugestao, volumesEditado]);

  const estimativaQ = usePesoEstimado(pedidoId, caixa, Number.parseInt(volumes, 10));
  const est = estimativaQ.data ?? null;
  const estTexto = est && est.total_kg > 0 ? est.total_kg.toFixed(3).replace(".", ",") : null;
  useEffect(() => {
    if (pesoEditado || !estTexto) return;
    setPeso(estTexto);
  }, [estTexto, pesoEditado]);
  const kg = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(3).replace(".", ","));

  const pesoNum = Number(peso.replace(",", "."));
  const volumesNum = Number.parseInt(volumes, 10);
  const faltando = itensDoModal.filter((i) => i.obrigatorio && !marcadosSet.has(i.id));
  const rotulosMarcados = itensDoModal.filter((i) => marcadosSet.has(i.id)).map((i) => i.rotulo);
  const podeSalvar =
    Number.isFinite(pesoNum) && pesoNum > 0 &&
    Number.isFinite(volumesNum) && volumesNum >= 1 &&
    modal !== "" &&
    (!trocou || motivoTroca.trim() !== "") &&
    faltando.length === 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {itens.length > 0 && (
          <div className="rounded-md border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-2.5">
              <PackageOpen className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Conteúdo da caixa</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold leading-none tabular-nums">
                    {itens.reduce((total, item) => total + item.quantidade, 0)}
                  </span>
                  <span className="text-sm text-muted-foreground">peças</span>
                  <span className="text-xs text-muted-foreground">· {itens.length} linha(s)</span>
                </div>
                <ul className="mt-3 space-y-1">
                  {itens.map((item) => (
                    <li key={item.id} className="flex items-baseline gap-2 text-sm">
                      <span className="shrink-0 font-medium tabular-nums">{item.quantidade} ×</span>
                      <span className="min-w-0 truncate">{item.descricao}</span>
                      {item.sku && (
                        <span className="ml-auto shrink-0">
                          <CodProduto chave={item.sku} variant="compacto" />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {erroCaixas && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Não foi possível sugerir caixas agora ({erroCaixas}). O registro da embalagem segue normal sem sugestão.
          </p>
        )}

        {!erroCaixas && !carregandoCaixas && caixas.length > 0 && (
          <div className="rounded-md border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-2.5">
              <Box className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Caixa sugerida</p>
              {caixaDiferenteDaSugerida && (
                <span className="text-xs text-muted-foreground">· diferente da sugerida</span>
              )}
            </div>

            {nenhumaCabe ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhuma caixa cadastrada comporta este pedido — escolha a embalagem na bancada e registre normalmente.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {caixas.map((c) => {
                  const selecionadaCaixa = caixa === c.codigo;
                  return (
                    <button
                      key={c.codigo}
                      type="button"
                      disabled={!c.cabe}
                      onClick={() => setCaixa(c.codigo)}
                      aria-pressed={selecionadaCaixa}
                      className={cn(
                        "rounded-md border p-3 text-left transition-colors",
                        c.cabe
                          ? selecionadaCaixa
                            ? "border-success bg-success/10"
                            : "border-border bg-card hover:border-foreground/30"
                          : "cursor-not-allowed border-border bg-muted/30 opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{c.codigo}</span>
                        <span className="truncate text-xs text-muted-foreground">{c.nome}</span>
                        {c.sugerida && (
                          <span className="ml-auto shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                            Sugerida
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.medidas}
                        {c.volumes > 1 && <span className="ml-1 font-medium text-foreground">× {c.volumes} volumes</span>}
                      </p>
                      {c.jogo_americano_curvado && (
                        <span className="mt-1 inline-block rounded-full bg-info/15 px-2 py-0.5 text-[11px] font-medium text-info">
                          jogo americano curvado
                        </span>
                      )}
                      {c.cabe ? (
                        <>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            ocupa {Math.round(c.ocupacao_pct)}% da caixa
                          </p>
                          {c.motivo && <p className="mt-0.5 text-xs text-warning">{c.motivo}</p>}
                        </>
                      ) : (
                        <p className="mt-0.5 text-xs text-muted-foreground">{c.motivo ?? "não cabe"}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}


        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="mesa-sp-peso">Peso real (kg)</Label>
            <Input
              id="mesa-sp-peso"
              inputMode="decimal"
              placeholder="0,000"
              value={peso}
              onChange={(e) => { setPeso(e.target.value); setPesoEditado(true); }}
            />
            {est && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Estimado pela ficha: {kg(est.total_kg)} kg (itens {kg(est.itens_kg)} + caixa {est.caixa_sem_peso ? "—" : kg(est.caixa_kg)})
                  {pesoEditado && estTexto && peso !== estTexto && (
                    <button
                      type="button"
                      className="ml-2 text-primary underline"
                      onClick={() => { setPeso(estTexto); setPesoEditado(false); }}
                    >
                      usar estimativa ({estTexto} kg)
                    </button>
                  )}
                </p>
                {!est.completo && (
                  <div className="rounded border border-warning bg-card px-2 py-1 text-warning">
                    {est.qtd_itens_sem_peso > 0 && (
                      <p>
                        {est.qtd_itens_sem_peso} item(ns) sem peso na ficha: {est.itens_sem_peso.map((i) => i.sku).join(", ")} — confira na balança
                      </p>
                    )}
                    {est.caixa_sem_peso && caixa && <p>caixa {caixa} sem peso cadastrado</p>}
                  </div>
                )}
              </div>
            )}
            {estimativaQ.error && (
              <p className="text-xs text-destructive">Sem estimativa de peso: {(estimativaQ.error as Error).message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mesa-sp-volumes">Volumes</Label>
            <Input
              id="mesa-sp-volumes"
              inputMode="numeric"
              value={volumes}
              onChange={(e) => { setVolumes(e.target.value); setVolumesEditado(true); }}
            />
            {volumesEditado && volumesSugestao !== null && volumes !== String(volumesSugestao) && (
              <button
                type="button"
                className="text-xs text-primary underline"
                onClick={() => { setVolumes(String(volumesSugestao)); setVolumesEditado(false); }}
              >
                usar sugestão ({volumesSugestao} {volumesSugestao === 1 ? "volume" : "volumes"})
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mesa-sp-modal">Modal</Label>
            <Select value={modal} onValueChange={setModal} disabled={sugestaoQ.isLoading}>
              <SelectTrigger id="mesa-sp-modal">
                <SelectValue placeholder="Escolher modal" />
              </SelectTrigger>
              <SelectContent>
                {modaisAtivos.map((m) => (
                  <SelectItem key={m.codigo} value={m.codigo}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {servicoCorreios && modais.find((m) => m.codigo === modal)?.exige_etiqueta_correios === true && (
              <SeloServicoCorreios
                servico={servicoCorreios.servico}
                freteValor={servicoCorreios.freteValor}
                freteGratis={servicoCorreios.freteGratis}
              />
            )}
          </div>
        </div>

        {sugestaoQ.error ? (
          <p className="text-xs text-destructive">{sugestaoQ.error instanceof Error ? sugestaoQ.error.message : String(sugestaoQ.error)}</p>
        ) : sugestao ? (
          <p className="text-xs text-muted-foreground">
            Sugerido: {modais.find((m) => m.codigo === sugestao.modal)?.nome ?? sugestao.modal}
            {sugestao.origem ? ` · ${sugestao.origem}` : ""}
          </p>
        ) : !sugestaoQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Sem sugestão de modal — escolha livre.</p>
        ) : null}

        {trocou && (
          <div className="space-y-1.5">
            <Label htmlFor="mesa-sp-motivo-troca">Motivo da troca</Label>
            <Textarea
              id="mesa-sp-motivo-troca"
              value={motivoTroca}
              onChange={(e) => setMotivoTroca(e.target.value)}
              placeholder="Por que sai por outro modal? (obrigatório)"
              rows={2}
            />
          </div>
        )}

        {/* Documentos (DANFE, etiqueta, romaneio) saíram daqui: são a estação seguinte. Sem rotina, sem bloco. */}
        {modal !== "" && itensDoModal.length > 0 && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rotina de {modais.find((m) => m.codigo === modal)?.nome ?? modal}
            </p>

            {(
              <ul className="space-y-2">
                {itensDoModal.map((item) => {
                  const id = `mesa-sp-check-${item.id}`;
                  return (
                    <li key={item.id} className="flex items-start gap-2">
                      <Checkbox
                        id={id}
                        className="mt-0.5"
                        checked={marcadosSet.has(item.id)}
                        disabled={marcandoItemId === item.id}
                        onCheckedChange={(v) => onAlternarMarcacao(item.id, v === true)}
                      />
                      <div className="min-w-0 space-y-0.5">
                        <Label htmlFor={id} className="block text-sm font-normal leading-snug">
                          {item.rotulo}
                          {!item.obrigatorio && (
                            <span className="text-xs text-muted-foreground"> · opcional</span>
                          )}
                        </Label>
                        {item.observacao && (
                          <p className="text-xs text-muted-foreground">{item.observacao}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => onEmbalar(pesoNum, volumesNum, modal, rotulosMarcados, caixa, trocou ? motivoTroca.trim() : null)}
            disabled={!podeSalvar || salvando || bloqueado}
          >
            {salvando && <Loader2 className="animate-spin" aria-hidden="true" />}
            Registrar embalagem
          </Button>
          {faltando.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Faltam {faltando.length} item(ns) da rotina.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
