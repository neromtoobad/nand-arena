// The cast. House bots have their own character; every player bot is the hero chassis,
// re-tinted by a hue taken from its netlist hash (the body is black, so only the glow changes).
import { DEPLOY } from "./chain.js";
import { hashBytes } from "./sim.js";

export const CAST = {
  Cautious: { src: "/art/cautious.webp", tone: "c-green", color: "#2fd36a" },
  Lookahead: { src: "/art/lookahead.webp", tone: "c-blue", color: "#4aa8ff" },
  Hunter: { src: "/art/hunter.webp", tone: "c-orange", color: "#ff9a2e" },
  Coward: { src: "/art/coward.webp", tone: "c-pink", color: "#ff4f8b" },
  Weaver: { src: "/art/weaver.webp", tone: "c-violet", color: "#a66bff" },
};
export const HERO = "/art/hero.webp";

export function castOf(entry) {
  const house = DEPLOY?.houseBots?.find(h => h.circuitId === entry.circuitId);
  if (house && CAST[house.name]) return { ...CAST[house.name], hue: 0, house: true };
  const h = hashBytes(entry);
  const hue = Math.round((h[20] / 256) * 360);
  return { src: HERO, tone: "c-mint", color: "#2ee6c2", hue, house: false };
}

/** Full-body character. */
export function BotArt({ entry, className, style, flip }) {
  const c = castOf(entry);
  return <img src={c.src} alt="" className={className} draggable={false}
    style={{ ...style, filter: [c.hue ? `hue-rotate(${c.hue}deg)` : "", style?.filter || ""].join(" ").trim() || undefined, transform: [flip ? "scaleX(-1)" : "", style?.transform || ""].join(" ").trim() || undefined }} />;
}

/** Head crop in a rounded tile. */
export function Head({ entry, size = 56, round }) {
  const c = castOf(entry);
  return (
    <div className={`head ${c.tone}`} style={{ width: size, height: size, borderRadius: round ? "50%" : Math.round(size * 0.28) }}>
      <img src={c.src} alt="" draggable={false} style={c.hue ? { filter: `hue-rotate(${c.hue}deg)` } : undefined} />
    </div>
  );
}
