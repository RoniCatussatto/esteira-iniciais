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
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/lote/:id"} component={LotePage} />
      <Route path={"/lote/:id/documentos"} component={DocumentosPage} />
      <Route path={"/lote/:id/revisao"} component={RevisaoPage} />
      <Route path={"/lote/:id/definir-inicial"} component={DefinirInicialPage} />
      <Route path={"/configuracoes"} component={ConfiguracoesPage} />
      <Route path={"/configuracoes/cliente/:clienteId/doc/:docConfigId"} component={DocConfigPage} />
      <Route path={"/indices"} component={IndicesPage} />
      <Route path={"/modelos-iniciais"} component={ModelosIniciaisPage} />
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
import ModelosIniciaisPage from "./pages/ModelosIniciaisPage";
