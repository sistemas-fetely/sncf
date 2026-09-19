import { useEffect, useMemo, useState } from "react";
import { Loader2, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  cepDoEndereco, modalSugerido,
  type ItemChecklistEmbalagem, type ItemPedidoMesa, type ModalEntrega, type ModalRegra,
} from "./tipos";

/**
 * Estação 4 — Embalagem. Peso REAL e volumes reais: a RPC recusa peso <= 0
 * justamente para não deixar entrar estimativa disfarçada de medição.
 *
 * O modal vem sugerido pela regra de CEP (`b2c_modal_regra`), mas o operador
 * manda: a sugestão é ponto de partida, não trava.
 *
 * O aviso fixo sobre etiqueta deu lugar à ROTINA DO MODAL (`b2c_embalagem_checklist`):
 * a lista é do banco, muda com o modal e as marcações zeram na troca — rotina de
 * outro modal é outra rotina, não continuação da anterior.
 */
interface Props {
  enderecoEntrega: unknown;
  itens: ItemPedidoMesa[];
  modais: ModalEntrega[];
  regras: ModalRegra[];
  checklist: ItemChecklistEmbalagem[];
  salvando: boolean;
  onEmbalar: (pesoKg: number, volumes: number, modal: string, checklist: string[]) => void;
}


export function EstacaoEmbalagem({
  enderecoEntrega, itens, modais, regras, checklist, salvando, onEmbalar,
}: Props) {
  const [peso, setPeso] = useState("");
  const [volumes, setVolumes] = useState("1");
  const [modal, setModal] = useState<string>("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  const cep = cepDoEndereco(enderecoEntrega);
  const sugerido = modalSugerido(cep, regras);

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
  const faltando = itensDoModal.filter((i) => i.obrigatorio && !marcados.has(i.rotulo));
  const podeSalvar =
    Number.isFinite(pesoNum) && pesoNum > 0 &&
    Number.isFinite(volumesNum) && volumesNum >= 1 &&
    modal !== "" &&
    faltando.length === 0;

  function trocarModal(codigo: string) {
    setModal(codigo);
    setMarcados(new Set());
  }

  function alternar(rotulo: string, marcado: boolean) {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (marcado) proximo.add(rotulo);
      else proximo.delete(rotulo);
      return proximo;
    });
  }

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
            <Select value={modal} onValueChange={trocarModal}>
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
            onClick={() => onEmbalar(pesoNum, volumesNum, modal, [...marcados])}
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
