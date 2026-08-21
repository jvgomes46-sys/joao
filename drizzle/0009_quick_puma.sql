CREATE TABLE `construction_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`ordem` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `construction_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `construction_stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subcategoryId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`ordem` int NOT NULL DEFAULT 0,
	`pesoPercentual` decimal(8,4) NOT NULL DEFAULT '0',
	`valorPrevisto` decimal(15,2) NOT NULL DEFAULT '0',
	`percentualPrevisto` decimal(6,2) NOT NULL DEFAULT '100',
	`percentualExecutado` decimal(6,2) NOT NULL DEFAULT '0',
	`status` enum('nao_iniciado','em_execucao','concluido') NOT NULL DEFAULT 'nao_iniciado',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `construction_stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `construction_subcategories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`nome` varchar(255) NOT NULL,
	`templateKey` varchar(100) NOT NULL,
	`origemCostEngineGrupo` varchar(100),
	`ordem` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `construction_subcategories_id` PRIMARY KEY(`id`)
);
