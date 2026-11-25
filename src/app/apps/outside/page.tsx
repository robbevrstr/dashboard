import type { Metadata } from "next";
import { BikeCheck } from "./BikeCheck";

export const metadata: Metadata = {
  title: "Should I go out?",
  description:
    "A yes or no for cycling, running or walking in Belgium right now, from the forecast for rain, wind, cold and air quality, plus daylight and pollen.",
};

export default function BikePage() {
  return (
    <section className="pt-14 pb-16">
      <BikeCheck />
      <p className="mt-12 text-sm text-muted">
        Forecast and air quality:{" "}
        <a href="https://open-meteo.com/" className="underline underline-offset-4 hover:text-foreground">
          Open-Meteo
        </a>{" "}
        (CC BY 4.0), with air data from the EU&apos;s Copernicus service (CAMS). Sun times are calculated in your
        browser.
      </p>
    </section>
  );
}
