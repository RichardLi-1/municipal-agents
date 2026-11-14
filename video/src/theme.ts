import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadHand } from "@remotion/google-fonts/Caveat";

const inter = loadInter("normal", { weights: ["400", "500", "600", "700", "800", "900"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });
const hand = loadHand("normal", { weights: ["600", "700"], subsets: ["latin"] });

export const font = {
  sans: inter.fontFamily,
  mono: mono.fontFamily,
  hand: hand.fontFamily,
};

export const color = {
  ground: "#ffffff",
  paper: "#fbfaf5",
  ink: "#0b0b0c",
  muted: "#5f6368",
  faint: "#e7e7ea",
  accent: "#1f5fd6", // civic blue, the product's one accent
  pen: "#1d3fa6", // ballpoint blue for the ticks
  formRule: "#c9c4b4",
  formInk: "#2b2a27",
  ok: "#1a7f37",
  bad: "#c62828",
};

export const W = 1920;
export const H = 1080;
