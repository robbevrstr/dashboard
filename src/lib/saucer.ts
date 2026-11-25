// Lets any page talk to Zorp, the flying saucer (src/components/Robot.tsx), without importing it.

export const SAUCER_NAME = "Zorp";
export const SAUCER_EVENT = "saucer";

export type Game = "clock" | "colour" | "circle";
export type Mood = "best" | "good" | "okay" | "bad";

export type SaucerEvent =
  /** A game finished: a new best, a good try or a bad one. */
  | { kind: "score"; game: Game; mood: Mood }
  /** "Should I go out?" knows the weather right now. */
  | { kind: "weather"; rain: boolean; dark: boolean };

export function tellSaucer(e: SaucerEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SaucerEvent>(SAUCER_EVENT, { detail: e }));
}
