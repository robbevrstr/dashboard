"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Game, SAUCER_EVENT, SAUCER_NAME, type SaucerEvent } from "@/lib/saucer";
import { loadSetting, saveSetting } from "@/lib/store";
import { elevation } from "@/lib/sun";
import { SaucerGame } from "./SaucerGame";

// Zorp, a little alien in a jet-powered flying saucer. It flies along the bottom of the
// page as you scroll, fidgets when you leave it alone, and falls asleep after a while.
// Pages can talk to it with tellSaucer() from src/lib/saucer.ts.

const LINES: { path: string; lines: string[] }[] = [
  {
    path: "/apps/comparer",
    lines: ["Save an item and set a target price. I'll scan the galaxy for deals.", "Accessories are hidden unless you ask for them."],
  },
  { path: "/apps/fuel", lines: ["These are maximum prices. Some stations are cheaper.", "My saucer runs on stardust. Much cheaper."] },
  {
    path: "/apps/power",
    lines: ["Pick how long it runs and the page finds the cheapest start.", "Solar power: that's my favourite star at work."],
  },
  {
    path: "/apps/outside",
    lines: ["Not a cyclist? Switch to run or walk.", "Tap an hour in the strip to check it.", "There's no weather in space. I kind of miss rain."],
  },
  {
    path: "/apps/sky",
    lines: ["Clear skies tonight? Wave if you see me up there.", "Drag the time to watch the sky turn.", "That fast dot is the ISS. Say hi from me."],
  },
  {
    path: "/apps/stop-the-clock",
    lines: ["On my planet a second lasts a little longer. Count carefully.", "The space bar works too. Fitting, right?"],
  },
  { path: "/apps/colour-memory", lines: ["Remember the colour, not its name.", "Lightness is the sneaky one. Like dark matter."] },
  { path: "/apps/circle", lines: ["Go slowly. Fast circles wobble.", "Planets are round. Mostly. Your turn."] },
  { path: "/apps", lines: ["Tools first, games further down.", "Every app here was built for fun. Mission log complete."] },
  {
    path: "/",
    lines: [
      `Greetings, earthling! I'm ${SAUCER_NAME}. Scroll and I'll fly along.`,
      "Mission control, all systems green. Your clock is up there; mine runs on galactic time.",
      "Have you tried the games yet?",
    ],
  },
];
const ANY = [
  "Beep boop. That's hello in Zorpian.",
  "Scanning this page… one lifeform found. Hi.",
  "Click me again for another tip.",
  "Scroll down, I like flying.",
  "I came for the Belgian fries. I stayed for the apps.",
  "Psst. Click me five times, quickly.",
];
const WAKE = ["I wasn't sleeping. I was in hyperspace.", "Huh? Oh, you're back, earthling.", "Just recharging my jets."];

// What it says after a game. A new best always gets a reaction; other tries only sometimes.
const BEST = ["New record! Logging it in the star log.", "A new best! I'm telling the mothership.", "Record broken. Beam it to the stars!"];
const REACT: Record<Game, Record<"good" | "bad", string[]>> = {
  clock: {
    good: ["Right on time. Atomic-clock level.", "Precise. You'd make a fine navigator."],
    bad: ["Time is relative. Very relative, in your case.", "My ship's clock says otherwise."],
  },
  colour: {
    good: ["Nice eye. Better than my scanner.", "Those colours were spot on."],
    bad: ["Colours look different through the dome. I'll allow it.", "That's a whole different nebula."],
  },
  circle: {
    good: ["Rounder than some moons I know.", "That's an orbit-grade circle."],
    bad: ["Lumpy. Like an asteroid.", "That's not a planet, that's a potato."],
  },
};

const HIDE_KEY = "robot";
const SEEN_KEY = "robot-seen";
const WEATHER_KEY = "saucer-weather";
const W = 60;
// Without other information, "night" is when the sun is down in Brussels.
const HOME = { lat: 50.85, lon: 4.35 };

const IDLE_AFTER = 5_000;
const SLEEP_AFTER = 30_000;
const SECRET_CLICKS = 5;
const SECRET_WINDOW = 2_500;
type Action = "look" | "beam" | "lights" | "wobble";
const ACTIONS: Action[] = ["look", "beam", "lights", "wobble"];
const ACTION_MS: Record<Action, number> = { look: 3000, beam: 2600, lights: 2000, wobble: 1800 };

type Weather = { rain: boolean; dark: boolean; at: number };

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const linesFor = (path: string) => {
  const match = LINES.find((l) => (l.path === "/" ? path === "/" : path === l.path || path.startsWith(`${l.path}/`)));
  return match ? match.lines : ANY;
};

