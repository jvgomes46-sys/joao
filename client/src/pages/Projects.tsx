import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Building2, MapPin, Calendar, Trash2, Edit2, Eye } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { StudyWizard } from "@/components/StudyWizard";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

const PROJECT_TYPE_LABELS: Record<string, string> = {
  loteamento: "Loteamento",
  condominio: "Condomínio",
  incorporacao: "Incorporação",
};

const PROJECT_TYPE_COLORS: Record<string, string> = {
  loteamento: "bg-blue-100 text-blue-800",
  condominio: "bg-purple-100 text-purple-800",
  incorporacao: "bg-green-100 text-green-800",
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_analise: "Em Análise",
  finalizado: "Finalizado",
  arquivado: "Arquivado",
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-800",
  em_analise: "bg-yellow-100 text-yellow-800",
  finalizado: "bg-green-100 text-green-800",
  arquivado: "bg-red-100 text-red-800",
};

export default function Projects() {
  const isMobile = useIsMobile();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: projects, isLoading, refetch } = trpc.projects.list.useQuery();
  const deleteProjectMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("Projeto deletado com sucesso");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao deletar projeto: ${error.message}`);
    },
  });

  const filteredProjects = projects?.filter((project) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDelete = (projectId: number) => {
    if (window.confirm("Tem certeza que deseja deletar este projeto?")) {
      deleteProjectMutation.mutate({ id: projectId });
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className={`${isMobile ? "text-2xl" : "text-3xl"} font-bold tracking-tight`}>Meus Empreendimentos</h1>
          <p className={`text-muted-foreground mt-1 ${isMobile ? "text-sm" : ""}`}>
            Gerencie seus estudos de viabilidade
          </p>
        </div>
        <StudyWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onSuccess={() => refetch()}
        />
        <Button onClick={() => setWizardOpen(true)} className={`gap-2 ${isMobile ? "w-full" : ""}`}>
          <Plus className="w-4 h-4" />
          {isMobile ? "Novo" : "Novo Estudo"}
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isMobile ? "Buscar..." : "Buscar por nome ou localização..."}
          className="pl-10 text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className={`grid gap-3 md:gap-4 ${isMobile ? "grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3"}`}>
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProjects && filteredProjects.length > 0 ? (
        <div className={`grid gap-3 md:gap-4 ${isMobile ? "grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3"}`}>
          {filteredProjects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-lg line-clamp-2">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {project.location || "Localização não informada"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge className={PROJECT_TYPE_COLORS[project.type]}>
                    {PROJECT_TYPE_LABELS[project.type]}
                  </Badge>
                  <Badge className={PROJECT_STATUS_COLORS[project.status]}>
                    {PROJECT_STATUS_LABELS[project.status]}
                  </Badge>
                </div>

                {/* Description */}
                {project.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                )}

                {/* Meta */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  Atualizado{" "}
                  {formatDistanceToNow(new Date(project.updatedAt), {
                    locale: ptBR,
                    addSuffix: true,
                  })}
                </div>

                {/* Actions */}
                <div className={`flex gap-2 pt-2 ${isMobile ? "flex-col" : ""}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-1 ${isMobile ? "w-full" : "flex-1"}`}
                  >
                    <Eye className="w-4 h-4" />
                    {isMobile ? "Abrir" : "Abrir"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-1 ${isMobile ? "w-full" : ""}`}
                  >
                    <Edit2 className="w-4 h-4" />
                    {isMobile ? "Editar" : ""}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-1 text-destructive hover:text-destructive ${isMobile ? "w-full" : ""}`}
                    onClick={() => handleDelete(project.id)}
                    disabled={deleteProjectMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                    {isMobile ? "Deletar" : ""}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className={`flex flex-col items-center justify-center ${isMobile ? "py-8 px-4" : "py-12"}`}>
            <Building2 className={`${isMobile ? "w-10 h-10" : "w-12 h-12"} text-muted-foreground mb-4`} />
            <h3 className={`${isMobile ? "text-base" : "text-lg"} font-semibold mb-2`}>Nenhum empreendimento encontrado</h3>
            <p className={`text-muted-foreground text-center mb-4 ${isMobile ? "text-sm" : ""}`}>
              {searchTerm
                ? "Tente ajustar sua busca"
                : "Comece criando um novo estudo de viabilidade"}
            </p>
            {!searchTerm && (
              <Button onClick={() => setWizardOpen(true)} className={`gap-2 ${isMobile ? "w-full" : ""}`}>
                <Plus className="w-4 h-4" />
                {isMobile ? "Criar Estudo" : "Criar Primeiro Estudo"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
