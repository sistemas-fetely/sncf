import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export type ContaBancaria = {
  id: string;
  nome_exibicao: string;
  tipo: string;
  banco: string;
  banco_codigo: string | null;
  agencia: string | null;
  numero_conta: string | null;
  unidade: string | null;
  saldo_inicial: number | null;
  data_saldo_inicial: string | null;
  saldo_atual: number | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
  limite_credito: number | null;
  cor: string | null;
  ativo: boolean | null;
};

const BANCOS_COMUNS: { codigo: string; nome: string }[] = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "104", nome: "Caixa Econômica Federal" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "260", nome: "Nu Pagamentos (Nubank)" },
  { codigo: "077", nome: "Inter" },
  { codigo: "341", nome: "Itaú" },
  { codigo: "336", nome: "C6 Bank" },
  { codigo: "212", nome: "Banco Original" },
  { codigo: "323", nome: "Mercado Pago" },
  { codigo: "380", nome: "PicPay" },
];

const UNIDADES = [
  { value: "matriz_sp", label: "Matriz SP" },
  { value: "joinville", label: "Joinville" },
  { value: "fabrica_sp", label: "Fábrica SP" },
  { value: "ecommerce_sp", label: "Ecommerce SP" },
];

const CORES = ["#1A3D2B", "#E91E63", "#E8833A", "#8B1A2F", "#F4A7B9", "#2563EB", "#9333EA", "#0891B2"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: ContaBancaria | null;
}

export function ContaBancariaFormSheet({ open, onOpenChange, editing }: Props) {
  const qc = useQueryClient();
  const isEdit = !!editing;

  const [nomeExibicao, setNomeExibicao] = useState("");
  const [tipo, setTipo] = useState("corrente");
  const [bancoCodigo, setBancoCodigo] = useState("");
  const [bancoNome, setBancoNome] = useState("");
  const [agencia, setAgencia] = useState("");
  const [numeroConta, setNumeroConta] = useState("");
  const [unidade, setUnidade] = useState("");
  const [saldoInicial, setSaldoInicial] = useState("");
  const [dataSaldoInicial, setDataSaldoInicial] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setNomeExibicao(editing.nome_exibicao || "");
      setTipo(editing.tipo || "corrente");
      setBancoCodigo(editing.banco_codigo || "");
      setBancoNome(editing.banco || "");
      setAgencia(editing.agencia || "");
      setNumeroConta(editing.numero_conta || "");
      setUnidade(editing.unidade || "");
      setSaldoInicial(editing.saldo_inicial != null ? String(editing.saldo_inicial) : "");
      setDataSaldoInicial(editing.data_saldo_inicial || "");
      setCor(editing.cor || CORES[0]);
      setAtivo(editing.ativo !== false);
    } else {
      setNomeExibicao("");
      setTipo("corrente");
      setBancoCodigo("");
      setBancoNome("");
      setAgencia("");
      setNumeroConta("");
      setUnidade("");
      setSaldoInicial("");
      setDataSaldoInicial(new Date().toISOString().substring(0, 10));
      setCor(CORES[Math.floor(Math.random() * CORES.length)]);
      setAtivo(true);
    }
  }, [open, editing]);

  function selecionarBanco(codigo: string) {
    setBancoCodigo(codigo);
    const b = BANCOS_COMUNS.find((x) => x.codigo === codigo);
    if (b) setBancoNome(b.nome);
  }

  const isContaCorrente = tipo === "corrente" || tipo === "poupanca";

  const mutation = useMutation({
    mutationFn: async () => {
      if (!nomeExibicao.trim()) throw new Error("Apelido é obrigatório");
      if (!bancoNome.trim() && tipo !== "caixa_fisico") throw new Error("Banco é obrigatório");

      const payload = {
        nome_exibicao: nomeExibicao.trim(),
        tipo,
        banco: bancoNome.trim() || (tipo === "caixa_fisico" ? "Caixa físico" : ""),
        banco_codigo: bancoCodigo || null,
        agencia: agencia.trim() || null,
        numero_conta: numeroConta.trim() || null,
        unidade: unidade || null,
        saldo_inicial: saldoInicial ? Number(saldoInicial) : 0,
        data_saldo_inicial: dataSaldoInicial || null,
        saldo_atual: isEdit ? undefined : (saldoInicial ? Number(saldoInicial) : 0),
        cor,
        ativo,
      };

      const cleanPayload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined) cleanPayload[k] = v;
      }

      if (isEdit && editing) {
        const { error } = await supabase
          .from("contas_bancarias")
          .update(cleanPayload as never)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("contas_bancarias")
          .insert(cleanPayload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Conta atualizada" : "Conta cadastrada");
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar conta bancária" : "Nova conta bancária"}</SheetTitle>
          <SheetDescription>
            Cadastro de conta corrente, poupança ou caixa físico.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>Apelido *</Label>
            <Input
              value={nomeExibicao}
              onChange={(e) => setNomeExibicao(e.target.value)}
              placeholder="Ex: Itaú Matriz, Bradesco Joinville, Caixinha SP"
            />
            <p className="text-xs text-muted-foreground">
              Nome curto pra identificar essa conta na lista.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Conta Corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
                <SelectItem value="caixa_fisico">Caixa Físico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo !== "caixa_fisico" && (
            <>
              <div className="space-y-1.5">
                <Label>Banco *</Label>
                <Select value={bancoCodigo} onValueChange={selecionarBanco}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANCOS_COMUNS.map((b) => (
                      <SelectItem key={b.codigo} value={b.codigo}>
                        {b.codigo} — {b.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={bancoNome}
                  onChange={(e) => setBancoNome(e.target.value)}
                  placeholder="Nome do banco (editável - caso não esteja na lista)"
                  className="mt-1"
                />
              </div>

              {isContaCorrente && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Agência</Label>
                    <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} placeholder="0001" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Número da conta</Label>
                    <Input value={numeroConta} onChange={(e) => setNumeroConta(e.target.value)} placeholder="12345-6" />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <Label>Unidade Fetely</Label>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES.map((u) => (
                  <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tipo !== "caixa_fisico" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Saldo inicial</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={saldoInicial}
                  onChange={(e) => setSaldoInicial(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data do saldo</Label>
                <Input
                  type="date"
                  value={dataSaldoInicial}
                  onChange={(e) => setDataSaldoInicial(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Cor de identificação</Label>
            <div className="flex flex-wrap gap-2">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    cor === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Conta ativa</Label>
              <p className="text-xs text-muted-foreground">
                Inativas ficam ocultas das listas mas mantêm histórico.
              </p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : isEdit ? "Salvar" : "Cadastrar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
