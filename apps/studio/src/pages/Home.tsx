import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Plus, Sparkles, Trash2 } from "lucide-react";

const STEPS = [
  { key: "site", label: "Site" },
  { key: "brief", label: "Brief" },
  { key: "access", label: "Access" },
  { key: "launch", label: "Launch" },
] as const;

const DEFAULT_ACTIONS = [
  "Type Birthday RSVP into the text box under What do you want to ask",
  "Click the button labeled Create it free",
  "Type Allen's Birthday into the Description text box",
  "Click Add your first question",
  "Open the Single line text dropdown and choose Yes/no",
  "Type allergies into the Question text box, then check Required",
  "Click Save Changes",
];

function composeScript(args: { goal: string; audience: string; outcome: string; actions: string[] }): string {
  const actions = args.actions.map((a) => a.trim()).filter(Boolean);
  const steps = actions.map((a, i) => `Step ${i + 1}: ${a}`).join(". ");
  const parts = [
    args.goal.trim() && `This demo is to ${args.goal.trim().replace(/^this demo is to\s+/i, "")}.`,
    args.audience.trim() && `The viewer is ${args.audience.trim()}.`,
    args.outcome.trim() && `When the walkthrough is done, ${args.outcome.trim()}.`,
    steps && `Walkthrough — follow this exact order, one browser action per step. ${steps}`,
  ].filter(Boolean);
  return parts.join(" ");
}

export default function Home() {
  const nav = useNavigate();
  const [stage, setStage] = useState(0);
  const [website_url, setUrl] = useState("https://surveys.free/google-forms-alternative/");
  const [product_name, setName] = useState("surveys.free");
  const [goal, setGoal] = useState("explain how a user creates a form");
  const [audience, setAudience] = useState("someone setting up a Birthday RSVP survey");
  const [outcome, setOutcome] = useState("the form is saved and ready to share");
  const [actions, setActions] = useState<string[]>(DEFAULT_ACTIONS);
  const [attest, setAttest] = useState(true);
  const [username, setUser] = useState("");
  const [password, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const script = composeScript({ goal, audience, outcome, actions });
  const filledActions = actions.map((a) => a.trim()).filter(Boolean);

  function setAction(i: number, value: string) {
    setActions((prev) => prev.map((a, idx) => (idx === i ? value : a)));
  }

  function next() {
    setErr(null);
    if (stage === 0 && !website_url.trim()) {
      setErr("A website URL is required.");
      return;
    }
    if (stage === 1) {
      if (!goal.trim()) {
        setErr("Say what this demo is for.");
        return;
      }
      if (filledActions.length < 1) {
        setErr("Add at least one on-screen action.");
        return;
      }
    }
    if (stage === 3 && !attest) {
      setErr("Confirm you have the right to record this URL.");
      return;
    }
    if (stage < STEPS.length - 1) setStage(stage + 1);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (stage !== STEPS.length - 1) {
      next();
      return;
    }
    if (!attest) {
      setErr("Confirm you have the right to record this URL.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/v1/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          mode: "kane",
          input: {
            website_url,
            script,
            walkthrough: filledActions,
            product_name,
            i_have_right_to_record: attest,
            credentials: username || password ? { username, password } : undefined,
            viewport: "1440x900",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
      nav(`/jobs/${data.id}`);
    } catch (caught) {
      setErr(String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-generate">
      <div className="hero-block">
        <h1 className="pixel-hero">demo.studio</h1>
        <p className="powered-by">
          <span>Powered by</span>
          <img className="powered-testmu" src="/testmu-logo.svg" alt="TestMu AI" />
          <span className="powered-sep" aria-hidden>
            ·
          </span>
          <span className="powered-kane">
            <img src="/kane-cli.svg" alt="" />
            Kane CLI
          </span>
        </p>
        <p className="hero-guide">
          Kane is the hands: it opens the site, clicks and types your walkthrough, and we film that session with voiceover.
        </p>
      </div>

      <form
        className="panel-card wizard"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <ol className="wizard-rail" aria-label="Form steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i === stage ? "on" : i < stage ? "done" : ""}>
              <button type="button" onClick={() => i <= stage && setStage(i)}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>

        {stage === 0 && (
          <div className="wizard-body">
            <p className="panel-kicker">Where</p>
            <h2 className="panel-title">The site You Want to Demo</h2>
            <label className="field-label">
              Website URL
              <input value={website_url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://" />
            </label>
            <label className="field-label">
              Product name
              <input value={product_name} onChange={(e) => setName(e.target.value)} placeholder="Shown on the job card" />
            </label>
          </div>
        )}

        {stage === 1 && (
          <div className="wizard-body">
            <p className="panel-kicker">Brief</p>
            <h2 className="panel-title">What Kane should demonstrate</h2>
            <label className="field-label">
              What is this demo for?
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                required
                placeholder="explain how a user creates a form"
              />
            </label>
            <label className="field-label">
              Who is watching?
              <input
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="a host sending a Birthday RSVP"
              />
            </label>
            <label className="field-label">
              What should be true at the end?
              <input
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                placeholder="the form is saved and ready to share"
              />
            </label>
            <div className="field-label">
              On-screen actions
              <p className="field-hint">One click, type, or choice per row. Kane follows this order.</p>
              <ol className="action-list">
                {actions.map((action, i) => (
                  <li key={i} className="action-row">
                    <span className="action-num">{String(i + 1).padStart(2, "0")}</span>
                    <input
                      value={action}
                      onChange={(e) => setAction(i, e.target.value)}
                      placeholder="Click the button labeled Create it free"
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove step ${i + 1}`}
                      disabled={actions.length <= 1}
                      onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4" />
                    </button>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="btn-ghost-pill add-action"
                disabled={actions.length >= 12}
                onClick={() => setActions((prev) => [...prev, ""])}
              >
                <Plus className="h-4" />
                Add action
              </button>
            </div>
          </div>
        )}

        {stage === 2 && (
          <div className="wizard-body">
            <p className="panel-kicker">Optional</p>
            <h2 className="panel-title">Sign-in only if the demo needs it</h2>
            <div className="row">
              <label className="field-label">
                Username
                <input value={username} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
              </label>
              <label className="field-label">
                Password
                <input type="password" value={password} onChange={(e) => setPass(e.target.value)} />
              </label>
            </div>
            <p className="field-hint">Leave blank for public pages. Credentials are not stored in the job log.</p>
          </div>
        )}

        {stage === 3 && (
          <div className="wizard-body">
            <p className="panel-kicker">Launch</p>
            <h2 className="panel-title">Ready to record {product_name || "this site"}</h2>
            <p className="launch-summary">
              Kane · {filledActions.length} actions · {website_url}
            </p>
            <p className="field-hint launch-brief">{script}</p>
            <button type="button" className={`choice-row ${attest ? "on" : ""}`} onClick={() => setAttest(!attest)}>
              <span className="choice-mark" />
              <span>I have the right to record this URL</span>
            </button>
          </div>
        )}

        {err && <p className="error-banner">{err}</p>}

        <div className="wizard-actions">
          <button type="button" className="btn-ghost-pill" disabled={stage === 0} onClick={() => setStage(stage - 1)}>
            <ArrowLeft className="h-4" />
            Back
          </button>
          {stage < STEPS.length - 1 ? (
            <button type="button" className="btn-ink-pill" onClick={next}>
              Continue
              <ArrowRight className="h-4" />
            </button>
          ) : (
            <button className="btn-ink-pill" disabled={busy} type="button" onClick={(e) => void submit(e)}>
              <Sparkles className="h-4" />
              {busy ? "Queuing…" : "Generate demo"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
