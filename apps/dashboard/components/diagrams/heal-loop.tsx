const CX = 310;
const CY = 200;
const R = 128;

const STATIONS = [
  { a: -90, n: "01", t: "A scraper loses the vote", d: "outvoted on 6 cells", anchor: "middle", dx: 0, dy: -40 },
  { a: -18, n: "02", t: "Repair requested", d: "prompt written from the diff", anchor: "start", dx: 20, dy: 4 },
  { a: 54, n: "03", t: "Preview comes back", d: 'status: "awaiting_approval"', anchor: "start", dx: 18, dy: 16 },
  { a: 126, n: "04", t: "Preview is scored", d: "field-by-field vs consensus", anchor: "end", dx: -18, dy: 16 },
  { a: 198, n: "05", t: "Approved, or rejected", d: "≥90% match, else retry", anchor: "end", dx: -20, dy: 4 },
] as const;

const pt = (a: number) => [CX + R * Math.cos((a * Math.PI) / 180), CY + R * Math.sin((a * Math.PI) / 180)] as const;

export function HealLoop() {
  const ringPath = `M ${CX} ${CY - R} A ${R} ${R} 0 1 1 ${CX - 0.01} ${CY - R} Z`;

  return (
    <svg viewBox="0 0 620 420" width="100%" role="img" aria-label="The verified healing loop: detect, repair, score, approve or reject">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--line-2)" strokeWidth="1.2" />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--brand)" strokeWidth="1.4" strokeDasharray="6 8" opacity=".5" className="flow" />

      <circle r="5" fill="var(--brand)">
        <animateMotion dur="11s" repeatCount="indefinite" path={ringPath} rotate="auto" />
      </circle>
      <circle r="10" fill="var(--brand)" opacity=".18">
        <animateMotion dur="11s" repeatCount="indefinite" path={ringPath} />
      </circle>

      {STATIONS.map((s) => {
        const [px, py] = pt(s.a);
        return (
          <g key={s.n}>
            <rect x={px - 13} y={py - 13} width="26" height="26" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.3" />
            <text x={px} y={py + 4} textAnchor="middle" fontFamily="var(--mono)" fontSize="10.5" fontWeight="600" fill="var(--ink)">
              {s.n}
            </text>
            <text
              x={px + s.dx} y={py + s.dy} textAnchor={s.anchor}
              fontFamily="var(--display)" fontSize="13" fontWeight="600" fill="var(--ink)"
            >
              {s.t}
            </text>
            <text
              x={px + s.dx} y={py + s.dy + 15} textAnchor={s.anchor}
              fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-4)"
            >
              {s.d}
            </text>
          </g>
        );
      })}

      <g>
        <rect x={CX - 76} y={CY - 46} width="152" height="92" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.4" />
        <text x={CX} y={CY - 27} textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5" letterSpacing=".13em" fill="var(--ink-3)">
          PREVIEW MATCH
        </text>
        <text x={CX} y={CY + 6} textAnchor="middle" fontFamily="var(--display)" fontSize="30" fontWeight="600" fill="var(--ink)">
          94%
        </text>
        <rect x={CX - 52} y={CY + 18} width="104" height="22" fill="var(--agree-soft)" stroke="var(--agree)" strokeWidth="1" />
        <text x={CX} y={CY + 33} textAnchor="middle" fontFamily="var(--mono)" fontSize="10" letterSpacing=".1em" fill="var(--agree)">
          APPROVED
        </text>
      </g>

      <text x={CX} y={CY + 74} textAnchor="middle" fontFamily="var(--hand)" fontSize="18" fill="var(--brand)">
        no --auto-approve, no human
      </text>
    </svg>
  );
}
