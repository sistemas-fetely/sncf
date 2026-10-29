import { useEffect, useMemo, useRef, useState } from "react";
import { CodProduto } from "@/components/produto/CodProduto";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Gift, Paperclip, Smartphone, Loader2, Minus, PackageSearch, Plus, Printer, QrCode, Search, ShoppingBag, Trash2, UserPlus, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvisosFrete, CartoesEntrega, useFreteVendaDireta, type ModalVd } from "@/components/venda-direta/EntregaVendaDireta";
import { ProdutoVarejoCombobox, type ProdutoVarejo } from "@/components/venda-direta/ProdutoVarejoCombobox";
import { ProdutoMiniatura, useImagensProduto } from "@/components/venda-direta/ProdutoMiniatura";
import { PixSafrapayPainel } from "@/components/venda-direta/PixSafrapay";
import { LinkCartaoPainel, SelectParcelas, parcelasPadrao, rotulosOpcaoPagamento, textoPadraoParcelas, useCfgParcelas } from "@/components/venda-direta/LinkCartao";
import { BeneficioCard, BENEFICIO_VAZIO, calcularBeneficio, payloadBeneficio, type BeneficioEstado } from "@/components/venda-direta/BeneficioVD";
import { formatBRL } from "@/lib/format-currency";
import { rawMessage } from "@/lib/format-error";
import { fetchCep } from "@/lib/viacep";
import { invalidarVendaDireta } from "@/components/venda-direta/queryKeys";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { meioVD, ROTULO_MEIO_VD, rotuloPagamentoVD, type PagamentoVD } from "@/lib/pedidos/meioVD";
import { abrirImpressaoVD } from "@/components/venda-direta/ImpressaoPedidoVD";
import type { LinhaVD } from "@/components/venda-direta/AcoesVendaDireta";

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
/** Linha de fn_vd_cliente_buscar: cliente (id) ou funcionário ainda não cliente (id NULL). */
interface ResultadoBusca {
  id: string | null; pessoa_id: string | null; funcionario: boolean; nome: string | null; cpf: string | null;
  telefone: string | null; email: string | null; cep: string | null; logradouro: string | null; numero: string | null;
  complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; inativo?: boolean | null;
}
interface NovoCliente extends Endereco { nome: string; cpf: string; telefone: string; email: string }
interface Item { sku: string; nome: string | null; preco: number; quantidade: number }
interface Resultado {
  pedido_id: string; id_externo: string; valor_itens: number; frete_cobrado: number; valor_total: number; pagamento: string;
  link_pagamento: string | null; pix_copia_cola: string | null; avisos: { sku: string; aviso: string }[] | null; estagio: string;
  valor_haver?: number | null; valor_a_pagar?: number | null;
  pagamento_refeito?: boolean | null; meio_trocado?: boolean | null; valor_anterior?: number | null;
  frete?: { servico: string | null; custo: number | null; cobrado: number | null; fonte: string | null; gratis: boolean | null; prazo_dias: number | null; faixa: string | null; motivo: string | null } | null;
}
const MODAIS: ModalVd[] = ["retirada", "sedex", "pac", "frete_fetely"];
const ATIVAS_DEVOLUCAO = ["solicitada", "aprovada", "aguardando_devolucao", "estorno_enviado", "falhou"];
const numTexto = (n: unknown) => (n == null || n === "" ? "" : String(n).replace(".", ","));
/** Remove da observação o sufixo automático de benefício (fn_vd_calcular.obs_beneficio). */
function observacaoSemBeneficio(obs: string | null): string {
  return (obs ?? "").split(" · ")
    .filter((p) => !p.startsWith("Beneficio no frete (") && !p.startsWith("Desconto no pedido R$ "))
    .join(" · ").trim();
}
interface PedidoEdicao {
  linha: LinhaVD & { pagamento_confirmado_em: string | null };
  estagio: string; cancelado_em: string | null; reembolsoAtivo: boolean;
  cliente: ClienteBusca | null; itens: Item[]; modo: ModalVd; endereco: Endereco; beneficio: BeneficioEstado; observacao: string;
}
const ROTULO_MODAL: Record<ModalVd, string> = { retirada: "Retirada no Site SP", sedex: "Correios SEDEX", pac: "Correios PAC", frete_fetely: "Frete Fetely" };

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

