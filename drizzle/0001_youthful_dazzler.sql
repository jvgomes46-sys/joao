CREATE TABLE `cost_engine_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`terraplanagem` decimal(12,2),
	`drenagem` decimal(12,2),
	`pavimentacao` decimal(12,2),
	`agua` decimal(12,2),
	`esgoto` decimal(12,2),
	`energia` decimal(12,2),
	`paisagismo` decimal(12,2),
	`portaria` decimal(12,2),
	`areaLazer` decimal(12,2),
	`licenciamento` decimal(12,2),
	`registro` decimal(12,2),
	`cartorio` decimal(12,2),
	`custosIndiretos` decimal(12,2),
	`contingencias` decimal(12,2),
	`investimentoTotal` decimal(12,2),
	`valorPorHectare` decimal(12,2),
	`valorPorM2` decimal(12,2),
	`valorPorLote` decimal(12,2),
	`cronogramaFisico` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cost_engine_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `finance_engine_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`vpl` decimal(15,2),
	`tir` decimal(8,4),
	`roi` decimal(8,4),
	`payback` decimal(8,2),
	`exposicaoMaximaCaixa` decimal(15,2),
	`lucroTotal` decimal(15,2),
	`margemLucro` decimal(8,4),
	`capitalProprio` decimal(15,2),
	`capitalNecessario` decimal(15,2),
	`lucroLote` decimal(12,2),
	`precoMinimoLote` decimal(12,2),
	`precoRecomendado` decimal(12,2),
	`tmaUtilizada` decimal(8,4),
	`fluxoCaixaMensal` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `finance_engine_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `geo_engine_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`areaBruta` decimal(12,2),
	`areaLiquida` decimal(12,2),
	`areaVendavel` decimal(12,2),
	`areaInstitucional` decimal(12,2),
	`areaVerde` decimal(12,2),
	`areaAPP` decimal(12,2),
	`sistemaViario` decimal(12,2),
	`eficienciaUrbanistica` decimal(5,2),
	`numeroLotes` int,
	`potencialConstrutivo` decimal(12,2),
	`densidade` decimal(8,2),
	`indicesUrbanisticos` json,
	`checklistGRAProhab` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `geo_engine_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`type` enum('loteamento','condominio','incorporacao') NOT NULL,
	`location` varchar(255),
	`status` enum('rascunho','em_analise','finalizado','arquivado') NOT NULL DEFAULT 'rascunho',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_engine_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`vgv` decimal(15,2),
	`precoMedioM2` decimal(12,2),
	`curvaVendas` json,
	`tabelasFinanciamento` json,
	`inadimplencia` decimal(5,2),
	`custoVendas` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_engine_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('otimista','realista','pessimista','customizado') NOT NULL,
	`descricao` text,
	`variacaoVGV` decimal(8,4),
	`variacaoCustos` decimal(8,4),
	`variacaoTaxa` decimal(8,4),
	`resultados` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scenarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tax_engine_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`regimeTributario` enum('ret','lucro_presumido','lucro_real') NOT NULL,
	`aliquotaIBS` decimal(8,4),
	`aliquotaCBS` decimal(8,4),
	`aliquotaIRPJ` decimal(8,4),
	`aliquotaCSLL` decimal(8,4),
	`aliquotaPIS` decimal(8,4),
	`aliquotaCOFINS` decimal(8,4),
	`redutorSocial` decimal(15,2),
	`patrimonioAfetacao` boolean DEFAULT false,
	`impostosTotais` decimal(15,2),
	`impactoReforma` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tax_engine_data_id` PRIMARY KEY(`id`)
);
