# EVTE PRO - Todo List

## Sprint 1: Estrutura Inicial da Plataforma

### Design System & Visual
- [x] Definir paleta de cores sofisticada (primária, secundária, neutras, feedback)
- [x] Configurar tipografia elegante (Google Fonts: Inter ou Roboto)
- [x] Criar design tokens no Tailwind CSS (cores, espaçamento, sombras)
- [x] Implementar tema claro/escuro com CSS variables

### Autenticação & Navegação
- [ ] Integrar Manus OAuth (login/logout)
- [ ] Criar DashboardLayout com sidebar navigation
- [ ] Implementar menu de navegação principal (Home, Empreendimentos, Dashboard, Relatórios)
- [ ] Adicionar perfil de usuário e logout no header

### Tela Inicial (Home)
- [ ] Criar página de boas-vindas para usuários autenticados
- [ ] Exibir lista rápida de empreendimentos recentes
- [ ] Adicionar CTA "Novo Estudo de Viabilidade"
- [ ] Implementar onboarding para novos usuários

### Gerenciamento de Empreendimentos
- [ ] Criar página de listagem de empreendimentos (Projects)
- [ ] Implementar CRUD de empreendimentos (Create, Read, Update, Delete)
- [ ] Adicionar filtros e busca por nome/tipo
- [ ] Criar modal/formulário para novo empreendimento
- [ ] Adicionar cards informativos com dados básicos do empreendimento

### Banco de Dados (Schema)
- [x] Criar tabela `projects` (empreendimentos)
- [x] Criar tabela `geo_engine_data` (dados urbanísticos)
- [x] Criar tabela `cost_engine_data` (dados de custos)
- [x] Criar tabela `sales_engine_data` (dados comerciais)
- [x] Criar tabela `finance_engine_data` (dados financeiros)
- [x] Criar tabela `tax_engine_data` (dados tributários)
- [x] Criar tabela `scenarios` (cenários de simulação)
- [x] Executar migrações Drizzle

### API & Backend (tRPC)
- [x] Criar procedures para CRUD de projects
- [x] Implementar query helpers em `server/db.ts`
- [ ] Adicionar validação de entrada com Zod

### Testes
- [ ] Escrever testes unitários para procedures de projects
- [ ] Testar autenticação e autorização
- [ ] Validar CRUD de empreendimentos

### Documentação & Relatório
- [ ] Documentar estrutura de dados
- [ ] Criar relatório final da Sprint 1
- [ ] Atualizar README do projeto

---

## Sprint 2: Assistente Inteligente (Wizard)

- [x] Implementar wizard step-by-step para criação de estudo
- [x] Criar formulários para cada etapa (Urbanístico, Engenharia, Comercial, Financeiro, Tributário)
- [x] Implementar validação de dados entre etapas
- [x] Adicionar resumo e confirmação final

---

## Sprint 3: Motor Urbanístico (GeoEngine)

- [ ] Implementar cálculo de áreas públicas (Lei 6.766/79)
- [ ] Criar estudo de massa automático
- [ ] Implementar checklist GRAPROHAB
- [ ] Adicionar visualização de dados urbanísticos

---

## Sprint 4: Motor de Engenharia de Custos (CostEngine)

- [ ] Criar biblioteca de itens de custo
- [ ] Implementar parametrização por m² e metro linear
- [ ] Adicionar cronograma físico
- [ ] Gerar orçamento automático

---

## Sprint 5: Motor Financeiro (FinanceEngine)

- [ ] Implementar Fluxo de Caixa Descontado (FCD)
- [ ] Calcular VPL, TIR, ROI, Payback
- [ ] Implementar Exposição Máxima de Caixa
- [ ] Criar análise de sensibilidade

---

## Sprint 6: Inteligência de Mercado

- [ ] Criar banco de indicadores
- [ ] Implementar pesquisa de mercado
- [ ] Adicionar velocidade de vendas e tempo de absorção

---

## Sprint 7: Simulador Inteligente

- [ ] Implementar comparador de cenários
- [ ] Criar simulação automática de cenários otimista/realista/pessimista
- [ ] Adicionar análise comparativa de resultados

---

## Sprint 8: Consultor Estratégico (IA)

- [ ] Integrar LLM para análise de resultados
- [ ] Gerar recomendações técnicas automáticas
- [ ] Criar parecer executivo com fundamentação

---

## Sprint 9: Dashboard Executivo

- [ ] Criar dashboard com KPIs principais
- [ ] Implementar gráficos interativos (Recharts)
- [ ] Adicionar semáforos, velocímetros e mapas de calor

---

## Sprint 10: Relatórios

- [ ] Gerar relatório executivo em PDF
- [ ] Gerar relatório técnico em PDF
- [ ] Gerar relatório financeiro em PDF
- [ ] Implementar exportação em Excel

---

## Sprint 11: Validação & Otimização

- [ ] Testes completos de integração
- [ ] Otimização de performance
- [ ] Revisão final da arquitetura
- [ ] Preparação para produção

---

## Responsividade Multi-Dispositivo

- [x] Implementar breakpoints Tailwind para mobile (sm), tablet (md/lg) e desktop (xl/2xl)
- [x] Adaptar DashboardLayout para mobile (sidebar colapsável, drawer navigation)
- [x] Otimizar StudyWizard para telas pequenas (layout vertical, modal responsivo)
- [x] Adaptar página Projects para mobile (cards em grid responsivo)
- [x] Testar em viewport: mobile (375px), tablet (768px), desktop (1440px)
- [x] Implementar touch-friendly buttons e spacing para mobile
- [x] Validar formulários em todos os tamanhos de tela

---

## Sprint 3: Motor Urbanístico (GeoEngine)

### Cálculos Urbanísticos (Lei 6.766/79)
- [ ] Implementar cálculo de áreas públicas (Lei 6.766/79)
- [ ] Cálculo de percentual de áreas verdes (mínimo 15%)
- [ ] Cálculo de áreas institucionais (mínimo 5%)
- [ ] Cálculo de sistema viário (rua, avenida, praça)
- [ ] Validação de conformidade com Lei 6.766/79

### Estudo de Massa
- [ ] Implementar cálculo de densidade de ocupação
- [ ] Cálculo de coeficiente de aproveitamento (CA)
- [ ] Cálculo de taxa de ocupação (TO)
- [ ] Análise de gabarito e altura máxima
- [ ] Cálculo de potencial construtivo

### Tipologia de Lotes
- [ ] Definir tipologias de lotes (residencial, comercial, misto)
- [ ] Cálculo automático de número de lotes por tipologia
- [ ] Distribuição de áreas por tipologia
- [ ] Cálculo de metragem média por lote
- [ ] Análise de viabilidade por tipologia

### Checklist GRAPROHAB
- [ ] Implementar checklist GRAPROHAB completo
- [ ] Validação de conformidade com critérios GRAPROHAB
- [ ] Geração de relatório de conformidade
- [ ] Alertas para não-conformidades críticas
- [ ] Sugestões de correção automática

### Interface GeoEngine
- [ ] Criar página/modal de entrada de dados urbanísticos
- [ ] Visualização de resultados de cálculos
- [ ] Gráficos de distribuição de áreas
- [ ] Mapa visual do loteamento (mockup)
- [ ] Exportação de dados urbanísticos

### Testes e Validação
- [ ] Testes unitários dos cálculos urbanísticos
- [ ] Validação de conformidade com Lei 6.766/79
- [ ] Testes de casos extremos (áreas muito pequenas/grandes)
- [ ] Validação de checklist GRAPROHAB
