/**
 * Registrar Recebimento — dinheiro entra na CONTA DO CLIENTE.
 *
 * NÃO existe campo de pedido aqui, e isso é por desenho:
 * DINHEIRO-CREDITA-CONTA-PEDIDO-DEBITA-SALDO. Quem procura pedido está
 * procurando o eixo antigo.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Upload, X } from "lucide-react";
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
  useLerComprovanteConta,
  useRegistrarRecebimentoCliente,
  type NivelProva,
} from "@/hooks/financeiro/useContaCliente";
import type { LeituraComprovante } from "@/hooks/comercial/useComprovantePagamento";
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

/** tipo lido pela IA -> meio da conta do cliente. `indefinido` não mexe no campo. */
const MEIO_POR_TIPO: Record<string, string> = {
  pix: "pix",
  cartao: "cartao",
  boleto: "boleto",
  ted: "transferencia",
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
  const [comprovantePath, setComprovantePath] = useState<string | null>(null);
  const [comprovanteNome, setComprovanteNome] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<LeituraComprovante | null>(null);
  const inputArquivo = useRef<HTMLInputElement | null>(null);

  const { data: opcoes = [], isLoading: buscando } = useClientesBusca(busca);
  const registrar = useRegistrarRecebimentoCliente();
  const lerComprovante = useLerComprovanteConta();

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
    descartarComprovante();
    if (!parceiroId) setCliente(null);
  }

  function descartarComprovante() {
    setComprovantePath(null);
    setComprovanteNome(null);
    setLeitura(null);
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  /** SISTEMA SUGERE / HUMANO DECIDE: preenche o formulário, nunca registra. */
  async function importarComprovante(file: File) {
    try {
      const { leitura: lido, storagePath } = await lerComprovante.mutateAsync({
        file,
        parceiroId: cliente?.id ?? null,
      });

      if (lido.valor > 0) setValor(lido.valor);

      if (lido.data && /^\d{4}-\d{2}-\d{2}$/.test(lido.data)) {
        if (lido.data > hojeIso()) {
          toast.warning("O comprovante traz uma data futura — a data não foi preenchida.");
        } else {
          setData(lido.data);
        }
      }

      const meioLido = MEIO_POR_TIPO[lido.tipo];
      if (meioLido) setMeio(meioLido);
      if (lido.chave) setChave(lido.chave);
      if (lido.pagador) setPagadorNome(lido.pagador);
      if (lido.pagador_documento) setPagadorDoc(lido.pagador_documento);

      setLeitura(lido);
      setComprovantePath(storagePath);
      setComprovanteNome(file.name);
    } catch (e: any) {
      // FAIL-LOUD: mensagem real na tela. O caminho manual continua livre.
      toast.error("Comprovante não lido", { description: e?.message ?? String(e) });
    } finally {
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
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
        comprovantePath,
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
          <div className="space-y-1">
            <input
              ref={inputArquivo}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importarComprovante(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              disabled={lerComprovante.isPending}
              onClick={() => inputArquivo.current?.click()}
            >
              {lerComprovante.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Lendo comprovante…
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  Importar comprovante
                </>
              )}
            </Button>

            {leitura && (
              <div className="space-y-0.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    Preenchido do comprovante ({comprovanteNome}) — confira antes de registrar.
                  </span>
                  <button
                    type="button"
                    onClick={descartarComprovante}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Descartar comprovante"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {leitura.sentido === "saida" && (
                  <p className="text-[11px] text-warning">
                    Este comprovante parece ser de dinheiro SAINDO da Fetely — confira.
                  </p>
                )}
                {leitura.confianca === "baixa" && (
                  <p className="text-[11px] text-warning">
                    Leitura com confiança baixa — confira cada campo.
                  </p>
                )}
              </div>
            )}
          </div>

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
