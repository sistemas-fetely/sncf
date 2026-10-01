# Sistema Visual Fetély

> Regras de interface do SNCF. Leia antes de criar ou alterar qualquer tela.
> Versão navegável, com previews: https://claude.ai/artifact/XA1XqGyNzYYaMo8wS5nbEm
> (o link é para pessoas; ferramentas leem este arquivo)

**Fonte da verdade dos valores é `src/index.css`.** Este documento explica o porquê e as
regras de uso. Se algum valor aqui divergir do CSS, o CSS manda e este arquivo é que está
errado — corrija-o.

O sistema visual da Fetély — marca brasileira de celebração e lifestyle, artigos para festa
e mesa. A tese criativa é 70% dopamina / 30% luxo, e o filtro que decide qualquer escolha,
de produto a tela, é uma pergunta só: **isso tornaria um momento mais especial?** Na
interface isso não vira enfeite: vira densidade honesta, número que se compara sem esforço
e estado que se lê de longe.

A paleta é cream, ouro mostarda e marrom escuro. O tema escuro é preto profundo com ouro
brilhante. Verde existe **apenas** como semântica de sucesso — nunca como `primary`,
`background` ou fundo de barra lateral.

---

## Fundamentos de conteúdo

- **Português do Brasil**, segunda pessoa, imperativo curto: "Lance a despesa", não "A
  despesa pode ser lançada". Nomes de componente e de prop também em português (`rotulo`,
  `valor`, `estado`, `acao`) — é assim no código.
- **Frase capitalizada, não Título Com Iniciais Maiúsculas.** Caixa alta só em `grupo-menu`
  e `micro`.
- **Nada de emoji na interface.** Ornamento é ouro e tipografia.
- **Vazio é convite, não lamento.** Nunca "Nenhum registro encontrado": diga o próximo
  gesto — "Importe a primeira nota fiscal para começar" — e ponha o botão que faz isso.
- **Estado atual, não descrição de módulo.** A linha sob o título de tela diz "Braspress ·
  sincronizado há 12 minutos", não "Módulo de logística".
- **Dinheiro sempre em BRL formatado** (`Intl.NumberFormat("pt-BR")`), com `—` quando o
  valor não existe. Ausência é travessão, nunca zero.

## Cor

`background` é a página, `card` é a superfície elevada; texto sempre em `foreground` ou
`muted-foreground`. Cor semântica só entra quando comunica estado — um KPI nasce neutro e
só ganha cor quando o número exige ação. `primary` é o ouro de ação: preenche botão
primário e o anel de foco. `gold`, `gold-light` e `gold-muted` são ornamento de marca
(ícone de cabeçalho, borda dourada, barra de rolagem) e nunca carregam informação sozinhos.

### A regra que mais se erra: base é preenchimento, `-strong` é texto

Cada cor semântica tem dois tokens:

| papel | tokens |
| --- | --- |
| **preenchimento** (com o `-foreground` em cima) | `success` `warning` `destructive` `info` |
| **texto** sobre tint (`bg-x/10` a `bg-x/15`) e sobre `card` | `success-strong` `warning-strong` `destructive-strong` `info-strong` |

Nunca use a cor base como texto sobre o tint dela mesma: é exatamente aí que ela rendia
entre 2.6:1 e 4.1:1 antes da revisão de 18/09/2026. No tema escuro as quatro cores de
status são claras, então o `-foreground` das quatro é tinta preta.

### Contraste

Todos os pares de texto passam 4.5:1 nos dois temas, e o marcador da barra lateral passa
3:1. Duas exceções conhecidas e aceitas: `sidebar-muted` no tema claro (3.31:1, usado em
rótulo de grupo e sub-item) e `gold` como texto (1.82:1 — é ornamento e nunca carrega
informação). Ao criar cor nova, meça antes.

## Tipografia

Duas famílias. `display` (Cormorant Garamond) **só** no título de tela e no nome da marca —
é onde mora o 30% de luxo. Todo o resto é `sans` (DM Sans), em **dois pesos apenas: 400 e
500**; 600 existe só em `grupo-menu`, `micro` e no item de menu ativo.

| estilo | tamanho / peso | onde |
| --- | --- | --- |
| `titulo-tela` | 27px / 400, display | único `h1`, no `PageHeader` |
| `titulo-marca` | 32px / 500, display | login, boas-vindas |
| `numero-kpi` | 24px / 400, tabular | valor de `CardIndicador` |
| `numero-heroi` | 21px / 400, tabular | número principal de uma aba |
| `titulo-secao` | 15px / 500 | `CardTitle`, títulos de seção |
| `corpo` | 14px / 400 | texto corrente, célula de tabela, botão (peso 500) |
| `item-menu` | 13.5px / 450 | item de primeiro nível da sidebar |
| `miudo` | 12px / 400 | linha de estado, texto secundário, sub-item |
| `rotulo` | 11px / 400 | rótulo de KPI, texto de `Selo`, contagem de rodapé |
| `nota` | 10px / 400 | nota sob um valor, legenda densa |
| `grupo-menu` | 10px / 600, caixa alta | rótulo de grupo da sidebar |
| `micro` | 9px / 600, caixa alta | selo "Novo", marcadores de canto |

