"use client";

import { useEffect, useState } from "react";


const SCRAPERS = [
  { y: 20, label: "CSS selectors", hint: ".price-tag", value: "129.99", ok: true },
  { y: 166, label: "Text anchors", hint: 'near "Price:"', value: "129.99", ok: true },
  { y: 312, label: "DOM structure", hint: "div > span:3", value: "0.00", ok: false },
];

const CARD_X = 176;
const CARD_W = 152;
const CARD_H = 76;

export function ConsensusEngine() {
  const [phase, setPhase] = useState(4);

  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % 6), 1500);
    return () => clearInterval(t);
  }, []);

  const lit = phase >= 1;
  const extracted = phase >= 2;
  const voted = phase >= 3;
  const emitted = phase >= 4;

  return (
    <svg viewBox="0 0 664 412" width="100%" role="img" aria-label="Three scrapers extract the same value; a majority vote decides the output">
      <defs>
        <marker id="ce-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 1 L6 4 L0 7 z" fill="var(--ink-4)" />
        </marker>
      </defs>

      <g className="float-a">
        <rect x="12" y="168" width="116" height="80" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.2" />
        <rect x="12" y="168" width="116" height="17" fill="var(--ink)" />
        <circle cx="21" cy="176.5" r="2" fill="var(--paper)" opacity=".7" />
        <circle cx="28" cy="176.5" r="2" fill="var(--paper)" opacity=".45" />
        <rect x="22" y="196" width="60" height="5" fill="var(--line-2)" />
        <rect x="22" y="207" width="86" height="5" fill="var(--line-2)" />
        <rect x="22" y="222" width="42" height="13" fill="var(--marker)" stroke="var(--ink)" strokeWidth=".8" />
        <text x="43" y="231.5" textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5" fill="var(--ink)">$129.99</text>
        <text x="70" y="262" textAnchor="middle" fontFamily="var(--mono)" fontSize="9" letterSpacing=".08em" fill="var(--ink-4)">
          ONE URL
        </text>
      </g>

      {SCRAPERS.map((s, i) => (
        <path
          key={`in-${i}`}
          d={`M128 208 C 152 208, 152 ${s.y + CARD_H / 2}, ${CARD_X - 4} ${s.y + CARD_H / 2}`}
          fill="none"
          stroke="var(--ink-4)"
          strokeWidth="1.1"
          markerEnd="url(#ce-arrow)"
          pathLength={1}
          strokeDasharray="1"
          style={{ strokeDashoffset: lit ? 0 : 1, transition: "stroke-dashoffset .6s ease" }}
        />
      ))}

      {SCRAPERS.map((s, i) => {
        const outvoted = voted && !s.ok;
        const accent = outvoted ? "var(--break)" : voted && s.ok ? "var(--agree)" : "var(--ink)";
        return (
          <g key={s.label} style={{ opacity: lit ? 1 : 0.32, transition: "opacity .45s ease" }}>
            <rect
              x={CARD_X} y={s.y} width={CARD_W} height={CARD_H}
              fill="var(--card)" stroke={accent} strokeWidth={outvoted ? 1.6 : 1.2}
              style={{ transition: "stroke .4s ease" }}
            />
            <rect x={CARD_X} y={s.y} width="3" height={CARD_H} fill={accent} style={{ transition: "fill .4s ease" }} />
            <text x={CARD_X + 15} y={s.y + 23} fontFamily="var(--display)" fontSize="12.5" fontWeight="600" fill="var(--ink)">
              {s.label}
            </text>
            <text x={CARD_X + 15} y={s.y + 38} fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-4)">
              {s.hint}
            </text>

            <g style={{ opacity: extracted ? 1 : 0, transition: "opacity .4s ease .05s" }}>
              <rect
                x={CARD_X + 15} y={s.y + 47} width="72" height="19"
                fill={outvoted ? "var(--break-soft)" : "var(--paper-2)"}
                stroke={outvoted ? "var(--break)" : "var(--line-2)"} strokeWidth=".9"
                style={{ transition: "fill .4s ease, stroke .4s ease" }}
              />
              <text
                x={CARD_X + 51} y={s.y + 60.5} textAnchor="middle"
                fontFamily="var(--mono)" fontSize="11" fill={outvoted ? "var(--break)" : "var(--ink)"}
                style={{ textDecoration: outvoted ? "line-through" : "none", transition: "fill .4s ease" }}
              >
                {s.value}
              </text>
              {outvoted && (
                <text x={CARD_X + 100} y={s.y + 61} fontFamily="var(--mono)" fontSize="9" letterSpacing=".06em" fill="var(--break)">
                  OUTVOTED
                </text>
              )}
            </g>
          </g>
        );
      })}

      {SCRAPERS.map((s, i) => {
        const d = `M${CARD_X + CARD_W} ${s.y + CARD_H / 2} C 358 ${s.y + CARD_H / 2}, 358 208, 384 208`;
        const stroke = voted && !s.ok ? "var(--break)" : "var(--ink-4)";
        return (
          <g key={`out-${i}`}>
            <path
              d={d} fill="none" stroke={stroke} strokeWidth="1.1"
              pathLength={1} strokeDasharray="1"
              style={{ strokeDashoffset: extracted ? 0 : 1, transition: "stroke-dashoffset .5s ease, stroke .4s ease" }}
            />
            <path
              d={d} fill="none" stroke={stroke} strokeWidth="1.8" className="flow"
              style={{ opacity: extracted && !voted ? 0.75 : 0, transition: "opacity .4s ease, stroke .4s ease" }}
            />
          </g>
        );
      })}

      <g style={{ opacity: extracted ? 1 : 0.3, transition: "opacity .4s ease" }}>
        <rect x="388" y="146" width="98" height="124" fill="var(--card)" stroke="var(--ink)" strokeWidth="1.4" />
        <text x="437" y="167" textAnchor="middle" fontFamily="var(--mono)" fontSize="9" letterSpacing=".14em" fill="var(--ink-3)">
          VOTE
        </text>
        <line x1="388" y1="176" x2="486" y2="176" stroke="var(--line)" strokeWidth="1" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={403 + i * 22} y="190" width="16" height="16"
            fill={voted ? (i < 2 ? "var(--agree)" : "var(--break-soft)") : "var(--paper-2)"}
            stroke={voted && i === 2 ? "var(--break)" : "var(--line-2)"} strokeWidth=".9"
            style={{ transition: `fill .35s ease ${i * 90}ms, stroke .35s ease` }}
          />
        ))}
        <text
          x="437" y="234" textAnchor="middle" fontFamily="var(--display)" fontSize="21" fontWeight="600"
          fill={voted ? "var(--ink)" : "var(--ink-4)"} style={{ transition: "fill .35s ease" }}
        >
          2 / 3
        </text>
        <text x="437" y="251" textAnchor="middle" fontFamily="var(--mono)" fontSize="8.5" letterSpacing=".1em" fill="var(--ink-4)">
          MAJORITY
        </text>
      </g>

      <path
        d="M486 208 L 512 208" fill="none" stroke="var(--ink-4)" strokeWidth="1.1" markerEnd="url(#ce-arrow)"
        pathLength={1} strokeDasharray="1"
        style={{ strokeDashoffset: emitted ? 0 : 1, transition: "stroke-dashoffset .35s ease" }}
      />

      <g
        className="float-b"
        style={{ opacity: emitted ? 1 : 0.25, transition: "opacity .45s ease" }}
      >
        <rect x="522" y="152" width="132" height="112" fill="var(--agree-soft)" stroke="var(--agree)" strokeWidth="1.4" />
        <text x="536" y="174" fontFamily="var(--mono)" fontSize="8.5" letterSpacing=".12em" fill="var(--agree)">
          CONSENSUS
        </text>
        <text x="536" y="208" fontFamily="var(--display)" fontSize="24" fontWeight="600" fill="var(--ink)">
          129.99
        </text>
        <line x1="536" y1="222" x2="640" y2="222" stroke="var(--agree)" strokeWidth=".8" opacity=".4" />
        <text x="536" y="242" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-2)">
          shipped to your DB
        </text>
        <path
          d="M630 166 l4 5 l8 -11" fill="none" stroke="var(--agree)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          pathLength={1} strokeDasharray="1"
          style={{ strokeDashoffset: emitted ? 0 : 1, transition: "stroke-dashoffset .4s ease .15s" }}
        />
      </g>

      <g style={{ opacity: voted ? 1 : 0, transition: "opacity .5s ease" }}>
        <path
          d="M196 400 C 236 398, 262 394, 286 386"
          fill="none" stroke="var(--brand)" strokeWidth="1.2" strokeLinecap="round" opacity=".65"
        />
        <path d="M198 396 l-6 4 l7 3" fill="none" stroke="var(--brand)" strokeWidth="1.2" strokeLinecap="round" opacity=".65" />
        <text x="292" y="393" fontFamily="var(--hand)" fontSize="19" fill="var(--brand)">
          alone, this ships a zero
        </text>
      </g>
    </svg>
  );
}
