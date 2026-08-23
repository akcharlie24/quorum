-- CreateTable
CREATE TABLE "drift_alerts" (
    "id" SERIAL NOT NULL,
    "target_id" INTEGER NOT NULL,
    "run_id" INTEGER NOT NULL,
    "field" TEXT,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION,
    "current" DOUBLE PRECISION,
    "fleet_wide" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drift_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drift_alerts_target_id_id_idx" ON "drift_alerts"("target_id", "id");

-- AddForeignKey
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
