CREATE TABLE `devedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loteId` int NOT NULL,
	`cooperativa` varchar(255),
	`dataBordero` varchar(20),
	`contratos` text,
	`valorBordero` varchar(50),
	`contrarioNome` varchar(255),
	`contrarioCpf` varchar(20),
	`vencBordero` varchar(20),
	`contrarioEndereco` text,
	`foro` varchar(255),
	`veiculoModelo` varchar(255),
	`veiculoAno` varchar(20),
	`veiculoPlaca` varchar(20),
	`veiculoRenavam` varchar(50),
	`veiculoChassis` varchar(100),
	`tipoInicial` varchar(100),
	`tipoPlanilha` varchar(100),
	`valorCausa` varchar(50),
	`status` enum('pendente','em_processamento','concluido','erro') NOT NULL DEFAULT 'pendente',
	`observacoes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devedores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`dataBordero` varchar(20),
	`cooperativa` varchar(255),
	`totalDevedores` int NOT NULL DEFAULT 0,
	`status` enum('aguardando','em_processamento','concluido','erro') NOT NULL DEFAULT 'aguardando',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lotes_id` PRIMARY KEY(`id`)
);
