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
import {
  cepDoEndereco, modalSugerido,
  type CaixaSugerida, type ItemChecklistEmbalagem, type ItemPedidoMesa, type ModalEntrega, type ModalRegra,
} from "./tipos";

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
  enderecoEntrega: unknown;
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
  onEmbalar: (pesoKg: number, volumes: number, modal: string, checklist: string[], caixaCodigo: string | null) => void;
}


export function EstacaoEmbalagem({
  enderecoEntrega, itens, modais, regras, checklist,
  marcados, marcandoItemId, onAlternarMarcacao,
  caixas, carregandoCaixas, erroCaixas, salvando, onEmbalar,
}: Props) {
  const [peso, setPeso] = useState("");
  const [volumes, setVolumes] = useState("1");
  const [modal, setModal] = useState<string>("");
  const [caixa, setCaixa] = useState<string | null>(null);

  const marcadosSet = useMemo(() => new Set(marcados), [marcados]);

  const sugeridaCodigo = caixas.find((c) => c.sugerida)?.codigo ?? null;

  // A sugerida vem pré-selecionada uma vez; depois disso a escolha é do operador
  // (SISTEMA SUGERE / HUMANO DECIDE) — recalcular por cima seria roubo de foco.
  useEffect(() => {
    if (caixa !== null || !sugeridaCodigo) return;
    setCaixa(sugeridaCodigo);
  }, [sugeridaCodigo, caixa]);

  const cep = cepDoEndereco(enderecoEntrega);
  const sugerido = modalSugerido(cep, regras);

  const nenhumaCabe = caixas.length > 0 && caixas.every((c) => !c.cabe);
  const caixaDiferenteDaSugerida =
    caixa !== null && sugeridaCodigo !== null && caixa !== sugeridaCodigo;

  // A sugestão preenche uma vez, quando as dimensões chegam. Depois disso quem
  // manda é o operador — recalcular por cima da escolha dele seria roubo de foco.
  useEffect(() => {
    if (modal !== "" || !sugerido) return;
    if (!modais.some((m) => m.codigo === sugerido)) return;
    setModal(sugerido);
  }, [sugerido, modais, modal]);

  const itensDoModal = useMemo(
    () => checklist.filter((i) => i.modal_codigo === modal),
    [checklist, modal],
  );

  const pesoNum = Number(peso.replace(",", "."));
  const volumesNum = Number.parseInt(volumes, 10);
  const faltando = itensDoModal.filter((i) => i.obrigatorio && !marcadosSet.has(i.id));
  const rotulosMarcados = itensDoModal.filter((i) => marcadosSet.has(i.id)).map((i) => i.rotulo);
  const podeSalvar =
    Number.isFinite(pesoNum) && pesoNum > 0 &&
    Number.isFinite(volumesNum) && volumesNum >= 1 &&
    modal !== "" &&
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
                        <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                          {item.sku}
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
                      <p className="mt-1 text-xs text-muted-foreground">{c.medidas}</p>
                      {c.cabe ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          ocupa {Math.round(c.ocupacao_pct)}% da caixa
                        </p>
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
              onChange={(e) => setPeso(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mesa-sp-volumes">Volumes</Label>
            <Input
              id="mesa-sp-volumes"
              inputMode="numeric"
              value={volumes}
              onChange={(e) => setVolumes(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mesa-sp-modal">Modal</Label>
            <Select value={modal} onValueChange={setModal}>
              <SelectTrigger id="mesa-sp-modal">
                <SelectValue placeholder="Escolher modal" />
              </SelectTrigger>
              <SelectContent>
                {modais.map((m) => (
                  <SelectItem key={m.codigo} value={m.codigo}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {cep
            ? `CEP de entrega ${cep}${sugerido ? ` · regra sugere ${sugerido}` : " · sem regra aplicável"}`
            : "Pedido sem CEP legível no endereço de entrega — a sugestão caiu na regra default."}
        </p>

        {modal !== "" && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rotina de {modais.find((m) => m.codigo === modal)?.nome ?? modal}
            </p>

            {itensDoModal.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Este modal não tem rotina cadastrada — nada a marcar antes de registrar.
              </p>
            ) : (
              <ul className="space-y-2">
                {itensDoModal.map((item) => {
                  const id = `mesa-sp-check-${item.modal_codigo}-${item.ordem}`;
                  return (
                    <li key={id} className="flex items-start gap-2">
                      <Checkbox
                        id={id}
                        className="mt-0.5"
                        checked={marcados.has(item.rotulo)}
                        onCheckedChange={(v) => alternar(item.rotulo, v === true)}
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
            onClick={() => onEmbalar(pesoNum, volumesNum, modal, [...marcados], caixa)}
            disabled={!podeSalvar || salvando}
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
