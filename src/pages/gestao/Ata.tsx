import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, FileText, Lock, Printer } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SAUDE_ROTULO, useAta, useAtaCabecalho, type LinhaAta } from "@/hooks/gestao/useReuniao";

/**
 * ATA-E-DERIVADA (20/08/2026): esta tela é SÓ LEITURA. A ata nasce dos itens
 * tocados na reunião (vw_gestao_ata) — não existe campo de texto livre de ata.
 */

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

export default function Ata() {
  const { reuniaoId = null } = useParams();
  const navigate = useNavigate();
  const { data: cabecalho, isLoading: carregandoCabecalho, error: erroCabecalho } = useAtaCabecalho(reuniaoId);
  const { data: linhas, isLoading, error } = useAta(reuniaoId);

  const grupos = useMemo(() => {
    const m = new Map<string, { ordem: number; linhas: LinhaAta[] }>();
    (linhas ?? []).forEach((l) => {
      const chave = l.item_tipo ?? "outros";
      const g = m.get(chave) ?? { ordem: l.ordem_grupo ?? 999, linhas: [] };
      g.linhas.push(l);
      m.set(chave, g);
    });
    return [...m.entries()].sort((a, b) => a[1].ordem - b[1].ordem);
  }, [linhas]);

  async function copiar() {
    const cab = [
      `Ata · ${cabecalho?.sala_nome ?? ""} #${cabecalho?.numero ?? ""}`,
      `Data: ${dataBR(cabecalho?.data)}`,
      `Presentes (${cabecalho?.presentes ?? 0}): ${cabecalho?.lista_presentes || "—"}`,
      `Ausentes (${cabecalho?.ausentes ?? 0}): ${cabecalho?.lista_ausentes || "—"}`,
      "",
    ];
    const corpo = grupos.flatMap(([tipo, g]) => [
      tipo.toUpperCase(),
      ...g.linhas.map((l) =>
        `- ${l.titulo ?? ""}${l.saude ? ` [${SAUDE_ROTULO[l.saude] ?? l.saude}]` : ""}${l.nota ? `: ${l.nota}` : ""}`,
      ),
      "",
    ]);
    try {
      await navigator.clipboard.writeText([...cab, ...corpo].join("\n"));
      toast.success("Ata copiada");
    } catch (e) {
      toast.error(`Não foi possível copiar: ${(e as Error).message}`);
    }
  }

  if (!reuniaoId) return null;

  return (
    <PageShell>
      <PageTitle
        titulo="Ata da reunião"
        icone={FileText}
        estado="A ata é derivada dos itens tocados na reunião. Nada aqui é editável."
        acoes={
          <>
            {cabecalho?.sala_id && (
              <Button variant="ghost" onClick={() => navigate(`/gestao/sala/${cabecalho.sala_id}`)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Sala
              </Button>
            )}
            <Button variant="outline" onClick={copiar}>
              <Copy className="mr-1 h-4 w-4" /> Copiar ata
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" /> Imprimir
            </Button>
          </>
        }
      />

      {erroCabecalho || error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar a ata: {((erroCabecalho ?? error) as Error).message}
        </p>
      ) : carregandoCabecalho || isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando ata…</p>
      ) : !cabecalho ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Reunião não encontrada — ou você não tem leitura nesta sala.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-1 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-medium">
                  {cabecalho.sala_nome} #{cabecalho.numero}
                </p>
                <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                  {cabecalho.status === "fechada" ? "Fechada" : "Aberta"}
                </Badge>
                {cabecalho.confidencial && (
                  <Badge variant="destructive" className="rounded px-1.5 py-0 text-[10px]">
                    <Lock className="mr-1 h-3 w-3" /> CONFIDENCIAL
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {cabecalho.sala_codigo} · {dataBR(cabecalho.data)} · fechada em{" "}
                {dataBR(cabecalho.fechada_em)} · {cabecalho.total_itens ?? 0} item(ns) · reunião
                anterior {dataBR(cabecalho.reuniao_anterior_data)}
              </p>
              <p className="text-xs text-muted-foreground">
                Presentes ({cabecalho.presentes ?? 0}): {cabecalho.lista_presentes || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Ausentes ({cabecalho.ausentes ?? 0}): {cabecalho.lista_ausentes || "—"}
              </p>
            </CardContent>
          </Card>

          {grupos.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Esta reunião não teve item tocado — não há ata para derivar.
              </CardContent>
            </Card>
          ) : (
            grupos.map(([tipo, g]) => (
              <div key={tipo} className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{tipo}</p>
                {g.linhas.map((l) => (
                  <Card key={l.item_id ?? `${tipo}-${l.ordem}`}>
                    <CardContent className="space-y-1 p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-medium">{l.titulo}</p>
                        {l.saude && (
                          <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                            {SAUDE_ROTULO[l.saude] ?? l.saude}
                          </Badge>
                        )}
                        {l.marcador && (
                          <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
                            {l.marcador}
                          </Badge>
                        )}
                      </div>
                      {l.complemento && (
                        <p className="text-xs text-muted-foreground">{l.complemento}</p>
                      )}
                      {l.nota && <p className="text-sm">{l.nota}</p>}
                      {l.responsavel && (
                        <p className="text-[11px] text-muted-foreground">
                          Responsável: {l.responsavel}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))
          )}
        </>
      )}
    </PageShell>
  );
}
