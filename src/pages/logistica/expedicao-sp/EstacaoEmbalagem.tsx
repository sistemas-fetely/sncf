import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cepDoEndereco, modalSugerido, type ModalEntrega, type ModalRegra } from "./tipos";

/**
 * Estação 4 — Embalagem. Peso REAL e volumes reais: a RPC recusa peso <= 0
 * justamente para não deixar entrar estimativa disfarçada de medição.
 *
 * O modal vem sugerido pela regra de CEP (`b2c_modal_regra`), mas o operador
 * manda: a sugestão é ponto de partida, não trava.
 */
interface Props {
  enderecoEntrega: unknown;
  modais: ModalEntrega[];
  regras: ModalRegra[];
  salvando: boolean;
  onEmbalar: (pesoKg: number, volumes: number, modal: string) => void;
}

export function EstacaoEmbalagem({ enderecoEntrega, modais, regras, salvando, onEmbalar }: Props) {
  const [peso, setPeso] = useState("");
  const [volumes, setVolumes] = useState("1");
  const [modal, setModal] = useState<string>("");

  const cep = cepDoEndereco(enderecoEntrega);
  const sugerido = modalSugerido(cep, regras);

  // A sugestão preenche uma vez, quando as dimensões chegam. Depois disso quem
  // manda é o operador — recalcular por cima da escolha dele seria roubo de foco.
  useEffect(() => {
    if (modal !== "" || !sugerido) return;
    if (!modais.some((m) => m.codigo === sugerido)) return;
    setModal(sugerido);
  }, [sugerido, modais, modal]);

  const escolhido = modais.find((m) => m.codigo === modal) ?? null;
  const pesoNum = Number(peso.replace(",", "."));
  const volumesNum = Number.parseInt(volumes, 10);
  const podeSalvar =
    Number.isFinite(pesoNum) && pesoNum > 0 &&
    Number.isFinite(volumesNum) && volumesNum >= 1 &&
    modal !== "";

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
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

        {escolhido?.exige_etiqueta_correios && (
          <div className="flex items-start gap-2 rounded-md bg-info/15 px-3 py-2 text-sm text-info-strong">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Gerar etiqueta no Bling antes de despachar.{" "}
              <a
                className="underline underline-offset-4"
                href="https://www.bling.com.br/b/vendas.pedidos.php"
                target="_blank"
                rel="noreferrer"
              >
                Abrir Bling
              </a>{" "}
              — v1 manual: o rastreio volta sozinho pela varredura dos Correios.
            </span>
          </div>
        )}

        <Button
          onClick={() => onEmbalar(pesoNum, volumesNum, modal)}
          disabled={!podeSalvar || salvando}
        >
          {salvando && <Loader2 className="animate-spin" aria-hidden="true" />}
          Registrar embalagem
        </Button>
      </CardContent>
    </Card>
  );
}
