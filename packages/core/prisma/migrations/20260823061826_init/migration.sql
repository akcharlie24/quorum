-- CreateTable
CREATE TABLE "targets" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "schema_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variants" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "collector_id" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "consensus_json" TEXT,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_results" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "rows_json" TEXT,
    "error" TEXT,
    "dissents_json" TEXT,

    CONSTRAINT "variant_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "row_key" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "consensus_value" TEXT,
    "dissenting_json" TEXT,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heal_events" (
    "id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "trigger_run_id" INTEGER,
    "prompt" TEXT NOT NULL,
    "preview_json" TEXT,
    "verdict" TEXT,
    "verdict_reason" TEXT,
    "verification" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "heal_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "log_json" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "targets_name_key" ON "targets"("name");

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_results" ADD CONSTRAINT "variant_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_results" ADD CONSTRAINT "variant_results_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heal_events" ADD CONSTRAINT "heal_events_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heal_events" ADD CONSTRAINT "heal_events_trigger_run_id_fkey" FOREIGN KEY ("trigger_run_id") REFERENCES "runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
