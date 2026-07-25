CREATE TABLE `clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nomeFantasia` varchar(255) NOT NULL,
	`nomeCompleto` text,
	`doc` varchar(30),
	`telefone` varchar(30),
	`logradouro` varchar(255),
	`numero` varchar(50),
	`complemento` varchar(255),
	`cep` varchar(20),
	`uf` varchar(5),
	`municipio` varchar(255),
	`paragrafaInicial` text,
	`enderecoCoop` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`),
	CONSTRAINT `clientes_nomeFantasia_unique` UNIQUE(`nomeFantasia`)
);
--> statement-breakpoint
CREATE TABLE `docConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clienteId` int NOT NULL,
	`nomeDocumento` varchar(255) NOT NULL,
	`descricao` text,
	`configJson` text,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `docConfigs_id` PRIMARY KEY(`id`)
);
