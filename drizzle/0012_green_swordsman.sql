CREATE TABLE `modelosCalculo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoriaPlanilha` varchar(100) NOT NULL,
	`qtdContratos` int NOT NULL,
	`fileKey` varchar(1000) NOT NULL,
	`fileUrl` varchar(1000) NOT NULL,
	`nomeArquivo` varchar(500) NOT NULL,
	`tamanho` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modelosCalculo_id` PRIMARY KEY(`id`)
);
