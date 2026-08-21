import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, AlertTriangle, ClipboardCheck, RefreshCw } from "lucide-react";
import type { RouterOutput } from "@/lib/trpc";

type Approval = RouterOutput["approvals"]["listByProject"][number];

const GRUPO_LABELS: Record<string, string> = {
  graprohab: "GRAPROHAB",
  levantamentos: "A. Levantamentos e Projetos",
  ambiental: "B. Licenciamento Ambiental",
  taxas_oficiais: "C. Taxas Oficiais",
  concessionarias: "D. Concessionárias",
};

const GRUPO_ORDER = ["graprohab", "levantamentos", "ambiental", "taxas_oficiais", "concessionarias"];

const STATUS_LABELS: Record<string, string> = {
  nao_iniciado: "Não iniciado",
  protocolado: "Protocolado",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  pendencia: "Pendência",
};

const STATUS_COLORS: Record<string, string> = {
  nao_iniciado: "bg-gray-100 text-gray-800",
  protocolado: "bg-blue-100 text-blue-800",
  em_analise: "bg-yellow-100 text-yellow-800",
  aprovado: "bg-green-100 text-green-800",
  pendencia: "bg-red-100 text-red-800",
};

function toDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function ApprovalRow({ approval, projectId }: { approval: Approval; projectId: number }) {
  const utils = trpc.useUtils();
  const updateMutation = trpc.approvals.update.useMutation({
    onSuccess: () => utils.approvals.listByProject.invalidate({ projectId }),
    onError: (error) => toast.error(`Erro ao atualizar: ${error.message}`),
  });

  const [observacao, setObservacao] = useState(approval.observacao ?? "");
  const [responsavel, setResponsavel] = useState(approval.responsavel ?? "");

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium">{approval.item}</p>
          <p className="text-xs text-muted-foreground">{approval.orgao}</p>
        </div>
        <Badge className={STATUS_COLORS[approval.status]}>{STATUS_LABELS[approval.status]}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select
          value={approval.status}
          onValueChange={(status) =>
            updateMutation.mutate({ id: approval.id, projectId, status: status as Approval["status"] })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="h-8 text-xs"
          placeholder="Data de protocolo"
          value={toDateInputValue(approval.dataProtocolo)}
          onChange={(e) =>
            updateMutation.mutate({
              id: approval.id,
              projectId,
              dataProtocolo: e.target.value ? new Date(e.target.value).toISOString() : null,
            })
          }
        />

        <Input
          type="date"
          className="h-8 text-xs"
          placeholder="Prazo estimado"
          value={toDateInputValue(approval.prazoEstimado)}
          onChange={(e) =>
            updateMutation.mutate({
              id: approval.id,
              projectId,
              prazoEstimado: e.target.value ? new Date(e.target.value).toISOString() : null,
            })
          }
        />

        <Input
          className="h-8 text-xs"
          placeholder="Responsável"
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          onBlur={() => {
            if (responsavel !== (approval.responsavel ?? "")) {
              updateMutation.mutate({ id: approval.id, projectId, responsavel: responsavel || null });
            }
          }}
        />
      </div>

      <Textarea
        className="text-xs min-h-[50px]"
        placeholder="Observações"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        onBlur={() => {
          if (observacao !== (approval.observacao ?? "")) {
            updateMutation.mutate({ id: approval.id, projectId, observacao: observacao || null });
          }
        }}
      />
    </div>
  );
}

export default function Approvals() {
  const params = useParams<{ id: string }>();
  const projectId = Number(params.id);
  const utils = trpc.useUtils();

  const { data: approvals, isLoading, error } = trpc.approvals.listByProject.useQuery(
    { projectId },
    { enabled: Number.isFinite(projectId) }
  );

  const seedMutation = trpc.approvals.seed.useMutation({
    onSuccess: () => {
      toast.success("Checklist de aprovações gerado a partir do GeoEngine");
      utils.approvals.listByProject.invalidate({ projectId });
    },
    onError: (error) => toast.error(error.message),
  });

  const groups = useMemo(() => {
    const map = new Map<string, Approval[]>();
    (approvals ?? []).forEach((a) => {
      const list = map.get(a.grupo) ?? [];
      list.push(a);
      map.set(a.grupo, list);
    });
    return GRUPO_ORDER.filter((g) => map.has(g)).map((g) => ({ grupo: g, items: map.get(g)! }));
  }, [approvals]);

  const progresso = useMemo(() => {
    if (!approvals || approvals.length === 0) return 0;
    const aprovados = approvals.filter((a) => a.status === "aprovado").length;
    return Math.round((aprovados / approvals.length) * 100);
  }, [approvals]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40" />
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
          <AlertTitle>Não foi possível carregar o checklist</AlertTitle>
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
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Aprovação / Licenciamento</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Checklist de acompanhamento por órgão/concessionária — {progresso}% aprovado
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => seedMutation.mutate({ projectId })}
          disabled={seedMutation.isPending}
        >
          <RefreshCw className="w-4 h-4" />
          {approvals && approvals.length > 0 ? "Já gerado" : "Gerar checklist"}
        </Button>
      </div>

      {(!approvals || approvals.length === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardCheck className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum item de checklist ainda</h3>
            <p className="text-muted-foreground text-center mb-4 text-sm">
              Calcule o GeoEngine deste projeto e gere o checklist a partir dos itens GRAPROHAB e do módulo de
              Aprovações e Projetos.
            </p>
            <Button onClick={() => seedMutation.mutate({ projectId })} disabled={seedMutation.isPending}>
              Gerar checklist
            </Button>
          </CardContent>
        </Card>
      ) : (
        groups.map(({ grupo, items }) => (
          <Card key={grupo}>
            <CardHeader>
              <CardTitle className="text-base">{GRUPO_LABELS[grupo] ?? grupo}</CardTitle>
              <CardDescription>{items.length} item(ns)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((approval) => (
                <ApprovalRow key={approval.id} approval={approval} projectId={projectId} />
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
