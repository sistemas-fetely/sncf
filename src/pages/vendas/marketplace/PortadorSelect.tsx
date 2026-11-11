import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { Portador } from './useMarketplace';

export function PortadorSelect({ portadores, value, onChange, disabled, limpar = false, nomeAtual }: { portadores: Portador[]; value: string | null; onChange: (id: string | null) => void; disabled?: boolean; limpar?: boolean; nomeAtual?: string | null }) {
  const [aberto, setAberto] = useState(false);
  const escolher = (id: string | null) => { onChange(id); setAberto(false); };
  return <Popover open={aberto} onOpenChange={setAberto}>
    <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label="Transportadora / portador" aria-expanded={aberto} disabled={disabled} className="w-full min-w-0 justify-between gap-2 text-left font-normal"><span className="truncate">{portadores.find(p => p.id === value)?.nome ?? nomeAtual ?? 'Selecionar portador'}</span><ChevronsUpDown className="h-4 w-4 shrink-0" /></Button></PopoverTrigger>
    <PopoverContent className="w-[min(420px,calc(100vw-32px))] p-0" align="start"><Command><CommandInput placeholder="Buscar por nome…" /><CommandList><CommandEmpty>Nenhum portador encontrado.</CommandEmpty><CommandGroup>
      {limpar && <CommandItem value="Sem portador padrão" onSelect={() => escolher(null)}>Sem portador padrão{!value && <Check className="ml-auto h-4 w-4" />}</CommandItem>}
      {portadores.map(p => <CommandItem key={p.id} value={`${p.nome} ${p.id}`} onSelect={() => escolher(p.id)}>{p.nome}{value === p.id && <Check className="ml-auto h-4 w-4 shrink-0" />}</CommandItem>)}
    </CommandGroup></CommandList></Command></PopoverContent>
  </Popover>;
}