"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, ChevronRight, Building2, Hammer, TrendingUp, DollarSign, FileText, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useState } from "react";
import { useIsMobile } from "@/hooks/useMobile";

type Step = "info" | "geo" | "cost" | "sales" | "finance" | "tax" | "review";

interface WizardData {
  name: string;
  description: string;
  type: "loteamento" | "condominio" | "incorporacao" | "";
  location: string;
  areaBruta: string;
  areaAPP: string;
  percentualVerde: string;
  percentualInstitucional: string;
  percentualSistemaViario: string;
  modoLotes: "automatico" | "manual";
  areaMediaLoteAlvo: string;
  numeroLotesManual: string;
  terraplanagem: string;
  pavimentacao: string;
  agua: string;
  esgoto: string;
  energia: string;
  vgv: string;
  precoMedioM2: string;
  velocidadeVendas: string;
  tmaUtilizada: string;
  capitalDisponivel: string;
  regimeTributario: "ret" | "lucro_presumido" | "lucro_real" | "";
}

const WIZARD_DATA_DEFAULTS: WizardData = {
  name: "",
  description: "",
  type: "",
  location: "",
  areaBruta: "",
  areaAPP: "",
  percentualVerde: "15",
  percentualInstitucional: "5",
  percentualSistemaViario: "20",
  modoLotes: "automatico",
  areaMediaLoteAlvo: "",
  numeroLotesManual: "",
  terraplanagem: "",
  pavimentacao: "",
  agua: "",
  esgoto: "",
  energia: "",
  vgv: "",
  precoMedioM2: "",
  velocidadeVendas: "",
  tmaUtilizada: "",
  capitalDisponivel: "",
  regimeTributario: "",
};

const STEPS: { id: Step; label: string; title: string; description: string; icon: React.ReactNode }[] = [
  {
    id: "info",
    label: "Informações",
    title: "Dados Básicos",
    description: "Nome, tipo e localização do empreendimento",
    icon: <Building2 className="w-5 h-5" />,
  },
  {
    id: "geo",
    label: "Urbanístico",
    title: "GeoEngine",
    description: "Análise de áreas conforme Lei 6.766/79",
    icon: <MapPin className="w-5 h-5" />,
  },
  {
    id: "cost",
    label: "Engenharia",
    title: "CostEngine",
    description: "Orçamento de infraestrutura",
    icon: <Hammer className="w-5 h-5" />,
  },
  {
    id: "sales",
    label: "Comercial",
    title: "SalesEngine",
    description: "VGV e projeção de vendas",
    icon: <TrendingUp className="w-5 h-5" />,
  },
  {
    id: "finance",
    label: "Financeiro",
    title: "FinanceEngine",
    description: "FCD, VPL, TIR e indicadores",
    icon: <DollarSign className="w-5 h-5" />,
  },
  {
    id: "tax",
    label: "Tributário",
    title: "TaxEngine",
    description: "RET, Lucro Presumido, IBS/CBS",
    icon: <FileText className="w-5 h-5" />,
  },
  {
    id: "review",
    label: "Revisão",
    title: "Confirmar",
    description: "Revise os dados antes de criar",
    icon: <CheckCircle2 className="w-5 h-5" />,
  },
];

interface StudyWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function StudyWizard({ open, onOpenChange, onSuccess }: StudyWizardProps) {
  const isMobile = useIsMobile();
  const [currentStep, setCurrentStep] = useState<Step>("info");
  const [data, setData] = useState<WizardData>(WIZARD_DATA_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);

