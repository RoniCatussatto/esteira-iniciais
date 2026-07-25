CREATE TABLE `documentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loteId` int NOT NULL,
	`devedorId` int NOT NULL,
	`nomeArquivo` varchar(500) NOT NULL,
	`nomePasta` varchar(500),
	`fileKey` varchar(1000) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`mimeType` varchar(100),
	`tamanho` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documentos_id` PRIMARY KEY(`id`)
);
