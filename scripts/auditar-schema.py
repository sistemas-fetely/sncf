#!/usr/bin/env python3
"""Audita a divergência entre o código, as migrations e o schema do banco.

Por que existe
--------------
Boa parte da lógica de negócio do SNCF vive em funções do Postgres chamadas por
`supabase.rpc(...)`. Essas chamadas passam por `(supabase as any)`, então o
TypeScript não valida nada: se a função não existir no banco, o erro só aparece
quando o usuário clica. E como muitas funções foram criadas direto no banco, sem
migration, mudanças nelas não aparecem em diff nem em code review.

Este script cruza três fontes e aponta onde elas discordam:

  1. `src/**` .................. o que o frontend chama
  2. `src/integrations/supabase/types.ts` ... espelho do banco (gerado)
  3. `supabase/migrations/*.sql` ........... o que está versionado

Uso
---
    python3 scripts/auditar-schema.py            # relatório completo
    python3 scripts/auditar-schema.py --curto    # só os riscos, sem listões

Sai com código 1 se encontrar chamada a RPC/tabela ausente do banco — serve para
travar CI.

Limites que você precisa conhecer antes de confiar
--------------------------------------------------
`types.ts` NÃO é uma lista completa do banco. Já se sabe disso no código: veja o
comentário em `src/hooks/useReembolso.ts`, que documenta o padrão
`supabase.from("x" as never)` justamente porque "várias tabelas/RPCs ainda não
constam no types.ts gerado". Prova concreta: `has_permission` é usada em políticas
RLS (logo existe no banco) e não está em `types.ts`.

Consequência: **ausência de `types.ts` é indício, não prova.** Os riscos 1, 2 e 3
são candidatos a investigar, não veredictos. O risco 4 é o único que não depende
disso — compara migrations contra funções que comprovadamente existem.

Para obter a lista real do que o banco expõe:

    curl -s -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
         "$VITE_SUPABASE_URL/rest/v1/" > schema.json

O JSON traz um caminho `/rpc/<funcao>` por função exposta e `/<tabela>` por
tabela. Passe esse arquivo em `--openapi schema.json` e o script usa ele como
fonte da verdade no lugar do `types.ts`.
"""

import argparse
import collections
import glob
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TYPES = os.path.join(RAIZ, "src/integrations/supabase/types.ts")


def ler_types():
    """Funções e tabelas/views declaradas em types.ts."""
    linhas = open(TYPES, encoding="utf-8").read().splitlines()

    def chaves(nome_bloco):
        achados = set()
        for i, linha in enumerate(linhas):
            m = re.match(r"^(\s*)" + nome_bloco + r": \{\s*$", linha)
            if not m:
                continue
            indent = len(m.group(1))
            # Funções com sobrecarga vêm como `nome:` e o tipo (`| {...}`) na
            # linha seguinte, então o `:` pode terminar a linha.
            chave = re.compile(r"^ {%d}([A-Za-z_][A-Za-z0-9_]*)\??:(?: |$)" % (indent + 2))
            irmao = re.compile(r"^ {%d}[A-Za-z_]" % indent)
            for j in range(i + 1, len(linhas)):
                if irmao.match(linhas[j]):
                    break
                k = chave.match(linhas[j])
                if k:
                    achados.add(k.group(1))
        return achados

    return chaves("Functions"), chaves("Tables") | chaves("Views")


def ler_openapi(caminho):
    """Funções e tabelas realmente expostas, a partir do OpenAPI do PostgREST."""
    paths = json.load(open(caminho, encoding="utf-8")).get("paths", {})
    fns = {p[len("/rpc/"):] for p in paths if p.startswith("/rpc/")}
    tabs = {p.lstrip("/") for p in paths if not p.startswith("/rpc/") and p != "/"}
    return fns, tabs


def ler_frontend():
    """O que o código chama, com arquivo e linha de cada ocorrência."""
    rpc = collections.defaultdict(list)
    tab = collections.defaultdict(list)
    for caminho in glob.glob(os.path.join(RAIZ, "src/**/*.ts*"), recursive=True):
        if caminho.endswith("types.ts"):
            continue
        rel = os.path.relpath(caminho, RAIZ)
        linhas = open(caminho, encoding="utf-8").read().splitlines()
        for n, linha in enumerate(linhas, 1):
            for m in re.finditer(r"""\.rpc\(\s*["']([a-zA-Z0-9_]+)["']""", linha):
                rpc[m.group(1)].append("%s:%d" % (rel, n))
            # `.storage.from("bucket")` é bucket, não tabela — e o `.storage`
            # costuma cair na linha anterior por quebra do prettier.
            if ".storage" in " ".join(linhas[max(0, n - 3):n]):
                continue
            for m in re.finditer(r"""\.from\(\s*["']([a-zA-Z0-9_]+)["']""", linha):
                tab[m.group(1)].append("%s:%d" % (rel, n))
    # `from("x" as never)` é o idioma usado quando a tabela não está em types.ts:
    # não é tabela de verdade, é placeholder para o TypeScript.
    tab.pop("x", None)
    return rpc, tab


