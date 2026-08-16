import { useFormContext, useFieldArray } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Package, Loader2 } from "lucide-react";
import { useParametros } from "@/hooks/useParametros";
import type { DadosEmpresaForm } from "@/lib/validations/colaborador-clt";

export function StepDadosEmpresa() {
  const { register, setValue, watch, formState: { errors } } = useFormContext<any>();

  const { data: sistemas, isLoading: loadingSistemas } = useParametros("sistema");
  const { data: tiposEquip, isLoading: loadingTipos } = useParametros("tipo_equipamento");
  const { data: estadosEquip } = useParametros("estado_equipamento");

  const { fields: acessoFields, append: addAcesso, remove: removeAcesso } = useFieldArray({
    name: "acessos_sistemas",
  });

  const { fields: equipFields, append: addEquip, remove: removeEquip } = useFieldArray({
    name: "equipamentos",
  });

  return (
    <div className="space-y-8">
      {/* Banner quando dados vieram do convite */}
      {((watch("acessos_sistemas") as any[])?.length > 0 || (watch("equipamentos") as any[])?.length > 0) && (
        <div className="rounded-lg border-l-4 p-3 mb-4 bg-primary/5 border-primary">
          <p className="text-sm font-medium text-primary">
            Dados definidos na contratação — confira e ajuste se necessário
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Esses dados foram preenchidos pelo RH no momento da contratação e podem ser editados aqui.
          </p>
        </div>
      )}

      {/* Dados Corporativos */}
      <div>
        <div className="mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            🏢 Dados corporativos
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Dados que a Fetely provê. O <strong>email corporativo</strong> será usado para acesso ao sistema e
            comunicações oficiais.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="email_corporativo">Email Corporativo *</Label>
            <Input
              id="email_corporativo"
              type="email"
              placeholder="nome.sobrenome@fetely.com.br"
              {...register("email_corporativo")}
            />
            {errors.email_corporativo && (
              <p className="text-xs text-destructive">{errors.email_corporativo?.message as string}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Deve ser um domínio Fetely configurado em /parametros.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="data_integracao">Data de Integração</Label>
            <Input id="data_integracao" type="date" {...register("data_integracao")} />
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label htmlFor="celular_corporativo_info">Celular Corporativo (provisão)</Label>
          <div className="flex items-center gap-3">
            <Switch
              id="celular_corporativo_info"
              checked={watch("celular_corporativo") || false}
              onCheckedChange={(checked) => {
                setValue("celular_corporativo", checked);
                if (!checked) setValue("telefone_corporativo", "");
              }}
            />
            <span className="text-sm text-muted-foreground">
              {watch("celular_corporativo") ? "Sim — aparelho + linha" : "Não necessário — usar celular pessoal"}
            </span>
          </div>

          {watch("celular_corporativo") ? (
            <div className="space-y-1 max-w-md mt-3">
              <Label htmlFor="telefone_corporativo">Número do Celular Corporativo</Label>
              <Input
                id="telefone_corporativo"
                type="tel"
                placeholder="(11) 91234-5678 ou ramal 123"
                {...register("telefone_corporativo")}
              />
              <p className="text-[11px] text-muted-foreground">
                Número da linha corporativa provisionada para o colaborador.
              </p>
            </div>
          ) : (
            <div className="space-y-1 max-w-md mt-3">
              <Label htmlFor="telefone_pessoal_auto">Telefone do colaborador (automático)</Label>
              <Input
                id="telefone_pessoal_auto"
                type="tel"
                value={watch("telefone") || watch("contato_telefone") || ""}
                readOnly
                disabled
                placeholder="Sem telefone pessoal cadastrado"
                className="bg-muted/50"
              />
              <p className="text-[11px] text-muted-foreground">
                Como não há celular corporativo, o telefone pessoal cadastrado em Dados Pessoais será exibido no perfil do colaborador.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Acesso aos Sistemas — dinâmico como equipamentos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            🔐 Acesso aos Sistemas
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              addAcesso({
                sistema: "",
                tem_acesso: true,
                usuario: "",
                observacoes: "",
              })
            }
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>

        {loadingSistemas ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : acessoFields.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum acesso a sistema cadastrado.</p>
            <p className="text-xs">Clique em "Adicionar" para registrar acessos do colaborador.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {acessoFields.map((field, index) => {
              const sistemaAtual = watch(`acessos_sistemas.${index}.sistema`);
              const temAcesso = watch(`acessos_sistemas.${index}.tem_acesso`);
              const sistemaInfo = sistemas?.find((s) => s.valor === sistemaAtual || s.label === sistemaAtual);

              return (
                <div key={field.id} className="border rounded-lg p-4 relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeAcesso(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pr-8">
                    <div className="space-y-1">
                      <Label className="text-xs">Sistema *</Label>
                      <Select
                        value={sistemaAtual}
                        onValueChange={(val) => setValue(`acessos_sistemas.${index}.sistema`, val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o sistema" />
                        </SelectTrigger>
                        <SelectContent>
                          {(sistemas || []).map((s) => (
                            <SelectItem key={s.id} value={s.label}>
                              <div>
                                <span>{s.label}</span>
                                {s.descricao && (
                                  <span className="text-muted-foreground ml-2 text-xs">— {s.descricao}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Usuário / Login</Label>
                      <Input
                        placeholder="nome.sobrenome ou email"
                        {...register(`acessos_sistemas.${index}.usuario`)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Perfil de acesso</Label>
                      {(() => {
                        const sistemaParam = sistemas?.find((s) => s.label === sistemaAtual || s.valor === sistemaAtual);
                        let perfis: string[] = ["admin", "usuario", "visualizador"];
                        if (sistemaParam?.descricao) {
                          try {
                            const meta = JSON.parse(sistemaParam.descricao);
                            if (meta.perfis_acesso?.length) perfis = meta.perfis_acesso;
                          } catch {}
                        }
                        return (
                          <Select
                            value={watch(`acessos_sistemas.${index}.perfil_acesso`) || ""}
                            onValueChange={(v) => setValue(`acessos_sistemas.${index}.perfil_acesso`, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o perfil" />
                            </SelectTrigger>
                            <SelectContent>
                              {perfis.map((p) => (
                                <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Observações</Label>
                      <Input
                        placeholder="Perfil, permissões, etc."
                        {...register(`acessos_sistemas.${index}.observacoes`)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-2 border-t">
                    <Switch
                      checked={temAcesso}
                      onCheckedChange={(checked) => setValue(`acessos_sistemas.${index}.tem_acesso`, checked)}
                    />
                    <Label className="text-xs text-muted-foreground">
                      {temAcesso ? "Acesso ativo" : "Sem acesso"}
                    </Label>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Equipamentos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            💻 Equipamentos
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              addEquip({
                tipo: "",
                marca: "",
                modelo: "",
                numero_patrimonio: "",
                numero_serie: "",
                data_entrega: "",
                estado: "novo",
                observacoes: "",
              })
            }
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>

        {equipFields.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum equipamento cadastrado.</p>
            <p className="text-xs">Clique em "Adicionar" para registrar equipamentos do colaborador.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {equipFields.map((field, index) => {
              const tipoAtual = watch(`equipamentos.${index}.tipo`);
              return (
                <div key={field.id} className="border rounded-lg p-4 relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeEquip(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-2 mb-3">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Equipamento {index + 1}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo *</Label>
                      <Select
                        value={tipoAtual}
                        onValueChange={(val) => setValue(`equipamentos.${index}.tipo`, val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {(tiposEquip || []).map((t) => (
                            <SelectItem key={t.id} value={t.valor}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(errors as any)?.equipamentos?.[index]?.tipo && (
                        <p className="text-xs text-destructive">{(errors as any).equipamentos[index].tipo.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Marca</Label>
                      <Input placeholder="Ex: Dell, Samsung" {...register(`equipamentos.${index}.marca`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Modelo</Label>
                      <Input placeholder="Ex: Latitude 5520" {...register(`equipamentos.${index}.modelo`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nº Patrimônio</Label>
                      <Input placeholder="Ex: PAT-00123" {...register(`equipamentos.${index}.numero_patrimonio`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Nº Série</Label>
                      <Input placeholder="Número de série" {...register(`equipamentos.${index}.numero_serie`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data de Entrega</Label>
                      <Input type="date" {...register(`equipamentos.${index}.data_entrega`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Estado</Label>
                      <Select
                        value={watch(`equipamentos.${index}.estado`)}
                        onValueChange={(val) => setValue(`equipamentos.${index}.estado`, val)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(estadosEquip || []).map((e) => (
                            <SelectItem key={e.id} value={e.valor}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label className="text-xs">Observações</Label>
                      <Input placeholder="Configurações, acessórios, etc." {...register(`equipamentos.${index}.observacoes`)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