function loadWeather(): Weather | undefined {
  try {
    const w = JSON.parse(sessionStorage.getItem(WEATHER_KEY) ?? "null") as Weather | null;
    // The weather from "Should I go out?" counts for an hour.
    if (w && Date.now() - w.at < 60 * 60_000) return w;
  } catch {}
  return undefined;
}

export function Robot() {
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [x, setX] = useState(16);
  const [lift, setLift] = useState(8);
  const [moving, setMoving] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [asleep, setAsleep] = useState(false);
  const [action, setAction] = useState<Action>();
  const [eye, setEye] = useState({ x: 0, y: 0 });
  const [say, setSay] = useState<string>();
  const [hop, setHop] = useState(0);
  const [rain, setRain] = useState(false);
  const [night, setNight] = useState(false);
  const [playing, setPlaying] = useState(false);
  const lineIdx = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const actionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastY = useRef(0);
  const lastInput = useRef(0);
  const nextAction = useRef(0);
  const asleepRef = useRef(false);
  const clicks = useRef<number[]>([]);
  const bodyRef = useRef<HTMLButtonElement>(null);

  const speak = useCallback((text: string, ms = 6000) => {
    setSay(text);
    clearTimeout(sayTimer.current);
    sayTimer.current = setTimeout(() => setSay(undefined), ms);
  }, []);

  const perform = useCallback((a: Action) => {
    setAction(a);
    clearTimeout(actionTimer.current);
    actionTimer.current = setTimeout(() => setAction(undefined), ACTION_MS[a]);
  }, []);

  useEffect(() => {
    let live = true;
    // Wait for the saved choice so a hidden Zorp doesn't flash in first.
    loadSetting(HIDE_KEY).then((v) => {
      if (!live) return;
      setHidden(v === "off");
      setReady(true);
    });
    lastInput.current = Date.now();
    return () => {
      live = false;
      clearTimeout(stopTimer.current);
      clearTimeout(sayTimer.current);
      clearTimeout(actionTimer.current);
    };
  }, []);

  // Rain and night: from "Should I go out?" when it has been opened, otherwise the sun over Brussels.
  useEffect(() => {
    const update = () => {
      const w = loadWeather();
      setRain(!!w?.rain);
      setNight(w ? w.dark : elevation(Date.now(), HOME.lat, HOME.lon) < -0.833);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  // Messages from the pages: game results and the weather.
  useEffect(() => {
    const onEvent = (ev: Event) => {
      const e = (ev as CustomEvent<SaucerEvent>).detail;
      if (!e) return;
      lastInput.current = Date.now();
      if (asleepRef.current) {
        asleepRef.current = false;
        setAsleep(false);
      }
      if (e.kind === "weather") {
        const before = loadWeather();
        try {
          sessionStorage.setItem(WEATHER_KEY, JSON.stringify({ rain: e.rain, dark: e.dark, at: Date.now() }));
        } catch {}
        setRain(e.rain);
        setNight(e.dark);
        if (e.rain && !before?.rain) {
          speak("Rain? Good thing I packed my umbrella.", 4500);
          setHop((h) => h + 1);
        }
        return;
      }
      if (e.mood === "okay") return;
      if (e.mood === "best") {
        speak(pick(BEST), 4500);
        setHop((h) => h + 1);
        perform("lights");
      } else if (Math.random() < 0.6) {
        speak(pick(REACT[e.game][e.mood]), 4500);
        if (e.mood === "bad") perform("wobble");
        else setHop((h) => h + 1);
      }
    };
    window.addEventListener(SAUCER_EVENT, onEvent);
    return () => window.removeEventListener(SAUCER_EVENT, onEvent);
  }, [speak, perform]);

  // Fly along with the scroll position, and land on the footer at the end of the page.
  useEffect(() => {
    if (!ready || hidden) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const place = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setX(16 + progress * (window.innerWidth - W - 32));
      const top = document.querySelector("footer")?.getBoundingClientRect().top ?? Infinity;
      setLift(Math.max(8, window.innerHeight - top + 4));
    };
    const onScroll = () => {
      place();
      const dy = window.scrollY - lastY.current;
      lastY.current = window.scrollY;
      if (reduce || dy === 0) return;
      setDir(dy > 0 ? 1 : -1);
      setMoving(true);
      clearTimeout(stopTimer.current);
      stopTimer.current = setTimeout(() => setMoving(false), 220);
    };
    lastY.current = window.scrollY;
    place();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", place);
    };
  }, [ready, hidden, path]);

  // Any input counts as "you're here": it wakes the saucer up and postpones the fidgeting.
  useEffect(() => {
    if (!ready || hidden || playing) return;
    let lastEye = 0;
    const active = () => {
      lastInput.current = Date.now();
      nextAction.current = 0;
      if (asleepRef.current) {
        asleepRef.current = false;
        setAsleep(false);
        setAction(undefined);
        setHop((h) => h + 1);
        if (Math.random() < 0.6) speak(pick(WAKE), 3500);
      }
    };
    // The pilot's eyes follow the mouse.
    const onMove = (e: PointerEvent) => {
      active();
      const now = Date.now();
      if (now - lastEye < 50 || !bodyRef.current) return;
      lastEye = now;
      const r = bodyRef.current.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.3);
      const len = Math.hypot(dx, dy) || 1;
      setEye({ x: (dx / len) * 1.8, y: (dy / len) * 1.2 });
    };
    // Coming back to the tab after a while gets a greeting.
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
        active();
        speak("Welcome back, earthling. I kept your orbit warm.", 4000);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", active, { passive: true });
    window.addEventListener("keydown", active);
    window.addEventListener("scroll", active, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
      window.removeEventListener("scroll", active);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, hidden, playing, speak]);

  // The idle routine: fidget every 6–10 seconds, fall asleep after 30.
  useEffect(() => {
    if (!ready || hidden || playing) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      const idle = now - lastInput.current;
      if (idle > SLEEP_AFTER) {
        if (!asleepRef.current) {
          asleepRef.current = true;
          setAsleep(true);
          setAction(undefined);
          setEye({ x: 0, y: 0 });
        }
        return;
      }
      if (idle < IDLE_AFTER) return;
      if (!nextAction.current) nextAction.current = now;
      if (now < nextAction.current) return;
      perform(pick(ACTIONS));
      nextAction.current = now + 6000 + Math.random() * 4000;
    }, 1000);
    return () => clearInterval(id);
  }, [ready, hidden, playing, perform]);

  // Say something on the first visit to each page in this session.
  useEffect(() => {
    if (!ready || hidden) return;
    lineIdx.current = 0;
    let seen: string[] = [];
    try {
      seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]");
    } catch {}
    if (seen.includes(path)) return;
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen, path]));
    } catch {}
    const id = setTimeout(() => speak(linesFor(path)[0]), 700);
    lineIdx.current = 1;
    return () => clearTimeout(id);
  }, [ready, hidden, path, speak]);

  const poke = () => {
    // Five quick clicks open the secret game.
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < SECRET_WINDOW), now];
    if (clicks.current.length >= SECRET_CLICKS) {
      clicks.current = [];
      setSay(undefined);
      setPlaying(true);
      return;
    }
    const pool = [...linesFor(path), ...ANY];
    speak(pool[lineIdx.current % pool.length]);
    lineIdx.current++;
    setHop((h) => h + 1);
  };

  const landed = useCallback(
    (distance: number) => {
      setPlaying(false);
      lastInput.current = Date.now();
      speak(
        distance >= 60_000
          ? "Flying with you was stellar. Thanks, co-pilot."
          : distance > 0
            ? "Back in one piece. Mostly. Thanks for flying Zorp Air."
            : "Not in the mood for asteroids? Fair enough.",
        5000,
      );
      setHop((h) => h + 1);
    },
    [speak],
  );

  const setOff = (off: boolean) => {
    setHidden(off);
    setSay(undefined);
    saveSetting(HIDE_KEY, off ? "off" : "on");
  };

  if (!ready) return null;

  if (playing) return <SaucerGame onClose={landed} />;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setOff(false)}
        className="fixed right-4 bottom-0 z-40 translate-y-7 opacity-70 outline-none transition-transform hover:translate-y-4 hover:opacity-100 focus-visible:translate-y-4 focus-visible:ring-2 focus-visible:ring-accent print:hidden"
        aria-label={`Bring ${SAUCER_NAME} the saucer back`}
        title={`Bring ${SAUCER_NAME} back`}
      >
        <Saucer state="asleep" eye={{ x: 0, y: 0 }} tilt={0} />
      </button>
    );
  }

  const rightSide = x > window.innerWidth / 2;
  const state = asleep ? "asleep" : moving ? "moving" : (action ?? "awake");

  return (
    <div
      className="pointer-events-none fixed left-0 z-40 transition-[transform,bottom] duration-300 ease-out motion-reduce:transition-none print:hidden"
      style={{ transform: `translateX(${x}px)`, bottom: lift, width: W }}
    >
      {say ? (
        <div
          role="status"
          className={`pointer-events-auto absolute bottom-full mb-1 w-max max-w-56 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-md ${
            rightSide ? "right-0" : "left-0"
          }`}
        >
          <p className="pr-5">{say}</p>
          <button
            type="button"
            onClick={() => setOff(true)}
            className="absolute top-1 right-1.5 rounded px-1 text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`Send ${SAUCER_NAME} away`}
            title={`Send ${SAUCER_NAME} away`}
          >
            ×
          </button>
        </div>
      ) : null}
      <button
        ref={bodyRef}
        type="button"
        onClick={poke}
        aria-label={asleep ? `${SAUCER_NAME} the saucer is asleep: click to wake it` : `${SAUCER_NAME} the saucer: click for a tip`}
        className="pointer-events-auto block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span key={hop} className={`block ${hop ? "animate-[robot-hop_0.45s_ease-out] motion-reduce:animate-none" : ""}`}>
          <Saucer state={state} eye={eye} tilt={moving ? dir * 9 : 0} rain={rain} night={night} />
        </span>
      </button>
    </div>
  );
}

