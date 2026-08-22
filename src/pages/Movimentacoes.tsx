import { useState, useMemo } from "react";
import { ArrowUpDown, Plus, Search, TrendingUp, ArrowRightLeft, DollarSign, Building2, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/contexts/AuthContext";
import { SelectDepartamentoHierarquico } from "@/components/shared/SelectDepartamentoHierarquico";
import { SalarioMasked } from "@/components/SalarioMasked";
import { useCargos } from "@/hooks/useCargos";
import {
  useMovimentacoes, useColaboradoresAtivos, useContratosPJAtivos,
  useCriarMovimentacao, useAtualizarStatusMovimentacao, useExcluirMovimentacao,
  type MovimentacaoComNome,
} from "@/hooks/useMovimentacoes";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

const TIPOS = [
  { value: "promocao", label: "Promoção", icon: TrendingUp },
  { value: "transferencia", label: "Transferência", icon: ArrowRightLeft },
  { value: "alteracao_salarial", label: "Alteração Salarial", icon: DollarSign },
  { value: "alteracao_cargo", label: "Alteração de Cargo", icon: ArrowUpDown },
  { value: "mudanca_departamento", label: "Mudança de Departamento", icon: Building2 },
];

const STATUS_BADGE: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0",
  aprovada: "bg-info/10 text-info border-0",
  efetivada: "bg-success/10 text-success border-0",
  cancelada: "bg-destructive/10 text-destructive border-0",
};

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

