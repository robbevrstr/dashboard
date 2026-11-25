import type { Metadata } from "next";
import { ColourMemory } from "./ColourMemory";

export const metadata: Metadata = {
  title: "Colour memory",
  description: "See a colour for two seconds, then rebuild it from memory with three sliders.",
};

export default function ColourMemoryPage() {
  return (
    <section className="pt-14 pb-16">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Colour memory</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        How well do you remember a colour? You get two seconds to look, then you mix it yourself.
      </p>
      <ColourMemory />
    </section>
  );
}
