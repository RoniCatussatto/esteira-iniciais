CREATE TABLE `extracoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devedorId` int NOT NULL,
	`loteId` int NOT NULL,
	`numeroContrato` varchar(100) NOT NULL,
	`dadoPlanilha01` text,
	`dadoPlanilha02` text,
	`dadoPlanilha03` text,
	`dadoPlanilha04` text,
	`multa2pct` enum('sim','nao','branco') DEFAULT 'branco',
	`moraEspecifica` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extracoes_id` PRIMARY KEY(`id`)
);
