"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, ChevronRight, Building2, Hammer, TrendingUp, DollarSign, FileText, MapPin } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useMobile";

type Step = "info" | "geo" | "cost" | "sales" | "finance" | "tax" | "review";

interface WizardData {
  // Informações
  name: string;
  description: string;
  type: "loteamento" | "condominio" | "incorporacao" | "";
  location: string;

  // GeoEngine
  areaBruta: string;
  areaAPP: string;
  percentualVerde: string;
  percentualInstitucional: string;
  percentualSistemaViario: string;
  modoLotes: "automatico" | "manual";
  areaMediaLoteAlvo: string;
  numeroLotesManual: string;

  // CostEngine
  tipologia: "loteamento_popular" | "loteamento_aberto" | "condominio_fechado" | "condominio_chacaras";
  topografia: "plana" | "ondulada" | "acidentada";
  padraoPavimentacao: "asfalto" | "paver";
  solucaoEsgoto: "fossa" | "rede_publica" | "ete_propria";
  necessitaElevatoria: boolean;
  solucaoAgua: "poco" | "rede_publica";
  isChacara: boolean;
  areaSupressaoVegetalM2: string;
  arvoresIsoladasUn: string;
  participacaoEletrica: "cliente_paga" | "concessionaria_cobre";
  contingenciaPercentual: string;
  custoFinanceiroPercentual: string;

  // SalesEngine
  modoPreco: "automatico" | "manual";
  agioPercentual: string;
  precoManualM2: string;
  modoAbsorcao: "automatico" | "manual";
  absorcaoManualLotesMes: string;
  comissaoPercentual: string;
  marketingPercentual: string;
  impostosPercentual: string;
  inadimplenciaPercentual: string;
  despesasAdministrativasPercentual: string;

  // FinanceEngine
  duracaoAprovacoesMeses: string;
  inicioVendasMes: string;
  curvaVendas: "constante" | "rampa" | "curva_s";
  percentualEntrada: string;
  numeroParcelas: string;
  tmaAnual: string;
  reinvestirCaixaPositivo: boolean;
  custosIndexados: boolean;
  indiceCustosAnualFracao: string;
  recebiveisIndexados: boolean;
  indiceRecebiveisAnualFracao: string;
  capexAprovacoesTotal: string;
  curvaObra: "linear" | "curva_s";

  // TaxEngine (ainda não é motor de cálculo — só gravação simples)
  regimeTributario: "ret" | "lucro_presumido" | "lucro_real" | "";
  patrimonioAfetacao: boolean;
}

const WIZARD_DATA_DEFAULTS: WizardData = {
  name: "",
  description: "",
  type: "",
  location: "",

  areaBruta: "",
  areaAPP: "",
  // vazios = seguem a legislação do município (ou o piso federal, com aviso)
  percentualVerde: "",
  percentualInstitucional: "",
  percentualSistemaViario: "",
  modoLotes: "automatico",
  areaMediaLoteAlvo: "",
  numeroLotesManual: "",

  tipologia: "loteamento_aberto",
  topografia: "plana",
  padraoPavimentacao: "asfalto",
  solucaoEsgoto: "rede_publica",
  necessitaElevatoria: false,
  solucaoAgua: "rede_publica",
  isChacara: false,
  areaSupressaoVegetalM2: "",
  arvoresIsoladasUn: "",
  participacaoEletrica: "concessionaria_cobre",
  // vazios = valor vigente da Configuração (hoje 5% e 6%)
  contingenciaPercentual: "",
  custoFinanceiroPercentual: "",

  modoPreco: "automatico",
  agioPercentual: "0",
  precoManualM2: "",
  modoAbsorcao: "automatico",
  absorcaoManualLotesMes: "",
  comissaoPercentual: "6",
  marketingPercentual: "3",
  impostosPercentual: "6",
  inadimplenciaPercentual: "5",
  despesasAdministrativasPercentual: "4",

  duracaoAprovacoesMeses: "", // vazio = derivado da Configuração (base + adicionais por gatilho)
  inicioVendasMes: "", // vazio = padrão da Configuração
  curvaVendas: "curva_s",
  percentualEntrada: "20",
  numeroParcelas: "120",
  tmaAnual: "14",
  reinvestirCaixaPositivo: false,
  custosIndexados: true,
  indiceCustosAnualFracao: "",
  recebiveisIndexados: true,
  indiceRecebiveisAnualFracao: "",
  capexAprovacoesTotal: "", // vazio = calculado pelo módulo 2.5; preenchido = override manual
  curvaObra: "curva_s",

  regimeTributario: "",
  patrimonioAfetacao: true,
};

