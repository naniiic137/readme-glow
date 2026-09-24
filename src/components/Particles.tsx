import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../app/presentation';

/** Soft floating particles in the theme's accent colours (static when motion is reduced). */
export function Particles({ colors }: { colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const count = 46;
    const parts = Array.from({ length: count }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 1 + Math.random() * 2.6,
      vx: (Math.random() - 0.5) * 0.00012,
      vy: -0.00005 - Math.random() * 0.00016,
      c: colors[i % colors.length]!,
      a: 0.25 + Math.random() * 0.55,
    }));
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (animate: boolean) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (animate) {
          p.x = (p.x + p.vx + 1) % 1;
          p.y = p.y + p.vy;
          if (p.y < -0.02) p.y = 1.02;
        }
        const g = ctx.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, p.r * 5);
        g.addColorStop(0, p.c);
        g.addColorStop(1, 'transparent');
        ctx.globalAlpha = p.a;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const loop = () => {
      draw(true);
      raf = requestAnimationFrame(loop);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      draw(false);
    });
    ro.observe(canvas);
    if (prefersReducedMotion()) draw(false);
    else loop();
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !prefersReducedMotion()) loop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [colors.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} className="rg-particles" aria-hidden="true" />;
}
