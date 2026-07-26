CREATE TABLE `modelosIniciais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`categoriaPlanilha` varchar(100) NOT NULL,
	`fileKey` varchar(1000) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`nomeArquivo` varchar(500) NOT NULL,
	`tamanho` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modelosIniciais_id` PRIMARY KEY(`id`),
	CONSTRAINT `modelosIniciais_nome_unique` UNIQUE(`nome`)
);
