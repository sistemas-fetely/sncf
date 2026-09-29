import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, CreditCard, Loader2, MessageCircle, Minus, PackageSearch, Plus, QrCode, Search, ShoppingBag, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { InputMoedaBR } from "@/components/compras/InputMoedaBR";
import { ProdutoVarejoCombobox, type ProdutoVarejo } from "@/components/venda-direta/ProdutoVarejoCombobox";
import { ProdutoMiniatura, useImagensProduto } from "@/components/venda-direta/ProdutoMiniatura";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { fetchCep } from "@/lib/viacep";

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function mascaraCpf(v: string) {
  const d = soDigitos(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}
function cpfOculto(v: string | null) {
  const d = soDigitos(v);
  if (d.length !== 11) return "sem CPF";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
function cpfValido(v: string) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

interface Endereco {
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string;
}
const ENDERECO_VAZIO: Endereco = { cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };

interface ClienteBusca {
  id: string; razao_social: string; cpf: string | null; telefone: string | null; email: string | null;
  cep: string | null; logradouro: string | null; numero: string | null; endereco_complemento: string | null;
  bairro: string | null; cidade: string | null; uf: string | null;
}
interface NovoCliente extends Endereco { nome: string; cpf: string; telefone: string; email: string }
interface Item { sku: string; nome: string | null; preco: number; quantidade: number }
interface Resultado {
  id_externo: string; valor_itens: number; frete_cobrado: number; valor_total: number; pagamento: string;
  link_pagamento: string | null; pix_copia_cola: string | null; avisos: { sku: string; aviso: string }[] | null; estagio: string;
}

function CamposEndereco({ v, onChange, cepObrigatorio }: { v: Endereco; onChange: (e: Endereco) => void; cepObrigatorio?: boolean }) {
  const [buscando, setBuscando] = useState(false);
  const set = (k: keyof Endereco, val: string) => onChange({ ...v, [k]: val });
  const onCepBlur = async () => {
    if (soDigitos(v.cep).length !== 8) return;
    setBuscando(true);
    const r = await fetchCep(v.cep);
    setBuscando(false);
    if (!r) { toast.error("CEP não encontrado."); return; }
    onChange({ ...v, logradouro: r.logradouro || v.logradouro, bairro: r.bairro || v.bairro, cidade: r.localidade || v.cidade, uf: r.uf || v.uf, complemento: v.complemento || r.complemento });
  };
  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-2 space-y-1">
        <Label>CEP{cepObrigatorio && "*"} {buscando && <Loader2 className="inline h-3 w-3 animate-spin" />}</Label>
        <Input value={v.cep} onChange={(e) => set("cep", soDigitos(e.target.value).slice(0, 8))} onBlur={onCepBlur} inputMode="numeric" />
      </div>
      <div className="col-span-4 space-y-1"><Label>Logradouro</Label><Input value={v.logradouro} onChange={(e) => set("logradouro", e.target.value)} /></div>
      <div className="col-span-1 space-y-1"><Label>Número</Label><Input value={v.numero} onChange={(e) => set("numero", e.target.value)} /></div>
      <div className="col-span-2 space-y-1"><Label>Complemento</Label><Input value={v.complemento} onChange={(e) => set("complemento", e.target.value)} /></div>
      <div className="col-span-3 space-y-1"><Label>Bairro</Label><Input value={v.bairro} onChange={(e) => set("bairro", e.target.value)} /></div>
      <div className="col-span-4 space-y-1"><Label>Cidade</Label><Input value={v.cidade} onChange={(e) => set("cidade", e.target.value)} /></div>
      <div className="col-span-2 space-y-1"><Label>UF</Label><Input value={v.uf} maxLength={2} onChange={(e) => set("uf", e.target.value.toUpperCase())} /></div>
    </div>
  );
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  } catch (e) {
    toast.error(`Não foi possível copiar: ${rawMessage(e)}`);
  }
}

