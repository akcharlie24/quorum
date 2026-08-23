export function LogoMark({ size = 26, tone = "ink" }: { size?: number; tone?: "ink" | "paper" }) {
  const line = tone === "paper" ? "rgba(239,239,236,.9)" : "var(--ink)";
  const dot = tone === "paper" ? "#8f8aff" : "var(--brand)";
  const wash = tone === "paper" ? "rgba(239,239,236,.16)" : "rgba(32,30,42,.09)";

  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <g strokeWidth={1.6} stroke={line}>
        <circle className="n1" cx="16" cy="10.2" r="8.4" fill={wash} style={{ transformOrigin: "16px 10.2px" }} />
        <circle className="n2" cx="9.4" cy="21.4" r="8.4" fill={wash} style={{ transformOrigin: "9.4px 21.4px" }} />
        <circle className="n3" cx="22.6" cy="21.4" r="8.4" fill={wash} style={{ transformOrigin: "22.6px 21.4px" }} />
      </g>
      <circle cx="16" cy="17.6" r="3.1" fill={dot} />
    </svg>
  );
}

export function Logo({
  size = 26,
  tone = "ink",
  tag,
  href = "/",
  onClick,
}: {
  size?: number;
  tone?: "ink" | "paper";
  tag?: string;
  href?: string | null;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const inner = (
    <>
      <LogoMark size={size} tone={tone} />
      <span>
        <span className="logo-word" style={tone === "paper" ? { color: "var(--paper)" } : undefined}>
          Quorum
        </span>
        {tag && <span className="logo-tag">{tag}</span>}
      </span>
    </>
  );
  if (href === null) return <span className="logo">{inner}</span>;
  return (
    <a className="logo" href={href} onClick={onClick}>
      {inner}
    </a>
  );
}
