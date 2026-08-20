import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"kane" | "naive">("kane");
  const [website_url, setUrl] = useState("http://localhost:4173");
  const [script, setScript] = useState(
    "Open the homepage hero. Then Features and explain Session replay. Open Contact, type an email into Work email, fill Company name, and explain Book a walkthrough.",
  );
  const [product_name, setName] = useState("Northbeam");
  const [attest, setAttest] = useState(true);
  const [compare, setCompare] = useState(false);
  const [username, setUser] = useState("demo@northbeam.io");
  const [password, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
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
          mode,
          input: {
            website_url,
            script,
            product_name,
            i_have_right_to_record: attest,
            compare_after: mode === "kane" && compare,
            credentials:
              username || password ? { username, password } : undefined,
            viewport: "1440x900",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
      nav(`/jobs/${data.id}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p style={{ color: "var(--muted)", maxWidth: 640 }}>
        Record a narrated walkthrough of a live site. Kane mode uses Kane CLI to
        click, assert, and heal. Normal mode uses first-match Playwright with no
        correction loop.
      </p>
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={`tab ${mode === "kane" ? "on" : ""}`} onClick={() => setMode("kane")}>
          Kane
        </button>
        <button className={`tab ${mode === "naive" ? "on" : ""}`} onClick={() => setMode("naive")}>
          Normal
        </button>
      </div>
      <form className="card" onSubmit={submit}>
        <div className="row">
          <div>
            <label>Website URL</label>
            <input value={website_url} onChange={(e) => setUrl(e.target.value)} required />
          </div>
          <div>
            <label>Product name</label>
            <input value={product_name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <label>What should the demo cover?</label>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          required
          placeholder="Describe the tour in your own words. We write the voiceover and click plan — this is not read aloud."
        />
        <div className="row">
          <div>
            <label>Username (optional)</label>
            <input value={username} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label>Password (optional)</label>
            <input type="password" value={password} onChange={(e) => setPass(e.target.value)} />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
          I have the right to record this URL
        </label>
        {mode === "kane" && (
          <label className="check">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
            Also run Normal mode for comparison
          </label>
        )}
        {err && <p className="abort">{err}</p>}
        <button className="primary" disabled={busy} type="submit">
          {busy ? "Queuing…" : `Start ${mode === "kane" ? "Kane" : "Normal"} demo`}
        </button>
      </form>
    </>
  );
}