export default function VendaDiretaNovo() {
  // Cliente
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cliente, setCliente] = useState<ClienteBusca | null>(null);
  const [novo, setNovo] = useState<NovoCliente | null>(null);
  // Itens / entrega / pagamento
  const [itens, setItens] = useState<Item[]>([]);
  const [modo, setModo] = useState<"retirada" | "entrega">("retirada");
  const [endereco, setEndereco] = useState<Endereco>(ENDERECO_VAZIO);
  const [fretePor, setFretePor] = useState<"cliente" | "fetely">("cliente");
  const [freteValor, setFreteValor] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [pagamento, setPagamento] = useState<"pix" | "cartao">("pix");
  const [observacao, setObservacao] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const buscaQ = useQuery({
    queryKey: ["venda-direta-busca-cliente", debounced],
    enabled: debounced.length >= 2 && !cliente && !novo,
    queryFn: async (): Promise<ClienteBusca[]> => {
      const t = debounced.replace(/[,()%*]/g, " ").trim();
      const dig = soDigitos(t);
      const filtros = [`razao_social.ilike.%${t}%`];
      if (dig.length >= 3) filtros.push(`cpf.ilike.%${dig}%`, `telefone.ilike.%${dig}%`);
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("id, razao_social, cpf, telefone, email, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf")
        .eq("tipo_pessoa", "PF")
        .or(filtros.join(","))
        .order("razao_social")
        .limit(10);
      if (error) throw error;
      return (data ?? []) as ClienteBusca[];
    },
  });

  const skus = itens.map((i) => i.sku);
  const saldoQ = useQuery({
    queryKey: ["venda-direta-saldo-site-sp", skus.slice().sort().join(",")],
    enabled: skus.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_centro")
        .select("sku, disponivel")
        .eq("centro", "SITE-SP")
        .in("sku", skus);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) m.set(r.sku, Number(r.disponivel ?? 0));
      return m;
    },
  });
  useEffect(() => {
    if (saldoQ.isError) toast.error(`Falha ao ler saldo do Site SP: ${rawMessage(saldoQ.error)}`);
  }, [saldoQ.isError, saldoQ.error]);
  const imgsQ = useImagensProduto(skus);

  const selecionarCliente = (c: ClienteBusca) => {
    setCliente(c);
    setTermo("");
    setEndereco({
      cep: soDigitos(c.cep), logradouro: c.logradouro ?? "", numero: c.numero ?? "", complemento: c.endereco_complemento ?? "",
      bairro: c.bairro ?? "", cidade: c.cidade ?? "", uf: c.uf ?? "",
    });
  };
  const abrirNovo = () => {
    setCliente(null);
    setNovo({ nome: "", cpf: "", telefone: "", email: "", ...ENDERECO_VAZIO });
  };
  const setNovoCampo = (k: keyof NovoCliente, v: string) => setNovo((n) => (n ? { ...n, [k]: v } : n));

  // Entrega pré-preenchida com endereço do novo cliente enquanto não editada
  const [enderecoEditado, setEnderecoEditado] = useState(false);
  useEffect(() => {
    if (novo && !enderecoEditado) {
      setEndereco({ cep: novo.cep, logradouro: novo.logradouro, numero: novo.numero, complemento: novo.complemento, bairro: novo.bairro, cidade: novo.cidade, uf: novo.uf });
    }
  }, [novo, enderecoEditado]);

  const addItem = (p: ProdutoVarejo) => {
    setItens((arr) => {
      const ex = arr.find((i) => i.sku === p.sku);
      if (ex) return arr.map((i) => (i.sku === p.sku ? { ...i, quantidade: i.quantidade + 1 } : i));
      return [...arr, { sku: p.sku, nome: p.nome_completo, preco: p.preco_varejo, quantidade: 1 }];
    });
  };

  const valorItens = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const pecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const freteCobrado = modo === "entrega" && fretePor === "cliente" ? freteValor : 0;
  const total = valorItens + freteCobrado;

  const pendencia = useMemo((): string | null => {
    if (!cliente && !novo) return "Selecione ou cadastre o cliente.";
    if (cliente && soDigitos(cliente.cpf).length !== 11) return "CPF obrigatório para a NF.";
    if (novo) {
      if (!novo.nome.trim()) return "Informe o nome do cliente.";
      if (!cpfValido(novo.cpf)) return "CPF inválido.";
      if (soDigitos(novo.telefone).length < 10) return "Informe o telefone/WhatsApp.";
    }
    if (itens.length === 0) return "Adicione ao menos um item.";
    if (itens.some((i) => !Number.isInteger(i.quantidade) || i.quantidade < 1)) return "Quantidade inválida.";
    if (modo === "entrega") {
      if (soDigitos(endereco.cep).length !== 8) return "CEP de entrega obrigatório.";
      if (!endereco.logradouro.trim() || !endereco.numero.trim() || !endereco.cidade.trim() || !endereco.uf.trim())
        return "Complete o endereço de entrega.";
      if (fretePor === "fetely" && !motivo.trim()) return "Informe o motivo do frete absorvido.";
    }
    return null;
  }, [cliente, novo, itens, modo, endereco, fretePor, motivo]);

  const criar = useMutation({
    mutationFn: async (): Promise<Resultado> => {
      const p_cliente = cliente
        ? { parceiro_id: cliente.id }
        : {
            nome: novo!.nome.trim(), cpf: soDigitos(novo!.cpf), telefone: soDigitos(novo!.telefone), email: novo!.email.trim() || null,
            cep: soDigitos(novo!.cep) || null, logradouro: novo!.logradouro || null, numero: novo!.numero || null,
            complemento: novo!.complemento || null, bairro: novo!.bairro || null, cidade: novo!.cidade || null, uf: novo!.uf || null,
          };
      const p_entrega =
        modo === "retirada"
          ? { modo: "retirada" }
          : {
              modo: "entrega", frete_pago_por: fretePor, frete_valor: freteValor,
              motivo_absorcao: fretePor === "fetely" ? motivo.trim() : null,
              endereco: { ...endereco, cep: soDigitos(endereco.cep) },
            };
      const { data, error } = await (supabase as any).rpc("criar_pedido_venda_direta", {
        p_cliente,
        p_itens: itens.map((i) => ({ sku: i.sku, quantidade: i.quantidade })),
        p_entrega,
        p_pagamento: pagamento,
        p_observacao: observacao.trim() || null,
      });
      if (error) throw error;
      if (!data) throw new Error("A criação do pedido não devolveu resultado.");
      return data as Resultado;
    },
    onSuccess: (r) => {
      setResultado(r);
      toast.success(`${r.id_externo} criado.`);
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  const limparTudo = () => {
    setTermo(""); setCliente(null); setNovo(null); setItens([]); setModo("retirada"); setEndereco(ENDERECO_VAZIO);
    setEnderecoEditado(false); setFretePor("cliente"); setFreteValor(0); setMotivo(""); setPagamento("pix"); setObservacao("");
    setResultado(null);
  };

  const telefoneCliente = soDigitos(cliente?.telefone ?? novo?.telefone ?? "");
  const primeiroNome = (cliente?.razao_social ?? novo?.nome ?? "").trim().split(/\s+/)[0] ?? "";

  if (resultado) {
    const r = resultado;
    const msg = `Olá ${primeiroNome}! Seu pedido ${r.id_externo} na Fetely ficou em ${formatBRL(r.valor_total)}. Pague pelo PIX neste link: ${r.link_pagamento ?? ""}`;
    const tel = telefoneCliente.length <= 11 ? `55${telefoneCliente}` : telefoneCliente;
    return (
      <PageShell>
        <PageHeader
          titulo="Venda Direta · Novo pedido"
          breadcrumb={[{ label: "Operação" }, { label: "Venda Direta · Novo pedido" }]}
          icone={ShoppingBag}
          estado="Venda B2C por telefone ou WhatsApp, fora do Shopify."
        />
        <Card>
          <CardHeader>
            <CardTitle>{r.id_externo} criado — aguardando pagamento</CardTitle>
            <p className="text-2xl font-semibold tabular-nums">{formatBRL(r.valor_total)}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {r.pagamento === "pix" ? (
              <>
                <div className="space-y-1">
                  <Label>Link de pagamento</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={r.link_pagamento ?? "—"} />
                    <Button variant="outline" disabled={!r.link_pagamento} onClick={() => copiar(r.link_pagamento!)}>
                      <Copy className="h-4 w-4" /> Copiar link
                    </Button>
                  </div>
                </div>
                <Button
                  disabled={!r.link_pagamento || telefoneCliente.length < 10}
                  onClick={() => window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, "_blank", "noopener")}
                >
                  <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
                </Button>
                <div className="space-y-1">
                  <Label>PIX copia e cola</Label>
                  <div className="flex gap-2">
                    <Textarea readOnly value={r.pix_copia_cola ?? "—"} className="font-mono text-xs" rows={3} />
                    <Button variant="outline" disabled={!r.pix_copia_cola} onClick={() => copiar(r.pix_copia_cola!)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                O link do cartão é enviado à parte; o Financeiro libera o pedido ao confirmar o pagamento.
              </p>
            )}
            {r.avisos && r.avisos.length > 0 && (
              <p className="text-sm text-warning">
                Itens sem saldo no Site SP: {r.avisos.map((a) => a.sku).join(", ")}
              </p>
            )}
            <Button variant="outline" onClick={limparTudo}><Plus className="h-4 w-4" /> Novo pedido</Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Venda Direta · Novo pedido"
        breadcrumb={[{ label: "Operação" }, { label: "Venda Direta · Novo pedido" }]}
        icone={ShoppingBag}
        estado="Venda B2C por telefone ou WhatsApp, fora do Shopify."
      />

      {/* Grade em 2 colunas a partir de lg: cliente/itens à esquerda, entrega/pagamento/observação à direita */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
      {/* 1. Cliente */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Cliente</CardTitle>
          {!novo && <Button variant="outline" size="sm" onClick={abrirNovo}><UserPlus className="h-4 w-4" /> Novo cliente</Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          {cliente ? (
            <div className="flex items-start justify-between rounded-md border p-3">
              <div className="text-sm">
                <p className="font-medium">{cliente.razao_social}</p>
                <p className="text-muted-foreground">{cpfOculto(cliente.cpf)} · {cliente.telefone ?? "sem telefone"}{cliente.email ? ` · ${cliente.email}` : ""}</p>
                {soDigitos(cliente.cpf).length !== 11 && <p className="mt-1 text-destructive">CPF obrigatório para a NF</p>}
              </div>
              <Button variant="ghost" size="icon" aria-label="Trocar cliente" onClick={() => setCliente(null)}><X className="h-4 w-4" /></Button>
            </div>
          ) : novo ? (
            <div className="space-y-3">
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-6 space-y-1"><Label>Nome*</Label><Input value={novo.nome} onChange={(e) => setNovoCampo("nome", e.target.value)} /></div>
                <div className="col-span-2 space-y-1">
                  <Label>CPF*</Label>
                  <Input value={novo.cpf} inputMode="numeric" onChange={(e) => setNovoCampo("cpf", mascaraCpf(e.target.value))} />
                  {soDigitos(novo.cpf).length === 11 && !cpfValido(novo.cpf) && <p className="text-xs text-destructive">CPF inválido</p>}
                </div>
                <div className="col-span-2 space-y-1"><Label>Telefone/WhatsApp*</Label><Input value={novo.telefone} inputMode="tel" onChange={(e) => setNovoCampo("telefone", e.target.value)} /></div>
                <div className="col-span-2 space-y-1"><Label>E-mail</Label><Input type="email" value={novo.email} onChange={(e) => setNovoCampo("email", e.target.value)} /></div>
              </div>
              <CamposEndereco v={novo} onChange={(e) => setNovo((n) => (n ? { ...n, ...e } : n))} />
              <Button variant="ghost" size="sm" onClick={() => setNovo(null)}>Cancelar novo cliente</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar por nome, CPF ou telefone…" value={termo} onChange={(e) => setTermo(e.target.value)} />
              </div>
              {buscaQ.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {buscaQ.isError && <p className="text-sm text-destructive">Falha na busca: {rawMessage(buscaQ.error)}</p>}
              {debounced.length >= 2 && buscaQ.data && (
                buscaQ.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {buscaQ.data.map((c) => (
                      <li key={c.id}>
                        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50" onClick={() => selecionarCliente(c)}>
                          <span className="font-medium">{c.razao_social}</span>
                          <span className="text-muted-foreground"> · {cpfOculto(c.cpf)} · {c.telefone ?? "sem telefone"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Itens — linha estilo PDV */}
      <Card>
        <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ProdutoVarejoCombobox value="" onSelect={addItem} ariaLabel="Adicionar produto" />
          {itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-10 text-muted-foreground">
              <PackageSearch className="h-8 w-8" />
              <p className="text-sm">Busque um produto pelo SKU ou nome</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {itens.map((i) => {
                const disp = saldoQ.data?.get(i.sku);
                const semSaldo = saldoQ.data ? (disp ?? 0) < i.quantidade : false;
                const setQtd = (q: number) =>
                  setItens((arr) => arr.map((x) => (x.sku === i.sku ? { ...x, quantidade: Math.max(1, Math.floor(q) || 1) } : x)));
                return (
                  <li key={i.sku} className="flex items-center gap-4 py-3">
                    <ProdutoMiniatura img={imgsQ.data?.get(i.sku)} tamanho={64} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="line-clamp-2 text-base font-medium">{i.nome ?? i.sku}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">{i.sku}</p>
                      {semSaldo ? (
                        <Badge variant="outline" className="border-warning/50 text-warning">Sem saldo no Site SP</Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal text-muted-foreground tabular-nums">
                          Site SP: {saldoQ.isLoading ? "…" : (disp ?? 0)} disp.
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-9 w-9" aria-label={`Diminuir ${i.sku}`} disabled={i.quantidade <= 1} onClick={() => setQtd(i.quantidade - 1)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number" min={1} step={1} aria-label={`Quantidade ${i.sku}`}
                        className="h-9 w-14 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        value={i.quantidade}
                        onChange={(e) => setQtd(Number(e.target.value))}
                      />
                      <Button variant="outline" size="icon" className="h-9 w-9" aria-label={`Aumentar ${i.sku}`} onClick={() => setQtd(i.quantidade + 1)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="w-32 text-right">
                      <p className="text-lg font-semibold tabular-nums">{formatBRL(i.preco * i.quantidade)}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">{formatBRL(i.preco)} cada</p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Remover ${i.sku}`} onClick={() => setItens((arr) => arr.filter((x) => x.sku !== i.sku))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 3. Entrega */}
      <Card>
        <CardHeader><CardTitle className="text-base">Entrega</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={modo} onValueChange={(v) => setModo(v as typeof modo)} className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="retirada" /> Retirada no Site SP</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="entrega" /> Entrega</label>
          </RadioGroup>
          {modo === "entrega" && (
            <div className="space-y-4">
              <CamposEndereco v={endereco} cepObrigatorio onChange={(e) => { setEnderecoEditado(true); setEndereco(e); }} />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quem paga o frete</Label>
                  <RadioGroup value={fretePor} onValueChange={(v) => setFretePor(v as typeof fretePor)} className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="cliente" /> Cliente</label>
                    <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="fetely" /> Fetely</label>
                  </RadioGroup>
                </div>
                <div className="space-y-1">
                  <Label>Valor do frete (R$)</Label>
                  <InputMoedaBR value={freteValor} onChange={setFreteValor} />
                </div>
              </div>
              {fretePor === "fetely" && (
                <div className="space-y-1">
                  <Label>Motivo*</Label>
                  <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Frete absorvido reduz a margem e fica registrado no pedido.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Pagamento */}
      <Card>
        <CardHeader><CardTitle className="text-base">Pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <RadioGroup value={pagamento} onValueChange={(v) => setPagamento(v as typeof pagamento)} className="flex gap-6">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="pix" /> PIX</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="cartao" /> Cartão</label>
          </RadioGroup>
          {pagamento === "cartao" && (
            <p className="text-xs text-muted-foreground">O link do cartão é enviado à parte; o Financeiro libera o pedido ao confirmar o pagamento.</p>
          )}
        </CardContent>
      </Card>

      {/* 5. Observação */}
      <Card>
        <CardHeader><CardTitle className="text-base">Observação</CardTitle></CardHeader>
        <CardContent><Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" /></CardContent>
      </Card>
        </div>

        {/* Resumo do pedido — protagonista, fixo ao rolar em lg */}
        <div className="lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader><CardTitle className="text-base">Resumo do pedido</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className={cliente || novo?.nome.trim() ? "font-medium" : "text-muted-foreground"}>
                {cliente?.razao_social ?? (novo?.nome.trim() || "Cliente não selecionado")}
              </p>
              {itens.length > 0 && (
                <ul className="space-y-2">
                  {itens.map((i) => (
                    <li key={i.sku} className="flex items-center gap-3 text-sm">
                      <ProdutoMiniatura img={imgsQ.data?.get(i.sku)} tamanho={40} />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="tabular-nums text-muted-foreground">{i.quantidade}×</span> {i.nome ?? i.sku}
                      </span>
                      <span className="tabular-nums">{formatBRL(i.preco * i.quantidade)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Itens ({pecas})</span><span className="tabular-nums">{formatBRL(valorItens)}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="tabular-nums">
                    {modo === "retirada" ? "Retirada no Site SP" : fretePor === "fetely" ? "Pago pela Fetely" : formatBRL(freteCobrado)}
                  </span>
                </div>
              </div>
              <Separator />
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-3xl font-semibold tabular-nums">{formatBRL(total)}</span>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {pagamento === "pix" ? <QrCode className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {pagamento === "pix" ? "PIX" : "Cartão"}
              </p>
              {pendencia && <p className="text-sm text-warning">{pendencia}</p>}
              <Button size="lg" className="w-full" disabled={!!pendencia || criar.isPending} onClick={() => criar.mutate()}>
                {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar pedido
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile: barra enxuta no pé com total e botão */}
      <div className="sticky bottom-0 z-20 -mx-6 flex items-center justify-between gap-4 border-t bg-background/95 px-6 py-3 backdrop-blur lg:hidden">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-semibold tabular-nums">{formatBRL(total)}</p>
        </div>
        <Button size="lg" disabled={!!pendencia || criar.isPending} onClick={() => criar.mutate()}>
          {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar pedido
        </Button>
      </div>
    </PageShell>
  );
}