  const createProjectMutation = trpc.projects.create.useMutation();
  const calculateGeoEngineMutation = trpc.geoEngine.calculate.useMutation();
  const saveCostEngineMutation = trpc.costEngine.save.useMutation();
  const saveSalesEngineMutation = trpc.salesEngine.save.useMutation();
  const saveFinanceEngineMutation = trpc.financeEngine.save.useMutation();
  const saveTaxEngineMutation = trpc.taxEngine.save.useMutation();

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case "info":
        if (!data.name.trim()) {
          toast.error("Preencha o nome do empreendimento");
          return false;
        }
        if (!data.type) {
          toast.error("Selecione o tipo de empreendimento");
          return false;
        }
        return true;
      case "geo":
        if (!data.areaBruta || Number(data.areaBruta) <= 0) {
          toast.error("Preencha a área bruta");
          return false;
        }
        if (data.modoLotes === "automatico" && (!data.areaMediaLoteAlvo || Number(data.areaMediaLoteAlvo) <= 0)) {
          toast.error("Preencha a área média do lote-alvo (modo automático)");
          return false;
        }
        if (data.modoLotes === "manual" && (!data.numeroLotesManual || Number(data.numeroLotesManual) <= 0)) {
          toast.error("Preencha o número de lotes (modo manual)");
          return false;
        }
        return true;
      case "cost":
        if (!data.terraplanagem && !data.pavimentacao && !data.agua && !data.esgoto && !data.energia) {
          toast.error("Preencha pelo menos um custo de infraestrutura");
          return false;
        }
        return true;
      case "sales":
        if (!data.vgv) {
          toast.error("Preencha o VGV total");
          return false;
        }
        return true;
      case "finance":
        if (!data.tmaUtilizada) {
          toast.error("Preencha a Taxa Mínima de Atratividade");
          return false;
        }
        return true;
      case "tax":
        if (!data.regimeTributario) {
          toast.error("Selecione o regime tributário");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateCurrentStep() && currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].id);
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    }
  };

  const handleFinish = async () => {
    if (!data.name || !data.type) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    setIsSaving(true);
    try {
      const project = await createProjectMutation.mutateAsync({
        name: data.name,
        description: data.description,
        type: data.type,
        location: data.location,
      });

      if (!project) {
        throw new Error("Falha ao criar o projeto");
      }

      // GeoEngine: só roda o cálculo se a etapa Urbanístico foi preenchida.
      if (data.areaBruta) {
        await calculateGeoEngineMutation.mutateAsync({
          projectId: project.id,
          areaBruta: Number(data.areaBruta),
          areaAPP: data.areaAPP ? Number(data.areaAPP) : undefined,
          percentualVerde: data.percentualVerde ? Number(data.percentualVerde) : undefined,
          percentualInstitucional: data.percentualInstitucional ? Number(data.percentualInstitucional) : undefined,
          percentualSistemaViario: data.percentualSistemaViario ? Number(data.percentualSistemaViario) : undefined,
          modoLotes: data.modoLotes,
          areaMediaLoteAlvo: data.modoLotes === "automatico" && data.areaMediaLoteAlvo ? Number(data.areaMediaLoteAlvo) : undefined,
          numeroLotesManual: data.modoLotes === "manual" && data.numeroLotesManual ? Number(data.numeroLotesManual) : undefined,
        });
      }

      // Etapas seguintes: CostEngine/SalesEngine/FinanceEngine/TaxEngine ainda
      // não existem como motores de cálculo — persistimos os dados brutos
      // coletados, em vez de descartá-los (eram descartados antes desta etapa).
      if (data.terraplanagem || data.pavimentacao || data.agua || data.esgoto || data.energia) {
        await saveCostEngineMutation.mutateAsync({
          projectId: project.id,
          terraplanagem: data.terraplanagem ? Number(data.terraplanagem) : undefined,
          pavimentacao: data.pavimentacao ? Number(data.pavimentacao) : undefined,
          agua: data.agua ? Number(data.agua) : undefined,
          esgoto: data.esgoto ? Number(data.esgoto) : undefined,
          energia: data.energia ? Number(data.energia) : undefined,
        });
      }

      if (data.vgv || data.precoMedioM2 || data.velocidadeVendas) {
        await saveSalesEngineMutation.mutateAsync({
          projectId: project.id,
          vgv: data.vgv ? Number(data.vgv) : undefined,
          precoMedioM2: data.precoMedioM2 ? Number(data.precoMedioM2) : undefined,
          velocidadeVendas: data.velocidadeVendas ? Number(data.velocidadeVendas) : undefined,
        });
      }

      if (data.tmaUtilizada || data.capitalDisponivel) {
        await saveFinanceEngineMutation.mutateAsync({
          projectId: project.id,
          tmaUtilizada: data.tmaUtilizada ? Number(data.tmaUtilizada) : undefined,
          capitalDisponivel: data.capitalDisponivel ? Number(data.capitalDisponivel) : undefined,
        });
      }

      if (data.regimeTributario) {
        await saveTaxEngineMutation.mutateAsync({
          projectId: project.id,
          regimeTributario: data.regimeTributario,
        });
      }

      toast.success("Estudo de viabilidade criado com sucesso!");
      onOpenChange(false);
      onSuccess?.();
      setData(WIZARD_DATA_DEFAULTS);
      setCurrentStep("info");
    } catch (error) {
      toast.error(`Erro ao criar estudo: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateData = (key: keyof WizardData, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const stepIndex = (id: Step) => STEPS.findIndex((s) => s.id === id);
  const canAdvance = () => validateCurrentStep();
  const isCreating = isSaving;

  const renderStepContent = () => {
    switch (currentStep) {
      case "info":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome do Empreendimento *</Label>
              <Input
                id="name"
                placeholder="Ex: Loteamento Residencial Alphaville"
                value={data.name}
                onChange={(e) => updateData("name", e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="type">Tipo de Empreendimento *</Label>
              <Select value={data.type} onValueChange={(value) => updateData("type", value as any)}>
                <SelectTrigger id="type" className="mt-2">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="loteamento">Loteamento</SelectItem>
                  <SelectItem value="condominio">Condomínio</SelectItem>
                  <SelectItem value="incorporacao">Incorporação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="location">Localização</Label>
              <Input
                id="location"
                placeholder="Ex: São Paulo, SP"
                value={data.location}
                onChange={(e) => updateData("location", e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva o empreendimento..."
                value={data.description}
                onChange={(e) => updateData("description", e.target.value)}
                className="mt-2"
                rows={3}
              />
            </div>
          </div>
        );
      case "geo":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="areaBruta">Área Bruta da Gleba (m²) *</Label>
                <Input
                  id="areaBruta"
                  type="number"
                  placeholder="0"
                  value={data.areaBruta}
                  onChange={(e) => updateData("areaBruta", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="areaAPP">APP / Reserva Legal (m²)</Label>
                <Input
                  id="areaAPP"
                  type="number"
                  placeholder="0"
                  value={data.areaAPP}
                  onChange={(e) => updateData("areaAPP", e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">Deduzida da gleba antes dos percentuais de área pública</p>
              </div>
              <div>
                <Label htmlFor="percentualVerde">Área Verde (%)</Label>
                <Input
                  id="percentualVerde"
                  type="number"
                  placeholder="15"
                  value={data.percentualVerde}
                  onChange={(e) => updateData("percentualVerde", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="percentualInstitucional">Área Institucional (%)</Label>
                <Input
                  id="percentualInstitucional"
                  type="number"
                  placeholder="5"
                  value={data.percentualInstitucional}
                  onChange={(e) => updateData("percentualInstitucional", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="percentualSistemaViario">Sistema Viário (%)</Label>
                <Input
                  id="percentualSistemaViario"
                  type="number"
                  placeholder="20"
                  value={data.percentualSistemaViario}
                  onChange={(e) => updateData("percentualSistemaViario", e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <Label htmlFor="modoLotes">Quantidade de Lotes</Label>
              <Select value={data.modoLotes} onValueChange={(value) => updateData("modoLotes", value as any)}>
                <SelectTrigger id="modoLotes" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatico">Automático (área ÷ lote-alvo)</SelectItem>
                  <SelectItem value="manual">Manual (informar quantidade)</SelectItem>
                </SelectContent>
              </Select>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {data.modoLotes === "automatico" ? (
                  <div>
                    <Label htmlFor="areaMediaLoteAlvo">Área Média do Lote-Alvo (m²) *</Label>
                    <Input
                      id="areaMediaLoteAlvo"
                      type="number"
                      placeholder="250"
                      value={data.areaMediaLoteAlvo}
                      onChange={(e) => updateData("areaMediaLoteAlvo", e.target.value)}
                      className="mt-2"
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="numeroLotesManual">Número de Lotes *</Label>
                    <Input
                      id="numeroLotesManual"
                      type="number"
                      placeholder="0"
                      value={data.numeroLotesManual}
                      onChange={(e) => updateData("numeroLotesManual", e.target.value)}
                      className="mt-2"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case "cost":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="terraplanagem">Terraplanagem (R$/m²)</Label>
                <Input
                  id="terraplanagem"
                  type="number"
                  placeholder="0"
                  value={data.terraplanagem}
                  onChange={(e) => updateData("terraplanagem", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="pavimentacao">Pavimentação (R$/m²)</Label>
                <Input
                  id="pavimentacao"
                  type="number"
                  placeholder="0"
                  value={data.pavimentacao}
                  onChange={(e) => updateData("pavimentacao", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="agua">Rede de Água (R$/m)</Label>
                <Input
                  id="agua"
                  type="number"
                  placeholder="0"
                  value={data.agua}
                  onChange={(e) => updateData("agua", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="esgoto">Rede de Esgoto (R$/m)</Label>
                <Input
                  id="esgoto"
                  type="number"
                  placeholder="0"
                  value={data.esgoto}
                  onChange={(e) => updateData("esgoto", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="energia">Energia Elétrica (R$/m)</Label>
                <Input
                  id="energia"
                  type="number"
                  placeholder="0"
                  value={data.energia}
                  onChange={(e) => updateData("energia", e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        );
      case "sales":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vgv">VGV Total (R$) *</Label>
                <Input
                  id="vgv"
                  type="number"
                  placeholder="0"
                  value={data.vgv}
                  onChange={(e) => updateData("vgv", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="precoMedioM2">Preço Médio (R$/m²)</Label>
                <Input
                  id="precoMedioM2"
                  type="number"
                  placeholder="0"
                  value={data.precoMedioM2}
                  onChange={(e) => updateData("precoMedioM2", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="velocidadeVendas">Velocidade de Vendas (un/mês)</Label>
                <Input
                  id="velocidadeVendas"
                  type="number"
                  placeholder="0"
                  value={data.velocidadeVendas}
                  onChange={(e) => updateData("velocidadeVendas", e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        );
      case "finance":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tmaUtilizada">TMA Utilizada (%) *</Label>
                <Input
                  id="tmaUtilizada"
                  type="number"
                  placeholder="0"
                  value={data.tmaUtilizada}
                  onChange={(e) => updateData("tmaUtilizada", e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="capitalDisponivel">Capital Disponível (R$)</Label>
                <Input
                  id="capitalDisponivel"
                  type="number"
                  placeholder="0"
                  value={data.capitalDisponivel}
                  onChange={(e) => updateData("capitalDisponivel", e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
          </div>
        );
      case "tax":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="regimeTributario">Regime Tributário *</Label>
              <Select value={data.regimeTributario} onValueChange={(value) => updateData("regimeTributario", value as any)}>
                <SelectTrigger id="regimeTributario" className="mt-2">
                  <SelectValue placeholder="Selecione o regime" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ret">RET (4%)</SelectItem>
                  <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                  <SelectItem value="lucro_real">Lucro Real (IBS/CBS)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case "review":
        return (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Revise todos os dados antes de criar o estudo. Você poderá editá-los depois.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Nome</p>
                <p className="font-semibold">{data.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tipo</p>
                <p className="font-semibold capitalize">{data.type}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Localização</p>
                <p className="font-semibold">{data.location || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Regime Tributário</p>
                <p className="font-semibold capitalize">{data.regimeTributario.replace(/_/g, " ") || "-"}</p>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${isMobile ? "max-w-full h-screen rounded-none" : "max-w-4xl"} max-h-[95vh] overflow-hidden flex flex-col p-0`}>
        {/* Header */}
        <div className={`bg-gradient-to-r from-primary/5 to-secondary/5 border-b border-border/40 ${isMobile ? "px-4 py-4" : "px-8 py-6"}`}>
          <DialogTitle className={isMobile ? "text-lg font-bold" : "text-2xl font-bold"}>Novo Estudo de Viabilidade</DialogTitle>
          <DialogDescription className={`mt-1 ${isMobile ? "text-xs" : ""}`}>
            Crie um novo estudo seguindo as etapas do assistente inteligente
          </DialogDescription>
        </div>

        {/* Progress Bar */}
        <div className={`bg-background border-b border-border/40 ${isMobile ? "px-4 py-3" : "px-8 py-4"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-muted-foreground ${isMobile ? "text-xs" : "text-sm"}`}>
              Etapa {currentStepIndex + 1} de {STEPS.length}
            </span>
            <span className={`font-semibold ${isMobile ? "text-xs" : "text-sm"}`}>{STEPS[currentStepIndex].title}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className={`flex flex-1 overflow-hidden ${isMobile ? "flex-col" : ""}`}>
          {/* Sidebar - Step Navigator */}
          {!isMobile && (
            <div className="w-64 border-r border-border/40 bg-muted/30 p-6 overflow-y-auto">
              <div className="space-y-3">
                {STEPS.map((step, index) => {
                  const isActive = currentStep === step.id;
                  const isCompleted = stepIndex(step.id) < stepIndex(currentStep);
                  return (
                    <button
                      key={step.id}
                      onClick={() => setCurrentStep(step.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all text-sm ${
                        isActive
                          ? "bg-primary text-primary-foreground font-semibold"
                          : isCompleted
                            ? "bg-success/20 text-success hover:bg-success/30"
                            : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0">{step.icon}</div>
                        <span className="truncate">{step.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mobile Step Tabs */}
          {isMobile && (
            <div className="border-b border-border/40 bg-muted/30 px-4 py-3 overflow-x-auto">
              <div className="flex gap-2">
                {STEPS.map((step) => {
                  const isActive = currentStep === step.id;
                  const isCompleted = stepIndex(step.id) < stepIndex(currentStep);
                  return (
                    <button
                      key={step.id}
                      onClick={() => setCurrentStep(step.id)}
                      className={`px-3 py-2 rounded-lg transition-all text-xs whitespace-nowrap ${
                        isActive
                          ? "bg-primary text-primary-foreground font-semibold"
                          : isCompleted
                            ? "bg-success/20 text-success"
                            : "hover:bg-accent"
                      }`}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className={`flex-1 overflow-y-auto ${isMobile ? "px-4 py-4" : "px-8 py-6"}`}>
            {renderStepContent()}
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`border-t border-border/40 bg-background ${isMobile ? "px-4 py-3" : "px-8 py-4"}`}>
          <div className={`flex gap-3 ${isMobile ? "flex-col-reverse" : "justify-end"}`}>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className={isMobile ? "w-full" : ""}
            >
              Cancelar
            </Button>
            {currentStep !== "info" && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className={isMobile ? "w-full" : ""}
              >
                Anterior
              </Button>
            )}
            {currentStep !== "review" && (
              <Button
                onClick={handleNext}
                disabled={!canAdvance()}
                className={isMobile ? "w-full" : ""}
              >
                Próximo <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {currentStep === "review" && (
              <Button
                onClick={handleFinish}
                disabled={isCreating}
                className={isMobile ? "w-full" : ""}
              >
                {isCreating ? "Criando..." : "Criar Estudo"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
