import { useEffect, useRef, type ReactNode } from "react";

// 插画描边配色(低饱和,作为背景纹理层)
const LINE = "rgba(37, 99, 235, 0.40)";
const LINE_SOFT = "rgba(37, 99, 235, 0.20)";
const VIOLET = "rgba(124, 58, 237, 0.40)";
const CYAN = "rgba(6, 182, 212, 0.44)";
const PANEL = "rgba(37, 99, 235, 0.09)";

interface Cluster {
  className: string;
  viewBox: string;
  node: ReactNode;
}

/** 蓝图图纸:工程制图风格,置于「宣传」与「登录」的底层。 */
const BLUEPRINT = (
  <g transform="rotate(-5)">
    <rect x="-332" y="-236" width="664" height="472" rx="12" fill="rgba(37,99,235,0.04)" stroke="rgba(37,99,235,0.17)" strokeWidth="1.6" />
    <rect x="-332" y="-236" width="664" height="472" rx="12" fill="url(#bpGrid)" />
    <rect x="-332" y="-236" width="664" height="472" rx="12" fill="url(#bpGridMajor)" />
    <circle cx="-112" cy="-34" r="142" fill="none" stroke="rgba(37,99,235,0.26)" strokeWidth="1.8" />
    <circle cx="-112" cy="-34" r="3.5" fill="rgba(37,99,235,0.4)" />
    <path d="M-112 -34 L66 -178 M-112 -34 L-252 96" fill="none" stroke="rgba(37,99,235,0.2)" strokeWidth="1.2" strokeDasharray="6 6" />
    <path d="M-244 -202 H44" stroke="rgba(6,182,212,0.38)" strokeWidth="1.2" />
    <path d="M-244 -208 V-196 M44 -208 V-196" stroke="rgba(6,182,212,0.38)" strokeWidth="1.2" />
    <path d="M-302 -202 V162" stroke="rgba(6,182,212,0.3)" strokeWidth="1.2" />
    <path d="M-308 162 H-296 M-308 -202 H-296" stroke="rgba(6,182,212,0.3)" strokeWidth="1.2" />
    <path d="M-112 -172 L-58 -202 H44" fill="none" stroke="rgba(37,99,235,0.22)" strokeWidth="1.1" />
    <path d="M-112 108 L-42 150 H72" fill="none" stroke="rgba(37,99,235,0.22)" strokeWidth="1.1" />
    <circle cx="188" cy="-92" r="46" fill="none" stroke="rgba(124,58,237,0.2)" strokeWidth="1.4" />
    <path d="M142 -92 H234 M188 -138 V-46" stroke="rgba(124,58,237,0.16)" strokeWidth="1" />
    <rect x="122" y="146" width="210" height="84" fill="none" stroke="rgba(37,99,235,0.22)" strokeWidth="1.4" />
    <path d="M122 174 H332 M122 202 H332 M234 146 V230" stroke="rgba(37,99,235,0.16)" strokeWidth="1" />
  </g>
);

/**
 * 主题插画簇:学习(书/灯泡/学位帽)、数据(柱状图)、英语(对话气泡)、
 * 写作(铅笔/引号)、管理(组织架构)、心理(大脑)、学科图标组(英语/语文/物理/蓝图)。
 * 每簇一个独立 SVG + 各自 viewBox,由 CSS 锚定到视口边缘,不随容器宽高比被裁切。
 */
