import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  profile: { full_name: string | null; avatar_url: string | null; department: string | null; position: string | null; approved: boolean } | null;
  loading: boolean;
  approved: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const currentUserIdRef = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);

  const resetUserState = () => {
    currentUserIdRef.current = null;
    setRoles([]);
    setProfile(null);
    setLoading(false);
  };

  const fetchUserData = async (userId: string) => {
    currentUserIdRef.current = userId;
    setLoading(true);

    const [rolesRes, profileRes] = await Promise.all([
      supabase.rpc("get_user_roles", { _user_id: userId }),
      supabase
        .from("profiles")
        .select("full_name, avatar_url, department, position, approved")
        .eq("user_id", userId)
        .single(),
    ]);

    if (currentUserIdRef.current !== userId) return;

    if (rolesRes.error) {
      console.error("Erro ao carregar perfis de acesso", rolesRes.error);
      setRoles([]);
    } else {
      setRoles((rolesRes.data ?? []) as AppRole[]);
    }

    if (profileRes.error) {
      console.error("Erro ao carregar perfil do usuário", profileRes.error);
      setProfile(null);
    } else {
      setProfile(profileRes.data);
    }

    setLoading(false);
  };

  useEffect(() => {
    const applySession = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user?.id ?? null;

      // Bug fix (29/04/2026): TOKEN_REFRESHED do Supabase Auth dispara
      // periodicamente (a cada ~50min ou quando a aba volta de inativa).
      // Antes: cada disparo chamava fetchUserData → setLoading(true) →
      // ProtectedRoute mostrava spinner → toda árvore desmontava →
      // useState locais (faturaExpanded, selecionados, etc.) RESETAVAM.
      //
      // Fix: se o userId é o MESMO que já está logado, só atualiza
      // session/user silenciosamente (sem mexer em loading/roles/profile).
      // Token refresh é renovação, não mudança de identidade.
      if (nextUserId && nextUserId === currentUserIdRef.current) {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        return;
      }

      // Caminho normal: login inicial, troca de usuário, ou logout
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        void fetchUserData(nextSession.user.id);
        return;
      }

      resetUserState();
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // PASSWORD_RECOVERY: fluxo implicit (fallback)
      if (event === "PASSWORD_RECOVERY") {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
        if (window.location.pathname !== "/definir-senha") {
          window.location.replace("/definir-senha");
        }
        return;
      }

      // SIGNED_IN: fluxo PKCE para recovery link
      // No PKCE, recovery links disparam SIGNED_IN. Detectamos pelo hash da URL
      // (implicit: #type=recovery) ou pelo pathname já estar em /definir-senha
      // (redirect_to funcionou corretamente).
      if (event === "SIGNED_IN") {
        const hash = window.location.hash;
        const search = window.location.search;
        const isRecoveryHash = hash.includes("type=recovery");
        const isPkceAuthRedirect = search.includes("code=");
        const isOnResetPage =
          window.location.pathname === "/definir-senha" ||
          window.location.pathname === "/reset-password";

        // Fluxo implicit: hash tem type=recovery mas não está na página certa
        if (isRecoveryHash && !isOnResetPage) {
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          setLoading(false);
          window.location.replace("/reset-password");
          return;
        }

        // Fluxo PKCE: chegou via ?code= na URL (recovery, invite ou magic link)
        // Login normal via email+senha NÃO tem ?code= na URL — é API call direto
        if (isPkceAuthRedirect && !isOnResetPage) {
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          setLoading(false);
          window.location.replace("/reset-password");
          return;
        }

        // Já está na página de reset — só atualiza estado, não navega
        if (isOnResetPage) {
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          setLoading(false);
          return;
        }
      }

      applySession(nextSession);
    });


    void supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      applySession(initialSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    resetUserState();
    navigate("/login", { replace: true });
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const hasAnyRole = (r: AppRole[]) => r.some((role) => roles.includes(role));

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        roles,
        profile,
        loading,
        approved: profile?.approved ?? false,
        signOut,
        hasRole,
        hasAnyRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