/** Campos que a UI mostra como percentual "0 a 100" mas a API espera como fração "0 a 1". */
function frac(v: string): number | undefined {
  if (!v) return undefined;
  return Number(v) / 100;
}

const STEPS: { id: Step; label: string; title: string; description: string; icon: React.ReactNode }[] = [
  { id: "info", label: "Informações", title: "Dados Básicos", description: "Nome, tipo e localização do empreendimento", icon: <Building2 className="w-5 h-5" /> },
  { id: "geo", label: "Urbanístico", title: "GeoEngine", description: "Análise de áreas conforme Lei 6.766/79", icon: <MapPin className="w-5 h-5" /> },
  { id: "cost", label: "Engenharia", title: "CostEngine", description: "Orçamento de infraestrutura", icon: <Hammer className="w-5 h-5" /> },
  { id: "sales", label: "Comercial", title: "SalesEngine", description: "VGV e projeção de vendas", icon: <TrendingUp className="w-5 h-5" /> },
  { id: "finance", label: "Financeiro", title: "FinanceEngine", description: "Fluxo de caixa, VPL, TIR e indicadores", icon: <DollarSign className="w-5 h-5" /> },
  { id: "tax", label: "Tributário", title: "TaxEngine", description: "RET, Lucro Presumido, IBS/CBS", icon: <FileText className="w-5 h-5" /> },
  { id: "review", label: "Revisão", title: "Confirmar", description: "Revise os dados antes de criar", icon: <CheckCircle2 className="w-5 h-5" /> },
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
  // Se um estudo anterior falhou no meio do cálculo (ex.: CostEngine rejeitou
  // um input), o projeto já foi criado — reaproveita o mesmo id ao tentar de
  // novo, em vez de criar um segundo projeto órfão a cada retry.
  const createdProjectIdRef = useRef<number | null>(null);

  const createProjectMutation = trpc.projects.create.useMutation();
  const calculateGeoEngineMutation = trpc.geoEngine.calculate.useMutation();
  const calculateCostEngineMutation = trpc.costEngine.calculate.useMutation();
  const calculateSalesEngineMutation = trpc.salesEngine.calculate.useMutation();
  const calculateFinanceEngineMutation = trpc.financeEngine.calculate.useMutation();
  const calculateTaxEngineMutation = trpc.taxEngine.calculate.useMutation();
  const seedApprovalsMutation = trpc.approvals.seed.useMutation();

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  /**
   * Validação pura (sem efeito colateral) usada para habilitar/desabilitar o
   * botão "Próximo" — NUNCA chamar direto no JSX de uma função que dispara
   * toast, porque o React re-executa o render (e portanto essa checagem) a
   * cada keystroke, o que faria o toast de erro repetir a cada digitação.
   */
  const getStepValidationError = (): string | null => {
    switch (currentStep) {
      case "info":
        if (!data.name.trim()) return "Preencha o nome do empreendimento";
        if (!data.type) return "Selecione o tipo de empreendimento";
        return null;
      case "geo":
        if (!data.areaBruta || Number(data.areaBruta) <= 0) return "Preencha a área bruta";
        if (data.modoLotes === "automatico" && (!data.areaMediaLoteAlvo || Number(data.areaMediaLoteAlvo) <= 0)) {
          return "Preencha a área média do lote-alvo (modo automático)";
        }
        if (data.modoLotes === "manual" && (!data.numeroLotesManual || Number(data.numeroLotesManual) <= 0)) {
          return "Preencha o número de lotes (modo manual)";
        }
        return null;
      case "cost":
        return null;
      case "sales":
        if (data.modoPreco === "manual" && (!data.precoManualM2 || Number(data.precoManualM2) <= 0)) {
          return "Preencha o preço manual (R$/m²)";
        }
        if (data.modoAbsorcao === "manual" && (!data.absorcaoManualLotesMes || Number(data.absorcaoManualLotesMes) <= 0)) {
          return "Preencha a absorção manual (lotes/mês)";
        }
        return null;
      case "finance":
        if (!data.tmaAnual || Number(data.tmaAnual) <= 0) return "Preencha a Taxa Mínima de Atratividade (% a.a.)";
        return null;
      case "tax":
        if (!data.regimeTributario) return "Selecione o regime tributário";
        return null;
      default:
        return null;
    }
  };

  const isStepValid = (): boolean => getStepValidationError() === null;

  const validateCurrentStep = (): boolean => {
    const error = getStepValidationError();
    if (error) {
      toast.error(error);
      return false;
    }
    return true;
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
    if (!validateCurrentStep()) return;

    setIsSaving(true);
    try {
      let project: { id: number } | undefined;
      if (createdProjectIdRef.current !== null) {
        project = { id: createdProjectIdRef.current };
      } else {
        const created = await createProjectMutation.mutateAsync({
          name: data.name,
          description: data.description,
          type: data.type,
          location: data.location,
        });
        if (!created) throw new Error("Falha ao criar o projeto");
        createdProjectIdRef.current = created.id;
        project = created;
      }

      // 1) GeoEngine — área, lotes, densidade. Todo o resto depende disto.
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

      // 1b) Checklist de aprovações (FASE 2, spec seção 3) — semeado a partir
      // do checklist GRAPROHAB que o GeoEngine acabou de calcular.
      await seedApprovalsMutation.mutateAsync({ projectId: project.id });

      // 2) CostEngine — orçamento parametrizado com toda a lógica condicional. Depende do GeoEngine.
      await calculateCostEngineMutation.mutateAsync({
        projectId: project.id,
        topografia: data.topografia,
        padraoPavimentacao: data.padraoPavimentacao,
        solucaoEsgoto: data.solucaoEsgoto,
        necessitaElevatoria: data.solucaoEsgoto === "rede_publica" ? data.necessitaElevatoria : undefined,
        solucaoAgua: data.solucaoAgua,
        isChacara: data.tipologia === "condominio_chacaras" ? data.isChacara : undefined,
        areaSupressaoVegetalM2: data.areaSupressaoVegetalM2 ? Number(data.areaSupressaoVegetalM2) : undefined,
        arvoresIsoladasUn: data.arvoresIsoladasUn ? Number(data.arvoresIsoladasUn) : undefined,
        tipologia: data.tipologia,
        participacaoEletrica: data.participacaoEletrica,
        contingenciaPercentual: data.contingenciaPercentual ? Number(data.contingenciaPercentual) : undefined,
        custoFinanceiroPercentual: data.custoFinanceiroPercentual ? Number(data.custoFinanceiroPercentual) : undefined,
        custoAprovacoesTotal: data.capexAprovacoesTotal ? Number(data.capexAprovacoesTotal) : undefined,
      });

      // 3) SalesEngine — preço, VGV, absorção. Depende do GeoEngine (lotes/área média).
      const salesOutput = await calculateSalesEngineMutation.mutateAsync({
        projectId: project.id,
        tipologia: data.tipologia,
        modoPreco: data.modoPreco,
        agioPercentual: data.modoPreco === "automatico" ? frac(data.agioPercentual) : undefined,
        precoManualM2: data.modoPreco === "manual" ? Number(data.precoManualM2) : undefined,
        modoAbsorcao: data.modoAbsorcao,
        absorcaoManualLotesMes: data.modoAbsorcao === "manual" ? Number(data.absorcaoManualLotesMes) : undefined,
        comissaoPercentual: frac(data.comissaoPercentual) ?? 0,
        marketingPercentual: frac(data.marketingPercentual) ?? 0,
        impostosPercentual: frac(data.impostosPercentual) ?? 0,
        inadimplenciaPercentual: frac(data.inadimplenciaPercentual) ?? 0,
        despesasAdministrativasPercentual: frac(data.despesasAdministrativasPercentual) ?? 0,
      });

      // 4) FinanceEngine — fluxo de caixa de 120 meses, VPL/TIR/payback. Depende do GeoEngine + CostEngine;
      // usa o preço/prazo de vendas que o SalesEngine acabou de calcular (não redigitado).
      await calculateFinanceEngineMutation.mutateAsync({
        projectId: project.id,
        duracaoAprovacoesMeses: data.duracaoAprovacoesMeses ? Number(data.duracaoAprovacoesMeses) : undefined,
        inicioVendasMes: data.inicioVendasMes ? Number(data.inicioVendasMes) : undefined,
        precoBrutoPorLote: salesOutput.precoBrutoPorLote,
        prazoVendasMeses: salesOutput.prazoVendasMeses,
        curvaVendas: data.curvaVendas,
        percentualDeducoesVenda: salesOutput.percentualDeducoesVenda,
        percentualEntrada: frac(data.percentualEntrada) ?? 0.2,
        numeroParcelas: Number(data.numeroParcelas),
        tmaAnualFracao: frac(data.tmaAnual) ?? 0.14,
        reinvestirCaixaPositivo: data.reinvestirCaixaPositivo,
        custosIndexados: data.custosIndexados,
        indiceCustosAnualFracao: data.custosIndexados ? frac(data.indiceCustosAnualFracao) : undefined,
        recebiveisIndexados: data.recebiveisIndexados,
        indiceRecebiveisAnualFracao: data.recebiveisIndexados ? frac(data.indiceRecebiveisAnualFracao) : undefined,
        capexAprovacoesTotal: data.capexAprovacoesTotal ? Number(data.capexAprovacoesTotal) : undefined,
        curvaObra: data.curvaObra,
      });

      // 5) TaxEngine — impostos sobre a receita real (SalesEngine) e o lucro
      // real (FinanceEngine) que os motores anteriores acabaram de calcular.
      if (data.regimeTributario) {
        await calculateTaxEngineMutation.mutateAsync({
          projectId: project.id,
          regime: data.regimeTributario,
          patrimonioAfetacao: data.patrimonioAfetacao,
        });
      }

      toast.success("Estudo de viabilidade criado e calculado com sucesso!");
      createdProjectIdRef.current = null;
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

  const updateData = <K extends keyof WizardData>(key: K, value: WizardData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const stepIndex = (id: Step) => STEPS.findIndex((s) => s.id === id);
  const canAdvance = () => isStepValid();
  const isCreating = isSaving;

  const renderStepContent = () => {
    switch (currentStep) {
      case "info":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Nome do Empreendimento *</Label>
              <Input id="name" placeholder="Ex: Loteamento Residencial Alphaville" value={data.name} onChange={(e) => updateData("name", e.target.value)} className="mt-2" />
            </div>
            <div>
              <Label htmlFor="type">Tipo de Empreendimento *</Label>
              <Select value={data.type} onValueChange={(value) => updateData("type", value as WizardData["type"])}>
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
              <Input id="location" placeholder="Ex: Formosa, GO" value={data.location} onChange={(e) => updateData("location", e.target.value)} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">A UF (ex: ", GO") é usada para buscar custos unitários regionais quando disponíveis</p>
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" placeholder="Descreva o empreendimento..." value={data.description} onChange={(e) => updateData("description", e.target.value)} className="mt-2" rows={3} />
            </div>
          </div>
        );

      case "geo":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="areaBruta">Área Bruta da Gleba (m²) *</Label>
                <Input id="areaBruta" type="number" placeholder="0" value={data.areaBruta} onChange={(e) => updateData("areaBruta", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="areaAPP">APP / Reserva Legal (m²)</Label>
                <Input id="areaAPP" type="number" placeholder="0" value={data.areaAPP} onChange={(e) => updateData("areaAPP", e.target.value)} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">Deduzida da gleba antes dos percentuais de área pública</p>
              </div>
              <div>
                <Label htmlFor="percentualVerde">Área Verde (%)</Label>
                <Input id="percentualVerde" type="number" placeholder="Conforme legislação" value={data.percentualVerde} onChange={(e) => updateData("percentualVerde", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="percentualInstitucional">Área Institucional (%)</Label>
                <Input id="percentualInstitucional" type="number" placeholder="Conforme legislação" value={data.percentualInstitucional} onChange={(e) => updateData("percentualInstitucional", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="percentualSistemaViario">Sistema Viário (%)</Label>
                <Input id="percentualSistemaViario" type="number" placeholder="Conforme legislação" value={data.percentualSistemaViario} onChange={(e) => updateData("percentualSistemaViario", e.target.value)} className="mt-2" />
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-muted-foreground">
                  Deixe os percentuais em branco para seguir a legislação do município informado em Localização
                  (ou o piso federal da Lei 6.766/79, com aviso, se o município não estiver cadastrado na
                  Configuração). Preencha para adotar uma premissa própria do projeto — um valor acima do mínimo
                  é permitido; abaixo do mínimo o sistema calcula, mas emite alerta de não conformidade.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <Label htmlFor="modoLotes">Quantidade de Lotes</Label>
              <Select value={data.modoLotes} onValueChange={(value) => updateData("modoLotes", value as WizardData["modoLotes"])}>
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
                    <Input id="areaMediaLoteAlvo" type="number" placeholder="250" value={data.areaMediaLoteAlvo} onChange={(e) => updateData("areaMediaLoteAlvo", e.target.value)} className="mt-2" />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="numeroLotesManual">Número de Lotes *</Label>
                    <Input id="numeroLotesManual" type="number" placeholder="0" value={data.numeroLotesManual} onChange={(e) => updateData("numeroLotesManual", e.target.value)} className="mt-2" />
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
                <Label htmlFor="tipologia">Tipologia *</Label>
                <Select value={data.tipologia} onValueChange={(value) => updateData("tipologia", value as WizardData["tipologia"])}>
                  <SelectTrigger id="tipologia" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="loteamento_popular">Loteamento Popular</SelectItem>
                    <SelectItem value="loteamento_aberto">Loteamento Aberto</SelectItem>
                    <SelectItem value="condominio_fechado">Condomínio Fechado</SelectItem>
                    <SelectItem value="condominio_chacaras">Condomínio de Chácaras</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Define preço/absorção padrão e se muro/portaria/lazer entram no orçamento</p>
              </div>
              <div>
                <Label htmlFor="topografia">Topografia *</Label>
                <Select value={data.topografia} onValueChange={(value) => updateData("topografia", value as WizardData["topografia"])}>
                  <SelectTrigger id="topografia" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plana">Plana</SelectItem>
                    <SelectItem value="ondulada">Ondulada</SelectItem>
                    <SelectItem value="acidentada">Acidentada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="padraoPavimentacao">Padrão de Pavimentação *</Label>
                <Select value={data.padraoPavimentacao} onValueChange={(value) => updateData("padraoPavimentacao", value as WizardData["padraoPavimentacao"])}>
                  <SelectTrigger id="padraoPavimentacao" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asfalto">Asfalto (TSD/CBUQ)</SelectItem>
                    <SelectItem value="paver">Paver (Intertravado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="participacaoEletrica">Participação Financeira Rede Elétrica *</Label>
                <Select value={data.participacaoEletrica} onValueChange={(value) => updateData("participacaoEletrica", value as WizardData["participacaoEletrica"])}>
                  <SelectTrigger id="participacaoEletrica" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cliente_paga">Cliente paga</SelectItem>
                    <SelectItem value="concessionaria_cobre">Concessionária cobre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-2 border-t border-border/40 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="solucaoAgua">Solução de Água *</Label>
                <Select value={data.solucaoAgua} onValueChange={(value) => updateData("solucaoAgua", value as WizardData["solucaoAgua"])}>
                  <SelectTrigger id="solucaoAgua" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rede_publica">Rede Pública</SelectItem>
                    <SelectItem value="poco">Poço Artesiano + Reservatório</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {data.solucaoAgua === "poco" && data.tipologia === "condominio_chacaras" && (
                <div className="flex items-center gap-3 mt-2 md:mt-8">
                  <Switch checked={data.isChacara} onCheckedChange={(v) => updateData("isChacara", v)} id="isChacara" />
                  <Label htmlFor="isChacara" className="font-normal">Proprietário executa a ligação domiciliar por conta própria</Label>
                </div>
              )}
              <div>
                <Label htmlFor="solucaoEsgoto">Solução de Esgoto *</Label>
                <Select value={data.solucaoEsgoto} onValueChange={(value) => updateData("solucaoEsgoto", value as WizardData["solucaoEsgoto"])}>
                  <SelectTrigger id="solucaoEsgoto" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rede_publica">Rede Pública</SelectItem>
                    <SelectItem value="fossa">Fossa Séptica</SelectItem>
                    <SelectItem value="ete_propria">ETE Própria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {data.solucaoEsgoto === "rede_publica" && (
                <div className="flex items-center gap-3 mt-2 md:mt-8">
                  <Switch checked={data.necessitaElevatoria} onCheckedChange={(v) => updateData("necessitaElevatoria", v)} id="necessitaElevatoria" />
                  <Label htmlFor="necessitaElevatoria" className="font-normal">Necessita estação elevatória</Label>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-border/40 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="areaSupressaoVegetalM2">Área de Supressão Vegetal (m²)</Label>
                <Input id="areaSupressaoVegetalM2" type="number" placeholder="0" value={data.areaSupressaoVegetalM2} onChange={(e) => updateData("areaSupressaoVegetalM2", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="arvoresIsoladasUn">Árvores Isoladas a Suprimir (un)</Label>
                <Input id="arvoresIsoladasUn" type="number" placeholder="0" value={data.arvoresIsoladasUn} onChange={(e) => updateData("arvoresIsoladasUn", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="contingenciaPercentual">Contingência sobre a Obra (%)</Label>
                <Input id="contingenciaPercentual" type="number" placeholder="Conforme Configuração" value={data.contingenciaPercentual} onChange={(e) => updateData("contingenciaPercentual", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="custoFinanceiroPercentual">Custo Financeiro (% s/ infra)</Label>
                <Input id="custoFinanceiroPercentual" type="number" placeholder="Conforme Configuração" value={data.custoFinanceiroPercentual} onChange={(e) => updateData("custoFinanceiroPercentual", e.target.value)} className="mt-2" />
              </div>
            </div>
          </div>
        );

      case "sales":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="modoPreco">Preço de Venda</Label>
              <Select value={data.modoPreco} onValueChange={(value) => updateData("modoPreco", value as WizardData["modoPreco"])}>
                <SelectTrigger id="modoPreco" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatico">Automático (matriz de tipologia × ágio)</SelectItem>
                  <SelectItem value="manual">Manual (pesquisa de mercado)</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {data.modoPreco === "automatico" ? (
                  <div>
                    <Label htmlFor="agioPercentual">Ágio / Desconto Regional (%)</Label>
                    <Input id="agioPercentual" type="number" placeholder="0" value={data.agioPercentual} onChange={(e) => updateData("agioPercentual", e.target.value)} className="mt-2" />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="precoManualM2">Preço Manual (R$/m²) *</Label>
                    <Input id="precoManualM2" type="number" placeholder="0" value={data.precoManualM2} onChange={(e) => updateData("precoManualM2", e.target.value)} className="mt-2" />
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <Label htmlFor="modoAbsorcao">Absorção de Vendas</Label>
              <Select value={data.modoAbsorcao} onValueChange={(value) => updateData("modoAbsorcao", value as WizardData["modoAbsorcao"])}>
                <SelectTrigger id="modoAbsorcao" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatico">Automático (velocidade padrão por tipologia)</SelectItem>
                  <SelectItem value="manual">Manual (lotes/mês)</SelectItem>
                </SelectContent>
              </Select>
              {data.modoAbsorcao === "manual" && (
                <div className="mt-4">
                  <Label htmlFor="absorcaoManualLotesMes">Absorção Manual (lotes/mês) *</Label>
                  <Input id="absorcaoManualLotesMes" type="number" placeholder="0" value={data.absorcaoManualLotesMes} onChange={(e) => updateData("absorcaoManualLotesMes", e.target.value)} className="mt-2" />
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-border/40">
              <p className="text-sm font-semibold mb-3">Deduções sobre Venda (%)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="comissaoPercentual">Comissão</Label>
                  <Input id="comissaoPercentual" type="number" value={data.comissaoPercentual} onChange={(e) => updateData("comissaoPercentual", e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="marketingPercentual">Marketing</Label>
                  <Input id="marketingPercentual" type="number" value={data.marketingPercentual} onChange={(e) => updateData("marketingPercentual", e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="impostosPercentual">Impostos</Label>
                  <Input id="impostosPercentual" type="number" value={data.impostosPercentual} onChange={(e) => updateData("impostosPercentual", e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="inadimplenciaPercentual">Inadimplência</Label>
                  <Input id="inadimplenciaPercentual" type="number" value={data.inadimplenciaPercentual} onChange={(e) => updateData("inadimplenciaPercentual", e.target.value)} className="mt-2" />
                </div>
                <div>
                  <Label htmlFor="despesasAdministrativasPercentual">Despesas Adm.</Label>
                  <Input id="despesasAdministrativasPercentual" type="number" value={data.despesasAdministrativasPercentual} onChange={(e) => updateData("despesasAdministrativasPercentual", e.target.value)} className="mt-2" />
                </div>
              </div>
            </div>
          </div>
        );

      case "finance":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tmaAnual">TMA — Custo de Capital (% a.a.) *</Label>
                <Input id="tmaAnual" type="number" placeholder="14" value={data.tmaAnual} onChange={(e) => updateData("tmaAnual", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="duracaoAprovacoesMeses">Prazo de Aprovações (meses)</Label>
                <Input
                  id="duracaoAprovacoesMeses"
                  type="number"
                  placeholder="Calculado automaticamente"
                  value={data.duracaoAprovacoesMeses}
                  onChange={(e) => updateData("duracaoAprovacoesMeses", e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe em branco para usar o prazo da Configuração: prazo base + adicionais por gatilho
                  (ETE própria, supressão vegetal, condomínio fechado).
                </p>
              </div>
              <div>
                <Label htmlFor="inicioVendasMes">Início das Vendas (mês)</Label>
                <Input id="inicioVendasMes" type="number" placeholder="Conforme Configuração" value={data.inicioVendasMes} onChange={(e) => updateData("inicioVendasMes", e.target.value)} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  Em branco usa o padrão da Configuração. Vendas podem começar antes do fim das aprovações
                  (pré-lançamento) — este campo não é amarrado ao prazo de aprovações.
                </p>
              </div>
              <div>
                <Label htmlFor="capexAprovacoesTotal">Custo de Aprovações (R$)</Label>
                <Input
                  id="capexAprovacoesTotal"
                  type="number"
                  placeholder="Calculado automaticamente"
                  value={data.capexAprovacoesTotal}
                  onChange={(e) => updateData("capexAprovacoesTotal", e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe em branco para calcular automaticamente (área da gleba × índices R$/m² da Configuração,
                  com os condicionais de supressão, poço e solução de esgoto). Preencha só para forçar um valor.
                </p>
              </div>
              <div>
                <Label htmlFor="curvaVendas">Curva de Vendas</Label>
                <Select value={data.curvaVendas} onValueChange={(value) => updateData("curvaVendas", value as WizardData["curvaVendas"])}>
                  <SelectTrigger id="curvaVendas" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="constante">Constante</SelectItem>
                    <SelectItem value="rampa">Rampa</SelectItem>
                    <SelectItem value="curva_s">Curva S</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="curvaObra">Curva Física de Obra</Label>
                <Select value={data.curvaObra} onValueChange={(value) => updateData("curvaObra", value as WizardData["curvaObra"])}>
                  <SelectTrigger id="curvaObra" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="curva_s">Curva S (por disciplina)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="percentualEntrada">Entrada no Ato da Venda (%)</Label>
                <Input id="percentualEntrada" type="number" placeholder="20" value={data.percentualEntrada} onChange={(e) => updateData("percentualEntrada", e.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="numeroParcelas">Número de Parcelas</Label>
                <Input id="numeroParcelas" type="number" placeholder="120" value={data.numeroParcelas} onChange={(e) => updateData("numeroParcelas", e.target.value)} className="mt-2" />
              </div>
            </div>

            <div className="pt-2 border-t border-border/40 space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={data.reinvestirCaixaPositivo} onCheckedChange={(v) => updateData("reinvestirCaixaPositivo", v)} id="reinvestirCaixaPositivo" />
                <Label htmlFor="reinvestirCaixaPositivo" className="font-normal">Reinvestir caixa positivo à TMA mensal</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={data.custosIndexados} onCheckedChange={(v) => updateData("custosIndexados", v)} id="custosIndexados" />
                <Label htmlFor="custosIndexados" className="font-normal">Custos indexados (INCC)</Label>
              </div>
              {data.custosIndexados && (
                <div className="max-w-xs">
                  <Label htmlFor="indiceCustosAnualFracao">Índice de Custos (% a.a.) — deixe em branco para usar o INCC vigente da Configuração</Label>
                  <Input id="indiceCustosAnualFracao" type="number" placeholder="ex: 6,5" value={data.indiceCustosAnualFracao} onChange={(e) => updateData("indiceCustosAnualFracao", e.target.value)} className="mt-2" />
                </div>
              )}
              <div className="flex items-center gap-3">
                <Switch checked={data.recebiveisIndexados} onCheckedChange={(v) => updateData("recebiveisIndexados", v)} id="recebiveisIndexados" />
                <Label htmlFor="recebiveisIndexados" className="font-normal">Recebíveis indexados (IPCA + juros)</Label>
              </div>
              {data.recebiveisIndexados && (
                <div className="max-w-xs">
                  <Label htmlFor="indiceRecebiveisAnualFracao">Índice de Recebíveis (% a.a.) — deixe em branco para usar o IPCA vigente da Configuração</Label>
                  <Input id="indiceRecebiveisAnualFracao" type="number" placeholder="ex: 4,5" value={data.indiceRecebiveisAnualFracao} onChange={(e) => updateData("indiceRecebiveisAnualFracao", e.target.value)} className="mt-2" />
                </div>
              )}
            </div>
          </div>
        );

      case "tax":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="regimeTributario">Regime Tributário *</Label>
              <Select value={data.regimeTributario} onValueChange={(value) => updateData("regimeTributario", value as WizardData["regimeTributario"])}>
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
            {data.regimeTributario === "ret" && (
              <div className="flex items-center gap-3">
                <Switch checked={data.patrimonioAfetacao} onCheckedChange={(v) => updateData("patrimonioAfetacao", v)} id="patrimonioAfetacao" />
                <Label htmlFor="patrimonioAfetacao" className="font-normal">Projeto possui patrimônio de afetação</Label>
              </div>
            )}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                O cálculo de impostos é uma modelagem simplificada e educativa — confira sempre com o contador do projeto antes de decidir, especialmente pela transição da reforma tributária (IBS/CBS).
              </AlertDescription>
            </Alert>
          </div>
        );

      case "review":
        return (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Ao confirmar, o GeoEngine, CostEngine, SalesEngine e FinanceEngine rodam de verdade — isso pode levar alguns segundos. Você poderá recalcular depois.
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
                <p className="text-muted-foreground">Área Bruta</p>
                <p className="font-semibold">{data.areaBruta ? `${data.areaBruta} m²` : "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tipologia</p>
                <p className="font-semibold capitalize">{data.tipologia.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">TMA</p>
                <p className="font-semibold">{data.tmaAnual}% a.a.</p>
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

  // Fecha o modal (Cancelar, clique fora, Esc) — o wizard nunca desmonta
  // (fica sempre no DOM em Projects.tsx com open=false), então sem isto os
  // dados e a etapa ficavam presos do fechamento anterior na próxima abertura.
  // Não reseta enquanto uma criação está em andamento (isSaving) — deixa o
  // handleFinish decidir o que fazer com o resultado dela.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSaving) {
      setData(WIZARD_DATA_DEFAULTS);
      setCurrentStep("info");
      createdProjectIdRef.current = null;
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <div className="bg-primary h-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Main Content */}
        <div className={`flex flex-1 overflow-hidden ${isMobile ? "flex-col" : ""}`}>
          {/* Sidebar - Step Navigator */}
          {!isMobile && (
            <div className="w-64 border-r border-border/40 bg-muted/30 p-6 overflow-y-auto">
              <div className="space-y-3">
                {STEPS.map((step) => {
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
          <div className={`flex-1 overflow-y-auto ${isMobile ? "px-4 py-4" : "px-8 py-6"}`}>{renderStepContent()}</div>
        </div>

        {/* Footer Actions */}
        <div className={`border-t border-border/40 bg-background ${isMobile ? "px-4 py-3" : "px-8 py-4"}`}>
          <div className={`flex gap-3 ${isMobile ? "flex-col-reverse" : "justify-end"}`}>
            <Button variant="outline" onClick={() => handleOpenChange(false)} className={isMobile ? "w-full" : ""}>
              Cancelar
            </Button>
            {currentStep !== "info" && (
              <Button variant="outline" onClick={handlePrevious} className={isMobile ? "w-full" : ""}>
                Anterior
              </Button>
            )}
            {currentStep !== "review" && (
              <Button onClick={handleNext} disabled={!canAdvance()} className={isMobile ? "w-full" : ""}>
                Próximo <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
            {currentStep === "review" && (
              <Button onClick={handleFinish} disabled={isCreating} className={isMobile ? "w-full" : ""}>
                {isCreating ? "Calculando..." : "Criar e Calcular Estudo"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
