import type { Metadata } from "next";
import { HowRound } from "./HowRound";

export const metadata: Metadata = {
  title: "How round?",
  description: "Draw a circle freehand and find out how round it really is.",
};

export default function CirclePage() {
  return (
    <section className="pt-14 pb-16">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">How round?</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Draw a circle with your mouse or finger. It gets compared to the closest perfect circle, and every wobble
        shows.
      </p>
      <HowRound />
    </section>
  );
}