type SaucerState = "awake" | "moving" | "asleep" | Action;

function Saucer({
  state,
  eye,
  tilt,
  rain = false,
  night = false,
}: {
  state: SaucerState;
  eye: { x: number; y: number };
  tilt: number;
  rain?: boolean;
  night?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 60 58"
      width={W}
      height={58}
      className={`saucer is-${state} ${night ? "is-night" : ""} ${rain ? "is-rain" : ""}`}
      overflow="visible"
      aria-hidden
    >
      {/* Rain falling around it */}
      {rain ? (
        <g className="saucer-rain stroke-sky-400" strokeWidth="1.2" strokeLinecap="round">
          <line x1="6" y1="0" x2="4" y2="5" />
          <line x1="54" y1="4" x2="52" y2="9" />
          <line x1="10" y1="16" x2="8" y2="21" />
          <line x1="50" y1="20" x2="48" y2="25" />
        </g>
      ) : null}
      {/* A glow on the ground under it at night */}
      <ellipse className="saucer-glow fill-amber-300" cx="30" cy="55" rx="20" ry="3" />
      {/* Tractor beam, shown while it "scans" the page */}
      <path className="saucer-beam fill-accent" d="M24 40 L36 40 L46 58 L14 58 Z" />
      <g className="saucer-float">
        <g className="saucer-body" style={{ transform: `rotate(${tilt}deg)` }}>
          {/* Umbrella, when it rains */}
          {rain ? (
            <g className="saucer-umbrella">
              <path d="M30 13 V5" className="stroke-foreground" strokeWidth="1.5" />
              <path
                d="M15 6 Q30 -6 45 6 Q41 3.5 37.5 6 Q33.75 3.5 30 6 Q26.25 3.5 22.5 6 Q19 3.5 15 6 Z"
                className="fill-sky-500 stroke-foreground"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </g>
          ) : null}
          {/* Dome and pilot */}
          <path d="M19 24 a11 11 0 0 1 22 0" className="fill-surface stroke-foreground" strokeWidth="2" />
          <path d="M22 24 a8 8 0 0 1 16 0 z" className="fill-foreground" />
          <path d="M22.5 18.5 a8 8 0 0 1 4 -3.5" fill="none" className="stroke-surface" strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
          <g style={{ transform: `translate(${eye.x}px, ${eye.y}px)` }} className="saucer-gaze">
            <g className="saucer-look">
              <g className="saucer-eyes">
                <circle cx="27" cy="20.5" r="1.8" className="fill-accent" />
                <circle cx="33" cy="20.5" r="1.8" className="fill-accent" />
              </g>
            </g>
          </g>
          {/* Saucer rim with running lights */}
          <ellipse cx="30" cy="29" rx="24" ry="7" className="fill-surface stroke-foreground" strokeWidth="2" />
          <ellipse cx="30" cy="27.5" rx="15" ry="2.5" className="fill-foreground" opacity=".08" />
          <g className="saucer-lights">
            <circle cx="17" cy="30" r="1.6" className="fill-amber-400" />
            <circle cx="30" cy="32" r="1.6" className="fill-amber-400" />
            <circle cx="43" cy="30" r="1.6" className="fill-amber-400" />
          </g>
          {/* Jets */}
          <rect x="14" y="35" width="7" height="4" rx="1.5" className="fill-foreground" />
          <rect x="39" y="35" width="7" height="4" rx="1.5" className="fill-foreground" />
          <path d="M15.5 39 L17.5 47 L19.5 39 Z" className="saucer-flame fill-amber-500" />
          <path d="M40.5 39 L42.5 47 L44.5 39 Z" className="saucer-flame fill-amber-500" />
        </g>
      </g>
      {/* Sleeping */}
      <g className="saucer-zzz fill-muted" fontSize="9" fontWeight="600">
        <text x="46" y="16">z</text>
        <text x="50" y="10" fontSize="7">z</text>
        <text x="53" y="5" fontSize="5">z</text>
      </g>
    </svg>
  );
}
