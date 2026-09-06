import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { usePessoasSistema } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  usePodeGerenciarProjeto, useProjeto, useSalvarProjeto,
  type ProjetoStatus, type ProjetoVisibilidade,
} from "@/hooks/tarefas/useProjetosTarefas";
import { CORES } from "./NovoProjetoDialog";
import { MarcaProjeto, NOMES_ICONE_PROJETO, iconeProjeto } from "./MarcaProjeto";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2 } from "lucide-react";

/** Efeito de cada visibilidade, explicado ao lado da opção. */
const EFEITO_VISIBILIDADE: Record<ProjetoVisibilidade, string> = {
  publica: "Todos veem o projeto.",
  departamento: "Só quem é do departamento escolhido vê o projeto.",
  privada: "Só responsável, criador e participantes veem o projeto.",
};

const STATUS_ROTULO: Record<ProjetoStatus, string> = {
  ativo: "Ativo",
  arquivado: "Arquivado",
  encerrado: "Encerrado",
};

const TIPO_ROTULO: Record<string, string> = { projeto: "Projeto", tema: "Tema" };

/** Ícones aceitos — o mapa vive em MarcaProjeto, ponto único de resolução. */
const ICONES = NOMES_ICONE_PROJETO;

/** Imagem do projeto: tipos e tamanho validados ANTES de subir. */
const TIPOS_IMAGEM: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
const LIMITE_IMAGEM_BYTES = 512 * 1024;
const BUCKET_IMAGEM = "projeto-icones";

