import type { Metadata } from "next";
import { StopTheClock } from "./StopTheClock";

export const metadata: Metadata = {
  title: "Stop the clock",
  description: "Stop a timer at exactly ten seconds, after the digits have disappeared.",
};

export default function StopTheClockPage() {
  return (
    <section className="pt-14 pb-16">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Stop the clock</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Start the timer and stop it at exactly ten seconds. The catch: the digits vanish halfway, so you have to count
        in your head.
      </p>
      <StopTheClock />
    </section>
  );
}