export default function VendaDiretaNovo() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = useParams<{ id: string }>();
  const edicao = !!editId;
  const [motivo, setMotivo] = useState("");
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const itensRef = useRef<HTMLDivElement>(null);
  const entregaRef = useRef<HTMLDivElement>(null);
  const beneficioRef = useRef<HTMLDivElement>(null);
  // Cliente
  const [termo, setTermo] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cliente, setCliente] = useState<ClienteBusca | null>(null);
  const [novo, setNovo] = useState<NovoCliente | null>(null);
  // Itens / entrega / pagamento
  const [itens, setItens] = useState<Item[]>([]);
  const [modo, setModo] = useState<ModalVd>("retirada");
  const [endereco, setEndereco] = useState<Endereco>(ENDERECO_VAZIO);
  const [beneficio, setBeneficio] = useState<BeneficioEstado>(BENEFICIO_VAZIO);
  const [anexarComprovante, setAnexarComprovante] = useState(false);
  const [pagamento, setPagamento] = useState<PagamentoVD>("pix");
  // Bonificação: quem autorizou, motivo (motivos_concessao) e observação.
  const [bonifAutorizado, setBonifAutorizado] = useState("");
  const [bonifMotivo, setBonifMotivo] = useState("brinde");
  const [bonifObs, setBonifObs] = useState("");
  const bonif = pagamento === "bonificacao";
  const motivosBonifQ = useQuery({
    queryKey: ["motivos-concessao-ativos"],
    enabled: bonif,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("motivos_concessao").select("codigo, nome").eq("ativo", true).order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as { codigo: string; nome: string }[];
    },
  });
  // Vendedora do pedido: sem pré-seleção (decisão do Flavio — escolhe sempre).
  const [vendedorId, setVendedorId] = useState<string | null>(null);
  // CD que atende o pedido (centro_canal canal VD). Padrão: Site SP.
  const [cdCodigo, setCdCodigo] = useState<string>("SITE-SP");
  const [observacao, setObservacao] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const edQ = useQuery({
    queryKey: ["venda-direta-edicao", editId],
    enabled: edicao,
    staleTime: 0,
    queryFn: async (): Promise<PedidoEdicao> => {
      const { data: p, error } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo, estagio, cancelado_em, parceiro_id, forma_solicitada, valor_liquido, endereco_entrega, observacao_pedido, itens_json")
        .eq("id", editId).maybeSingle();
      if (error) throw error;
      if (!p) throw new Error("Pedido não encontrado.");
      const [gQ, cQ, dQ] = await Promise.all([
        supabase.from("vw_venda_direta_gestao" as never).select("*").eq("id", editId as string).maybeSingle(),
        p.parceiro_id
          ? supabase.from("parceiros_comerciais")
              .select("id, razao_social, cpf, telefone, email, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf")
              .eq("id", p.parceiro_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        (supabase as any).from("vd_devolucao").select("status").eq("pedido_id", editId).in("status", ATIVAS_DEVOLUCAO),
      ]);
      if (gQ.error) throw gQ.error;
      if (cQ.error) throw cQ.error;
      if (dQ.error) throw dQ.error;
      const g = (gQ.data ?? {}) as any;
      const brutos: { sku: string; quantidade: number; descricao?: string | null; valor_unitario?: number | null }[] = Array.isArray(p.itens_json) ? p.itens_json : [];
      const skus = brutos.map((i) => i.sku);
      const precos = new Map<string, { nome: string | null; preco: number }>();
      if (skus.length) {
        const { data: prods, error: e2 } = await (supabase as any).from("sncf_produtos").select("sku, nome_completo, preco_varejo").in("sku", skus);
        if (e2) throw e2;
        for (const r of prods ?? []) precos.set(r.sku, { nome: r.nome_completo, preco: Number(r.preco_varejo ?? 0) });
      }
      const ee = (p.endereco_entrega ?? {}) as any;
      const modo: ModalVd = MODAIS.includes(ee.modal) ? ee.modal : "retirada";
      const bf = ee.frete?.beneficio ?? null;
      const ds = ee.desconto ?? null;
      const beneficio: BeneficioEstado = {
        freteTipo: bf?.tipo && bf.tipo !== "nenhum" ? bf.tipo : "nenhum",
        freteValor: bf?.tipo === "pct" || bf?.tipo === "valor" ? numTexto(bf.valor) : "",
        pedidoTipo: ds?.tipo === "pct" || ds?.tipo === "valor" ? ds.tipo : "nenhum",
        pedidoValor: ds?.tipo === "pct" || ds?.tipo === "valor" ? numTexto(ds.valor_informado ?? ds.valor) : "",
        motivo: bf?.motivo ?? ds?.motivo ?? "",
      };
      const c = (cQ.data ?? null) as ClienteBusca | null;
      return {
        linha: {
          id: p.id, id_externo: p.id_externo, valor_liquido: Number(p.valor_liquido ?? 0),
          cliente_nome: c?.razao_social ?? g.cliente_nome ?? null, cliente_telefone: c?.telefone ?? g.cliente_telefone ?? null,
          provisao_id: g.provisao_id ?? null, link_pagamento: g.link_pagamento ?? null,
          pagamento: g.pagamento ?? (p.forma_solicitada === "pix" ? "pix" : "cartao"),
          pagamento_confirmado_em: g.pagamento_confirmado_em ?? null,
        },
        estagio: p.estagio, cancelado_em: p.cancelado_em, reembolsoAtivo: (dQ.data ?? []).length > 0,
        cliente: c,
        itens: brutos.map((i) => ({
          sku: i.sku, quantidade: Number(i.quantidade ?? 1),
          nome: precos.get(i.sku)?.nome ?? i.descricao ?? null,
          preco: precos.get(i.sku)?.preco ?? Number(i.valor_unitario ?? 0),
        })),
        modo,
        // Pedido com CEP → endereço do pedido; retirada → endereço do cadastro do cliente.
        endereco: soDigitos(ee.cep).length > 0
          ? {
            cep: soDigitos(ee.cep), logradouro: ee.logradouro ?? "", numero: ee.numero ?? "", complemento: ee.complemento ?? "",
            bairro: ee.bairro ?? "", cidade: ee.cidade ?? "", uf: ee.uf ?? "",
          }
          : {
            cep: soDigitos(c?.cep), logradouro: c?.logradouro ?? "", numero: c?.numero ?? "", complemento: c?.endereco_complemento ?? "",
            bairro: c?.bairro ?? "", cidade: c?.cidade ?? "", uf: c?.uf ?? "",
          },
        beneficio,
        observacao: observacaoSemBeneficio(p.observacao_pedido),
      };
    },
  });
  const inicializado = useRef(false);
  useEffect(() => {
    const d = edQ.data;
    if (!d) return;
    if (inicializado.current) return;
    inicializado.current = true;
    setPagamento(meioVD(d.linha.pagamento));
    setCliente(d.cliente); setItens(d.itens); setModo(d.modo); setEndereco(d.endereco);
    setEnderecoEditado(true); setBeneficio(d.beneficio); setObservacao(d.observacao);
  }, [edQ.data]);
  const bloqueioEdicao: string | null = !edQ.data ? null
    : edQ.data.cancelado_em ? "Pedido cancelado — não pode ser editado."
    : edQ.data.linha.pagamento_confirmado_em ? "Pedido já tem pagamento registrado — não pode ser editado."
    : edQ.data.estagio !== "aguardando_pagamento" ? "Pedido só pode ser editado enquanto aguarda pagamento."
    : edQ.data.reembolsoAtivo ? "Pedido tem reembolso em andamento — não pode ser editado."
    : null;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  const buscaQ = useQuery({
    queryKey: ["venda-direta-busca-cliente", debounced],
    enabled: debounced.length >= 2 && !cliente && !novo,
    queryFn: async (): Promise<ResultadoBusca[]> => {
      const { data, error } = await (supabase as any).rpc("fn_vd_cliente_buscar", { p_termo: debounced });
      if (error) throw error;
      return (data ?? []) as ResultadoBusca[];
    },
  });

  // Vendedoras ativas (RPC própria — RLS bloqueia leitura direta de `vendedores` aqui).
  const vendedoresQ = useQuery({
    queryKey: ["vd-vendedores-opcoes"],
    enabled: !edicao,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_vd_vendedores_opcoes");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; tipo: string }[];
    },
  });

  // CDs habilitados para Venda Direta (centro_canal + rótulo de centro_distribuicao).
  const cdsQ = useQuery({
    queryKey: ["vd-cds-opcoes"],
    enabled: !edicao,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: cc, error } = await (supabase as any)
        .from("centro_canal").select("centro_codigo").eq("canal", "VD").eq("habilitado", true);
      if (error) throw error;
      const cods = [...new Set(((cc ?? []) as { centro_codigo: string }[]).map((r) => r.centro_codigo))];
      if (cods.length === 0) return [] as { codigo: string; rotulo: string }[];
      const { data: cds, error: e2 } = await (supabase as any)
        .from("centro_distribuicao").select("codigo, nome, rotulo_curto").in("codigo", cods);
      if (e2) throw e2;
      return ((cds ?? []) as { codigo: string; nome: string | null; rotulo_curto: string | null }[])
        .map((c) => ({ codigo: c.codigo, rotulo: c.rotulo_curto ?? c.nome ?? c.codigo }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
    },
  });
  const cdRotulo = cdsQ.data?.find((c) => c.codigo === cdCodigo)?.rotulo ?? (cdCodigo === "SITE-SP" ? "Site SP" : cdCodigo);

  const skus = itens.map((i) => i.sku);
  const saldoQ = useQuery({
    queryKey: ["venda-direta-saldo-cd", cdCodigo, skus.slice().sort().join(",")],
    enabled: skus.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await (supabase as any)
        .from("vw_estoque_centro")
        .select("sku, disponivel")
        .eq("centro", cdCodigo)
        .in("sku", skus);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) m.set(r.sku, Number(r.disponivel ?? 0));
      return m;
    },
  });
  useEffect(() => {
    if (saldoQ.isError) toast.error(`Falha ao ler saldo do ${cdRotulo}: ${rawMessage(saldoQ.error)}`);
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
  const selecionarResultado = (r: ResultadoBusca) => {
    if (r.id) {
      selecionarCliente({
        id: r.id, razao_social: r.nome ?? "", cpf: r.cpf, telefone: r.telefone, email: r.email, cep: r.cep,
        logradouro: r.logradouro, numero: r.numero, endereco_complemento: r.complemento, bairro: r.bairro, cidade: r.cidade, uf: r.uf,
      });
      return;
    }
    // Funcionário que ainda não é cliente: abre o formulário de novo cliente pré-preenchido.
    setCliente(null);
    setTermo("");
    setNovo({
      nome: r.nome ?? "", cpf: mascaraCpf(r.cpf ?? ""), telefone: r.telefone ?? "", email: r.email ?? "",
      cep: soDigitos(r.cep), logradouro: r.logradouro ?? "", numero: r.numero ?? "", complemento: r.complemento ?? "",
      bairro: r.bairro ?? "", cidade: r.cidade ?? "", uf: r.uf ?? "",
    });
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
  const frete = useFreteVendaDireta(soDigitos(endereco.cep), itens);
  const opcaoSel = frete.opcoes.find((o) => o.modal === modo);
  const freteCotado = modo === "retirada" ? 0 : (opcaoSel?.cobrado ?? 0);
  const ben = calcularBeneficio(bonif ? BENEFICIO_VAZIO : beneficio, valorItens, freteCotado, modo !== "retirada");
  const freteCobrado = ben.freteCobrado;
  // Opção escolhida ficou indisponível (CEP/itens mudaram) → volta para retirada.
  useEffect(() => {
    if (modo !== "retirada" && opcaoSel && !opcaoSel.disponivel && !frete.cotando) setModo("retirada");
  }, [modo, opcaoSel, frete.cotando]);
  const total = Math.max(valorItens - ben.desconto, 0) + freteCobrado;
  // Parcelas do link do cartão: padrão pelo total até o usuário mexer.
  const cfgParcelasQ = useCfgParcelas();
  const cfgPixNoLink = cfgParcelasQ.data?.pix_no_link === true;
    const [parcelasManual, setParcelasManual] = useState<number | null>(null);
  // Haver Site SP: crédito do cliente — o banco aplica TODOS os haveres (por vencimento) até cobrir o pedido.
  const parceiroId = !edicao ? cliente?.id ?? null : null;
  const haverQ = useQuery({
    queryKey: ["haver-disponivel-parceiro", parceiroId],
    enabled: !!parceiroId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_haver_disponivel_parceiro", { p_parceiro_id: parceiroId });
      if (error) throw new Error(rawMessage(error));
      return (data ?? []) as { haver_id: string; saldo: number; origem: string | null; descricao: string | null; expira_em: string | null }[];
    },
  });
  useEffect(() => { if (haverQ.error) toast.error("Não foi possível ler o crédito do cliente", { description: (haverQ.error as Error).message }); }, [haverQ.error]);
  const haveres = parceiroId ? haverQ.data ?? [] : [];
  const haverSaldoTotal = haveres.reduce((a, h) => a + Number(h.saldo ?? 0), 0);
  const temHaver = haverSaldoTotal > 0;
  const [usarHaver, setUsarHaver] = useState(true);
  const haverAtivo = temHaver && usarHaver;
  const haverAplicado = haverAtivo ? Math.min(haverSaldoTotal, total) : 0;
  const aPagarComHaver = Math.max(total - haverAplicado, 0);
  const haverCobreTudo = haverAtivo && aPagarComHaver <= 0.009;
  const parcelasLink = parcelasManual ?? (cfgParcelasQ.data ? parcelasPadrao(cfgParcelasQ.data, total) : 1);
  const rotPag = rotulosOpcaoPagamento(cfgPixNoLink, parcelasLink);

  const pendencia = useMemo((): string | null => {
    if (!edicao && !vendedorId) return "Informe a vendedora.";
    if (!cliente && !novo) return "Selecione ou cadastre o cliente.";
    if (cliente && soDigitos(cliente.cpf).length !== 11) return "CPF obrigatório para a NF.";
    if (novo) {
      if (!novo.nome.trim()) return "Informe o nome do cliente.";
      if (!cpfValido(novo.cpf)) return "CPF inválido.";
      if (soDigitos(novo.telefone).length < 10) return "Informe o telefone/WhatsApp.";
    }
    if (itens.length === 0) return "Adicione ao menos um item.";
    if (itens.some((i) => !Number.isInteger(i.quantidade) || i.quantidade < 1)) return "Quantidade inválida.";
    if (modo !== "retirada") {
      if (soDigitos(endereco.cep).length !== 8) return "CEP de entrega obrigatório.";
      if (!endereco.logradouro.trim() || !endereco.numero.trim() || !endereco.cidade.trim() || !endereco.uf.trim())
        return "Complete o endereço de entrega.";
      if (frete.cotando) return "Aguarde a cotação do frete.";
      if (!opcaoSel?.disponivel) return opcaoSel?.motivo ?? "Modalidade de entrega indisponível.";
    }
    if (ben.ativo && beneficio.motivo.trim().length < 3) return "Informe o motivo do benefício.";
    if (bonif && bonifAutorizado.trim().length < 2) return "Informe quem autorizou a bonificação.";
    if (bonif && !bonifMotivo) return "Informe o motivo da bonificação.";
    if (edicao && motivo.trim().length < 3) return "Informe o motivo da alteração.";
    return null;
  }, [cliente, novo, itens, modo, endereco, frete.cotando, opcaoSel, ben.ativo, beneficio.motivo, edicao, motivo, vendedorId, bonif, bonifAutorizado, bonifMotivo]);

  const criar = useMutation({
    mutationFn: async (): Promise<Resultado> => {
      const p_cliente = cliente
        ? { parceiro_id: cliente.id }
        : {
            nome: novo!.nome.trim(), cpf: soDigitos(novo!.cpf), telefone: soDigitos(novo!.telefone), email: novo!.email.trim() || null,
            cep: soDigitos(novo!.cep) || null, logradouro: novo!.logradouro || null, numero: novo!.numero || null,
            complemento: novo!.complemento || null, bairro: novo!.bairro || null, cidade: novo!.cidade || null, uf: novo!.uf || null,
          };
      let cotacao_id: string | null = null;
      if (modo === "sedex" || modo === "pac") {
        try {
          cotacao_id = await frete.cotacaoIdValida();
        } catch (e) {
          // SEDEX ainda sai pelo plano B do servidor; PAC exige cotação.
          if (modo === "pac") throw e;
        }
        if (modo === "pac" && !cotacao_id) throw new Error("PAC indisponível sem cotação dos Correios.");
      }
      const beneficioPayload = payloadBeneficio(bonif ? BENEFICIO_VAZIO : beneficio, modo !== "retirada");
      const p_entrega =
        modo === "retirada"
          ? { modo: "retirada", beneficio: beneficioPayload, ...(edicao ? {} : { centro_codigo: cdCodigo }) }
          : {
              modo, cotacao_id,
              ...(edicao ? {} : { centro_codigo: cdCodigo }),
              endereco: { ...endereco, cep: soDigitos(endereco.cep) },
              beneficio: beneficioPayload,
            };
      const p_itens = itens.map((i) => ({ sku: i.sku, quantidade: i.quantidade }));
      if (edicao) {
        const { data, error } = await (supabase as any).rpc("vd_editar_pedido", {
          p_pedido_id: editId, p_itens, p_entrega, p_observacao: observacao.trim() || null, p_motivo: motivo.trim(), p_meio: pagamento,
        });
        if (error) throw error;
        if (!data) throw new Error("A edição do pedido não devolveu resultado.");
        return data as Resultado;
      }
      const { data, error } = await (supabase as any).rpc("criar_pedido_venda_direta", {
        p_cliente,
        p_itens,
        p_entrega,
        p_pagamento: pagamento,
        p_observacao: observacao.trim() || null,
        p_vendedor_id: vendedorId,
        ...(bonif ? { p_bonificacao: { autorizado_por: bonifAutorizado.trim(), motivo: bonifMotivo, observacao: bonifObs.trim() || null } } : {}),
        ...(haverAtivo && !bonif ? { p_usar_haver: true } : {}),
      });
      if (error) throw error;
      if (!data) throw new Error("A criação do pedido não devolveu resultado.");
      return data as Resultado;
    },
    onSuccess: async (r) => {
      await invalidarVendaDireta(queryClient);
      if (edicao) {
        await queryClient.invalidateQueries({ queryKey: ["venda-direta-edicao", editId] });
        if (!r.pagamento_refeito) {
          toast.success("Pedido atualizado (pagamento inalterado)");
          navigate("/pedidos/venda-direta");
          return;
        }
        setResultado(r);
        toast.success(`${r.id_externo} atualizado — novo pagamento gerado.`);
        return;
      }
      setResultado(r);
      toast.success(`${r.id_externo} criado.`);
    },
    onError: (e) => toast.error(rawMessage(e)),
  });

  const limparTudo = () => {
    setTermo(""); setCliente(null); setNovo(null); setItens([]); setModo("retirada"); setEndereco(ENDERECO_VAZIO);
    setEnderecoEditado(false); setBeneficio(BENEFICIO_VAZIO); setPagamento("pix"); setBonifAutorizado(""); setBonifMotivo("brinde"); setBonifObs(""); setObservacao(""); setVendedorId(null);
    setCdCodigo("SITE-SP"); setResultado(null);
  };

  const telefoneCliente = soDigitos(cliente?.telefone ?? novo?.telefone ?? "");
  const primeiroNome = (cliente?.razao_social ?? novo?.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const pagamentoOriginal = meioVD(edQ.data?.linha.pagamento);
  const pagamentoMudou = edicao && pagamento !== pagamentoOriginal;
  const totalMudou = edicao && Math.abs(total - Number(edQ.data?.linha.valor_liquido ?? 0)) > 0.009;

  const tentarSalvar = () => {
    if (criar.isPending) return;
    if (!pendencia) {
      setTentouSalvar(false);
      criar.mutate();
      return;
    }
    setTentouSalvar(true);
    let alvo: HTMLElement | null = null;
    if (edicao && motivo.trim().length < 3) alvo = motivoRef.current;
    else if (itens.length === 0 || itens.some((i) => !Number.isInteger(i.quantidade) || i.quantidade < 1)) alvo = itensRef.current;
    else if (modo !== "retirada") alvo = entregaRef.current;
    else if (ben.ativo && beneficio.motivo.trim().length < 3) alvo = beneficioRef.current;
    alvo?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLButtonElement) alvo.focus();
      else alvo?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    }, 350);
  };

  const tituloTela = edicao ? `Pedidos Site SP · Editar ${edQ.data?.linha.id_externo ?? ""}`.trim() : "Pedidos Site SP · Novo pedido";
  const cabecalho = (
    <PageHeader
      titulo={tituloTela}
      breadcrumb={[{ label: "Operação" }, { label: tituloTela }]}
      icone={ShoppingBag}
      estado={edicao ? "Edição antes do pagamento — o cliente não muda." : "Pedido B2C por telefone ou WhatsApp, fora do Shopify."}
    />
  );

  if (edicao && (edQ.isLoading || edQ.isError || bloqueioEdicao)) {
    return (
      <PageShell>
        {cabecalho}
        <Card><CardContent className="space-y-3 py-6">
          {edQ.isLoading ? <Loader2 className="h-5 w-5 animate-spin" />
            : edQ.isError ? <p className="text-sm text-destructive">{rawMessage(edQ.error)}</p>
            : <p className="text-sm text-warning">{bloqueioEdicao}</p>}
          <Button variant="outline" asChild><Link to="/pedidos/venda-direta">Voltar para a Gestão</Link></Button>
        </CardContent></Card>
      </PageShell>
    );
  }

  if (resultado) {
    const r = resultado;
    const msg = `Olá ${primeiroNome}! Seu pedido ${r.id_externo} na Fetely ficou em ${formatBRL(r.valor_total)}. Pague pelo PIX neste link: ${r.link_pagamento ?? ""}`;
    const tel = telefoneCliente.length <= 11 ? `55${telefoneCliente}` : telefoneCliente;
    return (
      <PageShell>
        {cabecalho}
        <Card>
          <CardHeader>
            <CardTitle>{r.id_externo} {edicao ? "atualizado" : "criado"} — {r.pagamento === "bonificacao" ? "bonificado" : r.pagamento === "haver" ? "coberto pelo crédito do cliente" : "aguardando pagamento"}</CardTitle>
            <p className="text-2xl font-semibold tabular-nums">{formatBRL(r.valor_total)}</p>
            {Number(r.valor_haver ?? 0) > 0 && (
              <p className="text-sm text-muted-foreground">
                Crédito <span className="font-medium tabular-nums text-foreground">{formatBRL(r.valor_haver ?? 0)}</span>
                {" · "}A pagar <span className="font-medium tabular-nums text-foreground">{formatBRL(r.valor_a_pagar ?? 0)}</span>
              </p>
            )}
            {edicao && (
              <p className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm font-medium">
                {Math.abs(Number(r.valor_anterior ?? 0) - Number(r.valor_total ?? 0)) > 0.009
                  ? `O valor mudou de ${formatBRL(r.valor_anterior ?? null)} para ${formatBRL(r.valor_total)}`
                  : `O meio mudou para ${ROTULO_MEIO_VD[meioVD(r.pagamento)]}`} — envie o novo pagamento ao cliente
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {r.frete && (
              <p className="text-sm text-muted-foreground">
                Frete: <span className="font-medium text-foreground">{r.frete.servico ?? "—"}</span>
                {" · "}{r.frete.gratis || Number(r.frete.cobrado ?? 0) === 0 ? "Grátis" : <span className="tabular-nums">{formatBRL(r.frete.cobrado)}</span>}
                {r.frete.prazo_dias != null && <> · prazo {r.frete.prazo_dias}d</>}
                {r.frete.faixa && <> · {r.frete.faixa}</>}
                {r.frete.fonte === "plano_b" && <> · preço de tabela</>}
                {r.frete.motivo && <> · {r.frete.motivo}</>}
              </p>
            )}
            {r.pagamento === "bonificacao" ? (
              <p className="rounded-md border bg-muted/40 p-3 text-sm font-medium">Pedido bonificado criado — segue para faturamento.</p>
            ) : r.pagamento === "haver" ? (
              <p className="rounded-md border bg-muted/40 p-3 text-sm">Pedido coberto pelo crédito — sem cobrança.</p>
            ) : r.pagamento === "pix" && cfgPixNoLink ? (
              <LinkCartaoPainel
                meio="pix"
                pedidoId={r.pedido_id}
                idExterno={r.id_externo}
                total={Number(r.valor_haver ?? 0) > 0 ? Number(r.valor_a_pagar ?? 0) : r.valor_total}
                clienteNome={cliente?.razao_social ?? novo?.nome ?? null}
                telefone={telefoneCliente}
                pixLocal={{ payload: r.pix_copia_cola, link: r.link_pagamento }}
              />
            ) : r.pagamento === "pix" ? (
              <PixSafrapayPainel
                auto
                pedidoId={r.pedido_id}
                idExterno={r.id_externo}
                total={Number(r.valor_haver ?? 0) > 0 ? Number(r.valor_a_pagar ?? 0) : r.valor_total}
                clienteNome={cliente?.razao_social ?? novo?.nome ?? null}
                telefone={telefoneCliente}
                fallbackPayload={r.pix_copia_cola}
                fallbackLink={r.link_pagamento}
              />
            ) : r.pagamento === "cartao_maquininha" ? (
              <div className="space-y-3 rounded-md border border-warning/50 bg-warning/10 p-3">
                <p className="text-sm font-medium">Aguardando comprovante da maquininha — passe o cartão e anexe o comprovante para liberar o pedido.</p>
                <Button onClick={() => setAnexarComprovante(true)}><Paperclip className="h-4 w-4" /> Anexar comprovante</Button>
                {anexarComprovante && (
                  <ConfirmarPagamentoDialog
                    pedidoId={r.pedido_id}
                    provisaoId={(r as Resultado & { provisao_id?: string | null }).provisao_id ?? undefined}
                    aberto={anexarComprovante}
                    modo="sops"
                    aoFechar={() => { setAnexarComprovante(false); void invalidarVendaDireta(queryClient); }}
                  />
                )}
              </div>
            ) : (
              <LinkCartaoPainel
                pedidoId={r.pedido_id}
                idExterno={r.id_externo}
                total={Number(r.valor_haver ?? 0) > 0 ? Number(r.valor_a_pagar ?? 0) : r.valor_total}
                clienteNome={cliente?.razao_social ?? novo?.nome ?? null}
                telefone={telefoneCliente}
                maxParcelas={parcelasLink}
                meio="cartao"
              />
            )}
            {r.avisos && r.avisos.length > 0 && (
              <p className="text-sm text-warning">
                {r.avisos.map((a) => <span key={a.sku} className="block">{a.aviso}</span>)}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {edicao
                ? <Button variant="outline" onClick={() => navigate("/pedidos/venda-direta")}>Voltar para a Gestão</Button>
                : <Button variant="outline" onClick={limparTudo}><Plus className="h-4 w-4" /> Novo pedido</Button>}
              <Button variant="outline" onClick={() => navigate(`/pedidos/venda-direta?pedido=${r.pedido_id}`)}>Voltar ao pedido</Button>
              <Button variant="outline" onClick={() => abrirImpressaoVD(r.pedido_id)}><Printer className="h-4 w-4" /> Imprimir</Button>
              <Button variant="outline" onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")}>Fechar</Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      {cabecalho}

      {/* Grade em 2 colunas a partir de lg: cliente/itens à esquerda, entrega/pagamento/observação à direita */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
      {/* 0a. CD — de onde sai o pedido, só na criação */}
      {!edicao && (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CD</CardTitle>
          </CardHeader>
          <CardContent>
            {cdsQ.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando CDs" />
            ) : cdsQ.isError ? (
              <p className="text-sm text-destructive">Falha ao carregar CDs: {rawMessage(cdsQ.error)}</p>
            ) : (cdsQ.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-destructive">Nenhum CD habilitado para Venda Direta — avise Sistemas.</p>
            ) : (
              <Select value={cdCodigo} onValueChange={(v) => setCdCodigo(v)}>
                <SelectTrigger aria-label="CD do pedido" className="w-full sm:max-w-xs">
                  <SelectValue placeholder="CD" />
                </SelectTrigger>
                <SelectContent>
                  {cdsQ.data!.map((c) => <SelectItem key={c.codigo} value={c.codigo}>{c.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      )}

      {/* 0. Vendedora — card próprio, só na criação */}
      {!edicao && (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vendedora*</CardTitle>
          </CardHeader>
          <CardContent>
            {vendedoresQ.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando vendedoras" />
            ) : vendedoresQ.isError ? (
              <p className="text-sm text-destructive">Falha ao carregar vendedoras: {rawMessage(vendedoresQ.error)}</p>
            ) : (vendedoresQ.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-destructive">Nenhuma vendedora ativa encontrada — avise Sistemas.</p>
            ) : (
              <Select value={vendedorId ?? ""} onValueChange={(v) => setVendedorId(v)}>
                <SelectTrigger aria-label="Vendedora do pedido" className="w-full sm:max-w-xs">
                  <SelectValue placeholder="Quem fez a venda?" />
                </SelectTrigger>
                <SelectContent>
                  {vendedoresQ.data!.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      )}
      {/* 1. Cliente */}
      <Card ref={itensRef}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Cliente</CardTitle>
          {!novo && !edicao && <Button variant="outline" size="sm" onClick={abrirNovo}><UserPlus className="h-4 w-4" /> Novo cliente</Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          {edicao && <p className="text-xs text-muted-foreground">Cliente não pode ser trocado — para outro cliente, cancele e crie um novo pedido</p>}
          {cliente ? (
            <div className="flex items-start justify-between rounded-md border p-3">
              <div className="text-sm">
                <p className="font-medium">{cliente.razao_social}</p>
                <p className="text-muted-foreground">{cpfOculto(cliente.cpf)} · {cliente.telefone ?? "sem telefone"}{cliente.email ? ` · ${cliente.email}` : ""}</p>
                {soDigitos(cliente.cpf).length !== 11 && <p className="mt-1 text-destructive">CPF obrigatório para a NF</p>}
              </div>
              {!edicao && <Button variant="ghost" size="icon" aria-label="Trocar cliente" onClick={() => setCliente(null)}><X className="h-4 w-4" /></Button>}
            </div>
          ) : edicao ? (
            <p className="text-sm text-destructive">Pedido sem cliente vinculado.</p>
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
                    {buscaQ.data.map((c, i) => (
                      <li key={c.id ?? `p-${c.pessoa_id ?? i}`}>
                        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50" onClick={() => selecionarResultado(c)}>
                          <span className="font-medium">{c.nome}</span>
                          <span className="text-muted-foreground"> · {cpfOculto(c.cpf)} · {c.telefone ?? "sem telefone"}</span>
                          {c.funcionario && <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px] font-normal">Funcionário</Badge>}
                          {c.inativo && <Badge variant="outline" className="ml-2 px-1.5 py-0 text-[10px] font-normal">Inativo</Badge>}
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
      <Card ref={entregaRef}>
        <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ProdutoVarejoCombobox value="" onSelect={addItem} ariaLabel="Adicionar produto" />
          {itens.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-10 text-muted-foreground">
              <PackageSearch className="h-8 w-8" />
              <p className="text-sm">Busque um produto pelo código, SKU ou nome</p>
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
                      <CodProduto chave={i.sku} />
                      {semSaldo ? (
                        <Badge variant="outline" className="border-warning/50 text-warning">Sem saldo no {cdRotulo}</Badge>
                      ) : (
                        <Badge variant="outline" className="font-normal text-muted-foreground tabular-nums">
                          {cdRotulo}: {saldoQ.isLoading ? "…" : (disp ?? 0)} disp.
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
          <CamposEndereco v={endereco} cepObrigatorio onChange={(e) => { setEnderecoEditado(true); setEndereco(e); }} />
          {frete.aguardandoDados && soDigitos(endereco.cep).length !== 8 && (
            <p className="text-xs text-muted-foreground">Informe o CEP de entrega para cotar SEDEX, PAC e Frete Fetely.</p>
          )}
          <CartoesEntrega opcoes={frete.opcoes} valor={modo} onChange={(m) => setModo(m)} cotando={frete.cotando} />
          <AvisosFrete correiosErro={frete.correiosErro} tabelaErro={frete.tabelaErro} paramErro={frete.paramErro} pesoIncompleto={frete.pesoIncompleto} />
        </CardContent>
      </Card>

      <div ref={beneficioRef}>
        {!bonif && <BeneficioCard v={beneficio} onChange={setBeneficio} comEntrega={modo !== "retirada"} />}
      </div>

      {/* 4. Pagamento */}
      <Card>
        <CardHeader><CardTitle className="text-base">Pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {temHaver && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Crédito do cliente · <span className="tabular-nums">{formatBRL(haverSaldoTotal)}</span></span>
                <label className="flex items-center gap-2 text-sm"><Switch checked={usarHaver} onCheckedChange={setUsarHaver} />Usar crédito neste pedido</label>
              </div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {haveres.map((h) => (
                  <li key={h.haver_id} className="tabular-nums">
                    {h.descricao || h.origem || "Crédito"} · {formatBRL(Number(h.saldo ?? 0))}
                    {h.expira_em ? ` · vence em ${h.expira_em.slice(0, 10).split("-").reverse().join("/")}` : ""}
                  </li>
                ))}
              </ul>
              {haverAtivo && (
                <p className="tabular-nums text-muted-foreground">Crédito {formatBRL(haverAplicado)} · A pagar {formatBRL(aPagarComHaver)}</p>
              )}
              {haverCobreTudo && <p className="text-muted-foreground">Pedido coberto pelo crédito — sem cobrança</p>}
            </div>
          )}
          <RadioGroup disabled={haverCobreTudo} value={pagamento} onValueChange={(v) => setPagamento(v as typeof pagamento)} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-start gap-2 text-sm">
              <RadioGroupItem value="pix" className="mt-0.5" />
              <span>
                <span className="flex items-center gap-1"><QrCode className="h-3.5 w-3.5" />{rotPag.pix}</span>
                <span className="block text-xs text-muted-foreground">{rotPag.pixLegenda}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <RadioGroupItem value="cartao" className="mt-0.5" />
              <span>
                <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />{rotPag.cartao}</span>
                <span className="block text-xs text-muted-foreground">{rotPag.cartaoLegenda}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <RadioGroupItem value="cartao_maquininha" className="mt-0.5" />
              <span>
                <span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" />Cartão maquininha</span>
                <span className="block text-xs text-muted-foreground">Passa na loja · sem link · anexar o comprovante</span>
              </span>
            </label>
            {!edicao && (
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="bonificacao" className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5" />Bonificação</span>
                  <span className="block text-xs text-muted-foreground">Sem cobrança · direto para faturamento</span>
                </span>
              </label>
            )}
          </RadioGroup>
          {bonif && (
            <div className="space-y-3 pt-2">
              <p className="rounded-md border border-info/50 bg-info/10 p-3 text-sm">Pedido sem cobrança. Preço de tabela com desconto de bonificação; frete por conta da Fetely. Segue direto para faturamento.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bonif-aut">Autorizado por *</Label>
                  <Input id="bonif-aut" value={bonifAutorizado} onChange={(e) => setBonifAutorizado(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo *</Label>
                  <Select value={bonifMotivo} onValueChange={setBonifMotivo}>
                    <SelectTrigger><SelectValue placeholder={motivosBonifQ.isLoading ? "Carregando…" : "Escolha"} /></SelectTrigger>
                    <SelectContent>
                      {(motivosBonifQ.data ?? []).map((m) => <SelectItem key={m.codigo} value={m.codigo}>{m.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {motivosBonifQ.isError && <p className="text-xs text-destructive">{(motivosBonifQ.error as Error).message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bonif-obs">Observação da bonificação</Label>
                <Textarea id="bonif-obs" rows={2} value={bonifObs} onChange={(e) => setBonifObs(e.target.value)} />
              </div>
            </div>
          )}
          {pagamento === "cartao" && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Label className="text-sm">Parcelas no link</Label>
              <SelectParcelas value={parcelasLink} onChange={setParcelasManual} />
              {cfgParcelasQ.isError
                ? <span className="text-sm text-destructive">Regras de parcelamento: {rawMessage(cfgParcelasQ.error)}</span>
                : <span className="text-sm text-muted-foreground">{textoPadraoParcelas(cfgParcelasQ.data)}</span>}
            </div>
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
                        <span className="tabular-nums text-muted-foreground">{i.quantidade}×</span> <CodProduto chave={i.sku} variant="compacto" /> {i.nome ?? i.sku}
                      </span>
                      <span className="tabular-nums">{formatBRL(i.preco * i.quantidade)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Itens ({pecas})</span><span className="tabular-nums">{formatBRL(valorItens)}</span></div>
                {ben.desconto > 0 && (
                  <div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="tabular-nums">−{formatBRL(ben.desconto)}</span></div>
                    {beneficio.motivo.trim() && <p className="text-xs text-muted-foreground">{beneficio.motivo.trim()}</p>}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frete</span>
                  <span className="tabular-nums">
                    <span className="text-muted-foreground">{ROTULO_MODAL[modo]} · </span>
                    {modo === "retirada" ? "Grátis" : (
                      <>
                        {ben.freteTipo !== "nenhum" && <span className="mr-1 text-muted-foreground line-through">{formatBRL(freteCotado)}</span>}
                        {freteCobrado === 0 ? "Grátis" : formatBRL(freteCobrado)}
                      </>
                    )}
                  </span>
                </div>
              </div>
              <Separator />
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-3xl font-semibold tabular-nums">{formatBRL(total)}</span>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {bonif ? <Gift className="h-4 w-4" /> : pagamento === "pix" ? <QrCode className="h-4 w-4" /> : pagamento === "cartao_maquininha" ? <Smartphone className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {bonif ? "Bonificação · sem cobrança" : pagamento === "pix" ? (cfgPixNoLink ? "PIX · link Safrapay" : "PIX · QR na conta") : pagamento === "cartao_maquininha" ? "Cartão maquininha · comprovante" : `Cartão · até ${parcelasLink}x`}
              </p>
              {edicao && (pagamentoMudou || totalMudou) && (
                <p className="rounded-md border border-warning/50 bg-warning/10 p-2 text-sm font-medium">
                  Pagamento será refeito: {formatBRL(edQ.data?.linha.valor_liquido ?? 0)} → {formatBRL(total)} · {rotuloPagamentoVD(pagamento)}
                </p>
              )}
              {edicao && (
                <div className="space-y-1">
                  <Label htmlFor="motivo-edicao">Motivo da alteração*</Label>
                  <Textarea
                    ref={motivoRef}
                    id="motivo-edicao"
                    rows={2}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex.: cliente trocou um item"
                    aria-invalid={tentouSalvar && motivo.trim().length < 3}
                    className={tentouSalvar && motivo.trim().length < 3 ? "border-destructive focus-visible:ring-destructive" : undefined}
                  />
                  {tentouSalvar && motivo.trim().length < 3 && <p className="text-sm text-destructive">Informe o motivo da alteração</p>}
                </div>
              )}
              {pendencia && (!edicao || tentouSalvar) && !(edicao && motivo.trim().length < 3) && <p className="text-sm text-destructive">{pendencia}</p>}
              <Button size="lg" className="w-full" disabled={criar.isPending || (!edicao && !!pendencia)} onClick={tentarSalvar}>
                {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {edicao ? "Salvar alterações" : "Criar pedido"}
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
        <Button size="lg" disabled={criar.isPending || (!edicao && !!pendencia)} onClick={tentarSalvar}>
          {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {edicao ? "Salvar alterações" : "Criar pedido"}
        </Button>
      </div>
    </PageShell>
  );
}