const CLUSTERS: Cluster[] = [
  {
    className: "illu-subjects",
    viewBox: "530 26 364 72",
    node: (
      <g strokeLinejoin="round">
        {/* 英语 */}
        <g transform="translate(566 62)">
          <rect x="-30" y="-30" width="60" height="60" rx="15" fill={PANEL} stroke={LINE} strokeWidth="2" />
          <text x="0" y="11" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="26" fontWeight="700" fill="rgba(37,99,235,0.55)">
            Aa
          </text>
        </g>
        {/* 语文 */}
        <g transform="translate(662 62)">
          <rect x="-30" y="-30" width="60" height="60" rx="15" fill={PANEL} stroke={LINE} strokeWidth="2" />
          <text x="0" y="12" textAnchor="middle" fontFamily="'Songti SC', 'SimSun', 'Noto Serif SC', serif" fontSize="30" fill="rgba(37,99,235,0.55)">
            文
          </text>
        </g>
        {/* 物理 */}
        <g transform="translate(758 62)">
          <rect x="-30" y="-30" width="60" height="60" rx="15" fill={PANEL} stroke={LINE} strokeWidth="2" />
          <g fill="none" stroke={CYAN} strokeWidth="1.6">
            <ellipse cx="0" cy="0" rx="19" ry="7.5" />
            <ellipse cx="0" cy="0" rx="19" ry="7.5" transform="rotate(60)" />
            <ellipse cx="0" cy="0" rx="19" ry="7.5" transform="rotate(120)" />
          </g>
          <circle cx="0" cy="0" r="3.6" fill="rgba(6,182,212,0.7)" />
        </g>
        {/* 蓝图 */}
        <g transform="translate(854 62)">
          <rect x="-30" y="-30" width="60" height="60" rx="15" fill={PANEL} stroke={VIOLET} strokeWidth="2" />
          <rect x="-19" y="-19" width="38" height="38" rx="3" fill="none" stroke={VIOLET} strokeWidth="1.4" />
          <path d="M-19 -6 H19 M-19 6 H19 M-6 -19 V19 M6 -19 V19" stroke="rgba(124,58,237,0.38)" strokeWidth="1" />
          <circle cx="0" cy="0" r="9" fill="none" stroke={VIOLET} strokeWidth="1.4" />
        </g>
      </g>
    ),
  },
  {
    className: "illu-learn",
    viewBox: "60 40 280 180",
    node: (
      <g transform="translate(70 44)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 92 C22 80 48 80 68 94 C88 80 114 80 136 92 L136 164 C114 152 88 152 68 166 C48 152 22 152 0 164 Z" fill={PANEL} stroke={LINE} strokeWidth="2.2" />
        <path d="M68 94 L68 166" stroke={LINE} strokeWidth="1.6" />
        <path d="M14 108 H50 M14 122 H50 M86 108 H122 M86 122 H122" stroke={LINE_SOFT} strokeWidth="1.5" />
        <circle cx="212" cy="46" r="26" fill={PANEL} stroke={VIOLET} strokeWidth="2.2" />
        <path d="M200 74 H224 M204 84 H220" stroke={VIOLET} strokeWidth="2.2" />
        <path d="M212 20 V6 M178 46 H164 M246 46 H260 M188 22 L178 12 M236 22 L246 12" stroke={VIOLET} strokeWidth="1.6" opacity="0.65" />
      </g>
    ),
  },
  {
    className: "illu-chart",
    viewBox: "1130 14 205 156",
    node: (
      <g transform="translate(1214 44)">
        <path d="M-74 116 H108 M-74 116 V-18" fill="none" stroke={LINE_SOFT} strokeWidth="1.8" />
        <rect x="-60" y="58" width="26" height="58" rx="5" fill={PANEL} stroke={LINE} strokeWidth="1.8" />
        <rect x="-20" y="28" width="26" height="88" rx="5" fill={PANEL} stroke={LINE} strokeWidth="1.8" />
        <rect x="20" y="-6" width="26" height="122" rx="5" fill={PANEL} stroke={LINE} strokeWidth="1.8" />
        <path d="M-48 44 L-8 12 L32 -20" fill="none" stroke={CYAN} strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="-20" r="4.5" fill={CYAN} />
      </g>
    ),
  },
  {
    className: "illu-bubble",
    viewBox: "56 706 200 154",
    node: (
      <g transform="translate(66 716)">
        <path
          d="M0 0 H164 A16 16 0 0 1 180 16 V88 A16 16 0 0 1 164 104 H70 L34 134 V104 H16 A16 16 0 0 1 0 88 V16 A16 16 0 0 1 16 0 Z"
          fill={PANEL}
          stroke={LINE}
          strokeWidth="2.2"
        />
        <text x="90" y="76" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="54" fontWeight="700" fill="rgba(37,99,235,0.35)">
          A
        </text>
      </g>
    ),
  },
  {
    className: "illu-pencil",
    viewBox: "344 682 122 172",
    node: (
      <g transform="translate(404 766)">
        <g transform="rotate(-30)" strokeLinecap="round" strokeLinejoin="round">
          <rect x="-12" y="-78" width="24" height="120" rx="5" fill={PANEL} stroke={VIOLET} strokeWidth="2.2" />
          <path d="M-12 42 L0 70 L12 42" fill="none" stroke={VIOLET} strokeWidth="2.2" />
          <path d="M0 70 V82" stroke={VIOLET} strokeWidth="2.2" />
          <path d="M-12 -26 H12" stroke={VIOLET} strokeWidth="1.5" opacity="0.6" />
        </g>
      </g>
    ),
  },
  {
    className: "illu-quote",
    viewBox: "484 738 60 72",
    node: (
      <text x="492" y="800" fontFamily="Georgia, 'Times New Roman', serif" fontSize="80" fill="rgba(6,182,212,0.26)">
        &ldquo;
      </text>
    ),
  },
  {
    className: "illu-org",
    viewBox: "546 652 308 164",
    node: (
      <g transform="translate(700 736)" strokeLinecap="round">
        <rect x="-46" y="-74" width="92" height="40" rx="9" fill={PANEL} stroke={LINE} strokeWidth="2" />
        <path d="M0 -34 V-6 M-98 -6 H98 M-98 -6 V30 M0 -6 V30 M98 -6 V30" fill="none" stroke={LINE_SOFT} strokeWidth="1.8" />
        <rect x="-144" y="30" width="92" height="40" rx="9" fill={PANEL} stroke={LINE} strokeWidth="2" />
        <rect x="-46" y="30" width="92" height="40" rx="9" fill={PANEL} stroke={LINE} strokeWidth="2" />
        <rect x="52" y="30" width="92" height="40" rx="9" fill={PANEL} stroke={LINE} strokeWidth="2" />
      </g>
    ),
  },
  {
    className: "illu-brain",
    viewBox: "1018 710 140 124",
    node: (
      <g transform="translate(1088 776)" strokeLinecap="round">
        <path
          d="M-4 -56 c-15 0 -27 6 -34 17 -13 2 -22 12 -22 25 0 7 3 13 8 17 -3 4 -5 9 -5 14 0 14 11 25 25 25 4 0 8 -1 11 -3 4 10 14 16 25 16 12 0 23 -8 27 -19 3 1 6 2 10 2 12 0 22 -10 22 -23 0 -5 -2 -10 -5 -14 8 -5 12 -13 12 -22 0 -16 -13 -28 -29 -28 -5 0 -10 1 -14 3 -4 -5 -11 -8 -18 -8 z"
          fill={PANEL}
          stroke={VIOLET}
          strokeWidth="2.2"
        />
        <path d="M-4 -56 V36" stroke={VIOLET} strokeWidth="1.5" opacity="0.55" />
        <path d="M-30 -22 c-8 3 -13 10 -13 19" fill="none" stroke={VIOLET} strokeWidth="1.4" opacity="0.5" />
        <path d="M-34 6 c-2 8 3 15 10 19" fill="none" stroke={VIOLET} strokeWidth="1.4" opacity="0.5" />
        <path d="M-14 22 c6 5 14 6 21 2" fill="none" stroke={VIOLET} strokeWidth="1.4" opacity="0.5" />
        <path d="M14 -40 c10 1 17 9 17 19" fill="none" stroke={VIOLET} strokeWidth="1.4" opacity="0.5" />
        <path d="M30 -14 c8 2 13 9 13 17" fill="none" stroke={VIOLET} strokeWidth="1.4" opacity="0.5" />
        <path d="M22 14 c4 6 3 14 -2 19" fill="none" stroke={VIOLET} strokeWidth="1.4" opacity="0.5" />
      </g>
    ),
  },
  {
    className: "illu-cap",
    viewBox: "312 208 104 76",
    node: (
      <g transform="translate(320 236)" strokeLinejoin="round">
        <path d="M0 0 L44 -20 L88 0 L44 20 Z" fill={PANEL} stroke={LINE} strokeWidth="2" />
        <path d="M22 10 V30 c0 6 10 10 22 10 s22 -4 22 -10 V10" fill="none" stroke={LINE} strokeWidth="2" />
        <path d="M84 4 V28" stroke={LINE} strokeWidth="1.6" />
      </g>
    ),
  },
  {
    className: "illu-formula",
    viewBox: "1306 320 92 40",
    node: (
      <text x="1314" y="352" fontFamily="Georgia, 'Times New Roman', serif" fontSize="34" fontStyle="italic" fill="rgba(37,99,235,0.28)">
        f(x)
      </text>
    ),
  },
  {
    className: "illu-target",
    viewBox: "1318 562 68 68",
    node: (
      <g transform="translate(1352 596)" fill="none" stroke={CYAN} strokeWidth="2">
        <circle cx="0" cy="0" r="26" />
        <circle cx="0" cy="0" r="14" />
        <circle cx="0" cy="0" r="3" fill={CYAN} stroke="none" />
      </g>
    ),
  },
];

