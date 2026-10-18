import { ImageOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MiniaturaProduto({ url, nome }: { url?: string | null; nome?: string | null }) {
  if (!url) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground" aria-label="Sem foto">
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="h-10 w-10 shrink-0 overflow-hidden rounded border" aria-label={`Ver foto de ${nome ?? "produto"}`}>
          <img src={url} alt={nome ?? ""} loading="lazy" className="h-full w-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" side="right">
        <img src={url} alt={nome ?? ""} className="w-full rounded object-contain" />
        {nome && <p className="mt-1 text-xs text-muted-foreground">{nome}</p>}
      </PopoverContent>
    </Popover>
  );
}
