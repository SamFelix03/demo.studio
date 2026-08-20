import { Link, Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Job from "./pages/Job";
import History from "./pages/History";

export default function App() {
  const loc = useLocation();
  return (
    <div className="shell">
      <header className="top">
        <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit", fontSize: 28 }}>
          Demo Studio
        </Link>
        <nav style={{ display: "flex", gap: 16 }}>
          <Link to="/" style={{ color: loc.pathname === "/" ? "inherit" : "var(--muted)" }}>
            New demo
          </Link>
          <Link to="/jobs" style={{ color: loc.pathname === "/jobs" ? "inherit" : "var(--muted)" }}>
            History
          </Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/jobs" element={<History />} />
        <Route path="/jobs/:id" element={<Job />} />
      </Routes>
    </div>
  );
}
