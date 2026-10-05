import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEPLOY, IS_FORK, loadSeason, connectWallet, short, addrUrl } from "./chain.js";
import Arena from "./pages/Arena.jsx";
import Match from "./pages/Match.jsx";
import Lab from "./pages/Lab.jsx";
import About from "./pages/About.jsx";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

function useHashRoute() {
  const get = () => (window.location.hash.replace(/^#/, "") || "/").split("?");
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => { setRoute(get()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const [path, query = ""] = route;
  return { parts: path.split("/").filter(Boolean), query: new URLSearchParams(query) };
}

export function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect x="5" y="5" width="22" height="22" rx="5" fill="#1d1d1b" />
      {[10, 16, 22].map(p => (
        <g key={p} fill="#1d1d1b"><rect x={p - 1} y="1" width="2" height="4" rx="1" /><rect x={p - 1} y="27" width="2" height="4" rx="1" /><rect x="1" y={p - 1} width="4" height="2" rx="1" /><rect x="27" y={p - 1} width="4" height="2" rx="1" /></g>
      ))}
      <path d="M10 20 v-8 h5 v4 h4" stroke="#4ff2d4" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 12 v8 h-5" stroke="#ff8db3" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function App() {
  const { parts, query } = useHashRoute();
  const [season, setSeason] = useState(null);
  const [error, setError] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    if (!DEPLOY) { setError("Not deployed yet."); return; }
    try { setSeason(await loadSeason()); setError(null); }
    catch (e) { console.error(e); setError(e.shortMessage || e.message); }
  }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 20000); return () => clearInterval(id); }, [refresh]);

  const connect = async () => {
    try { setWallet(await connectWallet()); }
    catch (e) { setToast({ text: e.shortMessage || e.message }); }
  };
  useEffect(() => { if (toast && !toast.sticky) { const id = setTimeout(() => setToast(null), 6000); return () => clearTimeout(id); } }, [toast]);

  const page = parts[0] || "";
  let body;
  if (page === "match") body = <Match season={Number(parts[1])} a={Number(parts[2])} b={Number(parts[3])} />;
  else if (page === "lab") body = <Lab query={query} />;
  else if (page === "how") body = <About />;
  else body = <Arena />;

  return (
    <Ctx.Provider value={{ season, error, refresh, wallet, connect, setToast }}>
      <header className="hdr">
        <div className="wrap">
          <a className="logo" href="#/"><Logo /> NAND Arena</a>
          <nav className="nav">
            <a href="#/" className={page === "" || page === "match" ? "on" : ""}>Arena</a>
            <a href="#/lab" className={page === "lab" ? "on" : ""}>Bot Lab</a>
            <a href="#/how" className={page === "how" ? "on" : ""}>How it works</a>
          </nav>
          <div className="spacer" />
          <span className="pill hide-sm"><span className="dot" /> {IS_FORK ? "X Layer fork (dev)" : "X Layer mainnet"}</span>
          {wallet
            ? <a className="btn ghost sm" href={addrUrl(wallet.address)} target="_blank" rel="noreferrer">{short(wallet.address)}</a>
            : <button className="btn primary sm" onClick={connect}>Connect wallet</button>}
        </div>
      </header>
      <main className="wrap">{body}</main>
      <footer className="foot">
        <div className="wrap">
          <span>NAND Arena · bots are TapeOut circuits on X Layer · refereed on-chain</span>
          {DEPLOY && (
            <span>
              Arena <a className="addr" href={addrUrl(DEPLOY.arena)} target="_blank" rel="noreferrer">{short(DEPLOY.arena)}</a>
              {" · "}Processor <a className="addr" href={addrUrl(DEPLOY.processor)} target="_blank" rel="noreferrer">{short(DEPLOY.processor)}</a>
              {" · "}<a href="https://github.com/neromtoobad/nand-arena" target="_blank" rel="noreferrer">GitHub</a>
            </span>
          )}
        </div>
      </footer>
      {toast && <div className="toast" onClick={() => setToast(null)}>{toast.node || toast.text}</div>}
    </Ctx.Provider>
  );
}
