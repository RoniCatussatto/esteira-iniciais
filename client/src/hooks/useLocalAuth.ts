import { trpc } from "@/lib/trpc";
import { useCallback } from "react";
import { useLocation } from "wouter";

/**
 * Hook de autenticação local (email/senha).
 * Substitui o useAuth do Manus OAuth para o fluxo principal do sistema.
 */
export function useLocalAuth() {
  const [, navigate] = useLocation();

  const meQuery = trpc.auth.localMe.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const utils = trpc.useUtils();

  const logoutMutation = trpc.auth.localLogout.useMutation({
    onSuccess: () => {
      utils.auth.localMe.setData(undefined, null);
      navigate("/login");
    },
  });

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    isAuthenticated: Boolean(meQuery.data),
    logout,
    refresh: () => meQuery.refetch(),
  };
}
