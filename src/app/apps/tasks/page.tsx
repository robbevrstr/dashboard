import type { Metadata } from "next";
import { TaskBoard } from "./TaskBoard";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Your to-do list, with due dates.",
};

export default function TasksPage() {
  return (
    <section className="pt-14">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Tasks</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
        Everything you still have to do, sorted by when it&apos;s due. Overdue tasks come first.
      </p>
      <TaskBoard />
    </section>
  );
}
