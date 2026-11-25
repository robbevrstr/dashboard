import type { Metadata } from "next";
import { getIssTle } from "@/lib/iss";
import { SkyTonight } from "./SkyTonight";

export const metadata: Metadata = {
  title: "Tonight's sky",
  description:
    "Will it be clear tonight? The Moon's phase, which planets are up, a sky chart and when the space station flies over, for anywhere in Belgium.",
};

export default function SkyPage() {
  // Not awaited: the orbit streams in while the rest of the page is already there.
  const tle = getIssTle();
  return (
    <section className="pt-14 pb-16">
      <SkyTonight tle={tle} />
      <p className="mt-12 max-w-2xl text-sm leading-relaxed text-muted">
        Cloud forecast:{" "}
        <a href="https://open-meteo.com/" className="underline underline-offset-4 hover:text-foreground">
          Open-Meteo
        </a>{" "}
        (CC BY 4.0). Space station orbit:{" "}
        <a href="https://celestrak.org/" className="underline underline-offset-4 hover:text-foreground">
          CelesTrak
        </a>{" "}
        or{" "}
        <a href="https://tle.ivanstanojevic.me/" className="underline underline-offset-4 hover:text-foreground">
          TLE API
        </a>
        . The Sun, Moon, planets and stars are calculated in your browser with astronomy-engine, and the station&apos;s
        passes with satellite.js. Your location only leaves your browser for the cloud forecast, rounded to about a
        kilometre.
      </p>
    </section>
  );
}
