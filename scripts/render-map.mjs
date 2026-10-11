// Renders the Components Map swimlane to SVG (and PNG when sharp is available).
// Usage: node scripts/render-map.mjs v1|v2
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const version = process.argv[2] || "v1";
const data = (await import(pathToFileURL(path.resolve(`scripts/map-data-${version}.mjs`)).href)).default;

const COLS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];
const ROWS = ["Cron / Vercel", "News and web sources", "Gemini Flash", "Code (validators and scorer)", "Supabase", "HubSpot", "Resend", "Arjun"];
const LABEL_W = 175, COL_W = 225, ROW_H = 118, TOP = 96, LEFT = 20;
const W = LEFT + LABEL_W + COLS.length * COL_W + 20;
const H = TOP + 34 + ROWS.length * ROW_H + 120;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cellX = (c) => LEFT + LABEL_W + COLS.indexOf(c) * COL_W;
const cellY = (r) => TOP + 34 + ROWS.indexOf(r) * ROW_H;
const boxes = {};
let out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">`);
out.push(`<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5b2fc9"/></marker></defs>`);
out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
out.push(`<text x="${LEFT}" y="34" font-size="22" font-weight="700" fill="#090014">${esc(data.title)}</text>`);
out.push(`<text x="${LEFT}" y="60" font-size="13" fill="#5f5a70">${esc(data.subtitle)}</text>`);

// Grid
COLS.forEach((c, i) => {
  const x = cellX(c);
  out.push(`<rect x="${x}" y="${TOP}" width="${COL_W}" height="30" fill="#7c46f1"/>`);
  out.push(`<text x="${x + COL_W / 2}" y="${TOP + 20}" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">${c}</text>`);
});
ROWS.forEach((r, i) => {
  const y = cellY(r);
  out.push(`<rect x="${LEFT}" y="${y}" width="${LABEL_W + COLS.length * COL_W}" height="${ROW_H}" fill="${i % 2 ? "#ffffff" : "#f6f3fc"}" stroke="#e6e1f3"/>`);
  out.push(`<text x="${LEFT + 10}" y="${y + ROW_H / 2 + 5}" font-size="13" font-weight="700" fill="#090014">${esc(r)}</text>`);
});
COLS.forEach((c) => {
  out.push(`<line x1="${cellX(c)}" y1="${TOP + 30}" x2="${cellX(c)}" y2="${TOP + 34 + ROWS.length * ROW_H}" stroke="#e6e1f3"/>`);
});

// Boxes: tool (bold), action lines, "runs on" line, optional tag pill
for (const b of data.boxes) {
  const x = cellX(b.col) + 8 + (b.dx || 0), y = cellY(b.row) + 8;
  const w = (b.w || 1) * COL_W - 16, h = ROW_H - 16;
  boxes[b.id] = { x, y, w, h };
  const fill = b.arjun ? "#fdf0c8" : "#ffffff";
  const stroke = b.arjun ? "#c2410c" : "#7c46f1";
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
  out.push(`<text x="${x + 8}" y="${y + 17}" font-size="12" font-weight="700" fill="#090014">${esc(b.tool)}</text>`);
  b.action.forEach((line, i) => out.push(`<text x="${x + 8}" y="${y + 33 + i * 14}" font-size="11" fill="#090014">${esc(line)}</text>`));
  out.push(`<text x="${x + 8}" y="${y + h - 7}" font-size="10" font-style="italic" fill="#5f5a70">runs: ${esc(b.runs)}</text>`);
  if (b.tag) {
    const tw = b.tag.length * 6.2 + 12;
    out.push(`<rect x="${x + w - tw - 6}" y="${y + 5}" width="${tw}" height="16" rx="8" fill="#f0eafe" stroke="#7c46f1"/>`);
    out.push(`<text x="${x + w - tw / 2 - 6}" y="${y + 17}" font-size="10" font-weight="700" fill="#5b2fc9" text-anchor="middle">${esc(b.tag)}</text>`);
  }
}

// Arrows between box edges
// side is "l", "r", "t" or "b", optionally with a fraction along the edge, e.g. "r:0.3"
const anchor = (bx, spec) => {
  const [side, f0] = spec.split(":");
  const f = f0 ? Number(f0) : 0.5;
  return {
    l: [bx.x, bx.y + bx.h * f], r: [bx.x + bx.w, bx.y + bx.h * f],
    t: [bx.x + bx.w * f, bx.y], b: [bx.x + bx.w * f, bx.y + bx.h],
  }[side];
};
for (const a of data.arrows) {
  const [x1, y1] = anchor(boxes[a.from], a.fs || "r");
  const [x2, y2] = anchor(boxes[a.to], a.ts || "l");
  const off = a.off || 0;
  const mx = (x1 + x2) / 2 + off, my = (y1 + y2) / 2;
  out.push(`<path d="M${x1},${y1} Q${mx},${my + off} ${x2},${y2}" fill="none" stroke="#5b2fc9" stroke-width="1.5" marker-end="url(#ah)" ${a.dash ? 'stroke-dasharray="4 3"' : ""}/>`);
  if (a.label) out.push(`<text x="${mx}" y="${my + off / 2 - 4}" font-size="10" fill="#5b2fc9" text-anchor="middle" font-weight="700">${esc(a.label)}</text>`);
}

// Cut line: separates Arjun-owned data from system-written data
// Encloses the Supabase "Context" cell (Arjun-owned columns) and Arjun's own actions.
const yS = cellY("Supabase"), yA = cellY("Arjun"), yEnd = yA + ROW_H;
const xC = cellX("Context"), xP = cellX("Processing"), xT = cellX("Trigger");
out.push(`<path d="M${xC},${yS} L${xP},${yS} L${xP},${yEnd} M${xT},${yA} L${xC},${yA} L${xC},${yS}" fill="none" stroke="#ea580c" stroke-width="3" stroke-dasharray="10 6"/>`);
out.push(`<text x="${xP + 6}" y="${yS + 14}" font-size="11" font-weight="700" fill="#c2410c">CUT: Arjun-owned (left) | system-written (right)</text>`);

// Footnotes
const fy = TOP + 34 + ROWS.length * ROW_H + 26;
data.footnotes.forEach((f, i) => out.push(`<text x="${LEFT}" y="${fy + i * 18}" font-size="12" fill="${i === 0 ? "#c2410c" : "#5f5a70"}" ${i === 0 ? 'font-weight="700"' : ""}>${esc(f)}</text>`));
out.push(`</svg>`);

const svg = out.join("\n");
const svgPath = `docs/components-map-${version}.svg`;
writeFileSync(svgPath, svg);
console.log("wrote", svgPath);
try {
  const sharp = (await import("sharp")).default;
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(`docs/components-map-${version}.png`);
  console.log("wrote", `docs/components-map-${version}.png`);
} catch (e) {
  console.log("PNG skipped (sharp not available):", e.message);
}
