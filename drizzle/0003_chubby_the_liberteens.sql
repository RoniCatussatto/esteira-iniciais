ALTER TABLE `devedores` ADD `dadoPlanilha01` text;--> statement-breakpoint
ALTER TABLE `devedores` ADD `dadoPlanilha02` text;--> statement-breakpoint
ALTER TABLE `devedores` ADD `dadoPlanilha03` text;--> statement-breakpoint
ALTER TABLE `devedores` ADD `dadoPlanilha04` text;--> statement-breakpoint
ALTER TABLE `devedores` ADD `multa2pct` enum('sim','nao','branco') DEFAULT 'branco';--> statement-breakpoint
ALTER TABLE `devedores` ADD `moraEspecifica` text;