'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  ChevronRight,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

const footerLinks = [
  {
    title: 'Product',
    links: [
      { id: 1, title: 'Features', url: '/features' },
      { id: 3, title: 'Book demo', url: '/contact' },
    ],
  },
  {
    title: 'Clinic',
    links: [
      { id: 4, title: 'Dashboard', url: '/dashboard' },
      { id: 5, title: 'AI receptionist', url: '/dashboard/ai-receptionist' },
      { id: 6, title: 'Integrations', url: '/dashboard/integrations' },
    ],
  },
  {
    title: 'Company',
    links: [
      { id: 7, title: 'Contact', url: '/contact' },
      { id: 8, title: 'Privacy', url: '/privacy' },
      { id: 9, title: 'Terms', url: '/terms' },
    ],
  },
];

const trustBadges = [
  { label: 'Encrypted', icon: LockKeyhole },
  { label: 'GDPR-aware', icon: ShieldCheck },
  { label: 'Clinic-ready', icon: Stethoscope },
];

const getRGBA = (cssColor: React.CSSProperties['color']) => {
  if (typeof window === 'undefined' || !cssColor) {
    return 'rgba(107, 114, 128, 1)';
  }

  const element = document.createElement('div');
  element.style.color = cssColor;
  document.body.appendChild(element);
  const computedColor = window.getComputedStyle(element).color;
  document.body.removeChild(element);

  return computedColor || 'rgba(107, 114, 128, 1)';
};

const colorWithOpacity = (color: string, opacity: number) => {
  const match = color.match(/\d+(\.\d+)?/g);

  if (!match || match.length < 3) {
    return color;
  }

  const [r, g, b] = match;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

interface FlickeringGridProps extends React.HTMLAttributes<HTMLDivElement> {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  maxOpacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number | string;
}

export const FlickeringGrid: React.FC<FlickeringGridProps> = ({
  squareSize = 3,
  gridGap = 3,
  flickerChance = 0.2,
  color = '#6B7280',
  width,
  height,
  className,
  maxOpacity = 0.15,
  text = '',
  fontSize = 140,
  fontWeight = 600,
  ...props
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const memoizedColor = useMemo(() => getRGBA(color), [color]);

  const drawGrid = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      widthPx: number,
      heightPx: number,
      cols: number,
      rows: number,
      squares: Float32Array,
      dpr: number
    ) => {
      ctx.clearRect(0, 0, widthPx, heightPx);

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = widthPx;
      maskCanvas.height = heightPx;
      const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
      if (!maskCtx) {
        return;
      }

      if (text) {
        maskCtx.save();
        maskCtx.scale(dpr, dpr);
        maskCtx.fillStyle = 'white';
        maskCtx.font = `${fontWeight} ${fontSize}px var(--font-sans), system-ui, sans-serif`;
        maskCtx.textAlign = 'center';
        maskCtx.textBaseline = 'middle';
        maskCtx.fillText(text, widthPx / (2 * dpr), heightPx / (2 * dpr));
        maskCtx.restore();
      }

      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const x = i * (squareSize + gridGap) * dpr;
          const y = j * (squareSize + gridGap) * dpr;
          const squareWidth = squareSize * dpr;
          const squareHeight = squareSize * dpr;

          const maskData = maskCtx.getImageData(
            x,
            y,
            squareWidth,
            squareHeight
          ).data;
          const hasText = maskData.some(
            (value, index) => index % 4 === 0 && value > 0
          );

          const opacity = squares[i * rows + j];
          const finalOpacity = hasText
            ? Math.min(1, opacity * 3 + 0.4)
            : opacity;

          ctx.fillStyle = colorWithOpacity(memoizedColor, finalOpacity);
          ctx.fillRect(x, y, squareWidth, squareHeight);
        }
      }
    },
    [memoizedColor, squareSize, gridGap, text, fontSize, fontWeight]
  );

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, widthPx: number, heightPx: number) => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = widthPx * dpr;
      canvas.height = heightPx * dpr;
      canvas.style.width = `${widthPx}px`;
      canvas.style.height = `${heightPx}px`;

      const cols = Math.ceil(widthPx / (squareSize + gridGap));
      const rows = Math.ceil(heightPx / (squareSize + gridGap));
      const squares = new Float32Array(cols * rows);

      for (let i = 0; i < squares.length; i += 1) {
        squares[i] = Math.random() * maxOpacity;
      }

      return { cols, rows, squares, dpr };
    },
    [squareSize, gridGap, maxOpacity]
  );

  const updateSquares = useCallback(
    (squares: Float32Array, deltaTime: number) => {
      for (let i = 0; i < squares.length; i += 1) {
        if (Math.random() < flickerChance * deltaTime) {
          squares[i] = Math.random() * maxOpacity;
        }
      }
    },
    [flickerChance, maxOpacity]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let animationFrameId = 0;
    let gridParams: ReturnType<typeof setupCanvas>;

    const updateCanvasSize = () => {
      const newWidth = width || container.clientWidth;
      const newHeight = height || container.clientHeight;
      setCanvasSize({ width: newWidth, height: newHeight });
      gridParams = setupCanvas(canvas, newWidth, newHeight);
    };

    updateCanvasSize();

    let lastTime = 0;
    const animate = (time: number) => {
      if (!isInView) {
        return;
      }

      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;

      updateSquares(gridParams.squares, deltaTime);
      drawGrid(
        ctx,
        canvas.width,
        canvas.height,
        gridParams.cols,
        gridParams.rows,
        gridParams.squares,
        gridParams.dpr
      );
      animationFrameId = requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(canvas);

    if (isInView) {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [setupCanvas, updateSquares, drawGrid, width, height, isInView]);

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)} {...props}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
        }}
      />
    </div>
  );
};

