import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import LotePage from "./pages/LotePage";
import DocumentosPage from "./pages/DocumentosPage";
import RevisaoPage from "./pages/RevisaoPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import DocConfigPage from "./pages/DocConfigPage";
import IndicesPage from "./pages/IndicesPage";
import DefinirInicialPage from "./pages/DefinirInicialPage";
import ModelosCalculoPage from "./pages/ModelosCalculoPage";
import ModelosIniciaisPage from "./pages/ModelosIniciaisPage";
import GerarPlanilhasPage from "./pages/GerarPlanilhasPage";
import UploadPlanilhasPdfPage from "./pages/UploadPlanilhasPdfPage";
import GerarPeticoesPage from "./pages/GerarPeticoesPage";
import LoginPage from "./pages/LoginPage";
import { useLocalAuth } from "./hooks/useLocalAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";

/** Wrapper que redireciona para /login se não autenticado */
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useLocalAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return <Component />;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/login"} component={LoginPage} />
      <Route path={"/"}>
        {() => <ProtectedRoute component={Home} />}
      </Route>
      <Route path={"/lote/:id"}>
        {() => <ProtectedRoute component={LotePage} />}
      </Route>
      <Route path={"/lote/:id/documentos"}>
        {() => <ProtectedRoute component={DocumentosPage} />}
      </Route>
      <Route path={"/lote/:id/revisao"}>
        {() => <ProtectedRoute component={RevisaoPage} />}
      </Route>
      <Route path={"/lote/:id/definir-inicial"}>
        {() => <ProtectedRoute component={DefinirInicialPage} />}
      </Route>
      <Route path={"/configuracoes"}>
        {() => <ProtectedRoute component={ConfiguracoesPage} />}
      </Route>
      <Route path={"/configuracoes/cliente/:clienteId/doc/:docConfigId"}>
        {() => <ProtectedRoute component={DocConfigPage} />}
      </Route>
      <Route path={"/indices"}>
        {() => <ProtectedRoute component={IndicesPage} />}
      </Route>
      <Route path={"/modelos-iniciais"}>
        {() => <ProtectedRoute component={ModelosIniciaisPage} />}
      </Route>
      <Route path={"/modelos-calculo"}>
        {() => <ProtectedRoute component={ModelosCalculoPage} />}
      </Route>
      <Route path={"/lote/:id/gerar-planilhas"}>
        {() => <ProtectedRoute component={GerarPlanilhasPage} />}
      </Route>
      <Route path={"/lote/:id/upload-planilhas-pdf"}>
        {() => <ProtectedRoute component={UploadPlanilhasPdfPage} />}
      </Route>
      <Route path={"/lote/:id/gerar-peticoes"}>
        {() => <ProtectedRoute component={GerarPeticoesPage} />}
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
