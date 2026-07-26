CREATE TABLE `indicesCorrecao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mesAno` varchar(7) NOT NULL,
	`dataTexto` varchar(20) NOT NULL,
	`ipca` decimal(12,6) NOT NULL,
	`selic` decimal(12,6) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indicesCorrecao_id` PRIMARY KEY(`id`),
	CONSTRAINT `indicesCorrecao_mesAno_unique` UNIQUE(`mesAno`)
);