function useMediaQuery(query: string) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const checkQuery = () => setValue(mediaQuery.matches);

    checkQuery();
    mediaQuery.addEventListener('change', checkQuery);

    return () => {
      mediaQuery.removeEventListener('change', checkQuery);
    };
  }, [query]);

  return value;
}

export const Component = () => {
  const tablet = useMediaQuery('(max-width: 1024px)');

  return (
    <footer id="footer" className="w-full border-t border-foreground/[0.06] pb-0">
      <div className="flex flex-col gap-10 p-10 md:flex-row md:items-start md:justify-between">
        <div className="mx-0 flex max-w-xs flex-col items-start justify-start gap-y-5">
          <Link href="/" className="flex items-center gap-2" aria-label="Dentora">
            <Image
              src="/dentora.png"
              alt="Dentora"
              width={678}
              height={581}
              className="h-14 w-auto"
            />
          </Link>
          <p className="font-medium tracking-tight text-muted-foreground">
            AI receptionist for dental clinics. Dentora answers, triages, and
            organizes patient calls so your team can stay focused.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {trustBadges.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                <Icon className="size-3.5 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="pt-5 md:w-1/2">
          <div className="flex flex-col items-start justify-start gap-y-7 md:flex-row md:items-start md:justify-between lg:pl-10">
            {footerLinks.map((column) => (
              <ul key={column.title} className="flex flex-col gap-y-2">
                <li className="mb-2 text-sm font-semibold text-primary">
                  {column.title}
                </li>
                {column.links.map((link) => (
                  <li
                    key={link.id}
                    className="group inline-flex cursor-pointer items-center justify-start gap-1 text-[15px]/snug text-muted-foreground"
                  >
                    <Link href={link.url}>{link.title}</Link>
                    <div className="flex size-4 translate-x-0 transform items-center justify-center rounded border border-border opacity-0 transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:opacity-100">
                      <ChevronRight className="size-3" />
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
      <div className="relative z-0 mt-0 h-32 w-full md:h-40">
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-transparent from-40% to-background" />
        <div className="absolute inset-0 mx-6">
          <FlickeringGrid
            text={tablet ? 'Dentora' : 'Never miss a patient call'}
            fontSize={tablet ? 56 : 72}
            className="h-full w-full"
            squareSize={2}
            gridGap={tablet ? 2 : 3}
            color="var(--muted-foreground)"
            maxOpacity={0.3}
            flickerChance={0.1}
          />
        </div>
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm font-mono uppercase tracking-[0.14em] text-muted-foreground md:text-base">
          <Layers3 className="size-5" />
          <span>Dentora</span>
          <span className="text-foreground/30">/</span>
          <span>
            Built by{' '}
            <Link
              href="https://clientreach.ai"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Client Reach AI
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
};

export { Component as FlickeringFooter };
