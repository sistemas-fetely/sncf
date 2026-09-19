import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

/**
 * Linha de item — a unidade de trabalho do operador é a PEÇA, não o SKU.
 * O mesmo SKU pode aparecer nos dois blocos ao mesmo tempo: o bloco de cima
 * mostra o que AINDA FALTA (quantidade pendente), o de baixo o que JÁ FOI
 * bipado (quantidade conferida). O selo "ok" é só de quem completou — parcial
 * não é ok, é info.
 */
function LinhaItem({
  item, quantidade, modo, realce,
}: { item: ItemPedidoMesa; quantidade: number; modo: "conferir" | "conferido"; realce: boolean }) {
  const ok = modo === "conferido" && quantidade >= item.quantidade;
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-all duration-700",
        modo === "conferido" && !realce && "opacity-75",
        ok && "border-success/40 bg-success/10",
        realce && "border-success bg-success/20 opacity-100 ring-2 ring-success/60",
      )}
    >
      <div className="min-w-0">
        <p className={cn("truncate", modo === "conferido" ? "text-xs" : "text-sm")}>{item.descricao}</p>
        <p className="font-mono text-xs text-muted-foreground">
          {item.sku ?? "sem SKU"} · {item.ean ?? "sem EAN"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {modo === "conferir" ? (
          // A coluna da direita nunca é um número cru: o que falta é rótulo.
          <Selo estado="warning">
            falta {quantidade} {quantidade === 1 ? "peça" : "peças"}
          </Selo>
        ) : ok ? (
          <Selo estado="success">
            <Check className="mr-1 h-3 w-3" aria-hidden="true" />
            ok
          </Selo>
        ) : (
          <Selo estado="info">
            {quantidade} {quantidade === 1 ? "conferida" : "conferidas"}
          </Selo>
        )}
      </div>
    </li>
  );
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
  /** Item que ACABOU de receber um bipe — realce de ~1,5s no bloco Conferidos. */
  const [realce, setRealce] = useState<string | null>(null);
  /** Ordem de bipe — o último bipado fica no topo dos conferidos. */
  const [ordemConferidos, setOrdemConferidos] = useState<string[]>([]);
  const timerRealce = useRef<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  /** Trava de disparo único: a conferência OK é automática ao completar. */
  const jaRegistrou = useRef(false);

  // Troca de pedido zera tudo — contador de um pedido nunca vaza para o outro.
  useEffect(() => {
    setBipados({});
    setBuffer("");
    setAlerta(null);
    setMotivo("");
    setRealce(null);
    setOrdemConferidos([]);
    if (timerRealce.current !== null) window.clearTimeout(timerRealce.current);
    timerRealce.current = null;
    jaRegistrou.current = false;
  }, [pedidoId]);

  // A tela desmonta com o realce pendente: o timeout não pode disparar depois.
  useEffect(() => () => {
    if (timerRealce.current !== null) window.clearTimeout(timerRealce.current);
  }, []);

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
    // CADA bipe move o item para o topo dos conferidos e acende o realce —
    // a peça bipada aparece no bloco de baixo na hora, não só ao completar.
    setOrdemConferidos((ordem) => [...ordem.filter((id) => id !== alvo.id), alvo.id]);
    setRealce(alvo.id);
    if (timerRealce.current !== null) window.clearTimeout(timerRealce.current);
    timerRealce.current = window.setTimeout(() => setRealce(null), 1500);
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

  // Bloco de cima: o que AINDA FALTA de cada SKU (bipe parcial primeiro — o
  // operador volta ao que estava fazendo). Bloco de baixo: o que JÁ FOI
  // bipado de cada SKU, último bipe no topo. O mesmo SKU pode estar nos dois.
  const aConferir = itens
    .filter((i) => (bipados[i.id] ?? 0) < i.quantidade)
    .sort((a, b) => (bipados[b.id] ?? 0) - (bipados[a.id] ?? 0));
  const ordemIdx = new Map(ordemConferidos.map((id, idx) => [id, idx]));
  const conferidos = itens
    .filter((i) => (bipados[i.id] ?? 0) > 0)
    .sort((a, b) => (ordemIdx.get(b.id) ?? -1) - (ordemIdx.get(a.id) ?? -1));

  // Contadores em PEÇAS, não em linhas: a bancada conta peça.
  const pecasAConferir = aConferir.reduce((s, i) => s + i.quantidade - (bipados[i.id] ?? 0), 0);
  const pecasConferidas = conferidos.reduce((s, i) => s + (bipados[i.id] ?? 0), 0);

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

        {aConferir.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              A conferir · {pecasAConferir} {pecasAConferir === 1 ? "peça" : "peças"}
            </h3>
            <ul className="space-y-2">
              {aConferir.map((i) => (
                <LinhaItem
                  key={i.id}
                  item={i}
                  quantidade={i.quantidade - (bipados[i.id] ?? 0)}
                  modo="conferir"
                  realce={false}
                />
              ))}
            </ul>
          </section>
        )}

        {conferidos.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Conferidos · {pecasConferidas} {pecasConferidas === 1 ? "peça" : "peças"}
            </h3>
            <ul className="space-y-2">
              {conferidos.map((i) => (
                <LinhaItem
                  key={i.id}
                  item={i}
                  quantidade={bipados[i.id] ?? 0}
                  modo="conferido"
                  realce={realce === i.id}
                />
              ))}
            </ul>
          </section>
        )}

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
