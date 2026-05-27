'use client';

const toothOutline =
  'M205 92 L260 63 L337 88 L416 65 L477 91 L503 163 L471 260 L430 312 L398 337 L395 306 L428 240 L446 174 L462 128 L416 65 M205 92 L184 163 L213 253 L257 338 L291 372 L288 337 L256 310 L213 253 L184 163 Z M260 63 L239 107 L256 235 L288 337 M337 88 L373 107 L416 65 M373 107 L428 240 L471 260 M337 88 L303 187 L256 235 L213 253 M303 187 L344 280 L397 306 M344 280 L471 260 M430 312 L397 306 L344 280 L256 310 L257 338';

const neuralLines = [
  [239, 107, 373, 107],
  [239, 107, 303, 187],
  [239, 107, 337, 88],
  [205, 92, 239, 107],
  [184, 163, 239, 107],
  [184, 163, 256, 235],
  [256, 235, 344, 280],
  [213, 253, 344, 280],
  [213, 253, 291, 372],
  [256, 310, 344, 280],
  [303, 187, 428, 240],
  [303, 187, 373, 107],
  [373, 107, 462, 128],
  [373, 107, 477, 91],
  [416, 65, 462, 128],
  [477, 91, 462, 128],
  [477, 91, 503, 163],
  [462, 128, 503, 163],
  [462, 128, 428, 240],
  [503, 163, 428, 240],
  [428, 240, 397, 306],
  [397, 306, 471, 260],
  [430, 312, 397, 306],
];

const nodePositions = [
  [205, 92, 5],
  [260, 63, 4.5],
  [337, 88, 4.5],
  [416, 65, 5],
  [477, 91, 4.8],
  [184, 163, 5.5],
  [239, 107, 5.5],
  [373, 107, 5.5],
  [462, 128, 5],
  [503, 163, 5.5],
  [303, 187, 6.5],
  [428, 240, 7],
  [256, 235, 5],
  [213, 253, 5],
  [471, 260, 5],
  [344, 280, 5],
  [397, 306, 5],
  [430, 312, 4.5],
  [256, 310, 4],
  [288, 337, 4.8],
];

const placements = [{ x: 260, y: 40, scale: 2.8, rotate: 0, opacity: 0.35 }];

function ToothShape() {
  return (
    <>
      <path
        d={toothOutline}
        fill="none"
        stroke="url(#tooth-stroke)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {neuralLines.map(([x1, y1, x2, y2], i) => (
        <line
          key={`l${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="url(#tooth-stroke)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
      {nodePositions.map(([cx, cy, r], i) => (
        <circle key={`n${i}`} cx={cx} cy={cy} r={r} style={{ fill: 'var(--brand-primary)' }} />
      ))}
    </>
  );
}

export function ShatteredToothBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <svg
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="tooth-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: 'var(--brand-primary)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--brand-secondary)' }} />
          </linearGradient>
        </defs>

        {placements.map((p, i) => (
          <g
            key={i}
            opacity={p.opacity}
            transform={`translate(${p.x} ${p.y}) scale(${p.scale}) rotate(${p.rotate} 340 210)`}
          >
            <ToothShape />
          </g>
        ))}
      </svg>
    </div>
  );
}
