ALTER TABLE `docConfigs` ADD `regrasIdentificacao` text;--> statement-breakpoint
ALTER TABLE `docConfigs` ADD `scriptExtracao` text;--> statement-breakpoint
ALTER TABLE `docConfigs` ADD `mapeamentoCampos` text;--> statement-breakpoint
ALTER TABLE `docConfigs` ADD `historicoChat` text;--> statement-breakpoint
ALTER TABLE `docConfigs` ADD `arquivosModelo` text;--> statement-breakpoint
ALTER TABLE `docConfigs` ADD `statusConfig` enum('rascunho','configurado','testado') DEFAULT 'rascunho' NOT NULL;