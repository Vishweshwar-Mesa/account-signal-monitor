"use client";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** Runs animations only when the user has not asked for reduced motion. Opacity and transform only, so no layout shift. */
export function motionOK(fn: () => void) {
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", fn);
  return mm;
}

/** Count a number up from 0 to its rendered value. */
export function countUp(el: Element, duration = 0.8) {
  const target = Number(el.textContent);
  if (!Number.isFinite(target) || target === 0) return;
  const obj = { v: 0 };
  gsap.to(obj, { v: target, duration, ease: "power2.out", onUpdate: () => { el.textContent = String(Math.round(obj.v)); } });
}

export { gsap, useGSAP };
