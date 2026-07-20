import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useTabelaAtiva,
  useZonasTabela,
  useCepsTabela,
  type ZonaTarifa,
} from "@/hooks/logistica/useConteudoTabela";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtBRL(v: unknown): string {
  const n = Number(v ?? 0);
  if (isNaN(n)) return "—";
  return BRL.format(n);
}

function fmtPct(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
}

function fmtCep(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const s = String(n).padStart(8, "0");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v + (v.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

interface Props {
  transportadoraId: string;
}

export function ConteudoTabelaPreco({ transportadoraId }: Props) {
  const { data: ativa, isLoading: loadingAtiva } = useTabelaAtiva(transportadoraId);
  const tabelaId = ativa?.id ?? null;

  const { data: zonas = [], isLoading: loadingZonas } = useZonasTabela(tabelaId);

  if (loadingAtiva) {
    return (
      <div className="rounded-lg border bg-card p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando tabela ativa…
      </div>
    );
  }

  if (!ativa) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Nenhuma tabela ativa para esta transportadora.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FichaTabela ativa={ativa} totalZonas={zonas.length} tabelaId={tabelaId!} />

      <Tabs defaultValue="zonas" className="w-full">
        <TabsList>
          <TabsTrigger value="zonas">Zonas &amp; Preços</TabsTrigger>
          <TabsTrigger value="ceps">Cobertura de CEP</TabsTrigger>
        </TabsList>
        <TabsContent value="zonas" className="mt-4">
          <ZonasSection zonas={zonas} loading={loadingZonas} />
        </TabsContent>
        <TabsContent value="ceps" className="mt-4">
          <CepsSection tabelaId={tabelaId!} zonas={zonas} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FichaTabela({
  ativa,
  totalZonas,
  tabelaId,
}: {
  ativa: NonNullable<ReturnType<typeof useTabelaAtiva>["data"]>;
  totalZonas: number;
  tabelaId: string;
}) {
  const { data: ceps } = useCepsTabela(tabelaId, { page: 0, pageSize: 1 });
  const totalCeps = ceps?.total ?? 0;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{ativa.nome}</div>
          <div className="text-xs text-muted-foreground">
            {ativa.modal ? `Modal: ${ativa.modal}` : "Modal: —"} · Vigência{" "}
            {fmtDate(ativa.vigencia_inicio)}
            {ativa.vigencia_descricao ? ` · ${ativa.vigencia_descricao}` : ""}
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{totalZonas} zonas</Badge>
          <Badge variant="secondary">{totalCeps.toLocaleString("pt-BR")} CEPs</Badge>
          <Badge>Ativa</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
        <FichaCell label="GRIS" value={fmtPct(ativa.gris_pct)} />
        <FichaCell label="GRIS base" value={fmtBRL(ativa.gris_base)} />
        <FichaCell label="GRIS mín" value={fmtBRL(ativa.gris_minimo)} />
        <FichaCell label="ADM" value={fmtPct(ativa.adm_pct)} />
        <FichaCell label="Pedágio /100kg" value={fmtBRL(ativa.pedagio_por_100kg)} />
        <FichaCell label="SUFRAMA" value={fmtBRL(ativa.suframa)} />
        <FichaCell label="TAS" value={fmtBRL(ativa.tas)} />
      </div>
    </div>
  );
}

function FichaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tabular-nums font-medium">{value}</div>
    </div>
  );
}

