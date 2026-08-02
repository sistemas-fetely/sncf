/**
 * Blocos do dossiê do pedido (vw_dossie_pedido).
 * Cada bloco decide sozinho se tem conteúdo — valor ausente no jsonb chega
 * como `null`, então a checagem é explícita contra null.
 * Somente leitura: nenhum botão de resolver/conciliar aqui (a Auditoria
 * DETECTA e ROTEIA; quem resolve é a tela especializada).
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import type {
  DossieCaixa, DossieFamilia, DossieFiscal, DossieItens, DossieTerminais, DossieTitulos,
} from "@/hooks/useDossiePedido";

export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {titulo}
      </div>
      {children}
    </div>
  );
}

const Linha = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border bg-background px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
    {children}
  </div>
);

const Rot = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <span className="text-muted-foreground">
    {k}: <span className="text-foreground tabular-nums">{v}</span>
  </span>
);

/* ---------------- Família ---------------- */
export function BlocoFamilia({ familia }: { familia: DossieFamilia }) {
  if (!familia) return null;
  const temFilhos = (familia.qtd_filhos ?? 0) > 0;
  if (!temFilhos && familia.eh_filho !== true) return null;

  return (
    <Secao titulo="Família">
      {familia.pai && (
        <Linha>
          <Badge variant="outline">Pai</Badge>
          <span className="font-medium">{familia.pai.ref || "—"}</span>
          <Rot k="estágio" v={familia.pai.estagio || "—"} />
          <Rot k="valor" v={formatBRL(Number(familia.pai.valor || 0))} />
          <Rot k="NFs venda" v={familia.pai.nfs_venda ?? 0} />
          {familia.vinculo_pai && <Rot k="vínculo" v={familia.vinculo_pai} />}
        </Linha>
      )}
      {(familia.filhos ?? []).map((f, i) => (
        <Linha key={f.pedido_id ?? `${f.ref}-${i}`}>
          <Badge variant="secondary">Filho</Badge>
          <span className={cn("font-medium", f.ativo === false && "line-through text-muted-foreground")}>
            {f.ref || "—"}
          </span>
          {f.ativo === false && <Badge variant="outline" className="border-destructive/50 text-destructive">Inativo</Badge>}
          <Rot k="estágio" v={f.estagio || "—"} />
          <Rot k="valor" v={formatBRL(Number(f.valor || 0))} />
          <Rot k="itens" v={f.qtd_itens ?? 0} />
          <Rot k="NFs venda" v={f.nfs_venda ?? 0} />
          {f.vinculo && <Rot k="vínculo" v={f.vinculo} />}
        </Linha>
      ))}
    </Secao>
  );
}

/* ---------------- Itens ---------------- */
const COBERTURA_LABEL: Record<string, string> = {
  coberto: "Coberto",
  sem_nf_venda: "Sem NF de venda",
  divergente_aberto: "Divergente em aberto",
  divergente_compensado: "Divergente compensado",
  sem_dado: "Sem dado",
};

