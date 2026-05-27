import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/navegacao/CommandPalette";

export function CasaSearchDock() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((p) => !p);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground text-sm w-full max-w-[360px] hover:border-gold/50 transition-colors"
      >
        <Search className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 text-left truncate">Buscar tela…</span>
        <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-background/50 font-sans">
          ⌘K
        </kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
