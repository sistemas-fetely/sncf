/**
 * Registrar Recebimento — dinheiro entra na CONTA DO CLIENTE.
 *
 * NÃO existe campo de pedido aqui, e isso é por desenho:
 * DINHEIRO-CREDITA-CONTA-PEDIDO-DEBITA-SALDO. Quem procura pedido está
 * procurando o eixo antigo.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Selo } from "@/components/ui/selo";
import { formatBRL } from "@/lib/format-currency";
import {
  useClientesBusca,
  useRegistrarRecebimentoCliente,
  type NivelProva,
} from "@/hooks/financeiro/useContaCliente";
import { InputMoedaBR } from "@/components/compras/InputMoedaBR";

const MEIOS: { valor: string; label: string }[] = [
  { valor: "pix", label: "PIX" },
  { valor: "cartao", label: "Cartão" },
  { valor: "boleto", label: "Boleto" },
  { valor: "transferencia", label: "Transferência" },
  { valor: "dinheiro", label: "Dinheiro" },
  { valor: "outro", label: "Outro" },
];

const PROVA_META: Record<NivelProva, { estado: "success" | "warning" | "destructive"; label: string }> = {
  conciliado: { estado: "success", label: "Conciliado" },
  aguardando_extrato: { estado: "warning", label: "Aguardando extrato" },
  declarado_humano: { estado: "destructive", label: "Declarado por humano" },
};

function hojeIso() {
  return new Date().toLocaleDateString("en-CA");
}

interface Props {
  children: ReactNode;
  /** Cliente pré-selecionado (vem do drawer da Conta do Cliente). */
  parceiroId?: string | null;
  parceiroNome?: string | null;
}

export function RegistrarRecebimentoDialog({ children, parceiroId, parceiroNome }: Props) {
  const [open, setOpen] = useState(false);
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(
    parceiroId ? { id: parceiroId, nome: parceiroNome || "Cliente" } : null,
  );
  const [buscaOpen, setBuscaOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [valor, setValor] = useState(0);
  const [data, setData] = useState(hojeIso());
  const [meio, setMeio] = useState("pix");
  const [chave, setChave] = useState("");
  const [pagadorNome, setPagadorNome] = useState("");
  const [pagadorDoc, setPagadorDoc] = useState("");
  const [observacao, setObservacao] = useState("");
  const [ultimaProva, setUltimaProva] = useState<{ nivel: NivelProva; aviso?: string | null } | null>(null);

  const { data: opcoes = [], isLoading: buscando } = useClientesBusca(busca);
  const registrar = useRegistrarRecebimentoCliente();

  useEffect(() => {
    if (parceiroId) setCliente({ id: parceiroId, nome: parceiroNome || "Cliente" });
  }, [parceiroId, parceiroNome]);

  const maxData = hojeIso();
  const dataFutura = data > maxData;
  const podeSalvar = !!cliente && valor > 0 && !!data && !dataFutura && !!meio && !registrar.isPending;

  const resumo = useMemo(
    () => (valor > 0 ? formatBRL(valor) : null),
    [valor],
  );

  function limpar() {
    setValor(0);
    setData(hojeIso());
    setMeio("pix");
    setChave("");
    setPagadorNome("");
    setPagadorDoc("");
    setObservacao("");
    if (!parceiroId) setCliente(null);
  }

  async function submit() {
    if (!cliente) return;
    try {
      const res = await registrar.mutateAsync({
        parceiro_id: cliente.id,
        valor,
        data,
        meio,
        chave: chave.trim() || null,
        pagador_nome: pagadorNome.trim() || null,
        pagador_documento: pagadorDoc.trim() || null,
        observacao: observacao.trim() || null,
      });
      const nivel = (res.nivel_prova ?? "declarado_humano") as NivelProva;
      setUltimaProva({ nivel, aviso: res.aviso });
      toast.success(
        `${formatBRL(res.valor ?? valor)} registrado para ${res.cliente ?? cliente.nome} — prova: ${nivel}`,
        { description: res.aviso ?? undefined },
      );
      limpar();
      setOpen(false);
    } catch (e: any) {
      // FAIL-LOUD: a mensagem do banco vai crua para a tela.
      toast.error("Recebimento não registrado", {
        description: e?.message ?? String(e),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription>
            O dinheiro entra na conta do cliente. O pedido debita o saldo depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Popover open={buscaOpen} onOpenChange={setBuscaOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className={cn(!cliente && "text-muted-foreground")}>
                    {cliente ? cliente.nome : "Selecionar cliente"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Buscar por nome ou CNPJ"
                    value={busca}
                    onValueChange={setBusca}
                  />
                  <CommandList>
                    {buscando && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Buscando
                      </div>
                    )}
                    {!buscando && <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>}
                    <CommandGroup>
                      {opcoes.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={o.id}
                          onSelect={() => {
                            setCliente({ id: o.id, nome: o.nome });
                            setBuscaOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              cliente?.id === o.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{o.nome}</span>
                          {o.cnpj && (
                            <span className="ml-auto text-[11px] text-muted-foreground">{o.cnpj}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <InputMoedaBR value={valor} onChange={setValor} invalid={valor <= 0} />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={data}
                max={maxData}
                onChange={(e) => setData(e.target.value)}
                className={cn("h-8", dataFutura && "border-destructive")}
              />
              {dataFutura && (
                <p className="text-[11px] text-destructive">Data futura não é recebimento.</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Meio</Label>
            <Select value={meio} onValueChange={setMeio}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEIOS.map((m) => (
                  <SelectItem key={m.valor} value={m.valor}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Chave</Label>
            <Input
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder="E2E do PIX / NSU / nosso número — sobe a prova para Aguardando extrato"
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pagador</Label>
              <Input
                value={pagadorNome}
                onChange={(e) => setPagadorNome(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Documento do pagador</Label>
              <Input
                value={pagadorDoc}
                onChange={(e) => setPagadorDoc(e.target.value)}
                className="h-8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
            />
          </div>

          {ultimaProva && (
            <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
              <Selo estado={PROVA_META[ultimaProva.nivel].estado}>
                {PROVA_META[ultimaProva.nivel].label}
              </Selo>
              {ultimaProva.aviso && (
                <span className="text-[11px] text-muted-foreground">{ultimaProva.aviso}</span>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!podeSalvar} className="gap-2">
            {registrar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Registrar{resumo ? ` ${resumo}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