def ler_migrations():
    """Funções criadas nas migrations, separando as de trigger."""
    criadas = collections.defaultdict(list)
    derrubadas, gatilhos = set(), set()
    for caminho in sorted(glob.glob(os.path.join(RAIZ, "supabase/migrations/*.sql"))):
        rel = os.path.basename(caminho)
        txt = open(caminho, encoding="utf-8", errors="replace").read()
        padrao = (r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"
                  r"([a-zA-Z0-9_]+)\s*\((.{0,4000}?)RETURNS\s+(\w+)")
        for m in re.finditer(padrao, txt, re.I | re.S):
            criadas[m.group(1)].append(rel)
            # PostgREST não expõe funções de trigger, então a ausência delas em
            # types.ts ou no OpenAPI não significa nada.
            if m.group(3).lower() == "trigger":
                gatilhos.add(m.group(1))
        for m in re.finditer(r"DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)",
                             txt, re.I):
            derrubadas.add(m.group(1))
    return criadas, derrubadas, gatilhos


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--openapi", metavar="schema.json",
                    help="OpenAPI do PostgREST; usa ele em vez de types.ts (mais confiável)")
    ap.add_argument("--curto", action="store_true", help="omite os listões")
    args = ap.parse_args()

    if args.openapi:
        banco_fn, banco_tab = ler_openapi(args.openapi)
        fonte = "OpenAPI do PostgREST (%s)" % args.openapi
        confiavel = True
    else:
        banco_fn, banco_tab = ler_types()
        fonte = "types.ts (INCOMPLETO — veja o cabeçalho deste arquivo)"
        confiavel = False

    rpc, tab = ler_frontend()
    criadas, derrubadas, gatilhos = ler_migrations()

    def secao(t):
        print("\n" + "=" * 78 + "\n" + t + "\n" + "=" * 78)

    secao("INVENTÁRIO")
    print("  fonte do schema ........................ %s" % fonte)
    print("  funções no banco ....................... %d" % len(banco_fn))
    print("  tabelas/views no banco ................. %d" % len(banco_tab))
    print("  RPCs distintas chamadas pelo frontend .. %d" % len(rpc))
    print("  tabelas/views usadas pelo frontend ..... %d" % len(tab))
    print("  funções criadas nas migrations ......... %d" % len(criadas))

    achou_quebrado = False

    secao("RISCO 1 — RPC chamada pelo frontend e ausente do banco (quebra em runtime)")
    if not confiavel:
        print("  [indício, não prova: types.ts é incompleto]")
    quebradas = sorted(set(rpc) - banco_fn)
    achou_quebrado |= bool(quebradas)
    print("  nenhuma" if not quebradas else "")
    for f in quebradas:
        origem = "em migration" if f in criadas else "sem migration no repo"
        print("\n  %s  [%s]" % (f, origem))
        for loc in rpc[f][:6]:
            print("      " + loc)

    secao("RISCO 2 — tabela/view usada pelo frontend e ausente do banco")
    if not confiavel:
        print("  [mesmo caveat]")
    tq = sorted(set(tab) - banco_tab)
    achou_quebrado |= bool(tq)
    print("  nenhuma" if not tq else "")
    for t in tq:
        print("\n  %s" % t)
        for loc in tab[t][:6]:
            print("      " + loc)

    secao("RISCO 3 — função chamável criada em migration e ausente do banco")
    print("  (funções de trigger excluídas: PostgREST não as expõe)")
    orfas = sorted(f for f in criadas
                   if f not in banco_fn and f not in derrubadas and f not in gatilhos)
    print("\n  total: %d  (de %d criadas; %d são de trigger)"
          % (len(orfas), len(criadas), len(gatilhos)))
    if not args.curto:
        for f in orfas:
            marca = "  <-- CHAMADA PELO FRONTEND" if f in rpc else ""
            print("    %s  (%s)%s" % (f, criadas[f][-1], marca))

    secao("RISCO 4 — função no banco sem nenhuma migration (não versionada)")
    print("  Não depende de types.ts: compara migrations com funções que existem.")
    nv = sorted(f for f in banco_fn if f not in criadas)
    nv_chamadas = [f for f in nv if f in rpc]
    pct = (100.0 * len(nv_chamadas) / len(rpc)) if rpc else 0
    print("\n  sem migration: %d de %d funções do banco" % (len(nv), len(banco_fn)))
    print("  destas, chamadas pelo frontend: %d de %d RPCs usadas (%.0f%%)"
          % (len(nv_chamadas), len(rpc), pct))
    print("\n  Mudança nessas funções não aparece em diff nem em code review.")
    if not args.curto:
        for f in nv_chamadas:
            print("    %s  (%s)" % (f, rpc[f][0]))

    return 1 if achou_quebrado else 0


if __name__ == "__main__":
    sys.exit(main())
