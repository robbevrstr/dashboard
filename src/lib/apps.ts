// Registry of mini apps shown on the home page and /apps.
// To add a new app:
//   1. Create src/app/apps/<slug>/page.tsx
//   2. Add an entry below with that slug and status "live".
export type AppStatus = "live" | "building" | "planned";

export type MiniApp = {
  slug: string;
  title: string;
  /** One line for compact lists. */
  short: string;
  description: string;
  status: AppStatus;
  tags: string[];
  /** Tools and games are listed separately. Defaults to "tool". */
  kind?: "tool" | "game";
};

export const apps: MiniApp[] = [
  {
    slug: "agenda",
    short: "Your events and imported calendars",
    title: "Agenda",
    description:
      "Two weeks of plans at a glance. Add your own events and import calendars from Google, Outlook, iCloud or a timetable with a link.",
    status: "live",
    tags: ["planning", "calendar"],
  },
  {
    slug: "tasks",
    short: "A to-do list with due dates",
    title: "Tasks",
    description: "Everything you still have to do, sorted by when it's due, with overdue tasks first. Tick them off from the dashboard.",
    status: "live",
    tags: ["planning"],
  },
  {
    slug: "comparer",
    short: "Six Belgian shops, cheapest first",
    title: "Price comparer",
    description:
      "Add something you want to buy and compare its price at Coolblue, bol, MediaMarkt, Alternate, Vanden Borre and Amazon.be, cheapest first.",
    status: "live",
    tags: ["shopping", "scraping"],
  },
  {
    slug: "fuel",
    short: "Official maximum prices and history",
    title: "Fuel prices",
    description:
      "Today's official maximum prices for petrol, diesel, LPG and heating oil in Belgium, with a year of history.",
    status: "live",
    tags: ["open data", "charts"],
  },
  {
    slug: "power",
    short: "Plan when to run appliances",
    title: "Cheapest electricity hours",
    description:
      "Belgium's electricity price for every 15 minutes, the cheapest time to run the dishwasher, and where the power comes from right now.",
    status: "live",
    tags: ["energy", "open data"],
  },
  {
    slug: "outside",
    short: "Cycling, running or walking",
    title: "Should I go out?",
    description:
      "A straight yes or no for cycling, running or walking, from the forecast for rain, wind, cold and air quality, plus daylight and pollen.",
    status: "live",
    tags: ["weather", "outdoors"],
  },
  {
    slug: "sky",
    short: "Clouds, Moon, planets and the ISS",
    title: "Tonight's sky",
    description:
      "Will it be clear tonight? The Moon's phase, which planets are up, a sky chart for any time of night and when the space station flies over.",
    status: "live",
    tags: ["astronomy", "weather"],
  },
  {
    slug: "stop-the-clock",
    short: "Stop at exactly ten seconds",
    title: "Stop the clock",
    description: "Stop a timer at exactly ten seconds, after the digits have disappeared. How good is your inner clock?",
    status: "live",
    tags: ["game", "timing"],
    kind: "game",
  },
  {
    slug: "colour-memory",
    short: "Rebuild a colour from memory",
    title: "Colour memory",
    description: "See a colour for two seconds, then rebuild it from memory with hue, saturation and lightness.",
    status: "live",
    tags: ["game", "colour"],
    kind: "game",
  },
  {
    slug: "circle",
    short: "Draw a circle freehand",
    title: "How round?",
    description: "Draw a circle freehand and get a score for how round it really is, wobbles highlighted.",
    status: "live",
    tags: ["game", "drawing"],
    kind: "game",
  },
];

export const tools = apps.filter((a) => (a.kind ?? "tool") === "tool");
export const games = apps.filter((a) => a.kind === "game");
