// Ligar um passo a uma atribuição — e, quando ela não existe, criar sem sair da tela.
// A atribuição pertence à PESSOA, não ao processo: a mesma atribuição pode ser ligada a
// passos de processos diferentes. Por isso BUSCAR vem primeiro; criar é exceção.
import { useState } from "react";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatError } from "@/lib/format-error";
import {
  QUEM_EXECUTA_OPCOES,
  useCriarAtribuicaoParaPasso,
  usePessoasParaAtribuicao,
  useSalvarPasso,
  type QuemExecuta,
} from "@/hooks/processos/useProcessoPassos";
import { SeletorAtribuicaoPasso } from "@/components/processos/SeletorAtribuicaoPasso";

interface Props {
  processoId: string;
  passoId: string;
  passoNome: string;
  passoDescricao?: string | null;
  passoCondicional?: boolean;
  quemExecuta?: QuemExecuta | null;
  onFechar: () => void;
}

export function DialogLigarAtribuicao({
  processoId,
  passoId,
  passoNome,
  passoDescricao,
  passoCondicional = false,
  quemExecuta,
  onFechar,
}: Props) {
  const [modo, setModo] = useState<"buscar" | "criar">("buscar");
  const [atribuicaoId, setAtribuicaoId] = useState<string | null>(null);
  const salvarPasso = useSalvarPasso(processoId);
  const criar = useCriarAtribuicaoParaPasso(processoId);

  // Campos do caminho de exceção (criar), já preenchidos com o passo.
  const [nome, setNome] = useState(passoNome);
  const [descricao, setDescricao] = useState(passoDescricao ?? "");
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [tempo, setTempo] = useState("");
  const [fluxo, setFluxo] = useState("");

  const naoEDoTime = !!quemExecuta && quemExecuta !== "time";
  const rotuloQuem =
    QUEM_EXECUTA_OPCOES.find((o) => o.valor === quemExecuta)?.rotulo ?? quemExecuta;

  const ligarExistente = () => {
    if (!atribuicaoId) {
      toast.error("Escolha a atribuição que executa este passo.");
      return;
    }
    salvarPasso.mutate(
      {
        id: passoId,
        nome: passoNome,
        descricao: passoDescricao ?? null,
        atribuicao_id: atribuicaoId,
        condicional: passoCondicional,
      },
      {
        onSuccess: () => {
          toast.success("Passo ligado à atribuição.");
          onFechar();
        },
        onError: (e) => toast.error("Não ligou", { description: formatError(e) }),
      },
    );
  };

  const criarELigar = () => {
    const tempoNum = Number(tempo.replace(",", "."));
    const fluxoNum = fluxo.trim() === "" ? null : Number(fluxo.replace(",", "."));
    if (!nome.trim()) {
      toast.error("Dê um nome à atribuição.");
      return;
    }
    if (!pessoaId) {
      toast.error("Escolha a pessoa responsável.");
      return;
    }
    if (!Number.isFinite(tempoNum) || tempoNum <= 0) {
      toast.error("Tempo unitário precisa ser maior que zero.");
      return;
    }
    if (fluxoNum != null && (!Number.isFinite(fluxoNum) || fluxoNum < 0)) {
      toast.error("Volume diário inválido.");
      return;
    }
    criar.mutate(
      {
        passoId,
        nome,
        descricao: descricao || null,
        pessoa_id: pessoaId,
        tempo_unitario_min: tempoNum,
        fluxo_diario: fluxoNum,
        processo_id: processoId,
      },
      {
        onSuccess: () => {
          toast.success("Atribuição criada e ligada ao passo.");
          onFechar();
        },
        // FAIL-LOUD: a mensagem da RPC explica o motivo em português.
        onError: (e) => toast.error("Não criou a atribuição", { description: formatError(e) }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ligar passo a uma atribuição</DialogTitle>
          <DialogDescription>
            Passo “{passoNome}”. Escolha quem executa para o custo do processo passar a contar este
            passo.
          </DialogDescription>
        </DialogHeader>

        {naoEDoTime && (
          <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>
              Este passo está marcado como <strong>{rotuloQuem}</strong>: não precisa de atribuição,
              não conta como custo do time nem como divergência. Você pode ligar mesmo assim.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Atribuição existente</Label>
            <SeletorAtribuicaoPasso
              valor={atribuicaoId}
              onChange={(id) => {
                setAtribuicaoId(id);
                if (id) setModo("buscar");
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              A mesma atribuição serve a vários processos: o trabalho é o mesmo, da mesma pessoa.
            </p>
          </div>

          {modo === "buscar" ? (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setModo("criar")}>
              <Plus className="h-3.5 w-3.5" /> Criar atribuição para este passo
            </Button>
          ) : (
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Nova atribuição</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setModo("buscar")}
                >
                  <Search className="h-3.5 w-3.5" /> Voltar a buscar
                </Button>
              </div>

              <div className="space-y-1">
                <Label htmlFor="atr-nome">Nome</Label>
                <Input id="atr-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="atr-desc">Descrição</Label>
                <Textarea
                  id="atr-desc"
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Pessoa responsável</Label>
                <SeletorPessoa valor={pessoaId} onChange={setPessoaId} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="atr-tempo">Tempo unitário (min)</Label>
                  <Input
                    id="atr-tempo"
                    inputMode="decimal"
                    value={tempo}
                    onChange={(e) => setTempo(e.target.value)}
                    placeholder="Ex.: 10"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="atr-fluxo">Volume diário</Label>
                  <Input
                    id="atr-fluxo"
                    inputMode="decimal"
                    value={fluxo}
                    onChange={(e) => setFluxo(e.target.value)}
                    placeholder="Ex.: 4"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          {modo === "criar" ? (
            <Button onClick={criarELigar} disabled={criar.isPending}>
              {criar.isPending ? "Criando e ligando…" : "Criar e ligar"}
            </Button>
          ) : (
            <Button onClick={ligarExistente} disabled={salvarPasso.isPending}>
              {salvarPasso.isPending ? "Ligando…" : "Ligar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeletorPessoa({
  valor,
  onChange,
}: {
  valor: string | null;
  onChange: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const { pessoas, isLoading } = usePessoasParaAtribuicao();
  const escolhida = pessoas.find((p) => p.pessoa_id === valor);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{escolhida?.nome ?? "Escolha a pessoa"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar pessoa…" />
          <CommandList>
            <CommandEmpty>{isLoading ? "Carregando…" : "Nenhuma pessoa do time."}</CommandEmpty>
            <CommandGroup>
              {pessoas.map((p) => (
                <CommandItem
                  key={p.pessoa_id}
                  value={`${p.nome} ${p.cargo ?? ""}`}
                  onSelect={() => {
                    onChange(p.pessoa_id);
                    setAberto(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{p.nome}</span>
                    {p.cargo && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {p.cargo}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