export function BlocoItens({ itens }: { itens: DossieItens }) {
  if (!itens) return null;
  const div = itens.divergencias;

  return (
    <Secao titulo="Itens">
      <Linha>
        <Badge
          variant="outline"
          className={cn(
            itens.cobertura === "coberto" && "border-success/50 text-success",
            itens.cobertura?.startsWith("divergente") && "border-warning/50 text-warning",
            itens.cobertura === "sem_nf_venda" && "border-destructive/50 text-destructive"
          )}
        >
          {(itens.cobertura && COBERTURA_LABEL[itens.cobertura]) || itens.cobertura || "—"}
        </Badge>
        <Rot k="qtd pedido" v={itens.qtd_pedido ?? "—"} />
        <Rot k="qtd NF venda" v={itens.qtd_nf_venda ?? "—"} />
        {itens.diferenca_total != null && <Rot k="diferença" v={itens.diferenca_total} />}
      </Linha>

      {div && div.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">SKU</th>
                <th className="text-left px-3 py-1.5 font-medium">Descrição</th>
                <th className="text-right px-3 py-1.5 font-medium">Qtd pedido</th>
                <th className="text-right px-3 py-1.5 font-medium">Qtd NF</th>
                <th className="text-right px-3 py-1.5 font-medium">Diferença</th>
                <th className="text-left px-3 py-1.5 font-medium">Natureza</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {div.map((d, i) => (
                <tr key={`${d.sku ?? "sku"}-${i}`}>
                  <td className="px-3 py-1.5 tabular-nums">{d.sku || "—"}</td>
                  <td className="px-3 py-1.5">{d.descricao || "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.qtd_pedido ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.qtd_nf ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.diferenca ?? "—"}</td>
                  <td className="px-3 py-1.5">{d.natureza || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}

/* ---------------- Fiscal ---------------- */
export function BlocoFiscal({ fiscal }: { fiscal: DossieFiscal }) {
  const notas = fiscal?.notas;
  if (!notas || notas.length === 0) return null;

  return (
    <Secao titulo="Fiscal">
      {notas.map((n, i) => (
        <Linha key={n.nf_id ?? `${n.numero}-${i}`}>
          <span className="font-medium tabular-nums">NF {n.numero || "—"}</span>
          {n.eh_venda === false ? (
            <Badge variant="outline" className="border-warning/50 text-warning">
              Remessa — não é venda
            </Badge>
          ) : (
            <Badge variant="outline" className="border-success/50 text-success">Venda</Badge>
          )}
          <Rot k="situação" v={n.situacao || "—"} />
          <Rot k="emissão" v={formatDateBR(n.data_emissao)} />
          <Rot k="valor" v={formatBRL(Number(n.valor || 0))} />
          {n.cfops && <Rot k="CFOPs" v={n.cfops} />}
        </Linha>
      ))}
    </Secao>
  );
}

/* ---------------- Títulos ---------------- */
export function BlocoTitulos({ titulos }: { titulos: DossieTitulos }) {
  const lista = titulos?.lista;
  if (!lista || lista.length === 0) return null;

  return (
    <Secao titulo="Títulos">
      {lista.map((t, i) => (
        <Linha key={t.titulo_id ?? `${t.numero}-${i}`}>
          <span className="font-medium tabular-nums">{t.parcela || "—"}</span>
          <Rot k="forma" v={t.forma || "—"} />
          <Rot k="banco" v={t.banco || "—"} />
          <Badge variant="outline">Prova: {t.eixo_prova || "—"}</Badge>
          <Badge variant="outline">Status: {t.eixo_status || "—"}</Badge>
          <Rot k="valor" v={formatBRL(Number(t.valor_bruto ?? t.valor_efetivo ?? 0))} />
          <Rot k="vencimento" v={formatDateBR(t.vencimento)} />
          <Rot k="pago em" v={t.data_pagamento ? formatDateBR(t.data_pagamento.slice(0, 10)) : "—"} />
        </Linha>
      ))}
    </Secao>
  );
}

/* ---------------- Caixa ---------------- */
function comoLista(v: unknown): Record<string, unknown>[] {
  if (v == null) return [];
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [v as Record<string, unknown>];
}

export function BlocoCaixa({ caixa }: { caixa: DossieCaixa }) {
  if (!caixa) return null;
  const movs = comoLista(caixa.movimentacoes);
  const gerado = comoLista(caixa.haver_gerado);
  const aplicado = comoLista(caixa.haver_aplicado);
  if (movs.length === 0 && gerado.length === 0 && aplicado.length === 0) return null;

  const render = (rotulo: string, arr: Record<string, unknown>[]) =>
    arr.map((m, i) => (
      <Linha key={`${rotulo}-${i}`}>
        <Badge variant="secondary">{rotulo}</Badge>
        {Object.entries(m)
          .filter(([, v]) => v != null)
          .map(([k, v]) => (
            <Rot key={k} k={k.replace(/_/g, " ")} v={String(v)} />
          ))}
      </Linha>
    ));

  return (
    <Secao titulo="Caixa">
      {render("Movimentação", movs)}
      {render("Haver gerado", gerado)}
      {render("Haver aplicado", aplicado)}
    </Secao>
  );
}

/* ---------------- Terminais ---------------- */
export function BlocoTerminais({ terminais }: { terminais: DossieTerminais }) {
  if (!terminais) return null;
  const tits = comoLista(terminais.titulos_terminais);
  const cancelado = terminais.pedido_cancelado_em;
  if (tits.length === 0 && cancelado == null) return null;

  return (
    <Secao titulo="Terminais">
      {cancelado != null && (
        <Linha>
          <Badge variant="outline" className="border-destructive/50 text-destructive">
            Pedido cancelado
          </Badge>
          <Rot k="em" v={formatDateBR(String(cancelado).slice(0, 10))} />
          {terminais.pedido_cancelado_motivo && (
            <Rot k="motivo" v={terminais.pedido_cancelado_motivo} />
          )}
          {terminais.furo_cancelado_pos_nf === true && (
            <Badge variant="outline" className="border-destructive/50 text-destructive">
              Cancelado depois da NF
            </Badge>
          )}
        </Linha>
      )}
      {tits.map((t, i) => (
        <Linha key={`term-${i}`}>
          <Badge variant="secondary">Título terminal</Badge>
          {Object.entries(t)
            .filter(([, v]) => v != null)
            .map(([k, v]) => (
              <Rot key={k} k={k.replace(/_/g, " ")} v={String(v)} />
            ))}
        </Linha>
      ))}
    </Secao>
  );
}
