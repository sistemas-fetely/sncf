import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useDb } from "@/lib/db";
import { humanizeError } from "@/lib/errorMessages";
import { formatError } from "@/lib/format-error";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { hojeISO } from "@/lib/data";

/**
 * CADASTRO-EM-FASES · FASE 0 — Entrada Rápida de Pessoa.
 *
 * A tela antiga pedia ~40 campos de uma vez e por isso ninguém preenchia:
 * 4 pessoas ativas estão sem CPF. Aqui só existem os 10 campos que destravam
 * e-mail corporativo, acesso ao sistema, organograma e benefício iFood. O que
 * falta passa a ser PENDÊNCIA COBRADA DEPOIS (vw_cadastro_pendencia), mostrada
 * na cara do usuário ao salvar — o cadastro passa a ser honesto sobre estar
 * incompleto em vez de fingir completude.
 *
 * DIMENSÃO-VIVE-EM-TABELA: tipo_vinculo vem de `tipos_vinculo`, nunca de um
 * array no código.
 *
 * Exceção CLT: a admissão no eSocial é devida até o dia anterior ao início,
 * então CLT não tem fase 0 — exige os campos legais no mesmo ato.
 */

type Dim = { id: string; nome: string };
type TipoVinculo = { codigo: string; nome: string };

const CAMPOS_CLT = [
  ["pis_pasep", "PIS/PASEP"],
  ["ctps_numero", "CTPS (número)"],
  ["data_admissao", "Data de admissão"],
  ["valor_base", "Salário base"],
  ["banco_nome", "Banco"],
  ["agencia", "Agência"],
  ["conta", "Conta"],
] as const;

type CampoClt = (typeof CAMPOS_CLT)[number][0];

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

function mascaraCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function mascaraTelefone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function cpfValido(raw: string) {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (len: number) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(cpf[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

function emailValido(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

interface PendenciaFase {
  fase_nome: string;
  responsavel: string;
  total: number;
}

/** §9: mensagem de erro abaixo do campo, em destructive, dizendo o que fazer. */
function ErroCampo({ mostrar, mensagem }: { mostrar: boolean; mensagem: string | null }) {
  if (!mostrar || !mensagem) return null;
  return <p className="text-[11px] text-destructive">{mensagem}</p>;
}

/** §15/6: origem vazia diz o que fazer, não "erro ao carregar". */
function ListaOuVazio({ vazio, aviso, children }: { vazio: boolean; aviso: string; children: React.ReactNode }) {
  if (vazio) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">{aviso}</p>;
  }
  return <>{children}</>;
}


export default function PessoaEntradaRapida() {
  const db = useDb();
  const navigate = useNavigate();

  // Pessoa
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [cpf, setCpf] = useState("");
  const [emailPessoal, setEmailPessoal] = useState("");
  const [telefone, setTelefone] = useState("");

  // Vínculo
  const [tipoVinculo, setTipoVinculo] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [gestorPessoaId, setGestorPessoaId] = useState("");
  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [emailCorporativo, setEmailCorporativo] = useState("");
  const [emailTocado, setEmailTocado] = useState(false);
  const [sugerindoEmail, setSugerindoEmail] = useState(false);

  const [clt, setClt] = useState<Record<CampoClt, string>>({
    pis_pasep: "", ctps_numero: "", data_admissao: "", valor_base: "",
    banco_nome: "", agencia: "", conta: "",
  });

  // Dimensões
  const [tipos, setTipos] = useState<TipoVinculo[]>([]);
  const [cargos, setCargos] = useState<Dim[]>([]);
  const [departamentos, setDepartamentos] = useState<Dim[]>([]);
  const [unidades, setUnidades] = useState<Dim[]>([]);
  const [pessoasAtivas, setPessoasAtivas] = useState<Dim[]>([]);
  const [carregandoDims, setCarregandoDims] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [pessoaExistente, setPessoaExistente] = useState<{ id: string; nome_completo: string } | null>(null);
  const [sucesso, setSucesso] = useState<{ pessoaId: string; fases: PendenciaFase[] } | null>(null);

  // §9: erro nasce abaixo do campo, e só depois que o campo foi tocado ou o
  // usuário tentou salvar — formulário recém-aberto nunca abre vermelho.
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const marcar = (chave: string) => setTocado((s) => ({ ...s, [chave]: true }));
  const mostrarErro = (chave: string) => tentouSalvar || !!tocado[chave];


  const ehCLT = tipoVinculo === "CLT";
  const ehDiretoria = tipoVinculo === "DIRETORIA";

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregandoDims(true);
      try {
        const [tv, c, d, u, vg] = await Promise.all([
          (supabase as any).from("tipos_vinculo").select("codigo, nome").eq("ativo", true).order("ordem"),
          (supabase as any).from("cargos").select("id, nome").eq("ativo", true).order("nome"),
          (supabase as any).from("departamentos").select("id, nome").eq("ativo", true).order("nome"),
          (supabase as any).from("unidades").select("id, nome").order("nome"),
          (supabase as any)
            .from("vinculos")
            .select("pessoa_id, pessoas!vinculos_pessoa_id_fkey(id, nome_completo)")
            .eq("status", "ativo"),
        ]);
        const erro = tv.error || c.error || d.error || u.error || vg.error;
        if (erro) throw erro;
        if (!vivo) return;
        setTipos((tv.data || []) as TipoVinculo[]);
        setCargos((c.data || []) as Dim[]);
        setDepartamentos((d.data || []) as Dim[]);
        setUnidades((u.data || []) as Dim[]);
        const mapa = new Map<string, string>();
        for (const linha of (vg.data || []) as any[]) {
          if (linha?.pessoas?.id) mapa.set(linha.pessoas.id, linha.pessoas.nome_completo);
        }
        setPessoasAtivas(
          Array.from(mapa, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
        );
      } catch (err) {
        if (vivo) toast.error("Erro ao carregar listas: " + formatError(err));
      } finally {
        if (vivo) setCarregandoDims(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  /** Sugestão de e-mail corporativo — DIMENSÃO-VIVE-NO-BANCO (RPC decide o padrão). */
  async function sugerirEmail() {
    const nome = nomeCompleto.trim();
    if (!nome || emailTocado) return;
    setSugerindoEmail(true);
    try {
      const { data, error } = await (supabase.rpc as any)("fn_sugerir_email_corporativo", {
        p_nome_completo: nome,
        p_nome_social: null,
        p_dominio: "fetely.com.br",
      });
      if (error) throw error;
      if (typeof data === "string" && data) setEmailCorporativo(data);
    } catch (err) {
      toast.error("Não foi possível sugerir o e-mail corporativo: " + formatError(err));
    } finally {
      setSugerindoEmail(false);
    }
  }

  const faltando = useMemo(() => {
    const f: string[] = [];
    if (nomeCompleto.trim().length < 3) f.push("Nome completo");
    if (!cpfValido(cpf)) f.push("CPF válido");
    if (!emailValido(emailPessoal)) f.push("E-mail pessoal");
    if (onlyDigits(telefone).length < 10) f.push("Telefone");
    if (!tipoVinculo) f.push("Tipo de vínculo");
    if (!cargoId) f.push("Cargo");
    if (!departamentoId) f.push("Departamento");
    if (!unidadeId) f.push("Unidade");
    if (!ehDiretoria && !gestorPessoaId) f.push("Gestor");
    if (!dataInicio) f.push("Data de início");
    if (ehCLT) {
      for (const [campo, rotulo] of CAMPOS_CLT) {
        if (!clt[campo].trim()) f.push(rotulo);
      }
    }
    return f;
  }, [nomeCompleto, cpf, emailPessoal, telefone, tipoVinculo, cargoId, departamentoId, unidadeId, gestorPessoaId, dataInicio, ehCLT, ehDiretoria, clt]);

  function payloadVinculo(pessoaId: string) {
    const base: Record<string, unknown> = {
      pessoa_id: pessoaId,
      tipo_vinculo: tipoVinculo,
      status: "ativo",
      cargo_id: cargoId,
      departamento_id: departamentoId,
      unidade_id: unidadeId,
      gestor_pessoa_id: ehDiretoria ? null : gestorPessoaId || null,
      data_inicio: dataInicio,
      email_corporativo: emailCorporativo.trim() || null,
    };
    if (ehCLT) {
      const valor = Number(clt.valor_base.replace(/\./g, "").replace(",", "."));
      Object.assign(base, {
        pis_pasep: clt.pis_pasep.trim(),
        ctps_numero: clt.ctps_numero.trim(),
        data_admissao: clt.data_admissao,
        valor_base: isNaN(valor) ? null : valor,
        banco_nome: clt.banco_nome.trim(),
        agencia: clt.agencia.trim(),
        conta: clt.conta.trim(),
      });
    }
    return base;
  }

  /** Pendências da fase 0+ — proposital: a tela declara o que falta. */
  async function carregarPendencias(vinculoId: string): Promise<PendenciaFase[]> {
    const { data, error } = await (supabase as any)
      .from("vw_cadastro_pendencia")
      .select("fase_nome, responsavel, ordem")
      .eq("vinculo_id", vinculoId)
      .eq("obrigatorio", true);
    if (error) throw error;
    const mapa = new Map<string, PendenciaFase & { ordem: number }>();
    for (const l of (data || []) as any[]) {
      const chave = String(l.fase_nome);
      const atual = mapa.get(chave);
      if (atual) atual.total += 1;
      else mapa.set(chave, { fase_nome: chave, responsavel: l.responsavel ?? "—", total: 1, ordem: l.ordem ?? 0 });
    }
    return Array.from(mapa.values()).sort((a, b) => a.ordem - b.ordem);
  }

  async function concluir(pessoaId: string, vinculoId: string) {
    let fases: PendenciaFase[] = [];
    try {
      fases = await carregarPendencias(vinculoId);
    } catch (err) {
      toast.error("Pessoa criada, mas não foi possível ler as pendências: " + formatError(err));
    }
    setSucesso({ pessoaId, fases });
    toast.success("Pessoa criada");
  }

  async function salvar() {
    setTentouSalvar(true);
    if (faltando.length > 0) {
      toast.error("Faltam campos obrigatórios: " + faltando.join(", "));
      return;
    }
    setSalvando(true);
    try {
      // CPF já existente: nunca cria pessoa duplicada.
      const { data: existente, error: errBusca } = await (supabase as any)
        .from("pessoas")
        .select("id, nome_completo")
        .eq("cpf", onlyDigits(cpf))
        .maybeSingle();
      if (errBusca) throw errBusca;
      if (existente) {
        setPessoaExistente({ id: existente.id, nome_completo: existente.nome_completo });
        setSalvando(false);
        return;
      }

      const { data: p, error: e1 } = await (db as any)
        .from("pessoas")
        .insert({
          nome_completo: nomeCompleto.trim(),
          cpf: onlyDigits(cpf),
          email_pessoal: emailPessoal.trim(),
          telefone: telefone.trim(),
        })
        .select("id")
        .single();
      if (e1) throw e1;
      const pessoaId = p.id as string;

      const { data: v, error: e2 } = await (db as any)
        .from("vinculos")
        .insert(payloadVinculo(pessoaId))
        .select("id")
        .single();
      if (e2) {
        // Rollback otimista: nunca deixar pessoa órfã.
        const { error: errDel } = await (db as any).from("pessoas").delete().eq("id", pessoaId);
        if (errDel) {
          toast.error(
            "Vínculo falhou e a pessoa não pôde ser removida (" + humanizeError(errDel.message) + "). Edite a ficha para completar."
          );
        }
        throw e2;
      }

      await concluir(pessoaId, v.id as string);
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setSalvando(false);
    }
  }

  async function criarVinculoParaExistente() {
    if (!pessoaExistente) return;
    setSalvando(true);
    try {
      const { data: v, error } = await (db as any)
        .from("vinculos")
        .insert(payloadVinculo(pessoaExistente.id))
        .select("id")
        .single();
      if (error) throw error;
      await concluir(pessoaExistente.id, v.id as string);
    } catch (err) {
      toast.error(formatError(err));
    } finally {
      setSalvando(false);
      setPessoaExistente(null);
    }
  }

  if (sucesso) {
    return (
      <PageShell variant="leitura">
        <PageHeader titulo="Pessoa criada" estado="Fase 0 concluída — o resto virou pendência com responsável" />
        <Card>
          <CardHeader><CardTitle>O que ficou pendente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {sucesso.fases.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência obrigatória registrada.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {sucesso.fases.map((f) => (
                  <li key={f.fase_nome} className="flex items-center justify-between gap-3">
                    <span className="font-medium">{f.fase_nome}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {f.total} <span className="text-xs">({f.responsavel})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="ghost" onClick={() => navigate("/pessoas")}>Voltar para pessoas</Button>
              <Button onClick={() => navigate(`/pessoas/${sucesso.pessoaId}/editar`)}>Completar cadastro</Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell variant="leitura">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pessoas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          className="mb-0 flex-1"
          titulo="Entrada rápida de pessoa"
          icone={UserPlus}
          estado="Fase 0 — 10 campos, sem documento. O resto vira pendência cobrada depois."
        />
      </div>

      {/* QUEM É */}
      <Card>
        <CardHeader><CardTitle>Quem é</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome completo *</Label>
            <Input
              id="nome"
              value={nomeCompleto}
              onChange={(e) => setNomeCompleto(e.target.value)}
              onBlur={() => { marcar("nome"); void sugerirEmail(); }}
              placeholder="Maria Aparecida da Silva"
            />
            <ErroCampo
              mostrar={mostrarErro("nome")}
              mensagem={nomeCompleto.trim().length < 3 ? "Informe o nome completo" : null}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF *</Label>
            <Input
              id="cpf"
              value={cpf}
              onChange={(e) => setCpf(mascaraCpf(e.target.value))}
              onBlur={() => marcar("cpf")}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
            <ErroCampo
              mostrar={mostrarErro("cpf")}
              mensagem={!cpf.trim() ? "Informe o CPF" : !cpfValido(cpf) ? "Informe um CPF válido" : null}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefone">Telefone *</Label>
            <Input
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              onBlur={() => marcar("telefone")}
              placeholder="(00) 00000-0000"
              inputMode="numeric"
            />
            <ErroCampo
              mostrar={mostrarErro("telefone")}
              mensagem={onlyDigits(telefone).length < 10 ? "Informe o telefone" : null}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-pessoal">E-mail pessoal *</Label>
            <Input
              id="email-pessoal"
              value={emailPessoal}
              onChange={(e) => setEmailPessoal(e.target.value)}
              onBlur={() => marcar("email_pessoal")}
              placeholder="maria@gmail.com"
              type="email"
            />
            <ErroCampo
              mostrar={mostrarErro("email_pessoal")}
              mensagem={!emailValido(emailPessoal) ? "Informe um e-mail válido" : null}
            />
          </div>
        </CardContent>

      </Card>

      {/* ONDE ENTRA */}
      <Card>
        <CardHeader><CardTitle>Onde entra</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de vínculo *</Label>
            <Select
              value={tipoVinculo}
              onValueChange={(v) => { marcar("tipo_vinculo"); setTipoVinculo(v); }}
              disabled={carregandoDims}
            >
              <SelectTrigger>
                <SelectValue placeholder={carregandoDims ? "Carregando..." : "PJ"} />
              </SelectTrigger>
              <SelectContent>
                <ListaOuVazio vazio={tipos.length === 0} aviso="Nenhum tipo de vínculo cadastrado. Cadastre em Parâmetros">
                  {tipos.map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>{t.nome}</SelectItem>
                  ))}
                </ListaOuVazio>
              </SelectContent>
            </Select>
            <ErroCampo
              mostrar={mostrarErro("tipo_vinculo")}
              mensagem={!tipoVinculo ? "Escolha o tipo de vínculo" : null}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data de início *</Label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              onBlur={() => marcar("data_inicio")}
            />
            <ErroCampo
              mostrar={mostrarErro("data_inicio")}
              mensagem={!dataInicio ? "Informe a data de início" : null}
            />
          </div>
          {/* Par curto e correlato — única exceção à coluna única (§9). */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cargo *</Label>
              <Select
                value={cargoId}
                onValueChange={(v) => { marcar("cargo"); setCargoId(v); }}
                disabled={carregandoDims}
              >
                <SelectTrigger>
                  <SelectValue placeholder={carregandoDims ? "Carregando..." : "Analista Financeiro Sr"} />
                </SelectTrigger>
                <SelectContent>
                  <ListaOuVazio vazio={cargos.length === 0} aviso="Nenhum cargo cadastrado. Cadastre em Parâmetros">
                    {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </ListaOuVazio>
                </SelectContent>
              </Select>
              <ErroCampo mostrar={mostrarErro("cargo")} mensagem={!cargoId ? "Escolha o cargo" : null} />
            </div>
            <div className="space-y-1.5">
              <Label>Departamento *</Label>
              <Select
                value={departamentoId}
                onValueChange={(v) => { marcar("departamento"); setDepartamentoId(v); }}
                disabled={carregandoDims}
              >
                <SelectTrigger>
                  <SelectValue placeholder={carregandoDims ? "Carregando..." : "Administrativo"} />
                </SelectTrigger>
                <SelectContent>
                  <ListaOuVazio vazio={departamentos.length === 0} aviso="Nenhum departamento cadastrado. Cadastre em Parâmetros">
                    {departamentos.map((d) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                  </ListaOuVazio>
                </SelectContent>
              </Select>
              <ErroCampo
                mostrar={mostrarErro("departamento")}
                mensagem={!departamentoId ? "Escolha o departamento" : null}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade *</Label>
            <Select
              value={unidadeId}
              onValueChange={(v) => { marcar("unidade"); setUnidadeId(v); }}
              disabled={carregandoDims}
            >
              <SelectTrigger>
                <SelectValue placeholder={carregandoDims ? "Carregando..." : "Fetely Matriz SP"} />
              </SelectTrigger>
              <SelectContent>
                <ListaOuVazio vazio={unidades.length === 0} aviso="Nenhuma unidade cadastrada. Cadastre em Parâmetros">
                  {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </ListaOuVazio>
              </SelectContent>
            </Select>
            <ErroCampo mostrar={mostrarErro("unidade")} mensagem={!unidadeId ? "Escolha a unidade" : null} />
          </div>
          {!ehDiretoria && (
            <div className="space-y-1.5">
              <Label>Gestor *</Label>
              <Select
                value={gestorPessoaId}
                onValueChange={(v) => { marcar("gestor"); setGestorPessoaId(v); }}
                disabled={carregandoDims}
              >
                <SelectTrigger>
                  <SelectValue placeholder={carregandoDims ? "Carregando..." : "Nathalie Elkrief Ejzenberg"} />
                </SelectTrigger>
                <SelectContent>
                  <ListaOuVazio vazio={pessoasAtivas.length === 0} aviso="Nenhuma pessoa ativa para ser gestor. Cadastre em Pessoas">
                    {pessoasAtivas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </ListaOuVazio>
                </SelectContent>
              </Select>
              <ErroCampo mostrar={mostrarErro("gestor")} mensagem={!gestorPessoaId ? "Escolha o gestor" : null} />
            </div>
          )}
        </CardContent>

      </Card>

      {/* ACESSO */}
      <Card>
        <CardHeader><CardTitle>Acesso</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">

            <Label htmlFor="email-corp">E-mail corporativo</Label>
            <div className="flex items-center gap-2">
              <Input
                id="email-corp"
                value={emailCorporativo}
                onChange={(e) => { setEmailTocado(true); setEmailCorporativo(e.target.value); }}
                placeholder="maria.silva@fetely.com.br"
              />
              {sugerindoEmail && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground">Sugerido pelo padrão da empresa. Pode sobrescrever.</p>
          </div>
        </CardContent>
      </Card>

      {/* CLT NÃO TEM ENTRADA RÁPIDA */}
      {ehCLT && (
        <>
          <Alert variant="destructive">
            <AlertTitle>CLT não tem entrada rápida</AlertTitle>
            <AlertDescription>
              A admissão no eSocial é devida até o dia anterior ao início — sem estes dados a empresa fica em falta
              desde o primeiro dia.
            </AlertDescription>
          </Alert>
          <Card>
            <CardHeader><CardTitle>Dados legais obrigatórios (CLT)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {CAMPOS_CLT.map(([campo, rotulo]) => (
                <div className="space-y-1.5" key={campo}>
                  <Label htmlFor={`clt-${campo}`}>{rotulo} *</Label>
                  <Input
                    id={`clt-${campo}`}
                    type={campo === "data_admissao" ? "date" : "text"}
                    value={clt[campo]}
                    onChange={(e) => setClt((s) => ({ ...s, [campo]: e.target.value }))}
                    onBlur={() => marcar(`clt_${campo}`)}
                  />
                  <ErroCampo
                    mostrar={mostrarErro(`clt_${campo}`)}
                    mensagem={!clt[campo].trim() ? `Informe ${rotulo.toLowerCase()}` : null}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => navigate("/pessoas")} disabled={salvando}>Cancelar</Button>

        <Button onClick={salvar} disabled={salvando || faltando.length > 0} className="gap-2">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          {salvando ? "Criando..." : "Criar pessoa"}
        </Button>
      </div>

      <p className="pt-2 text-xs text-muted-foreground">
        Precisa de tudo agora? Crie a pessoa aqui e use o{" "}
        <span className="underline">Cadastro completo (edição)</span> em seguida.
      </p>

      <AlertDialog open={!!pessoaExistente} onOpenChange={(o) => !o && setPessoaExistente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>CPF já cadastrado</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe uma pessoa com este CPF: <strong>{pessoaExistente?.nome_completo}</strong>. Nunca criamos pessoa
              duplicada — você pode criar um novo vínculo para ela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={criarVinculoParaExistente}>
              Criar novo vínculo para esta pessoa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
