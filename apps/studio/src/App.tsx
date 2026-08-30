import { NavLink, Route, Routes } from "react-router-dom";
import { BadgeCheck, Clapperboard, Presentation, Sparkles } from "lucide-react";
import Home from "./pages/Home";
import Job from "./pages/Job";
import Gallery from "./pages/Gallery";
import Pitch from "./pages/Pitch";
import Verified from "./pages/Verified";

function Header() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <NavLink to="/" className="brand-pixel" aria-label="demo.studio home">
          demo.studio
        </NavLink>
        <nav className="center-nav" aria-label="Primary">
          <NavLink to="/jobs" className={({ isActive }) => `btn-nav ${isActive ? "on" : ""}`}>
            <Clapperboard className="h-4" />
            Demo Gallery
          </NavLink>
          <NavLink to="/" end className={({ isActive }) => `btn-nav ${isActive ? "on" : ""}`}>
            <Sparkles className="h-4" />
            Generate
          </NavLink>
          <NavLink to="/pitch" className={({ isActive }) => `btn-nav ${isActive ? "on" : ""}`}>
            <Presentation className="h-4" />
            Pitch
          </NavLink>
          <NavLink to="/verified" className={({ isActive }) => `btn-nav ${isActive ? "on" : ""}`}>
            <BadgeCheck className="h-4" />
            Verified
          </NavLink>
        </nav>
        <span className="header-spacer" aria-hidden />
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <Header />
      <main className="workspace">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pitch" element={<Pitch />} />
          <Route path="/verified" element={<Verified />} />
          <Route path="/jobs" element={<Gallery />} />
          <Route path="/jobs/:id" element={<Job />} />
        </Routes>
      </main>
    </div>
  );
}
