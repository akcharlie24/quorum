
function Page({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 236 150" width="100%" aria-hidden>
      <rect x="1" y="1" width="234" height="148" fill="var(--paper-2)" stroke="var(--line-2)" strokeWidth="1" />
      <rect x="1" y="1" width="234" height="15" fill="var(--line-2)" />
      <rect x="16" y="30" width="52" height="52" fill="var(--line-2)" opacity=".55" />
      <rect x="78" y="30" width="86" height="7" fill="var(--line-2)" />
      <rect x="78" y="43" width="62" height="7" fill="var(--line-2)" opacity=".7" />
      <rect x="16" y="94" width="52" height="6" fill="var(--line-2)" opacity=".5" />
      <rect x="16" y="106" width="120" height="6" fill="var(--line-2)" opacity=".5" />
      <rect x="16" y="118" width="94" height="6" fill="var(--line-2)" opacity=".5" />
      {children}
    </svg>
  );
}

const PRICE = { x: 78, y: 60, w: 62, h: 20 };

function priceBox(stroke: string, fill: string) {
  return (
    <>
      <rect x={PRICE.x} y={PRICE.y} width={PRICE.w} height={PRICE.h} fill={fill} stroke={stroke} strokeWidth="1.2" />
      <text x={PRICE.x + PRICE.w / 2} y={PRICE.y + 14} textAnchor="middle" fontFamily="var(--mono)" fontSize="11" fill="var(--ink)">
        $129.99
      </text>
    </>
  );
}

export function StrategyCss() {
  return (
    <Page>
      {priceBox("var(--brand)", "var(--card)")}
      <rect x={PRICE.x - 4} y={PRICE.y - 4} width={PRICE.w + 8} height={PRICE.h + 8} fill="none" stroke="var(--brand)" strokeWidth="1" strokeDasharray="3 3" className="flow" />
      <rect x="150" y="56" width="74" height="17" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth=".9" />
      <text x="187" y="68" textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5" fill="var(--brand)">.price-tag</text>
      <line x1="142" y1="66" x2="150" y2="66" stroke="var(--brand)" strokeWidth="1" />
    </Page>
  );
}

export function StrategyText() {
  return (
    <Page>
      {priceBox("var(--agree)", "var(--card)")}
      <rect x="16" y="60" width="52" height="20" fill="var(--agree-soft)" stroke="var(--agree)" strokeWidth="1.1" />
      <text x="42" y="74" textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5" fill="var(--agree)">Price:</text>
      <path d="M68 70 L 76 70" stroke="var(--agree)" strokeWidth="1.2" className="flow" />
      <text x="150" y="70" fontFamily="var(--hand)" fontSize="15" fill="var(--agree)">read the label</text>
    </Page>
  );
}

export function StrategyDom() {
  return (
    <Page>
      {priceBox("var(--dissent-2)", "var(--card)")}
      <path
        d="M150 26 L150 44 M150 44 L164 44 M150 44 L150 62 M150 62 L164 62 M150 62 L150 70 M150 70 L 74 70"
        fill="none" stroke="var(--dissent-2)" strokeWidth="1.1" strokeLinecap="round"
      />
      <circle cx="150" cy="26" r="3" fill="var(--dissent-2)" />
      <circle cx="150" cy="44" r="3" fill="var(--dissent-2)" />
      <circle cx="150" cy="62" r="3" fill="var(--dissent-2)" />
      <text x="170" y="29" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)">ul</text>
      <text x="170" y="47" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)">li[2]</text>
      <text x="170" y="65" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)">span[3]</text>
    </Page>
  );
}
