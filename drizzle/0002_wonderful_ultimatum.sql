CREATE TABLE `config_cost_parameters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chave` varchar(64) NOT NULL,
	`valor` decimal(8,4) NOT NULL,
	`regiao` varchar(100) NOT NULL DEFAULT 'Nacional',
	`dataBase` timestamp NOT NULL,
	`fonte` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_cost_parameters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_financial_indices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`indice` enum('incc','ipca','cambio_usd','cambio_gs') NOT NULL,
	`valor` decimal(12,6) NOT NULL,
	`dataReferencia` timestamp NOT NULL,
	`origem` enum('automatico','manual') NOT NULL DEFAULT 'manual',
	`fonte` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_financial_indices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_legislation` (
	`id` int AUTO_INCREMENT NOT NULL,
	`municipio` varchar(255) NOT NULL,
	`uf` varchar(8),
	`pais` varchar(100) NOT NULL DEFAULT 'Brasil',
	`percentualAreaVerdeMin` decimal(5,2),
	`percentualAreaInstitucionalMin` decimal(5,2),
	`percentualSistemaViarioMin` decimal(5,2),
	`areaMinimaLote` decimal(10,2),
	`frenteMinimaLote` decimal(8,2),
	`faixaNonAedificandi` decimal(8,2),
	`prazoExecucaoObrasMeses` int,
	`regrasArborizacao` json,
	`fonte` text,
	`dataUltimaVerificacao` timestamp,
	`isFederalFallback` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `config_legislation_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`engine` enum('geo_engine','cost_engine','sales_engine','finance_engine','tax_engine','full') NOT NULL,
	`snapshotData` json NOT NULL,
	`overrides` json,
	`calculatedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_standard_timelines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` enum('prazo_obra_por_porte','prazo_aprovacao_base','prazo_aprovacao_adicional') NOT NULL,
	`faixaPorteMin` decimal(12,2),
	`faixaPorteMax` decimal(12,2),
	`gatilho` varchar(64),
	`prazoMeses` int NOT NULL,
	`regiao` varchar(100) NOT NULL DEFAULT 'Nacional',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_standard_timelines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_tax_regimes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pais` varchar(100) NOT NULL,
	`regime` varchar(64) NOT NULL,
	`descricao` varchar(255),
	`aliquotas` json NOT NULL,
	`ativo` boolean NOT NULL DEFAULT true,
	`dataBase` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_tax_regimes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_typology_matrix` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipologia` enum('loteamento_popular','loteamento_aberto','condominio_fechado','condominio_chacaras') NOT NULL,
	`precoBaseM2` decimal(12,2) NOT NULL,
	`velocidadeAbsorcaoPadrao` decimal(8,2),
	`temMuro` boolean NOT NULL DEFAULT false,
	`temPortaria` boolean NOT NULL DEFAULT false,
	`temAreaLazer` boolean NOT NULL DEFAULT false,
	`regiao` varchar(100) NOT NULL DEFAULT 'Nacional',
	`dataBase` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_typology_matrix_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `config_unit_costs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`grupo` enum('terraplenagem','drenagem','pavimentacao','agua','esgoto','energia','obras_civis_condominio','servicos_complementares') NOT NULL,
	`itemCodigo` varchar(64) NOT NULL,
	`itemDescricao` varchar(255) NOT NULL,
	`unidade` varchar(16) NOT NULL,
	`valorUnitario` decimal(14,4) NOT NULL,
	`regiao` varchar(100) NOT NULL,
	`dataBase` timestamp NOT NULL,
	`fonte` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `config_unit_costs_id` PRIMARY KEY(`id`)
);
