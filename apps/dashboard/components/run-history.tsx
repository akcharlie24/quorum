"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { timeAgo } from "@/lib/format";

type Cycle = { runId: number; startedAt: string; healthy: number; dissenting: number; broken: number };

const SERIES = [
  { key: "broken", label: "Broken", color: "var(--break)", hint: "errored or lost most of its cells" },
  { key: "dissenting", label: "Dissenting", color: "var(--dissent-2)", hint: "outvoted on some cells" },
  { key: "healthy", label: "Healthy", color: "var(--agree)", hint: "agreed everywhere" },
] as const;

const PLOT_H = 132;
const HEADROOM = 10; // air above a full-height column, so it never touches the legend
const BAND_MAX = 44; // widest a cycle's slot gets; the bar caps well inside it
const GAP = 2; // surface gap between stacked segments

export function RunHistory({ history, total }: { history: Cycle[]; total: number }) {
  const yMax = Math.max(total, ...history.map((h) => h.healthy + h.dissenting + h.broken), 1);
  const unit = PLOT_H / yMax;
  const ticks = Array.from({ length: yMax + 1 }, (_, i) => i);

  const degraded = history.filter((h) => h.dissenting + h.broken > 0).length;
  const labelAt = new Set([0, Math.floor((history.length - 1) / 2), history.length - 1]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2.5 font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
            <span aria-hidden className="inline-block h-2.5 w-2.5" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10.5px] text-ink-4">
          {history.length} cycles · {degraded} degraded
        </span>
      </div>

      <TooltipProvider delayDuration={0}>
        <div className="flex gap-3">
          {/* y axis */}
          <div className="relative w-4 shrink-0" style={{ height: PLOT_H + HEADROOM }} aria-hidden>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 translate-y-1/2 font-mono text-[10px] text-ink-4 tabular-nums"
                style={{ bottom: t * unit }}
              >
                {t}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1" style={{ maxWidth: history.length * (BAND_MAX + 3) }}>
            <div className="relative" style={{ height: PLOT_H + HEADROOM }}>
              {ticks.map((t) => (
                <div
                  key={t}
                  aria-hidden
                  className="absolute inset-x-0 h-px"
                  style={{ bottom: t * unit, background: t === 0 ? "var(--line-2)" : "var(--line)" }}
                />
              ))}

              <div className="absolute inset-0 flex items-end justify-start gap-[3px]">
                {history.map((h, i) => {
                  const counts = { broken: h.broken, dissenting: h.dissenting, healthy: h.healthy };
                  const sum = h.broken + h.dissenting + h.healthy;
                  const topKey = SERIES.find((s) => counts[s.key] > 0)?.key;
                  return (
                    <Tooltip key={h.runId}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          style={{ maxWidth: BAND_MAX }}
                          className="group relative h-full min-w-0 flex-1 basis-0 cursor-default outline-none"
                          aria-label={`Cycle ${h.runId}, ${timeAgo(h.startedAt)}: ${h.healthy} healthy, ${h.dissenting} dissenting, ${h.broken} broken`}
                        >
                          <span
                            aria-hidden
                            className="absolute inset-0 bg-transparent transition-colors duration-150 group-hover:bg-ink/[0.04] group-focus-visible:bg-ink/[0.06]"
                          />
                          <span
                            aria-hidden
                            className="absolute inset-x-0 bottom-0 mx-auto flex max-w-[24px] flex-col justify-end"
                            style={{ height: sum * unit }}
                          >
                            {SERIES.map((s) => {
                              const n = counts[s.key];
                              if (n === 0) return null;
                              return (
                                <span
                                  key={s.key}
                                  className="block w-full transition-opacity duration-150 group-hover:opacity-90"
                                  style={{
                                    height: n * unit - GAP,
                                    marginBottom: GAP,
                                    background: s.color,
                                    borderRadius: s.key === topKey ? "3px 3px 0 0" : 0,
                                  }}
                                />
                              );
                            })}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <div className="mb-2 flex items-baseline gap-2">
                          <span className="font-display text-[13px] font-semibold">Cycle {h.runId}</span>
                          <span className="font-mono text-[10px] text-ink-4">{timeAgo(h.startedAt)}</span>
                        </div>
                        <div className="grid gap-1">
                          {SERIES.map((s) => (
                            <div key={s.key} className="flex items-center gap-2">
                              <span aria-hidden className="inline-block h-0.5 w-3.5" style={{ background: s.color }} />
                              <span className="font-mono text-[12px] font-semibold text-ink tabular-nums">
                                {counts[s.key]}
                              </span>
                              <span className="text-[12px] text-ink-3">{s.label.toLowerCase()}</span>
                            </div>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex gap-[3px]">
              {history.map((h, i) => (
                <span
                  key={h.runId}
                  style={{ maxWidth: BAND_MAX }}
                  className="min-w-0 flex-1 basis-0 text-center font-mono text-[9.5px] text-ink-4 tabular-nums"
                >
                  {labelAt.has(i) ? `#${h.runId}` : "\u00a0"}
                </span>
              ))}
            </div>
            <div className="mt-1.5 font-mono text-[9.5px] tracking-[0.08em] text-ink-4 uppercase">
              oldest &rarr; newest
            </div>
          </div>
        </div>
      </TooltipProvider>

      <table className="sr-only">
        <caption>Scraper health per cycle</caption>
        <thead>
          <tr>
            <th>Cycle</th>
            <th>Started</th>
            {SERIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.runId}>
              <td>{h.runId}</td>
              <td>{h.startedAt}</td>
              <td>{h.broken}</td>
              <td>{h.dissenting}</td>
              <td>{h.healthy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
