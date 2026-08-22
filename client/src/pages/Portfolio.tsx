import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Layers, TrendingUp, Wallet, PiggyBank, Percent, Eye } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ReferenceDot } from "recharts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "positive" | "negative";
}) {
  const toneClass = tone === "positive" ? "text-green-600" : tone === "negative" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <Icon className="w-8 h-8 text-muted-foreground/50 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Portfolio() {
  const { data, isLoading, error } = trpc.portfolio.get.useQuery(undefined, { retry: false });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível consolidar o portfólio</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!data || data.numeroProjetos === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Portfólio</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Layers className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum estudo calculado ainda</h3>
            <p className="text-muted-foreground text-center text-sm mb-4">
              A visão de portfólio consolida os estudos que já passaram pelo FinanceEngine.
            </p>
            <Link href="/projetos">
              <Button>Ir para Meus Empreendimentos</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const capitalNoPico = Math.abs(data.exposicaoMaximaConsolidada);
  const somaIngenua = Math.abs(data.somaDasExposicoesIndividuais);
  const economia = somaIngenua - capitalNoPico;

  const chartConfig: ChartConfig = { fluxoAcumulado: { label: "Caixa acumulado", color: "var(--chart-1)" } };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Portfólio</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {data.numeroProjetos} estudo(s) consolidado(s) — capital, retorno e cronograma somados entre projetos
        </p>
      </div>

      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="VGV do Portfólio" value={brl.format(data.vgvTotal)} icon={Wallet} />
        <KpiCard label="CAPEX do Portfólio" value={brl.format(data.capexTotal)} icon={PiggyBank} />
        <KpiCard
          label="VPL Somado"
          value={brl.format(data.vplSomado)}
          icon={data.vplSomado >= 0 ? TrendingUp : AlertTriangle}
          tone={data.vplSomado >= 0 ? "positive" : "negative"}
          hint={data.tmasDivergentes ? "TMAs diferentes entre projetos" : undefined}
        />
        <KpiCard
          label="TIR Consolidada"
          value={data.tirAnualConsolidada !== null ? `${pct.format(data.tirAnualConsolidada)} a.a.` : "Indisponível"}
          icon={Percent}
          hint="TIR do fluxo somado — não é média das TIRs"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Capital necessário no pico</CardTitle>
          <CardDescription>
            O pico de caixa de cada projeto acontece num mês diferente. Somar os picos individuais superestima o
            capital que você precisa ter em mãos — o número que importa é o do fluxo consolidado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Consolidado (real)</p>
              <p className="text-2xl font-bold text-destructive">{brl.format(capitalNoPico)}</p>
              <p className="text-xs text-muted-foreground">no mês {data.mesDaExposicaoMaxima} do portfólio</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Soma dos picos individuais</p>
              <p className="text-2xl font-bold text-muted-foreground line-through">{brl.format(somaIngenua)}</p>
              <p className="text-xs text-muted-foreground">o que uma planilha por projeto sugeriria</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Diferença</p>
              <p className="text-2xl font-bold text-green-600">{brl.format(economia)}</p>
              <p className="text-xs text-muted-foreground">
                {economia > 0 ? "capital que o escalonamento libera" : "projetos totalmente simultâneos"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Curva de Caixa Consolidada</CardTitle>
          <CardDescription>Caixa acumulado somando todos os projetos, mês a mês</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="max-h-[320px] w-full">
            <AreaChart data={data.fluxoConsolidado}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="mes" tickFormatter={(v) => `m${v}`} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => brl.format(Number(v))} width={90} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => brl.format(Number(v))} />} />
              <Area dataKey="fluxoAcumulado" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.2} />
              <ReferenceDot
                x={data.mesDaExposicaoMaxima}
                y={data.exposicaoMaximaConsolidada}
                r={5}
                fill="var(--destructive)"
                stroke="none"
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projetos no Portfólio</CardTitle>
          <CardDescription>Ordenados por VGV</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.projetos.map((p) => (
            <div key={p.projectId} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {p.localizacao ?? "sem localização"}
                  {p.offsetMeses > 0 && ` · começa ${p.offsetMeses} mês(es) depois do primeiro`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold">{brl.format(p.vgv)}</p>
                <p className="text-xs text-muted-foreground">
                  VPL {brl.format(p.vpl)}
                  {p.tirAnual !== null && ` · TIR ${pct.format(p.tirAnual)} a.a.`}
                </p>
              </div>
              <Link href={`/projetos/${p.projectId}`}>
                <Button variant="ghost" size="sm">
                  <Eye className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      {data.alertas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.alertas.map((a, i) => (
              <Alert key={i}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{a}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
