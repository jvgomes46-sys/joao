CREATE TABLE `partnership_analysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`percentualParceriaTerreno` decimal(6,4) NOT NULL,
	`resultado` json NOT NULL,
	`matrizSensibilidade1` json,
	`matrizSensibilidade2` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partnership_analysis_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `scenarios` MODIFY COLUMN `tipo` enum('otimista','realista','conservador','customizado') NOT NULL;