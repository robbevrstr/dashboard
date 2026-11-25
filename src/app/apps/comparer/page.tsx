import type { Metadata } from "next";
import { Comparer } from "./Comparer";

export const metadata: Metadata = {
  title: "Price comparer",
  description: "Compare prices for tech across Belgian shops.",
};

export default function ComparerPage() {
  return (
    <section className="pt-14">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Price comparer</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Add something you want to buy and see what it costs at Belgian tech shops, cheapest first.
      </p>
      <Comparer />
    </section>
  );
}
