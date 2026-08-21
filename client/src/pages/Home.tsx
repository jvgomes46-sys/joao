import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  TrendingUp,
  BarChart3,
  Zap,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  Hammer,
  FileText,
} from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    // Usuário autenticado - redirecionar para dashboard
    navigate("/projetos");
    return null;
  }

  // Página de boas-vindas para usuários não autenticados
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">EVTE PRO</h1>
          </div>
          <Button onClick={() => startLogin()} size="sm">
            Entrar
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container py-20 md:py-32">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <Badge className="mx-auto" variant="outline">
            Plataforma de Inteligência Imobiliária
          </Badge>

          <h2 className="text-5xl md:text-6xl font-bold tracking-tight">
            Análise de Viabilidade
            <span className="block text-primary">Profissional e Inteligente</span>
          </h2>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Estude a viabilidade técnica e econômica de loteamentos, condomínios e
            incorporações com precisão profissional. Gere relatórios executivos prontos
            para apresentação a comitês de investimento.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button size="lg" onClick={() => startLogin()} className="gap-2">
              Começar Agora
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline">
              Conhecer Recursos
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container py-20">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-4">Motores Integrados</h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Cinco motores especializados trabalham em conjunto para análise completa
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            {
              icon: <Building2 className="w-6 h-6" />,
              title: "GeoEngine",
              description: "Análise urbanística conforme Lei 6.766/79",
            },
            {
              icon: <Hammer className="w-6 h-6" />,
              title: "CostEngine",
              description: "Engenharia de custos parametrizada",
            },
            {
              icon: <TrendingUp className="w-6 h-6" />,
              title: "SalesEngine",
              description: "Análise comercial e velocidade de vendas",
            },
            {
              icon: <DollarSign className="w-6 h-6" />,
              title: "FinanceEngine",
              description: "FCD, VPL, TIR, ROI e indicadores",
            },
            {
              icon: <FileText className="w-6 h-6" />,
              title: "TaxEngine",
              description: "Análise tributária (RET, Lucro Presumido, IBS/CBS)",
            },
          ].map((engine, i) => (
            <Card key={i} className="border-border/40 hover:border-primary/50 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                  {engine.icon}
                </div>
                <CardTitle className="text-lg">{engine.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{engine.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="container py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h3 className="text-3xl font-bold">Por que escolher EVTE PRO?</h3>
            <div className="space-y-4">
              {[
                "Análise técnica completa com normas brasileiras atualizadas",
                "Cálculos financeiros precisos e validados",
                "Simulação de cenários otimista, realista e pessimista",
                "Relatórios executivos prontos para apresentação",
                "Interface intuitiva e profissional",
                "Suporte a múltiplos regimes tributários",
              ].map((benefit, i) => (
                <div key={i} className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-gradient-to-br from-primary/10 to-secondary/10 rounded-lg p-8 flex items-center justify-center min-h-96">
            <div className="text-center">
              <BarChart3 className="w-24 h-24 text-primary/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Análise Visual Interativa</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container py-20">
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="pt-12 pb-12 text-center space-y-6">
            <h3 className="text-3xl font-bold">Pronto para começar?</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Crie seu primeiro estudo de viabilidade agora e descubra o potencial
              dos seus empreendimentos imobiliários.
            </p>
            <Button size="lg" onClick={() => startLogin()} className="gap-2">
              Acessar Plataforma
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 mt-20">
        <div className="container text-center text-sm text-muted-foreground">
          <p>© 2026 EVTE PRO. Plataforma de Inteligência Imobiliária.</p>
        </div>
      </footer>
    </div>
  );
}