A escala desce rápido porque as telas são densas. Não invente tamanhos entre os degraus.

**Número é tipografia.** Todo número que se compara coluna a coluna leva
`font-variant-numeric: tabular-nums` e alinha à direita. Dinheiro alinha à direita, sempre.

## Espaço, borda, raio, foco, movimento

- **Espaço** — `space-2` (8px) entre controles, `space-4` (16px) entre seções, `space-6`
  (24px) de padding de página e de Card. Página não escreve `padding` nem `max-width`
  própria: quem resolve é o `PageShell`.
- **Borda, não sombra.** A hierarquia vem de `border` e de superfície. A única sombra de
  elevação é `sombra-card`, de 2px. Borda é decorativa (1.3:1): nunca deixe um estado
  depender só dela.
- **Raio** — `radius-md` (4px) em botão, campo e item de menu; `radius-lg` (6px) em Card e
  diálogo; `radius-full` em `Selo` e `Badge`. Estado é sempre pílula.
- **Foco** — `ring` de 2px com 2px de offset, em todo controle focalizável. Nunca remova o
  `focus-visible` sem pôr outra marca no lugar.
- **Movimento** — transições de 150–200ms em cor e fundo, `fade-in` de 300ms na entrada de
  bloco. Nada gira, nada pulsa, exceto o esqueleto de carregamento.

## As regras numeradas

Cada uma está citada na docstring do componente que a implementa.

- **§3 — Número é indicador, não parágrafo.** KPI vai em `CardIndicador`, nasce no tom
  `neutro`, valor tabular. Cor só quando o número exige ação.
- **§4 — Estado nunca é texto colorido solto: é `Selo`.** Uma única coluna de estado por
  tabela. Dado cadastral (CIF/FOB, UF, canal) não é estado — vai como texto miúdo em
  `muted-foreground`, sem selo. Selo não é clicável; se precisa clicar, é botão.
- **§5 e §8 — Dinheiro alinha à direita** com numeral tabular, via `CelulaDinheiro`. E a
  linha de estado do cabeçalho diz estado atual, não descrição de módulo.
- **§6 — A ação primária vai por último**, mais à direita, dentro de `acoes` do
  `PageHeader`. Uma única ação primária por tela.
- **§7 — A largura nasce do conteúdo**, via `PageShell`: `dados` (cheia) para tabelas e
  dashboards, `leitura` (896px) para formulários, `foco` (672px) para decisão única.
- **§10 — Vazio é convite**, via `EstadoVazio`. Listagem inteira via `TabelaFetely`, que já
  entrega busca, contagem, esqueleto, vazio, erro e paginação.
- **§14 — Um cabeçalho por tela**, sempre `PageHeader`. Um `h1` só por tela.

## Componentes

Antes de criar um componente novo, verifique se um destes resolve.

| componente | use quando | nunca |
| --- | --- | --- |
| `PageShell` | toda página | escrever `max-w-*` ou `px-*` na própria página; aninhar dois |
| `PageHeader` | topo de toda tela | um segundo `h1`; ação primária à esquerda |
| `Selo` | estado de um registro | como categoria; clicável; um sexto tom |
| `Badge` | categoria, contagem, marca fixa | como estado — isso é `Selo` |
| `CardIndicador` | faixa de 2 a 6 KPIs | pintar de verde um número que só está bom |
| `CelulaDinheiro` | toda coluna de dinheiro | colorir valor por ser negativo |
| `TabelaFetely` | listagem paginada ou filtrável | escrever esqueleto ou "carregando" próprio |
| `Table` | dentro do `TabelaFetely`, ou lista curta em Card | zebrar linhas; colorir a linha por estado |
| `EstadoVazio` | sem registros na origem | usar quando é filtro sem resultado |
| `Alert` | condição que vale para a tela inteira | empilhar três; `destructive` para "atenção" |
| `Button` | ações | mais de uma primária por tela |
| `Input` | campos | placeholder como rótulo; erro só pela borda |
| `Card` | agrupar assunto com começo e fim | Card dentro de Card; borda colorida de enfeite |
| `Sidebar` | navegação | terceiro nível de menu |

## Iconografia

Ícones do **lucide-react**: 16px na barra lateral, 20px (`h-5 w-5`) no cabeçalho de tela e
no `EstadoVazio`. Traço padrão, nunca preenchido. Ícone decorativo leva `aria-hidden="true"`;
ícone com significado precisa de rótulo em texto ao lado — ícone sozinho nunca é o estado.
O ícone do `PageHeader` é o único que usa `gold`.

## Marca

O logotipo é `src/assets/logo_fetely.jpg` — um JPG, sem versão vetorial nem monocromática.
Use sobre `card` ou `background`, nunca sobre cor de marca. Onde não couber, escreva
**Casa Fetély** em `titulo-marca`. Não recorte, não recolora, não redesenhe.
