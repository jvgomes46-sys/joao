import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Wallet, PiggyBank, Percent, FileDown, ClipboardCheck, HardHat } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Pie, PieChart, Cell } from "recharts";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatCurrency(v: number) {
  return currencyFormatter.format(v);
}

function formatPercent(fraction: number) {
  return percentFormatter.format(fraction);
}

const GRUPO_LABELS: Record<string, string> = {
  terraplenagem: "Terraplenagem",
  drenagem: "Drenagem",
  pavimentacao: "Pavimentação",
  agua: "Água",
  esgoto: "Esgoto",
  energia: "Energia",
  obras_civis_condominio: "Obras Civis / Condomínio",
  servicos_complementares: "Serviços Complementares",
};

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
];

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive" ? "text-green-600" : tone === "negative" ? "text-destructive" : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
          </div>
          <Icon className="w-8 h-8 text-muted-foreground/50" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);

  const { data, isLoading, error } = trpc.dashboard.getByProjectId.useQuery(
    { projectId },
    { enabled: Number.isFinite(projectId), retry: false }
  );

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

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/projetos">
          <Button variant="outline" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível montar o Dashboard</AlertTitle>
          <AlertDescription>
            {error?.message ?? "Erro desconhecido ao carregar os dados do estudo."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const vplPositivo = data.vpl >= 0;

  const capexChartConfig: ChartConfig = Object.fromEntries(
    data.composicaoCapexPorDisciplina.map((item, i) => [
      item.grupo,
      { label: GRUPO_LABELS[item.grupo] ?? item.grupo, color: CHART_COLORS[i % CHART_COLORS.length] },
    ])
  );

  const dreChartData = [
    { item: "Receita Bruta", valor: data.dreResumido.receitaBrutaTotal },
    { item: "Deduções", valor: -data.dreResumido.deducoesTotal },
    { item: "Custo Aprovações", valor: -data.dreResumido.aprovacoesTotal },
    { item: "Custo Obra", valor: -data.dreResumido.obraTotal },
    { item: "Lucro Líquido", valor: data.dreResumido.lucroLiquido },
  ];
  const dreChartConfig: ChartConfig = { valor: { label: "R$", color: "var(--chart-1)" } };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link href="/projetos">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{data.projectName}</h1>
          <p className="text-muted-foreground text-sm mt-1">Dashboard Executivo</p>
        </div>
        <div className="flex items-center gap-2">
          {data.regimeTributario && (
            <Badge variant="secondary" className="uppercase">
              {data.regimeTributario.replace("_", " ")}
            </Badge>
          )}
          <Link href={`/projetos/${projectId}/aprovacoes`}>
            <Button variant="outline" size="sm" className="gap-1">
              <ClipboardCheck className="w-4 h-4" />
              Aprovações
            </Button>
          </Link>
          <Link href={`/projetos/${projectId}/obra`}>
            <Button variant="outline" size="sm" className="gap-1">
              <HardHat className="w-4 h-4" />
              Obra
            </Button>
          </Link>
          <a href={`/api/reports/${projectId}/one-pager.pdf`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="gap-1">
              <FileDown className="w-4 h-4" />
              One-Pager
            </Button>
          </a>
          <a href={`/api/reports/${projectId}/technical.pdf`} target="_blank" rel="noreferrer">
            <Button variant="default" size="sm" className="gap-1">
              <FileDown className="w-4 h-4" />
              Relatório Técnico
            </Button>
          </a>
        </div>
      </div>

      {/* Bloco 1: VGV / CAPEX */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="VGV Total" value={formatCurrency(data.vgvTotal)} icon={Wallet} />
        <KpiCard label="VGV do Incorporador" value={formatCurrency(data.vgvIncorporador)} icon={Wallet} />
        <KpiCard label="CAPEX Total" value={formatCurrency(data.capexTotal)} icon={PiggyBank} />
        <KpiCard label="CAPEX / VGV" value={formatPercent(data.capexSobreVgv)} icon={Percent} />
      </div>

      {/* Bloco 2: Lucro / Margem / ROI / Exposição */}
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Lucro Líquido"
          value={formatCurrency(data.lucroLiquido)}
          icon={data.lucroLiquido >= 0 ? TrendingUp : TrendingDown}
          tone={data.lucroLiquido >= 0 ? "positive" : "negative"}
        />
        <KpiCard label="Margem sobre Receita" value={formatPercent(data.margemSobreReceitaRealizada)} icon={Percent} />
        <KpiCard label="ROI sobre CAPEX" value={formatPercent(data.roiSobreCapex)} icon={Percent} />
        <KpiCard label="Exposição Máxima de Caixa" value={formatCurrency(data.exposicaoMaximaCaixa)} icon={Wallet} tone="negative" />
      </div>

      {/* Bloco 3: VPL / TIR / Payback — o veredito de viabilidade */}
      <div className="grid gap-3 md:gap-4 grid-cols-1 md:grid-cols-3">
        <KpiCard label="VPL (Valor Presente Líquido)" value={formatCurrency(data.vpl)} icon={vplPositivo ? TrendingUp : TrendingDown} tone={vplPositivo ? "positive" : "negative"} />
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">TIR</p>
            {data.tirAnual !== null ? (
              <p className="text-2xl font-bold mt-1">
                {formatPercent(data.tirAnual)} <span className="text-sm font-normal text-muted-foreground">a.a.</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">{data.tirIndisponivelMotivo ?? "Indisponível"}</p>
            )}
            {data.tirMensal !== null && (
              <p className="text-xs text-muted-foreground">{formatPercent(data.tirMensal)} a.m.</p>
            )}
          </CardContent>
        </Card>
        <KpiCard
          label="Payback"
          value={data.paybackMes !== null ? `${data.paybackMes} meses` : "Não paga no horizonte"}
          icon={data.paybackMes !== null ? TrendingUp : TrendingDown}
          tone={data.paybackMes !== null ? "neutral" : "negative"}
        />
      </div>

      {!vplPositivo && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>VPL negativo</AlertTitle>
          <AlertDescription>
            O VPL é o veredito de viabilidade do estudo. Com VPL negativo, o projeto não se paga na TMA considerada.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Composição do CAPEX por disciplina */}
        <Card>
          <CardHeader>
            <CardTitle>Composição do CAPEX por Disciplina</CardTitle>
            <CardDescription>Percentual do investimento total por grupo de custo</CardDescription>
          </CardHeader>
          <CardContent>
            {data.composicaoCapexPorDisciplina.length > 0 ? (
              <ChartContainer config={capexChartConfig} className="mx-auto aspect-square max-h-[320px]">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => [
                          `${formatCurrency(Number(value))} (${GRUPO_LABELS[name as string] ?? name})`,
                          "",
                        ]}
                      />
                    }
                  />
                  <Pie data={data.composicaoCapexPorDisciplina} dataKey="valor" nameKey="grupo" innerRadius={60}>
                    {data.composicaoCapexPorDisciplina.map((entry, i) => (
                      <Cell key={entry.grupo} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem itens de custo ativos</p>
            )}
          </CardContent>
        </Card>

        {/* DRE Resumido */}
        <Card>
          <CardHeader>
            <CardTitle>DRE Resumido</CardTitle>
            <CardDescription>Consolidado do fluxo de caixa do estudo</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={dreChartConfig} className="max-h-[320px] w-full">
              <BarChart data={dreChartData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(Number(v))} />
                <YAxis type="category" dataKey="item" width={110} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                <Bar dataKey="valor" radius={4}>
                  {dreChartData.map((entry) => (
                    <Cell key={entry.item} fill={entry.valor >= 0 ? "var(--chart-2)" : "var(--destructive)"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            {data.impostosTotais !== null && (
              <p className="text-sm text-muted-foreground mt-2">
                Impostos totais ({data.regimeTributario}): {formatCurrency(data.impostosTotais)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Painel de alertas de consistência */}
      <Card>
        <CardHeader>
          <CardTitle>Alertas de Consistência</CardTitle>
          <CardDescription>Verificações automáticas de GeoEngine e FinanceEngine</CardDescription>
        </CardHeader>
        <CardContent>
          {data.alertas.length > 0 ? (
            <div className="space-y-2">
              {data.alertas.map((alerta, i) => (
                <Alert key={i}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{alerta}</AlertDescription>
                </Alert>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum alerta de consistência identificado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
