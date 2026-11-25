import type { Metadata } from "next";
import { AgendaView } from "./AgendaView";

export const metadata: Metadata = {
  title: "Agenda",
  description: "Your events and the calendars you import from a link, two weeks at a time.",
};

export default function AgendaPage() {
  return (
    <section className="pt-14">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Agenda</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Your own events together with any calendar you import from a link: Google, Outlook, iCloud or a timetable.
      </p>
      <AgendaView />
    </section>
  );
}
