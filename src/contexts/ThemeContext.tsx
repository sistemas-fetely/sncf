import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "casa-fetely-theme";

function readLocal(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return saved === "dark" || saved === "light" ? saved : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<Theme>(readLocal);
  const [hydrated, setHydrated] = useState(false);

  // Hidratação inicial a partir do banco
  useEffect(() => {
    if (!user?.id || hydrated) return;
    let cancelado = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_preferencias_navegacao")
          .select("tema")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelado) return;
        if (!error && data?.tema && (data.tema === "light" || data.tema === "dark")) {
          setThemeState(data.tema as Theme);
          localStorage.setItem(STORAGE_KEY, data.tema);
        }
      } catch {
        // silencioso — mantém localStorage
      } finally {
        if (!cancelado) setHydrated(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user?.id, hydrated]);

  // Aplica classe + grava localStorage em toda mudança
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const persistirNoBanco = async (t: Theme) => {
    if (!user?.id) return;
    try {
      await supabase.rpc("set_user_tema", { p_tema: t });
    } catch {
      // silencioso
    }
  };

  const toggleTheme = () => {
    setThemeState((t) => {
      const novo: Theme = t === "light" ? "dark" : "light";
      void persistirNoBanco(novo);
      return novo;
    });
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    void persistirNoBanco(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de <ThemeProvider>");
  return ctx;
}
