import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { ArrowLeft, AlertTriangle, HardHat, Plus, Trash2 } from "lucide-react";

const currency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const STATUS_LABELS: Record<string, string> = {
  nao_iniciado: "Não iniciado",
  em_execucao: "Em execução",
  concluido: "Concluído",
};

const STATUS_COLORS: Record<string, string> = {
  nao_iniciado: "bg-gray-100 text-gray-800",
  em_execucao: "bg-yellow-100 text-yellow-800",
  concluido: "bg-green-100 text-green-800",
};

const COST_ENGINE_GRUPOS = [
  "terraplenagem",
  "drenagem",
  "pavimentacao",
  "agua",
  "esgoto",
  "energia",
  "obras_civis_condominio",
  "servicos_complementares",
];

function NewCategoryDialog({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const utils = trpc.useUtils();
  const mutation = trpc.construction.createCategory.useMutation({
    onSuccess: () => {
      toast.success("Categoria criada");
      utils.construction.getTree.invalidate({ projectId });
      utils.construction.getDashboard.invalidate({ projectId });
      setOpen(false);
      setNome("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="w-4 h-4" />
          Nova Categoria
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Categoria Geral</DialogTitle>
          <DialogDescription>Ex.: "Áreas Construídas", "Infraestrutura"</DialogDescription>
        </DialogHeader>
        <Input placeholder="Nome da categoria" value={nome} onChange={(e) => setNome(e.target.value)} />
        <DialogFooter>
          <Button onClick={() => mutation.mutate({ projectId, nome })} disabled={!nome || mutation.isPending}>
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewSubcategoryDialog({ projectId, categoryId }: { projectId: number; categoryId: number }) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [templateKey, setTemplateKey] = useState("edificacao");
  const [origem, setOrigem] = useState<"manual" | "cost_engine">("manual");
  const [valorPrevistoTotal, setValorPrevistoTotal] = useState("");
  const [grupo, setGrupo] = useState(COST_ENGINE_GRUPOS[0]);

  const utils = trpc.useUtils();
  const { data: templates } = trpc.construction.stageTemplates.useQuery();

  const invalidateAndClose = () => {
    utils.construction.getTree.invalidate({ projectId });
    utils.construction.getDashboard.invalidate({ projectId });
    setOpen(false);
    setNome("");
    setValorPrevistoTotal("");
  };

  const manualMutation = trpc.construction.createSubcategoryManual.useMutation({
    onSuccess: () => {
      toast.success("Subcategoria criada");
      invalidateAndClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const costEngineMutation = trpc.construction.createSubcategoryFromCostEngine.useMutation({
    onSuccess: () => {
      toast.success("Subcategoria criada a partir do orçamento do CostEngine");
      invalidateAndClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (origem === "manual") {
      manualMutation.mutate({ categoryId, projectId, nome, templateKey, valorPrevistoTotal: Number(valorPrevistoTotal) || 0 });
    } else {
      costEngineMutation.mutate({ categoryId, projectId, nome, templateKey, grupo });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="w-3 h-3" />
          Nova Subcategoria
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Subcategoria</DialogTitle>
          <DialogDescription>As etapas são geradas automaticamente a partir do template escolhido.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs mb-1 block">Nome</Label>
            <Input placeholder="Ex.: Vestiário" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs mb-1 block">Template de Etapas</Label>
            <Select value={templateKey} onValueChange={setTemplateKey}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(templates ?? { edificacao: [], complexo_esportivo: [], infraestrutura_loteamento: [] }).map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Origem do Valor Previsto</Label>
            <Select value={origem} onValueChange={(v) => setOrigem(v as "manual" | "cost_engine")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (valor digitado)</SelectItem>
                <SelectItem value="cost_engine">CostEngine (puxar do orçamento do estudo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {origem === "manual" ? (
            <div>
              <Label className="text-xs mb-1 block">Valor Previsto Total (R$)</Label>
              <Input type="number" value={valorPrevistoTotal} onChange={(e) => setValorPrevistoTotal(e.target.value)} />
            </div>
          ) : (
            <div>
              <Label className="text-xs mb-1 block">Grupo do CostEngine</Label>
              <Select value={grupo} onValueChange={setGrupo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COST_ENGINE_GRUPOS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={!nome || manualMutation.isPending || costEngineMutation.isPending}
          >
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageRow({ stage, projectId }: { stage: any; projectId: number }) {
  const utils = trpc.useUtils();
  const [percentual, setPercentual] = useState(String(stage.percentualExecutado));

  useEffect(() => {
    setPercentual(String(stage.percentualExecutado));
  }, [stage.percentualExecutado]);

  const mutation = trpc.construction.updateStage.useMutation({
    onSuccess: () => {
      utils.construction.getTree.invalidate({ projectId });
      utils.construction.getDashboard.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-2 py-1.5 border-b last:border-0 text-sm">
      <span className="flex-1 truncate">{stage.nome}</span>
      <Badge className={`${STATUS_COLORS[stage.status]} text-xs shrink-0`}>{STATUS_LABELS[stage.status]}</Badge>
      <span className="text-xs text-muted-foreground w-24 text-right shrink-0">{currency(stage.valorPrevisto)}</span>
      <Input
        type="number"
        min={0}
        max={100}
        className="h-7 w-16 text-xs shrink-0"
        value={percentual}
        onChange={(e) => setPercentual(e.target.value)}
        onBlur={() => {
          const value = Math.min(100, Math.max(0, Number(percentual) || 0));
          setPercentual(String(value));
          if (value !== stage.percentualExecutado) {
            mutation.mutate({
              stageId: stage.id,
              projectId,
              percentualExecutado: value,
              status: value >= 100 ? "concluido" : value > 0 ? "em_execucao" : "nao_iniciado",
            });
          }
        }}
      />
      <span className="text-xs text-muted-foreground w-6 shrink-0">%</span>
    </div>
  );
}

export default function Construction() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const utils = trpc.useUtils();

  const { data: tree, isLoading, error } = trpc.construction.getTree.useQuery({ projectId }, { enabled: Number.isFinite(projectId) });
  const { data: dashboard } = trpc.construction.getDashboard.useQuery({ projectId }, { enabled: Number.isFinite(projectId) });

  const deleteCategoryMutation = trpc.construction.deleteCategory.useMutation({
    onSuccess: () => {
      utils.construction.getTree.invalidate({ projectId });
      utils.construction.getDashboard.invalidate({ projectId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link href={`/projetos/${projectId}`}>
          <Button variant="outline" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a obra</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link href={`/projetos/${projectId}`}>
            <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao Dashboard
            </Button>
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Execução de Obra</h1>
          <p className="text-muted-foreground text-sm mt-1">Acompanhamento por EAP: Categoria → Subcategoria → Etapa</p>
        </div>
        <NewCategoryDialog projectId={projectId} />
      </div>

      {dashboard && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HardHat className="w-4 h-4" />
              Resumo Executivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Progresso Geral</span>
                <span className="font-semibold">{dashboard.progressoGeralPercentual.toFixed(1)}%</span>
              </div>
              <Progress value={dashboard.progressoGeralPercentual} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Valor Previsto</p>
                <p className="font-semibold">{currency(dashboard.valorPrevistoTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Valor Executado</p>
                <p className="font-semibold text-green-700">{currency(dashboard.valorExecutadoTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Saldo a Executar</p>
                <p className="font-semibold">{currency(dashboard.saldoAExecutarTotal)}</p>
              </div>
            </div>
            {dashboard.porCategoria.length > 0 && (
              <div className="pt-2 space-y-2">
                {dashboard.porCategoria.map((c) => (
                  <div key={c.categoriaId}>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{c.nome}</span>
                      <span>{c.progressoPercentual.toFixed(1)}%</span>
                    </div>
                    <Progress value={c.progressoPercentual} className="h-1.5" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(!tree || tree.length === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <HardHat className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma categoria cadastrada</h3>
            <p className="text-muted-foreground text-center mb-4 text-sm">
              Crie categorias gerais (ex.: "Áreas Construídas", "Infraestrutura") e depois suas subcategorias.
            </p>
            <NewCategoryDialog projectId={projectId} />
          </CardContent>
        </Card>
      ) : (
        tree.map((categoria) => (
          <Card key={categoria.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">{categoria.nome}</CardTitle>
                <CardDescription>{categoria.subcategories.length} subcategoria(s)</CardDescription>
              </div>
              <div className="flex gap-2">
                <NewSubcategoryDialog projectId={projectId} categoryId={categoria.id} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Remover a categoria "${categoria.nome}" e tudo dentro dela?`)) {
                      deleteCategoryMutation.mutate({ categoryId: categoria.id, projectId });
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {categoria.subcategories.map((subcategoria: any) => (
                <div key={subcategoria.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{subcategoria.nome}</p>
                    {subcategoria.origemCostEngineGrupo && (
                      <Badge variant="secondary" className="text-xs">
                        CostEngine: {subcategoria.origemCostEngineGrupo}
                      </Badge>
                    )}
                  </div>
                  {subcategoria.stages.map((stage: any) => (
                    <StageRow key={stage.id} stage={stage} projectId={projectId} />
                  ))}
                </div>
              ))}
              {categoria.subcategories.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma subcategoria ainda.</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
