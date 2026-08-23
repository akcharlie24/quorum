"use client";

const W = 620;
const H = 260;
const PAD_L = 46;
const PAD_R = 20;
const PAD_T = 22;
const PAD_B = 40;

const TRUTH = [131, 129, 134, 130, 128, 132, 130, 129, 131, 130, 133, 129];
const BREAK_AT = 5;
const BROKEN = [132, 0, 0, 0, 0, 0, 0];

const maxY = 145;
const x = (i: number) => PAD_L + (i * (W - PAD_L - PAD_R)) / (TRUTH.length - 1);
const y = (v: number) => PAD_T + (1 - v / maxY) * (H - PAD_T - PAD_B);
const line = (arr: number[], offset = 0) =>
  arr.map((v, i) => `${i ? "L" : "M"}${x(i + offset).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

export function SilentDrift() {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Chart: one scraper's values fall to zero without raising an error">

      {[0, 50, 100, 145].map((v) => (
        <g key={v}>
          <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={PAD_L - 9} y={y(v) + 3.5} textAnchor="end" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-4)">
            {v}
          </text>
        </g>
      ))}


      <line x1={x(5.5)} y1={PAD_T - 6} x2={x(5.5)} y2={H - PAD_B} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="3 3" />
      <text x={x(5.5) + 7} y={PAD_T + 4} fontFamily="var(--mono)" fontSize="9" letterSpacing=".06em" fill="var(--ink-3)">
        SITE REDESIGN
      </text>

      <rect x={x(5.5)} y={PAD_T} width={W - PAD_R - x(5.5)} height={H - PAD_T - PAD_B} fill="var(--break)" opacity=".05" />

      <path d={line(TRUTH)} fill="none" stroke="var(--agree)" strokeWidth="2" strokeLinejoin="round" className="draw" style={{ ["--len" as string]: 900 }} />
      <path d={line(BROKEN, BREAK_AT)} fill="none" stroke="var(--break)" strokeWidth="2" strokeLinejoin="round" strokeDasharray="5 4" />

      {TRUTH.map((v, i) => (
        <circle key={`t${i}`} cx={x(i)} cy={y(v)} r="2.6" fill="var(--agree)" />
      ))}
      {BROKEN.map((v, i) =>
        i > 0 ? <circle key={`b${i}`} cx={x(i + BREAK_AT)} cy={y(v)} r="2.6" fill="var(--break)" /> : null
      )}

      <g>
        <path d={`M${x(8.4)} ${y(56)} C ${x(8.4)} ${y(34)}, ${x(8.8)} ${y(16)}, ${x(9.2)} ${y(3)}`} fill="none" stroke="var(--break)" strokeWidth="1.1" strokeLinecap="round" opacity=".7" />
        <path d={`M${x(9.2)} ${y(3)} l -7 -1 m 7 1 l -3 6`} fill="none" stroke="var(--break)" strokeWidth="1.1" strokeLinecap="round" opacity=".7" />
        <text x={x(8.1)} y={y(62)} fontFamily="var(--hand)" fontSize="18" fill="var(--break)">
          still &quot;200 OK&quot;
        </text>
      </g>

      <g transform={`translate(${PAD_L}, ${H - 14})`}>
        <line x1="0" y1="-4" x2="18" y2="-4" stroke="var(--agree)" strokeWidth="2" />
        <text x="24" y="0" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-3)">consensus of 2 survivors</text>
        <line x1="182" y1="-4" x2="200" y2="-4" stroke="var(--break)" strokeWidth="2" strokeDasharray="5 4" />
        <text x="206" y="0" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-3)">the scraper that broke silently</text>
      </g>
    </svg>
  );
}