function IllustrationBackdrop() {
  return (
    <div className="auth-illu">
      <svg className="illu illu-blueprint" viewBox="-360 -280 720 560" aria-hidden="true" focusable="false">
        {BLUEPRINT}
      </svg>
      {CLUSTERS.map((cluster) => (
        <svg key={cluster.className} className={`illu ${cluster.className}`} viewBox={cluster.viewBox} aria-hidden="true" focusable="false">
          {cluster.node}
        </svg>
      ))}
    </div>
  );
}

interface Ripple {
  x: number;
  y: number;
  born: number;
}

/** 交互点阵层(Canvas):整体呈同心水波纹扩散,鼠标经过处产生涟漪与形变。 */
function DotWave() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointer = useRef({ x: -9999, y: -9999, tx: -9999, ty: -9999, active: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SPACING = 28;
    const BASE_RADIUS = 1.35;
    // 水波位移幅度:同心波沿半径推挤 + 纵横向行波,让点阵整体像水面起伏
    const RADIAL_AMP = 9;
    const SWELL_AMP = 4.5;
    const SWAY_AMP = 3;
    const RING_FREQ = 0.042;
    const RING_SPEED = 2.1;
    const POINTER_RADIUS = 175;
    const POINTER_PUSH = 32;
    const RIPPLE_SPEED = 250;
    const RIPPLE_LIFE = 1.8;
    const RIPPLE_WIDTH = 38;
    const MAX_RIPPLES = 6;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let points: { x: number; y: number }[] = [];
    let ripples: Ripple[] = [];
    let frame = 0;
    let running = true;

    function buildPoints() {
      points = [];
      const cols = Math.ceil(width / SPACING) + 1;
      const rows = Math.ceil(height / SPACING) + 1;
      const offsetX = (width - (cols - 1) * SPACING) / 2;
      const offsetY = (height - (rows - 1) * SPACING) / 2;
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          points.push({ x: offsetX + col * SPACING, y: offsetY + row * SPACING });
        }
      }
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.floor(width * dpr));
      canvas!.height = Math.max(1, Math.floor(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildPoints();
    }

    function draw(now: number) {
      if (!running) return;
      const t = now / 1000;
      ctx!.clearRect(0, 0, width, height);

      const p = pointer.current;
      p.x += (p.tx - p.x) * 0.14;
      p.y += (p.ty - p.y) * 0.14;

      ripples = ripples.filter((ripple) => (now - ripple.born) / 1000 < RIPPLE_LIFE);

      const cx = width / 2;
      const cy = height / 2;

      for (const point of points) {
        // 以"位移"为主的水波:同心波沿半径方向推挤(波峰向外扩散),
        // 再叠加纵向起伏与横向摆荡,使点阵产生疏密变化而非原地明暗闪烁。
        const dxc = point.x - cx;
        const dyc = point.y - cy;
        const distCenter = Math.hypot(dxc, dyc) || 0.001;
        const ux = dxc / distCenter;
        const uy = dyc / distCenter;
        const ring = Math.sin(distCenter * RING_FREQ - t * RING_SPEED);
        const swell = Math.sin(point.x * 0.02 + t * 1.15);
        const sway = Math.sin(point.y * 0.023 - t * 0.95);

        let px = point.x + ux * ring * RADIAL_AMP + sway * SWAY_AMP;
        let py = point.y + uy * ring * RADIAL_AMP + swell * SWELL_AMP;
        let boost = 0;

        // 鼠标:推挤 + 高亮
        if (p.active) {
          const dx = point.x - p.x;
          const dy = point.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < POINTER_RADIUS && dist > 0.001) {
            const falloff = 1 - dist / POINTER_RADIUS;
            const ease = falloff * falloff;
            px += (dx / dist) * ease * POINTER_PUSH;
            py += (dy / dist) * ease * POINTER_PUSH;
            boost += ease * 1.05;
          }
        }

        // 鼠标涟漪:一圈圈向外扩散的高斯环
        for (const ripple of ripples) {
          const age = (now - ripple.born) / 1000;
          const life = 1 - age / RIPPLE_LIFE;
          if (life <= 0) continue;
          const rippleRadius = age * RIPPLE_SPEED;
          const dx = point.x - ripple.x;
          const dy = point.y - ripple.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const delta = dist - rippleRadius;
          if (Math.abs(delta) > RIPPLE_WIDTH * 2.5) continue;
          const band = Math.exp(-(delta * delta) / (2 * RIPPLE_WIDTH * RIPPLE_WIDTH));
          const amount = band * life;
          px += (dx / dist) * amount * 17;
          py += (dy / dist) * amount * 17;
          boost += amount * 0.95;
        }

        // 半径/明暗只做极轻微变化,让观感以"位移"为主而非原地"显现消失"
        const radius = Math.max(0.4, BASE_RADIUS + ring * 0.2 + boost * 1.9);
        const alpha = Math.min(0.9, 0.21 + (ring * 0.5 + 0.5) * 0.11 + boost * 0.55);
        ctx!.beginPath();
        ctx!.arc(px, py, radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(37, 99, 235, ${alpha.toFixed(3)})`;
        ctx!.fill();
      }

      if (!reducedMotion) frame = requestAnimationFrame(draw);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const p = pointer.current;
      p.tx = event.clientX - rect.left;
      p.ty = event.clientY - rect.top;
      p.active = true;
      const moved = Math.hypot(p.tx - p.lastX, p.ty - p.lastY);
      if (moved > 96 && ripples.length < MAX_RIPPLES) {
        p.lastX = p.tx;
        p.lastY = p.ty;
        ripples.push({ x: p.tx, y: p.ty, born: performance.now() });
      }
    }

    function onPointerLeave() {
      const p = pointer.current;
      p.active = false;
      p.tx = -9999;
      p.ty = -9999;
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!reducedMotion) {
        running = true;
        frame = requestAnimationFrame(draw);
      }
    }

    resize();
    if (reducedMotion) {
      draw(performance.now());
      running = false;
    } else {
      frame = requestAnimationFrame(draw);
    }
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="auth-dotwave" aria-hidden="true" />;
}

/** 登录页背景:主题插画层(SVG)+ 可交互水波点阵(Canvas)。 */
export function AuthBackground() {
  return (
    <div className="auth-decor" aria-hidden="true">
      {/* 蓝图网格 pattern 供纸张复用 */}
      <svg className="auth-defs" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="bpGrid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0 H0 V26" fill="none" stroke="rgba(37,99,235,0.075)" strokeWidth="1" />
          </pattern>
          <pattern id="bpGridMajor" width="130" height="130" patternUnits="userSpaceOnUse">
            <path d="M130 0 H0 V130" fill="none" stroke="rgba(37,99,235,0.13)" strokeWidth="1" />
          </pattern>
        </defs>
      </svg>
      <IllustrationBackdrop />
      <DotWave />
    </div>
  );
}