function useDepartamentos() {
  return useQuery({
    queryKey: ["departamentos", "ativos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await supabase
        .from("departamentos")
        .select("id,nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
}

interface Props {
  projetoId: string;
}

export function ConfiguracoesProjeto({ projetoId }: Props) {
  const { data: projeto, isLoading } = useProjeto(projetoId);
  const { data: podeGerenciar } = usePodeGerenciarProjeto(projetoId);
  const { data: pessoas } = usePessoasSistema();
  const { data: departamentos } = useDepartamentos();
  const salvar = useSalvarProjeto(projetoId);

  const somenteLeitura = !podeGerenciar;

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState<string | null>(null);
  const [departamento, setDepartamento] = useState<string | null>(null);
  const [visibilidade, setVisibilidade] = useState<ProjetoVisibilidade>("publica");
  const [status, setStatus] = useState<ProjetoStatus>("ativo");
  const [tipo, setTipo] = useState("projeto");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [cadencia, setCadencia] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [icone, setIcone] = useState<string | null>(null);
  const [confirmarResponsavel, setConfirmarResponsavel] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const qc = useQueryClient();
  const arquivoRef = useRef<HTMLInputElement>(null);

  const imagemUrl = projeto?.imagem_url ?? null;

  /** Caminho dentro do bucket a partir da URL pública gravada. */
  function caminhoDaUrl(url: string): string | null {
    const marca = `/${BUCKET_IMAGEM}/`;
    const i = url.indexOf(marca);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marca.length));
  }

  /** FAIL-LOUD: valida, sobe, grava a URL e só então avisa sucesso. */
  async function enviarImagem(arquivo: File) {
    const ext = TIPOS_IMAGEM[arquivo.type];
    if (!ext) {
      toast.error("Formato não aceito. Envie PNG, JPEG, WEBP ou SVG.");
      return;
    }
    if (arquivo.size > LIMITE_IMAGEM_BYTES) {
      toast.error(
        `A imagem tem ${(arquivo.size / 1024).toFixed(0)} KB e o limite é 512 KB. Reduza o arquivo e tente de novo.`
      );
      return;
    }
    setEnviandoImagem(true);
    try {
      const caminho = `${projetoId}/${Date.now()}.${ext}`;
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET_IMAGEM)
        .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
      if (erroUpload) throw erroUpload;

      const { data: pub } = supabase.storage.from(BUCKET_IMAGEM).getPublicUrl(caminho);
      if (!pub?.publicUrl) throw new Error("Não foi possível obter o endereço público da imagem.");

      const antigo = imagemUrl ? caminhoDaUrl(imagemUrl) : null;
      await salvar.mutateAsync({ imagem_url: pub.publicUrl });
      if (antigo && antigo !== caminho) {
        await supabase.storage.from(BUCKET_IMAGEM).remove([antigo]);
      }
      await qc.invalidateQueries({ queryKey: ["tarefas"] });
      toast.success("Imagem do projeto atualizada");
    } catch (e) {
      toast.error(`Não foi possível enviar a imagem: ${(e as Error).message}`);
    } finally {
      setEnviandoImagem(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  /** Remove a referência e o arquivo — nada de órfão no bucket. */
  async function removerImagem() {
    if (!imagemUrl) return;
    setEnviandoImagem(true);
    try {
      const caminho = caminhoDaUrl(imagemUrl);
      await salvar.mutateAsync({ imagem_url: null });
      if (caminho) {
        const { error } = await supabase.storage.from(BUCKET_IMAGEM).remove([caminho]);
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["tarefas"] });
      toast.success("Imagem removida");
    } catch (e) {
      toast.error(`Não foi possível remover a imagem: ${(e as Error).message}`);
    } finally {
      setEnviandoImagem(false);
    }
  }

  // hidrata o formulário a partir do projeto carregado
  useEffect(() => {
    if (!projeto) return;
    setNome(projeto.nome);
    setDescricao(projeto.descricao ?? "");
    setResponsavel(projeto.responsavel_id);
    setDepartamento(projeto.departamento_id);
    setVisibilidade(projeto.visibilidade);
    setStatus(projeto.status);
    setTipo((projeto as unknown as { tipo?: string }).tipo ?? "projeto");
    setInicio(projeto.data_inicio?.slice(0, 10) ?? "");
    setFim(projeto.data_fim_prevista?.slice(0, 10) ?? "");
    setCadencia(String((projeto as unknown as { cadencia_checkin_dias?: number }).cadencia_checkin_dias ?? ""));
    setCor(projeto.cor ?? CORES[0]);
    setIcone(projeto.icone);
  }, [projeto]);

  const nomePessoa = (id: string | null) =>
    (pessoas ?? []).find((p) => p.id === id)?.nome ?? "—";

  const departamentoFaltando = visibilidade === "departamento" && !departamento;
  const trocouResponsavel = !!projeto && responsavel !== projeto.responsavel_id;

  const podeSalvar = useMemo(
    () => !somenteLeitura && !!nome.trim() && !departamentoFaltando && !salvar.isPending,
    [somenteLeitura, nome, departamentoFaltando, salvar.isPending]
  );

  async function gravar() {
    if (!podeSalvar) return;
    const cad = cadencia.trim() === "" ? undefined : Number(cadencia);
    if (cad !== undefined && (!Number.isInteger(cad) || cad < 0)) {
      toast.error("A cadência de check-in precisa ser um número inteiro de dias.");
      return;
    }
    // FAIL-LOUD: erro sobe, o formulário volta ao estado do banco
    try {
      await salvar.mutateAsync({
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        responsavel_id: responsavel,
        departamento_id: departamento,
        visibilidade,
        status,
        tipo,
        data_inicio: inicio || null,
        data_fim_prevista: fim || null,
        cor,
        icone,
        ...(cad !== undefined ? { cadencia_checkin_dias: cad } : {}),
      });
      toast.success("Configurações salvas");
    } catch {
      // rollback do estado otimista: volta para o que está no banco
      if (projeto) {
        setNome(projeto.nome);
        setDescricao(projeto.descricao ?? "");
        setResponsavel(projeto.responsavel_id);
        setDepartamento(projeto.departamento_id);
        setVisibilidade(projeto.visibilidade);
        setStatus(projeto.status);
        setCor(projeto.cor ?? CORES[0]);
        setIcone(projeto.icone);
      }
    }
  }

  function aoClicarSalvar() {
    if (trocouResponsavel) {
      setConfirmarResponsavel(true);
      return;
    }
    void gravar();
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      {somenteLeitura && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
          Você só pode consultar estas configurações — quem gerencia o projeto pode alterá-las.
        </p>
      )}

      <div className="space-y-1">
        <Label htmlFor="cfg-nome">Nome</Label>
        <Input id="cfg-nome" value={nome} onChange={(e) => setNome(e.target.value)} disabled={somenteLeitura} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="cfg-desc">Descrição</Label>
        <Textarea id="cfg-desc" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={somenteLeitura} />
      </div>

      <div className="space-y-1">
        <Label>Responsável</Label>
        <Select
          value={responsavel ?? "none"}
          onValueChange={(v) => setResponsavel(v === "none" ? null : v)}
          disabled={somenteLeitura}
        >
          <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem responsável</SelectItem>
            {(pessoas ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {trocouResponsavel && (
          <p className="text-[11px] text-warning">
            Trocar o responsável muda quem gerencia o projeto. Pediremos confirmação ao salvar.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Departamento</Label>
        <Select
          value={departamento ?? "none"}
          onValueChange={(v) => setDepartamento(v === "none" ? null : v)}
          disabled={somenteLeitura}
        >
          <SelectTrigger><SelectValue placeholder="Sem departamento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem departamento</SelectItem>
            {(departamentos ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Visibilidade</Label>
        <div className="space-y-2">
          {(Object.keys(EFEITO_VISIBILIDADE) as ProjetoVisibilidade[]).map((v) => (
            <label
              key={v}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border p-2",
                visibilidade === v && "border-primary",
                somenteLeitura && "cursor-default opacity-70"
              )}
            >
              <input
                type="radio"
                className="mt-1"
                name="cfg-visibilidade"
                checked={visibilidade === v}
                onChange={() => setVisibilidade(v)}
                disabled={somenteLeitura}
              />
              <span className="text-sm">
                {v === "publica" ? "Pública" : v === "departamento" ? "Departamento" : "Privada"}
                <span className="block text-[11px] text-muted-foreground">{EFEITO_VISIBILIDADE[v]}</span>
              </span>
            </label>
          ))}
        </div>
        {departamentoFaltando && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
            Visibilidade por departamento sem departamento escolhido deixa o projeto invisível para todo mundo,
            exceto o dono e os participantes. Escolha um departamento para poder salvar.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ProjetoStatus)} disabled={somenteLeitura}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_ROTULO) as ProjetoStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_ROTULO[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={setTipo} disabled={somenteLeitura}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.keys(TIPO_ROTULO).map((t) => (
                <SelectItem key={t} value={t}>{TIPO_ROTULO[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cfg-ini">Início</Label>
          <Input id="cfg-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} disabled={somenteLeitura} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cfg-fim">Fim previsto</Label>
          <Input id="cfg-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} disabled={somenteLeitura} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cfg-cad">Check-in (dias)</Label>
          <Input
            id="cfg-cad"
            type="number"
            min={0}
            step={1}
            value={cadencia}
            onChange={(e) => setCadencia(e.target.value)}
            disabled={somenteLeitura}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Cor</Label>
        <div className="flex flex-wrap gap-2">
          {CORES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`cor ${c}`}
              disabled={somenteLeitura}
              onClick={() => setCor(c)}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition",
                cor === c ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label>Ícone</Label>
        <Select
          value={icone ?? "none"}
          onValueChange={(v) => setIcone(v === "none" ? null : v)}
          disabled={somenteLeitura}
        >
          <SelectTrigger><SelectValue placeholder="Sem ícone" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem ícone</SelectItem>
            {ICONES.map((i) => {
              const Icone = iconeProjeto(i);
              return (
                <SelectItem key={i} value={i}>
                  <span className="flex items-center gap-2">
                    <Icone className="h-4 w-4" />
                    {i}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Imagem do projeto</Label>
        <div className="flex items-center gap-3">
          <MarcaProjeto
            nome={nome}
            cor={cor}
            icone={icone}
            imagemUrl={imagemUrl}
            className="h-12 w-12"
          />
          <input
            ref={arquivoRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const arq = e.target.files?.[0];
              if (arq) void enviarImagem(arq);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={somenteLeitura || enviandoImagem}
            onClick={() => arquivoRef.current?.click()}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            {enviandoImagem ? "Enviando…" : imagemUrl ? "Trocar imagem" : "Enviar imagem"}
          </Button>
          {imagemUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={somenteLeitura || enviandoImagem}
              onClick={() => void removerImagem()}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover imagem
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG, WEBP ou SVG, até 512 KB. Quando há imagem, ela manda: o ícone escolhido não
          aparece. Sem imagem e sem ícone, fica só a cor.
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={aoClicarSalvar} disabled={!podeSalvar}>
          {salvar.isPending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>

      <AlertDialog open={confirmarResponsavel} onOpenChange={setConfirmarResponsavel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar o responsável do projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              {nomePessoa(responsavel)} passa a ser o responsável e a gerenciar este projeto.
              {projeto?.responsavel_id
                ? ` ${nomePessoa(projeto.responsavel_id)} pode perder o acesso de gestão, caso não seja criador nem participante.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmarResponsavel(false);
                void gravar();
              }}
            >
              Confirmar troca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
