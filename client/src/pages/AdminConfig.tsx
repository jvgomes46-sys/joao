import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Settings, Plus, Pencil, Trash2 } from "lucide-react";
import type { RouterOutput } from "@/lib/trpc";

type ConfigTableName = RouterOutput["adminConfig"]["tables"][number];

const TABLE_LABELS: Record<string, string> = {
  legislation: "A. Legislação Municipal/Regional",
  unit_costs: "B. Custos Unitários (SINAPI)",
  cost_parameters: "C. Parâmetros de Custo (BDI, contingência...)",
  financial_indices: "D. Índices Financeiros (INCC/IPCA/câmbio)",
  typology_matrix: "E. Matriz de Tipologias",
  standard_timelines: "F. Prazos Padrão",
  tax_regimes: "G. Regimes Tributários",
};

function jsonStringifyRow(row: Record<string, unknown>): string {
  const { id, createdAt, updatedAt, ...editable } = row;
  return JSON.stringify(editable, null, 2);
}

function RowEditorDialog({
  table,
  row,
  open,
  onOpenChange,
}: {
  table: ConfigTableName;
  row: Record<string, unknown> | null; // null = criando nova linha
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [text, setText] = useState(row ? jsonStringifyRow(row) : "{}");

  const createMutation = trpc.adminConfig.create.useMutation({
    onSuccess: () => {
      toast.success("Linha criada");
      utils.adminConfig.list.invalidate({ table });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.adminConfig.update.useMutation({
    onSuccess: () => {
      toast.success("Linha atualizada");
      utils.adminConfig.list.invalidate({ table });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      toast.error("JSON inválido");
      return;
    }
    if (row) {
      updateMutation.mutate({ table, id: row.id as number, data });
    } else {
      createMutation.mutate({ table, data });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Editar linha" : "Nova linha"}</DialogTitle>
          <DialogDescription>
            Edite o JSON dos campos. Datas em ISO 8601 (ex.: "2026-01-01T00:00:00.000Z").
          </DialogDescription>
        </DialogHeader>
        <Textarea className="font-mono text-xs min-h-[280px]" value={text} onChange={(e) => setText(e.target.value)} />
        <DialogFooter>
          <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigTablePanel({ table }: { table: ConfigTableName }) {
  const utils = trpc.useUtils();
  const { data: rows, isLoading, error } = trpc.adminConfig.list.useQuery({ table });
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null | undefined>(undefined);

  const deleteMutation = trpc.adminConfig.delete.useMutation({
    onSuccess: () => {
      toast.success("Linha removida");
      utils.adminConfig.list.invalidate({ table });
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-40" />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Não foi possível carregar</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  const list = (rows ?? []) as Record<string, unknown>[];
  const columns = list.length > 0 ? Object.keys(list[0]).filter((c) => !["createdAt", "updatedAt"].includes(c)) : [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1" onClick={() => setEditingRow(null)}>
          <Plus className="w-4 h-4" />
          Nova Linha
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma linha cadastrada ainda.</p>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap text-xs">
                    {c}
                  </TableHead>
                ))}
                <TableHead className="text-right text-xs">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((row) => (
                <TableRow key={row.id as number}>
                  {columns.map((c) => (
                    <TableCell key={c} className="text-xs whitespace-nowrap max-w-[220px] truncate">
                      {row[c] === null || row[c] === undefined
                        ? ""
                        : typeof row[c] === "object"
                          ? JSON.stringify(row[c])
                          : String(row[c])}
                    </TableCell>
                  ))}
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setEditingRow(row)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (window.confirm("Remover esta linha de configuração?")) {
                          deleteMutation.mutate({ table, id: row.id as number });
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editingRow !== undefined && (
        <RowEditorDialog table={table} row={editingRow} open={editingRow !== undefined} onOpenChange={(o) => !o && setEditingRow(undefined)} />
      )}
    </div>
  );
}

export default function AdminConfig() {
  const { data: tables, isLoading } = trpc.adminConfig.tables.useQuery();
  const [activeTable, setActiveTable] = useState<ConfigTableName | null>(null);

  const effectiveTable = activeTable ?? tables?.[0] ?? null;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Módulo de Configuração
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Camada administrativa global (spec seção 5) — todo Estudo lê destes valores; a edição é restrita a
          administradores. Cada cálculo grava um snapshot imutável, então alterar valores aqui nunca muda estudos já
          calculados.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex md:flex-col gap-1 md:w-64 shrink-0 overflow-x-auto">
            {(tables ?? []).map((t) => (
              <Button
                key={t}
                variant={effectiveTable === t ? "default" : "ghost"}
                size="sm"
                className="justify-start shrink-0"
                onClick={() => setActiveTable(t)}
              >
                {TABLE_LABELS[t] ?? t}
              </Button>
            ))}
          </div>
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-base">{effectiveTable ? TABLE_LABELS[effectiveTable] ?? effectiveTable : ""}</CardTitle>
              <CardDescription>Editável apenas por administradores. Alterações não afetam estudos já calculados.</CardDescription>
            </CardHeader>
            <CardContent>{effectiveTable && <ConfigTablePanel table={effectiveTable} />}</CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
