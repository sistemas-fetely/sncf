import { Menu } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CasaTopNav } from "./CasaTopNav";
import { CasaSearchDock } from "./CasaSearchDock";
import { CasaThemeToggle } from "./CasaThemeToggle";
import { CasaAvatarMenu } from "./CasaAvatarMenu";
import { CasaFalaFetelyButton } from "./CasaFalaFetelyButton";
import { CasaConfigButton } from "./CasaConfigButton";
import { useCasaApp } from "@/hooks/useCasaApp";

export function CasaHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeApp = useCasaApp();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
      <div className="flex h-16 items-center gap-4 px-4 md:px-6">
        {/* Mobile: hamburguer */}
        <div className="md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-6">
              <Link
                to="/"
                onClick={() => setMobileOpen(false)}
                className="flex items-baseline gap-2 mb-8"
              >
                <span className="font-display text-2xl text-gold tracking-wide">FETÉLY</span>
                <span className="text-[10px] uppercase tracking-[2px] text-muted-foreground">
                  {activeApp.label}
                </span>
              </Link>
              <div onClick={() => setMobileOpen(false)} className="flex flex-col gap-1">
                <CasaTopNav className="!flex-col !items-stretch" />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Marca */}
        <Link to="/" className="flex items-baseline gap-2 flex-shrink-0">
          <span className="font-display text-xl md:text-2xl text-gold tracking-wide leading-none">
            FETÉLY
          </span>
          <span className="hidden md:inline text-[10px] uppercase tracking-[2px] text-muted-foreground">
            {activeApp.label}
          </span>
        </Link>

        {/* Top nav desktop */}
        <CasaTopNav className="hidden lg:flex ml-auto" />

        {/* Utilitários */}
        <div className="flex items-center gap-1 ml-auto lg:ml-4">
          <CasaFalaFetelyButton />
          <CasaConfigButton />
          <CasaThemeToggle />
          <CasaAvatarMenu />
        </div>
      </div>
    </header>
  );
}
