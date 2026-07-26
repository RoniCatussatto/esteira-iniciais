ALTER TABLE `devedores` ADD `modeloInicial` varchar(100);--> statement-breakpoint
ALTER TABLE `extracoes` ADD `indiceCorrecao` enum('ipca','selic') DEFAULT 'ipca';