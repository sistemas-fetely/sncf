import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { normalizarCodigo, type ItemConferido, type ItemPedidoMesa } from "./tipos";

/**
 * Estação 3 — Conferência por bipagem.
 *
 * O leitor USB é um TECLADO: digita o código e manda Enter. Por isso não há
 * botão de "ler" — há um input que nunca perde o foco e um submit por Enter.
 *
 * REGRA-DE-BANCADA: bipe errado NÃO TRAVA a tela. O operador tem as mãos
 * ocupadas; o erro grita (som + faixa vermelha) e a fila continua. Só a RPC
 * decide o desfecho, e ela exige motivo para divergência.
 */

/** Bipe curto de erro. Sem asset: WebAudio nasce e morre no gesto. */
function tocarAlerta() {
  try {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 220;
    ganho.gain.value = 0.08;
    osc.connect(ganho).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
    osc.onended = () => void ctx.close();
  } catch {
    // Som é reforço, não requisito: navegador que bloqueia áudio não pode
    // derrubar a conferência. O alerta visual já está na tela.
  }
}

interface Props {
  pedidoId: string;
  itens: ItemPedidoMesa[];
  carregando: boolean;
  registrando: boolean;
  onRegistrar: (itens: ItemConferido[], ok: boolean, motivo: string | null) => void;
  onVoltarSeparacao: () => void;
}

export function EstacaoConferencia({
  pedidoId, itens, carregando, registrando, onRegistrar, onVoltarSeparacao,
}: Props) {
  const [bipados, setBipados] = useState<Record<string, number>>({});
  const [buffer, setBuffer] = useState("");
  const [alerta, setAlerta] = useState<string | null>(null);
  const [dialogDivergencia, setDialogDivergencia] = useState(false);
  const [motivo, setMotivo] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  /** Trava de disparo único: a conferência OK é automática ao completar. */
  const jaRegistrou = useRef(false);

  // Troca de pedido zera tudo — contador de um pedido nunca vaza para o outro.
  useEffect(() => {
    setBipados({});
    setBuffer("");
    setAlerta(null);
    setMotivo("");
    jaRegistrou.current = false;
  }, [pedidoId]);

  const focar = useCallback(() => {
    if (dialogDivergencia) return; // o diálogo precisa do foco dele
    inputRef.current?.focus();
  }, [dialogDivergencia]);

  useEffect(() => { focar(); }, [focar, carregando]);

  const completo = useMemo(
    () => itens.length > 0 && itens.every((i) => (bipados[i.id] ?? 0) >= i.quantidade),
    [itens, bipados],
  );

  const paraRpc = useCallback(
    (): ItemConferido[] =>
      itens.map((i) => ({
        sku: i.sku,
        ean: i.ean,
        esperado: i.quantidade,
        bipado: bipados[i.id] ?? 0,
      })),
    [itens, bipados],
  );

  // Todos os itens completos → registra sozinho. É o gesto que o briefing pede:
  // o último bipe fecha a conferência, sem pedir mais nada ao operador.
  useEffect(() => {
    if (!completo || jaRegistrou.current || registrando) return;
    jaRegistrou.current = true;
    onRegistrar(paraRpc(), true, null);
  }, [completo, registrando, onRegistrar, paraRpc]);

  function processar(codigoBruto: string) {
    const codigo = normalizarCodigo(codigoBruto);
    if (codigo === "") return;
    setBuffer("");

    // Casa por EAN (o que o leitor lê). SKU é aceito como segunda chave para o
    // item sem EAN cadastrado, que só pode entrar digitado à mão.
    const candidatos = itens.filter(
      (i) => normalizarCodigo(i.ean ?? "") === codigo || normalizarCodigo(i.sku ?? "") === codigo,
    );

    if (candidatos.length === 0) {
      tocarAlerta();
      setAlerta(`${codigo} não pertence a este pedido.`);
      return;
    }

    // Vários itens com o mesmo código: enche o primeiro que ainda falta.
    const alvo = candidatos.find((i) => (bipados[i.id] ?? 0) < i.quantidade);
    if (!alvo) {
      tocarAlerta();
      setAlerta(`${codigo} já foi bipado na quantidade do pedido.`);
      return;
    }

    setAlerta(null);
    setBipados((atual) => ({ ...atual, [alvo.id]: (atual[alvo.id] ?? 0) + 1 }));
  }

  function confirmarDivergencia() {
    const texto = motivo.trim();
    if (texto === "") return; // a RPC também recusa, mas não faz sentido chamá-la
    setDialogDivergencia(false);
    onRegistrar(paraRpc(), false, texto);
    onVoltarSeparacao();
  }

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando os itens para conferir…
        </CardContent>
      </Card>
    );
  }

  const totalEsperado = itens.reduce((s, i) => s + i.quantidade, 0);
  const totalBipado = itens.reduce((s, i) => s + Math.min(bipados[i.id] ?? 0, i.quantidade), 0);

  return (
    <Card onClick={focar}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[18rem] flex-1 space-y-1.5">
            <Label htmlFor="mesa-sp-bipagem">Bipe os itens</Label>
            <div className="relative">
              <ScanBarcode
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="mesa-sp-bipagem"
                ref={inputRef}
                autoFocus
                autoComplete="off"
                className="pl-9 font-mono"
                placeholder="Leitor USB ou digitação + Enter"
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  processar(buffer);
                }}
                // O leitor só funciona com o input focado. Qualquer clique fora
                // devolve o foco no próximo tick (sem brigar com o diálogo).
                onBlur={() => window.setTimeout(focar, 0)}
              />
            </div>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {totalBipado} / {totalEsperado} peças
          </div>
        </div>

        <div aria-live="assertive">
          {alerta && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive-strong">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {alerta}
            </div>
          )}
        </div>

        <ul className="space-y-2">
          {itens.map((i) => {
            const feito = bipados[i.id] ?? 0;
            const ok = feito >= i.quantidade;
            return (
              <li
                key={i.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                  ok && "border-success/40 bg-success/10",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{i.descricao}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {i.sku ?? "sem SKU"} · {i.ean ?? "sem EAN"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums">
                    {feito} / {i.quantidade}
                  </span>
                  {ok ? (
                    <Selo estado="success">
                      <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                      ok
                    </Selo>
                  ) : (
                    <Selo estado="warning">falta {i.quantidade - feito}</Selo>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setDialogDivergencia(true)} disabled={registrando}>
            Registrar divergência
          </Button>
          {registrando && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Registrando…
            </span>
          )}
          {completo && !registrando && (
            <span className="text-sm text-muted-foreground">
              Conferência completa — registrada automaticamente.
            </span>
          )}
        </div>
      </CardContent>

      <Dialog open={dialogDivergencia} onOpenChange={setDialogDivergencia}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar divergência</DialogTitle>
            <DialogDescription>
              O pedido volta para a separação (retrabalho). O estágio não muda — o
              motivo fica na trilha para quem for refazer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="mesa-sp-motivo">Motivo</Label>
            <Textarea
              id="mesa-sp-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: faltou 1 un do SKU X na caixa"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogDivergencia(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarDivergencia}
              disabled={motivo.trim() === ""}
            >
              Registrar divergência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
