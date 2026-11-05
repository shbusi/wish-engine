import type { ChannelVisual } from "@/lib/channels";

/**
 * Data-driven SVG scene for each ritual. `count` is the channel's total
 * offered wishes; the scene grows with it (capped so it stays legible).
 * Deterministic pseudo-random placement so server and client render identically.
 */
function rnd(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function RitualScene({ visual, count, hue }: { visual: ChannelVisual; count: number; hue: number }) {
  const n = Math.max(1, Math.min(count, 60));
  const r = rnd(n * 7919 + 17);
  const W = 640, H = 320;
  const accent = `hsl(${hue} 70% 60%)`;
  const accent2 = `hsl(${hue} 60% 45%)`;

  let body: React.ReactNode;
  switch (visual) {
    case "cairn": {
      const stones = Math.min(n, 18);
      body = (
        <g>
          <rect x={0} y={H - 30} width={W} height={30} fill="#2a2419" />
          {Array.from({ length: stones }, (_, i) => {
            const w = 150 - i * 6, h = 20 - i * 0.4;
            const x = W / 2 - w / 2 + (r() - 0.5) * 10, y = H - 32 - (i + 1) * h;
            return <ellipse key={i} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={i % 2 ? "#6b5f52" : "#857668"} stroke="#3a3128" />;
          })}
        </g>
      );
      break;
    }
    case "ema": {
      const cols = 8, rows = Math.min(3, Math.ceil(n / cols));
      body = (
        <g>
          {Array.from({ length: rows }, (_, row) => (
            <g key={row}>
              <line x1={30} y1={60 + row * 90} x2={W - 30} y2={60 + row * 90} stroke="#5b4636" strokeWidth={4} />
              {Array.from({ length: Math.min(cols, n - row * cols) }, (_, c) => {
                const x = 50 + c * 74, y = 68 + row * 90;
                return (
                  <g key={c} className="anim-sway" style={{ animationDelay: `${(r() * 4).toFixed(2)}s` }}>
                    <polygon points={`${x},${y + 8} ${x + 30},${y} ${x + 60},${y + 8} ${x + 60},${y + 55} ${x},${y + 55}`} fill="#c9a06a" stroke="#7a5a3a" />
                    <line x1={x + 10} y1={y + 22} x2={x + 50} y2={y + 22} stroke="#7a5a3a" strokeWidth={1.5} />
                    <line x1={x + 10} y1={y + 32} x2={x + 44} y2={y + 32} stroke="#7a5a3a" strokeWidth={1.5} />
                    <line x1={x + 10} y1={y + 42} x2={x + 36} y2={y + 42} stroke="#7a5a3a" strokeWidth={1.5} />
                  </g>
                );
              })}
            </g>
          ))}
        </g>
      );
      break;
    }
    case "fountain": {
      body = (
        <g>
          <ellipse cx={W / 2} cy={H - 60} rx={260} ry={50} fill="#1d3a5a" stroke="#2c5a86" strokeWidth={3} />
          <rect x={W / 2 - 20} y={80} width={40} height={130} fill="#6c7a89" />
          <ellipse cx={W / 2} cy={80} rx={60} ry={14} fill="#8595a5" />
          {Array.from({ length: 12 }, (_, i) => (
            <circle key={`d${i}`} cx={W / 2 + (i - 6) * 9} cy={60 - Math.abs(i - 6) * 3} r={3} fill="#9fd0ff" opacity={0.7} className="anim-float" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
          {Array.from({ length: Math.min(n, 60) }, (_, i) => (
            <ellipse key={i} cx={W / 2 + (r() - 0.5) * 440} cy={H - 60 + (r() - 0.5) * 60} rx={7} ry={4} fill={accent} stroke={accent2} />
          ))}
        </g>
      );
      break;
    }
    case "lantern": {
      body = (
        <g>
          <rect x={0} y={0} width={W} height={H} fill="#070914" />
          {Array.from({ length: 40 }, (_, i) => <circle key={`s${i}`} cx={r() * W} cy={r() * H} r={r() * 1.2} fill="#fff" opacity={0.6} />)}
          {Array.from({ length: Math.min(n, 30) }, (_, i) => {
            const x = r() * W, y = 40 + r() * (H - 80), s = 0.5 + r() * 0.8;
            return (
              <g key={i} transform={`translate(${x} ${y}) scale(${s})`} className="anim-float" style={{ animationDelay: `${(r() * 6).toFixed(2)}s`, animationDuration: `${6 + r() * 6}s` }}>
                <path d="M-14,-30 L14,-30 L18,10 L-18,10 Z" fill="#ff9a3c" opacity={0.95} />
                <rect x={-6} y={10} width={12} height={5} fill="#ffd27f" className="anim-flicker" />
                <ellipse cx={0} cy={-8} rx={20} ry={28} fill="#ffb347" opacity={0.18} />
              </g>
            );
          })}
        </g>
      );
      break;
    }
    case "ribbon-tree": {
      body = (
        <g>
          <rect x={W / 2 - 18} y={150} width={36} height={170} fill="#4a3728" />
          <circle cx={W / 2} cy={130} r={120} fill="#2f6b3a" />
          <circle cx={W / 2 - 90} cy={160} r={70} fill="#2a5f33" />
          <circle cx={W / 2 + 95} cy={165} r={75} fill="#2a5f33" />
          {Array.from({ length: Math.min(n, 60) }, (_, i) => {
            const a = r() * Math.PI * 2, d = r() * 110;
            const x = W / 2 + Math.cos(a) * d, y = 130 + Math.sin(a) * d;
            const c = [`hsl(${hue} 80% 55%)`, "#ffd166", "#ef476f", "#f8f9fa"][i % 4];
            return <path key={i} d={`M${x},${y} q4,12 0,24 q-4,12 2,22`} stroke={c} strokeWidth={4} fill="none" className="anim-sway" style={{ animationDelay: `${(r() * 4).toFixed(2)}s` }} />;
          })}
        </g>
      );
      break;
    }
    case "wall": {
      body = (
        <g>
          {Array.from({ length: 7 }, (_, row) =>
            Array.from({ length: 6 }, (_, col) => {
              const off = row % 2 ? 50 : 0;
              return <rect key={`${row}-${col}`} x={col * 110 - off} y={row * 46} width={106} height={42} fill={row % 2 ? "#b59b73" : "#c4aa80"} stroke="#8c7352" rx={3} />;
            }),
          )}
          {Array.from({ length: Math.min(n, 60) }, (_, i) => {
            const row = Math.floor(r() * 7), col = Math.floor(r() * 6);
            const off = row % 2 ? 50 : 0;
            return <rect key={i} x={col * 110 - off + 100} y={row * 46 + 14} width={9} height={16} fill="#fdf6e3" stroke="#9c8a6a" transform={`rotate(${(r() - 0.5) * 30} ${col * 110 - off + 104} ${row * 46 + 22})`} />;
          })}
        </g>
      );
      break;
    }
    case "candle": {
      const cols = 12, rows = Math.min(3, Math.ceil(n / cols));
      body = (
        <g>
          <rect x={0} y={0} width={W} height={H} fill="#0d0a08" />
          {Array.from({ length: rows }, (_, row) => (
            <g key={row}>
              <rect x={40} y={110 + row * 70} width={W - 80} height={6} fill="#3a2a1a" />
              {Array.from({ length: Math.min(cols, n - row * cols) }, (_, c) => {
                const x = 60 + c * 46, y = 110 + row * 70;
                return (
                  <g key={c}>
                    <rect x={x} y={y - 34} width={14} height={34} fill="#f3e5c0" rx={2} />
                    <ellipse cx={x + 7} cy={y - 42} rx={4} ry={8} fill="#ffb84d" className="anim-flicker" style={{ animationDelay: `${(r() * 1.6).toFixed(2)}s` }} />
                    <ellipse cx={x + 7} cy={y - 42} rx={16} ry={22} fill="#ffb84d" opacity={0.08} />
                  </g>
                );
              })}
            </g>
          ))}
        </g>
      );
      break;
    }
    case "krathong":
    case "diya": {
      const isDiya = visual === "diya";
      body = (
        <g>
          <rect x={0} y={0} width={W} height={H} fill="#07101c" />
          <rect x={0} y={140} width={W} height={H - 140} fill="#0f2a44" />
          {Array.from({ length: Math.min(n, 30) }, (_, i) => {
            const x = r() * W, y = 160 + r() * 130, s = 0.6 + r() * 0.6;
            return (
              <g key={i} transform={`translate(${x} ${y}) scale(${s})`} className="anim-float" style={{ animationDelay: `${(r() * 6).toFixed(2)}s`, animationDuration: `${8 + r() * 6}s` }}>
                {isDiya ? (
                  <path d="M-16,0 q16,12 32,0 l-4,-6 h-24 z" fill="#b5651d" />
                ) : (
                  <ellipse cx={0} cy={0} rx={20} ry={8} fill="#2f8f4e" />
                )}
                {!isDiya && <circle cx={-8} cy={-4} r={4} fill="#ff7eb6" />}
                {!isDiya && <circle cx={8} cy={-4} r={4} fill="#ffd166" />}
                <ellipse cx={0} cy={-10} rx={3} ry={6} fill="#ffcf5c" className="anim-flicker" />
                <ellipse cx={0} cy={12} rx={22} ry={6} fill="#ffcf5c" opacity={0.12} />
              </g>
            );
          })}
        </g>
      );
      break;
    }
    case "bonfim": {
      body = (
        <g>
          <rect x={0} y={0} width={W} height={H} fill="#f4efe6" />
          <rect x={40} y={40} width={W - 80} height={12} fill="#6b4a2b" />
          {Array.from({ length: Math.min(n, 48) }, (_, i) => {
            const x = 50 + (i % 24) * 23 + (i >= 24 ? 10 : 0);
            const c = ["#2b9348", "#ffd166", "#ef476f", "#118ab2", "#ff9f1c", "#8338ec", "#ffffff"][i % 7];
            const len = 150 + r() * 100;
            return (
              <g key={i} className="anim-sway" style={{ animationDelay: `${(r() * 4).toFixed(2)}s`, transformOrigin: `${x}px 52px` }}>
                <rect x={x} y={52} width={10} height={len} fill={c} stroke="#00000022" />
                {[0.3, 0.55, 0.8].map((k) => <circle key={k} cx={x + 5} cy={52 + len * k} r={5} fill={c} stroke="#00000044" />)}
              </g>
            );
          })}
        </g>
      );
      break;
    }
    case "prayer-flag": {
      const cols = ["#1e62d0", "#f5f5f5", "#d62828", "#2a9d3f", "#f4c20d"];
      body = (
        <g>
          <rect x={0} y={0} width={W} height={H} fill="#1a2a3f" />
          <path d="M0,220 Q160,140 320,220 T640,220 L640,320 L0,320 Z" fill="#2f3f55" />
          {[0, 1].map((line) => (
            <g key={line}>
              <path d={`M0,${70 + line * 90} Q${W / 2},${110 + line * 90} ${W},${70 + line * 90}`} stroke="#d9d0c0" strokeWidth={2} fill="none" />
              {Array.from({ length: Math.min(16, Math.max(0, n - line * 16)) }, (_, i) => {
                const x = 20 + i * 38, yy = 70 + line * 90 + Math.sin((i / 16) * Math.PI) * 40;
                return <path key={i} d={`M${x},${yy} h30 l-3,22 q-12,6 -24,0 z`} fill={cols[(i + line) % 5]} className="anim-sway" style={{ animationDelay: `${(r() * 4).toFixed(2)}s`, transformOrigin: `${x + 15}px ${yy}px` }} />;
              })}
            </g>
          ))}
        </g>
      );
      break;
    }
    case "star":
    default: {
      body = (
        <g>
          <rect x={0} y={0} width={W} height={H} fill="#06061a" />
          {Array.from({ length: 80 }, (_, i) => <circle key={`s${i}`} cx={r() * W} cy={r() * H} r={r() * 1.5} fill="#fff" opacity={0.3 + r() * 0.6} />)}
          {Array.from({ length: Math.min(n, 20) }, (_, i) => {
            const x = r() * W, y = r() * H * 0.7;
            return (
              <g key={i} className="anim-flicker" style={{ animationDelay: `${(r() * 2).toFixed(2)}s` }}>
                <line x1={x} y1={y} x2={x - 60} y2={y + 30} stroke={accent} strokeWidth={2} opacity={0.6} />
                <circle cx={x} cy={y} r={3} fill="#fff" />
              </g>
            );
          })}
        </g>
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-2xl" role="img" aria-label={`${visual} scene with ${count} wishes`}>
      {body}
    </svg>
  );
}