function ZonasSection({ zonas, loading }: { zonas: ZonaTarifa[]; loading: boolean }) {
  const [uf, setUf] = useState<string>("__all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const ufs = useMemo(() => {
    const set = new Set(zonas.map((z) => z.uf).filter(Boolean));
    return Array.from(set).sort();
  }, [zonas]);

  const filtered = useMemo(
    () => (uf === "__all" ? zonas : zonas.filter((z) => z.uf === uf)),
    [zonas, uf]
  );

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando zonas…
      </div>
    );
  }

  if (zonas.length === 0) {
    return <div className="text-sm text-muted-foreground">Nenhuma zona cadastrada.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={uf} onValueChange={setUf}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas UFs</SelectItem>
            {ufs.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">
          {filtered.length} de {zonas.length} zonas
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zona</TableHead>
              <TableHead>UF</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="text-right">Até 10</TableHead>
              <TableHead className="text-right">Até 20</TableHead>
              <TableHead className="text-right">Até 35</TableHead>
              <TableHead className="text-right">Até 50</TableHead>
              <TableHead className="text-right">Até 70</TableHead>
              <TableHead className="text-right">FPK (kg add.)</TableHead>
              <TableHead className="text-right">Peso mín</TableHead>
              <TableHead className="text-right">FV%</TableHead>
              <TableHead className="text-right">TXA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((z) => {
              const fx = z.modelo_peso === "faixas_fixas";
              const p = z.pesos ?? {};
              const isExp = !!expanded[z.id];
              return (
                <>
                  <TableRow key={z.id}>
                    <TableCell className="font-medium">{z.tarifa_code}</TableCell>
                    <TableCell>{z.uf}</TableCell>
                    <TableCell>
                      {fx ? (
                        <Badge variant="secondary">Faixas fixas</Badge>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1"
                          onClick={() => setExpanded((s) => ({ ...s, [z.id]: !s[z.id] }))}
                        >
                          <Badge variant="outline">Por kg</Badge>
                          <span className="text-xs text-muted-foreground underline">
                            {isExp ? "recolher" : "ver faixas"}
                          </span>
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fx ? fmtBRL(p.ate_10) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fx ? fmtBRL(p.ate_20) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fx ? fmtBRL(p.ate_35) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fx ? fmtBRL(p.ate_50) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fx ? fmtBRL(p.ate_70) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(z.kg_adicional)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {z.peso_minimo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPct(z.fv_pct)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(z.txa)}</TableCell>
                  </TableRow>
                  {!fx && isExp && (
                    <TableRow key={z.id + "-exp"} className="bg-muted/40">
                      <TableCell colSpan={12}>
                        <div className="grid grid-cols-6 md:grid-cols-10 gap-2 text-xs p-2">
                          {Array.from({ length: 30 }, (_, i) => i + 1).map((k) => (
                            <div key={k} className="rounded border bg-background p-1">
                              <div className="text-[10px] text-muted-foreground">{k} kg</div>
                              <div className="tabular-nums">{fmtBRL(p[String(k)])}</div>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CepsSection({ tabelaId, zonas }: { tabelaId: string; zonas: ZonaTarifa[] }) {
  const [uf, setUf] = useState<string>("__all");
  const [tarifa, setTarifa] = useState<string>("__all");
  const [busca, setBusca] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data, isFetching } = useCepsTabela(tabelaId, {
    uf: uf === "__all" ? null : uf,
    tarifaCode: tarifa === "__all" ? null : tarifa,
    busca: busca || null,
    page,
    pageSize,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const ufs = useMemo(() => {
    const set = new Set(zonas.map((z) => z.uf).filter(Boolean));
    return Array.from(set).sort();
  }, [zonas]);

  const tarifas = useMemo(() => {
    const set = new Set(
      zonas
        .filter((z) => uf === "__all" || z.uf === uf)
        .map((z) => z.tarifa_code)
        .filter(Boolean)
    );
    return Array.from(set).sort();
  }, [zonas, uf]);

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  if (total === 0 && !isFetching && !busca && uf === "__all" && tarifa === "__all") {
    return (
      <div className="rounded-lg border p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-medium text-amber-900 dark:text-amber-200">
            Sem cobertura de CEP cadastrada
          </div>
          <div className="text-amber-800 dark:text-amber-300">
            Cotação indisponível até importar as faixas de CEP para esta tabela.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={uf} onValueChange={resetPage(setUf)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas UFs</SelectItem>
            {ufs.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tarifa} onValueChange={resetPage(setTarifa)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Zona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas zonas</SelectItem>
            {tarifas.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar CEP"
          className="w-40"
        />
        <div className="text-xs text-muted-foreground ml-auto">
          {isFetching ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> carregando…
            </span>
          ) : (
            <>{total.toLocaleString("pt-BR")} faixa(s)</>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zona</TableHead>
              <TableHead>UF</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>CEP inicial</TableHead>
              <TableHead>CEP final</TableHead>
              <TableHead className="text-right">Prazo (d)</TableHead>
              <TableHead className="text-right">TDA/Risco</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isFetching && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                  Nenhuma faixa encontrada com esses filtros.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.tarifa_code}</TableCell>
                <TableCell>{r.uf}</TableCell>
                <TableCell>{r.cidade ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{fmtCep(r.cep_inicial)}</TableCell>
                <TableCell className="tabular-nums">{fmtCep(r.cep_final)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.prazo ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.tda_risco !== null && r.tda_risco !== undefined ? fmtBRL(r.tda_risco) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          Página {page + 1} de {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || isFetching}
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
            disabled={page + 1 >= totalPages || isFetching}
          >
            Próxima <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
