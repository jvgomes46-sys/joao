CREATE TABLE `approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`orgao` varchar(255) NOT NULL,
	`grupo` varchar(100) NOT NULL,
	`item` varchar(500) NOT NULL,
	`status` enum('nao_iniciado','protocolado','em_analise','aprovado','pendencia') NOT NULL DEFAULT 'nao_iniciado',
	`dataProtocolo` timestamp,
	`prazoEstimado` timestamp,
	`responsavel` varchar(255),
	`observacao` text,
	`origem` enum('automatico','manual') NOT NULL DEFAULT 'automatico',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `approvals_id` PRIMARY KEY(`id`)
);
