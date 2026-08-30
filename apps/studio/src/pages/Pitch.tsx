import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

const SLIDES = 9;

const FLOW = [
  {
    n: "01",
    title: "You",
    body: "surveys.free · Birthday RSVP · type the title, click Create it free, save.",
    kane: false,
    out: false,
  },
  {
    n: "02",
    title: "Studio",
    body: "Wizard turns that into a numbered brief and posts a job.",
    kane: false,
    out: false,
  },
  {
    n: "03",
    title: "API + Temporal",
    body: "Job is stored. KaneDemoWorkflow starts.",
    kane: false,
    out: false,
  },
  {
    n: "04",
    title: "Kane CLI",
    body: "Preflight the URL. Store live buttons and fields.",
    kane: true,
    out: false,
  },
  {
    n: "05",
    title: "Kane CLI",
    body: "One Chrome. TestMD clicks and types the RSVP flow.",
    kane: true,
    out: false,
  },
  {
    n: "06",
    title: "LMNT + ffmpeg",
    body: "Voiceover timed to the stills. Mux + captions.",
    kane: false,
    out: false,
  },
  {
    n: "07",
    title: "demo.mp4",
    body: "Narrated tour of the live product.",
    kane: false,
    out: true,
  },
];

function Stars() {
  return (
    <span className="deck-stars" aria-hidden>
      {["★", "✦", "★", "✧", "★", "✦", "✧", "★"].map((s, n) => (
        <span key={n} className={`deck-star n${n}`}>
          {s}
        </span>
      ))}
    </span>
  );
}