export default function Movimentacoes() {
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["super_admin", "gestor_rh", "financeiro"]);

  const { data: movimentacoes = [], isLoading } = useMovimentacoes();
  const { data: colaboradores = [] } = useColaboradoresAtivos();
  const { data: contratosPJ = [] } = useContratosPJAtivos();
  const { data: cargosRaw = [], isLoading: loadingCargos } = useCargos();
  const cargos = cargosRaw.map((c) => ({ id: c.id, label: c.nome }));
  
  const criarMut = useCriarMovimentacao();
  const statusMut = useAtualizarStatusMovimentacao();
  const excluirMut = useExcluirMovimentacao();

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [vinculo, setVinculo] = useState<"clt" | "pj">("clt");
  const [tipo, setTipo] = useState("promocao");
  const [pessoaId, setPessoaId] = useState("");
  const [dataEfetivacao, setDataEfetivacao] = useState("");
  const [cargoNovo, setCargoNovo] = useState("");
  const [deptoNovo, setDeptoNovo] = useState("");
  const [salarioNovo, setSalarioNovo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const filtered = useMemo(() => {
    return movimentacoes.filter((m) => {
      if (busca && !m.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      if (filtroTipo !== "todos" && m.tipo !== filtroTipo) return false;
      if (filtroStatus !== "todos" && m.status !== filtroStatus) return false;
      return true;
    });
  }, [movimentacoes, busca, filtroTipo, filtroStatus]);

  // KPIs
  const totalMes = movimentacoes.filter((m) => {
    const d = new Date(m.data_efetivacao);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const pendentes = movimentacoes.filter((m) => m.status === "pendente").length;
  const promocoes = movimentacoes.filter((m) => m.tipo === "promocao").length;

  const resetForm = () => {
    setVinculo("clt");
    setTipo("promocao");
    setPessoaId("");
    setDataEfetivacao("");
    setCargoNovo("");
    setDeptoNovo("");
    setSalarioNovo("");
    setMotivo("");
    setObservacoes("");
  };

  const handleSubmit = () => {
    const pessoa = vinculo === "clt"
      ? colaboradores.find((c) => c.id === pessoaId)
      : contratosPJ.find((c) => c.id === pessoaId);

    if (!pessoa || !dataEfetivacao) return;

    const payload: any = {
      tipo,
      data_efetivacao: dataEfetivacao,
      motivo: motivo || null,
      observacoes: observacoes || null,
      status: "pendente",
      created_by: null,
    };

    if (vinculo === "clt") {
      const col = pessoa as typeof colaboradores[0];
      payload.colaborador_id = col.id;
      payload.contrato_pj_id = null;
      payload.cargo_anterior = col.cargo;
      payload.departamento_anterior = col.departamento;
      payload.salario_anterior = col.salario_base;
      payload.cargo_novo = cargoNovo || col.cargo;
      payload.departamento_novo = deptoNovo || col.departamento;
      payload.salario_novo = salarioNovo ? parseFloat(salarioNovo) : col.salario_base;
    } else {
      const pj = pessoa as typeof contratosPJ[0];
      payload.contrato_pj_id = pj.id;
      payload.colaborador_id = null;
      payload.cargo_anterior = pj.tipo_servico;
      payload.departamento_anterior = pj.departamento;
      payload.salario_anterior = pj.valor_mensal;
      payload.cargo_novo = cargoNovo || pj.tipo_servico;
      payload.departamento_novo = deptoNovo || pj.departamento;
      payload.salario_novo = salarioNovo ? parseFloat(salarioNovo) : pj.valor_mensal;
    }

    criarMut.mutate(payload, {
      onSuccess: () => {
        setDialogOpen(false);
        resetForm();
      },
    });
  };

  const selectedPessoa = vinculo === "clt"
    ? colaboradores.find((c) => c.id === pessoaId)
    : contratosPJ.find((c) => c.id === pessoaId);

  const fmt = (v: number | null) => v != null ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—";

  return (
    <PageShell>
      <PageHeader
        titulo="Promoções e Movimentações"
        estado="Registro de promoções, transferências e alterações"
        acoes={canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Movimentação
          </Button>
        )}
      />

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard title="Movimentações no Mês" value={totalMes} icon={ArrowUpDown} variant="default" />
        <StatCard title="Pendentes de Aprovação" value={pendentes} icon={ArrowRightLeft} variant={pendentes > 0 ? "warning" : "default"} />
        <StatCard title="Promoções Registradas" value={promocoes} icon={TrendingUp} variant="success" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="aprovada">Aprovada</SelectItem>
            <SelectItem value="efetivada">Efetivada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Vínculo</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>De → Para</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma movimentação encontrada</TableCell></TableRow>
              ) : (
                filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{new Date(m.data_efetivacao + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{TIPO_LABEL[m.tipo] || m.tipo}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{m.vinculo}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{m.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.tipo === "alteracao_salarial" || m.tipo === "promocao" ? (
                        <span className="inline-flex items-center gap-1">
                          <SalarioMasked valor={m.salario_anterior} userId={null} contexto="revisao_salarial" />
                          {" → "}
                          <SalarioMasked valor={m.salario_novo} userId={null} contexto="revisao_salarial" />
                        </span>
                      ) : m.tipo === "transferencia" || m.tipo === "mudanca_departamento"
                        ? `${m.departamento_anterior || "—"} → ${m.departamento_novo || "—"}`
                        : `${m.cargo_anterior || "—"} → ${m.cargo_novo || "—"}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[m.status] || ""}>{m.status}</Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right space-x-1">
                        {m.status === "pendente" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: m.id, status: "aprovada" })}>Aprovar</Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => statusMut.mutate({ id: m.id, status: "cancelada" })}>Cancelar</Button>
                          </>
                        )}
                        {m.status === "aprovada" && (
                          <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: m.id, status: "efetivada" })}>Efetivar</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => excluirMut.mutate(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Nova Movimentação */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Movimentação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vínculo</Label>
                <Select value={vinculo} onValueChange={(v) => { setVinculo(v as "clt" | "pj"); setPessoaId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="clt">CLT</SelectItem>
                    <SelectItem value="pj">PJ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{vinculo === "clt" ? "Colaborador" : "Contrato PJ"}</Label>
              <Select value={pessoaId} onValueChange={setPessoaId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {vinculo === "clt"
                    ? colaboradores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome_completo}</SelectItem>)
                    : contratosPJ.map((c) => <SelectItem key={c.id} value={c.id}>{c.contato_nome} ({c.razao_social})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {selectedPessoa && (
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p><strong>Cargo atual:</strong> {vinculo === "clt" ? (selectedPessoa as any).cargo : (selectedPessoa as any).tipo_servico}</p>
                <p><strong>Departamento:</strong> {(selectedPessoa as any).departamento}</p>
                <p><strong>Valor atual:</strong> {fmt(vinculo === "clt" ? (selectedPessoa as any).salario_base : (selectedPessoa as any).valor_mensal)}</p>
              </div>
            )}

            <div>
              <Label>Data de Efetivação</Label>
              <Input type="date" value={dataEfetivacao} onChange={(e) => setDataEfetivacao(e.target.value)} />
            </div>

            {(tipo === "promocao" || tipo === "alteracao_cargo") && (
              <div>
                <Label>Novo Cargo</Label>
                {loadingCargos ? (
                  <div className="flex items-center h-10"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : (
                  <Select value={cargoNovo} onValueChange={setCargoNovo}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                    <SelectContent>
                      {cargos.map((c) => (
                        <SelectItem key={c.id} value={c.label}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {(tipo === "transferencia" || tipo === "mudanca_departamento" || tipo === "promocao") && (
              <div>
                <Label>Novo Departamento</Label>
                <SelectDepartamentoHierarquico
                  valueTexto={deptoNovo}
                  onChange={(dep) => setDeptoNovo(dep?.label || "")}
                />
              </div>
            )}

            {(tipo === "alteracao_salarial" || tipo === "promocao") && (
              <div>
                <Label>Novo Salário/Valor</Label>
                <Input type="number" step="0.01" value={salarioNovo} onChange={(e) => setSalarioNovo(e.target.value)} placeholder="0.00" />
              </div>
            )}

            <div>
              <Label>Motivo</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da movimentação" />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações adicionais" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!pessoaId || !dataEfetivacao || criarMut.isPending}>
              {criarMut.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