export default function Pitch() {
  const [i, setI] = useState(0);

  const go = useCallback((n: number) => {
    setI(Math.max(0, Math.min(SLIDES - 1, n)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        go(i + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(i - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, i]);

  return (
    <div className="page-pitch">
      <p className="panel-kicker deck-kicker">Pitch</p>

      <div className="deck-stage" key={i}>
        {i === 0 && (
          <section className="deck-slide">
            <p className="pixel-hero deck-word">Hi, I’m Sam</p>
            <p className="deck-lead">SDE at a startup. Hackathons on the side.</p>
            <img className="deck-gif" src="/pitch-media/sam.gif" alt="" />
          </section>
        )}

        {i === 1 && (
          <section className="deck-slide deck-slide-wide">
            <div className="deck-split">
              <article className="deck-half tilt-left">
                <p className="panel-kicker">At work</p>
                <h2>The feature is done.</h2>
                <p>Then I still have to click through it on camera so everyone else can see it.</p>
              </article>
              <article className="deck-half tilt-right">
                <p className="panel-kicker">At hackathons</p>
                <h2>Judges want a demo.</h2>
                <p>So I spend the last hour recording, not shipping.</p>
              </article>
            </div>
            <img className="deck-gif deck-gif-wide" src="/pitch-media/work.gif" alt="" />
          </section>
        )}

        {i === 2 && (
          <section className="deck-slide">
            <p className="deck-cta">Thousands of others face the same problem too.</p>
          </section>
        )}

        {i === 3 && (
          <section className="deck-slide">
            <p className="deck-lead">That’s why we built</p>
            <div className="deck-mark">
              <Stars />
              <h1 className="pixel-hero">demo.studio</h1>
            </div>
            <p className="deck-quiet">
              Kane CLI is the hands.
              <br />
              Kane CLI also tests the whole app, end to end.
            </p>
          </section>
        )}

        {i === 4 && (
          <section className="deck-slide">
            <p className="panel-kicker">One brief</p>
            <h2 className="deck-title">Give this. Get a film.</h2>
            <div className="deck-giveget">
              <ul className="deck-pills">
                <li>URL</li>
                <li>Goal</li>
                <li>Who’s watching</li>
                <li>On-screen actions</li>
              </ul>
              <span className="deck-arrow fat" aria-hidden>
                →
              </span>
              <div className="deck-box tilt-right deck-out">
                <strong>demo.mp4</strong>
                <span>Live product + voiceover</span>
              </div>
            </div>
          </section>
        )}

        {i === 5 && (
          <section className="deck-slide deck-slide-wide">
            <p className="panel-kicker">How it works</p>
            <h2 className="deck-title">One brief. Seven beats.</h2>
            <ol className="wf">
              {FLOW.map((step, idx) => (
                <li key={step.n}>
                  <div className={`wf-card${step.kane ? " kane" : ""}${step.out ? " out" : ""}`}>
                    <header>
                      <span className="wf-num">{step.n}</span>
                      {step.kane ? <img className="wf-logo" src="/kane-cli.svg" alt="" /> : null}
                    </header>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                  {idx < FLOW.length - 1 ? (
                    <span className="wf-join" aria-hidden>
                      →
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        )}

        {i === 6 && (
          <section className="deck-slide deck-slide-wide">
            <p className="panel-kicker">Kane CLI</p>
            <h2 className="deck-title">Every call we make</h2>
            <ul className="deck-kane">
              <li>
                <img src="/kane-cli.svg" alt="" />
                <div>
                  <strong>Health</strong>
                  <p>
                    <code>whoami</code> · <code>login</code> · <code>balance</code> · <code>config set-window</code>
                  </p>
                </div>
              </li>
              <li>
                <img src="/kane-cli.svg" alt="" />
                <div>
                  <strong>Preflight</strong>
                  <p>
                    <code>run --agent</code> — CAPTCHA, paywall, login wall, 6xx abort
                  </p>
                </div>
              </li>
              <li>
                <img src="/kane-cli.svg" alt="" />
                <div>
                  <strong>Understand</strong>
                  <p>
                    <code>run</code> stores live nav, CTAs, fields → <code>context.md</code>
                  </p>
                </div>
              </li>
              <li>
                <img src="/kane-cli.svg" alt="" />
                <div>
                  <strong>Author</strong>
                  <p>
                    <code>testmd run --agent</code> — one Chrome, click/type/heal
                  </p>
                </div>
              </li>
              <li>
                <img src="/kane-cli.svg" alt="" />
                <div>
                  <strong>Telemetry</strong>
                  <p>NDJSON → console, stills, heal from <code>failure.yaml</code></p>
                </div>
              </li>
              <li>
                <img src="/kane-cli.svg" alt="" />
                <div>
                  <strong>Studio suite</strong>
                  <p>
                    <code>testmd run kane/*_test.md</code> — landing, wizard, gallery, <code>/health</code>
                  </p>
                </div>
              </li>
            </ul>
            <p className="deck-caption">Line-by-line map and the 6/6 e2e rollup are in the README.</p>
          </section>
        )}

        {i === 7 && (
          <section className="deck-slide deck-slide-wide">
            <p className="panel-kicker">Scoring</p>
            <h2 className="deck-title">Kane stops Cursor.</h2>
            <ol className="wf">
              <li>
                <div className="wf-card">
                  <header>
                    <span className="wf-num">01</span>
                  </header>
                  <strong>Cursor</strong>
                  <p>Edits Studio. Tries to end the turn.</p>
                </div>
                <span className="wf-join" aria-hidden>
                  →
                </span>
              </li>
              <li>
                <div className="wf-card kane">
                  <header>
                    <span className="wf-num">02</span>
                    <img className="wf-logo" src="/kane-cli.svg" alt="" />
                  </header>
                  <strong>Stop hook</strong>
                  <p>Diff maps to TestMD. Kane replays in Chrome.</p>
                </div>
                <span className="wf-join" aria-hidden>
                  →
                </span>
              </li>
              <li>
                <div className="wf-card">
                  <header>
                    <span className="wf-num">03</span>
                  </header>
                  <strong>Blocked</strong>
                  <p>Continue-submit fails Access → Launch. Agent must fix.</p>
                </div>
                <span className="wf-join" aria-hidden>
                  →
                </span>
              </li>
              <li>
                <div className="wf-card out">
                  <header>
                    <span className="wf-num">04</span>
                  </header>
                  <strong>Green</strong>
                  <p>Kane matches the baseline. Cursor may stop.</p>
                </div>
              </li>
            </ol>
            <p className="deck-caption">Open /verified for the blocked and green Kane reports.</p>
          </section>
        )}

        {i === 8 && (
          <section className="deck-slide">
            <p className="pixel-hero deck-word">Thank you</p>
            <blockquote className="deck-quote">
              Don’t record the walkthrough.
              <br />
              Let Kane walk it.
            </blockquote>
            <p className="brand-pixel">demo.studio</p>
          </section>
        )}
      </div>

      <footer className="deck-foot">
        <button type="button" className="btn-ghost-pill" disabled={i === 0} onClick={() => go(i - 1)}>
          <ArrowLeft className="h-4" />
          Back
        </button>
        <ol className="deck-dots" aria-label="Slides">
          {Array.from({ length: SLIDES }, (_, n) => (
            <li key={n}>
              <button
                type="button"
                className={n === i ? "on" : ""}
                aria-label={`Slide ${n + 1}`}
                onClick={() => go(n)}
              />
            </li>
          ))}
        </ol>
        <button type="button" className="btn-ink-pill" disabled={i === SLIDES - 1} onClick={() => go(i + 1)}>
          Continue
          <ArrowRight className="h-4" />
        </button>
      </footer>
    </div>
  );
}
