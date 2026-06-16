import { useState, useEffect, useRef, useCallback } from "react";
import Papa from "papaparse";

// ── Design tokens ──────────────────────────────────────────────────
const C = {
  bg: "#0A0A0A", surface: "#141414", surfaceHigh: "#1C1C1C",
  border: "#2A2A2A", accent: "#A8FF78", accentDim: "#A8FF7822",
  textPrimary: "#F5F5F5", textSecondary: "#888888", textMuted: "#555555",
  red: "#FF6B6B", redDim: "#FF6B6B22", yellow: "#FFD166", yellowDim: "#FFD16622",
  amazon: "#FF9900",
};
const ALL_CATS = ["Dining","Groceries","Transport","Subscriptions","Shopping","Entertainment","Health","Other"];
const CAT_COLOR = { Dining:C.accent, Groceries:C.yellow, Transport:"#7EB8FF", Subscriptions:"#C77DFF", Shopping:C.amazon, Entertainment:"#FF6B9D", Health:"#5EE7B7", Other:C.textMuted };
const PEOPLE = ["Riya","Dev","Priya","Sam","Zara"];
let _txId = 1000;

// ── CSV parser for Chase format ────────────────────────────────────
function parseChaseCSV(csvText) {
  const decoded = csvText.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const firstLine = decoded.split("\n")[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const result = Papa.parse(decoded.trim(), { header: true, skipEmptyLines: true, delimiter });
  if (!result.data.length) throw new Error("No rows parsed");
  return result.data.map((row) => {
    const merchant = (row["Description"] || row["description"] || "Unknown")
      .trim().replace(/\s+/g, " ");
    const rawAmount = parseFloat((row["Amount"] || row["amount"] || "0").replace(/[^0-9.-]/g, ""));
    const isCredit = rawAmount > 0;
    const amount = Math.abs(rawAmount);
    const date = row["Transaction Date"] || row["Post Date"] || row["transaction date"] || "";
    let dateStr = date;
    try {
      const d = new Date(date);
      if (!isNaN(d)) dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {}
    // Pre-fill category from Chase's own category field
    const chaseCategory = (row["Category"] || "").toLowerCase();
    let category = null;
    if (chaseCategory.includes("food") || chaseCategory.includes("drink")) category = "Dining";
    else if (chaseCategory.includes("grocer")) category = "Groceries";
    else if (chaseCategory.includes("travel")) category = "Transport";
    else if (chaseCategory.includes("shopping")) category = "Shopping";
    else if (chaseCategory.includes("health") || chaseCategory.includes("medical")) category = "Health";
    else if (chaseCategory.includes("entertainment")) category = "Entertainment";
    return {
      id: _txId++, merchant, date: dateStr, rawDate: date,
      total: amount, myShare: amount, split: false, people: [],
      settled: false, category, amazonItems: null, isCredit, source: "chase",
    };
  }).filter(t => !t.isCredit && t.total > 0);
}

// ── AI categorize via serverless ───────────────────────────────────
async function aiCategorize(transactions) {
  const todo = transactions.filter(t => !t.category);
  if (!todo.length) return {};
  try {
    const res = await fetch("/api/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions: todo.map(t => ({ id: t.id, merchant: t.merchant, amount: t.total })) })
    });
    const data = await res.json();
    return data.categories || {};
  } catch { return {}; }
}

// ── Atoms ──────────────────────────────────────────────────────────
const Avatar = ({ name, size = 36 }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: C.accent + "22", display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, fontWeight: 800, fontSize: size * 0.38, flexShrink: 0 }}>{name[0]}</div>
);
const Dot = ({ cat }) => (
  <span style={{ width: 8, height: 8, borderRadius: "50%", background: CAT_COLOR[cat] || C.textMuted, display: "inline-block", flexShrink: 0 }} />
);
const Pill = ({ label, color }) => (
  <span style={{ background: color + "22", color, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap" }}>{label}</span>
);
const Toast = ({ msg }) => (
  <div style={{ position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)", background: C.accent, color: "#0A0A0A", padding: "10px 20px", borderRadius: 20, fontSize: 13, fontWeight: 700, zIndex: 300, whiteSpace: "nowrap", boxShadow: `0 4px 20px ${C.accent}44` }}>{msg}</div>
);

// ── Sheet ──────────────────────────────────────────────────────────
const Sheet = ({ onClose, children, title }) => (
  <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: "24px 24px 0 0", border: `1px solid ${C.border}`, borderBottom: "none", maxHeight: "88vh", overflowY: "auto" }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: "16px auto 0" }} />
      {title && <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", padding: "16px 20px 0", margin: 0 }}>{title}</p>}
      <div style={{ padding: "12px 20px 48px" }}>{children}</div>
    </div>
  </div>
);

// ── Category sheet ─────────────────────────────────────────────────
const CatSheet = ({ current, onSelect, onClose }) => (
  <Sheet onClose={onClose} title="CHANGE CATEGORY">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
      {ALL_CATS.map(cat => (
        <button key={cat} onClick={() => onSelect(cat)} style={{ background: current === cat ? CAT_COLOR[cat] + "22" : C.surfaceHigh, border: `1px solid ${current === cat ? CAT_COLOR[cat] + "66" : C.border}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          <Dot cat={cat} />
          <span style={{ color: current === cat ? CAT_COLOR[cat] : C.textSecondary, fontSize: 14, fontWeight: current === cat ? 700 : 400 }}>{cat}</span>
        </button>
      ))}
    </div>
  </Sheet>
);

// ── Transaction detail ─────────────────────────────────────────────
const TxDetail = ({ tx, onClose, onUpdateCategory, onMarkSplit, onMarkSettled }) => {
  const [editCat, setEditCat] = useState(false);
  return (
    <Sheet onClose={onClose} title="TRANSACTION">
      {editCat && <CatSheet current={tx.category} onSelect={cat => { onUpdateCategory(tx.id, cat); setEditCat(false); }} onClose={() => setEditCat(false)} />}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, marginTop: 8 }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: C.surfaceHigh, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
          {tx.merchant.toLowerCase().includes("amazon") ? "🛒" : tx.merchant.toLowerCase().includes("uber") || tx.merchant.toLowerCase().includes("lyft") ? "🚗" : tx.merchant.toLowerCase().includes("apple") ? "🍎" : tx.category === "Dining" ? "🍽️" : tx.category === "Groceries" ? "🛍️" : "💳"}
        </div>
        <div>
          <p style={{ color: C.textPrimary, fontSize: 20, fontWeight: 700, margin: "0 0 3px" }}>{tx.merchant}</p>
          <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>{tx.date}</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div style={{ background: C.surfaceHigh, borderRadius: 14, padding: "14px 16px" }}>
          <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 4px" }}>TOTAL CHARGED</p>
          <p style={{ color: C.textPrimary, fontSize: 22, fontWeight: 800, margin: 0 }}>${tx.total.toFixed(2)}</p>
        </div>
        <div style={{ background: C.accentDim, border: `1px solid ${C.accent}33`, borderRadius: 14, padding: "14px 16px" }}>
          <p style={{ color: C.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 4px" }}>MY SHARE</p>
          <p style={{ color: C.accent, fontSize: 22, fontWeight: 800, margin: 0 }}>${tx.myShare.toFixed(2)}</p>
        </div>
      </div>

      <div style={{ background: C.surfaceHigh, borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Dot cat={tx.category} />
          <span style={{ color: CAT_COLOR[tx.category] || C.textMuted, fontSize: 15, fontWeight: 600 }}>{tx.category || "Uncategorized"}</span>
        </div>
        <button onClick={() => setEditCat(true)} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer" }}>Change</button>
      </div>

      {tx.split && tx.people.length > 0 && (
        <div style={{ background: C.surfaceHigh, borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 10px" }}>SPLIT WITH</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tx.people.map(p => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface, borderRadius: 20, padding: "6px 12px" }}>
                <Avatar name={p} size={20} />
                <span style={{ color: C.textPrimary, fontSize: 13 }}>{p}</span>
                <span style={{ color: C.textMuted, fontSize: 12 }}>${((tx.total - tx.myShare) / tx.people.length).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!tx.split && (
        <button onClick={() => { onMarkSplit(tx.id); onClose(); }} style={{ width: "100%", background: C.accentDim, border: `1px solid ${C.accent}44`, color: C.accent, borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
          + Mark as split expense
        </button>
      )}
      {tx.split && !tx.settled && (
        <button onClick={() => { onMarkSettled(tx.id); onClose(); }} style={{ width: "100%", background: C.yellowDim, border: `1px solid ${C.yellow}44`, color: C.yellow, borderRadius: 14, padding: "14px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
          ✓ Mark as settled
        </button>
      )}
      {tx.settled && <div style={{ textAlign: "center", padding: "12px 0", color: C.accent, fontSize: 14, fontWeight: 600 }}>✓ Fully settled</div>}
    </Sheet>
  );
};

// ── Add Split sheet ────────────────────────────────────────────────
const AddSplit = ({ onClose, onAdd, transactions, preSelectedTx = null }) => {
  const [mode, setMode] = useState(preSelectedTx ? "existing" : "existing"); // existing | new
  const [selectedTx, setSelectedTx] = useState(preSelectedTx);
  const [merchant, setMerchant] = useState("");
  const [total, setTotal] = useState("");
  const [myAmt, setMyAmt] = useState("");
  const [picked, setPicked] = useState([]);

  const splitableTxs = transactions.filter(t => !t.split && !t.isCredit);
  const valid = mode === "existing"
    ? selectedTx && picked.length > 0 && parseFloat(myAmt) > 0
    : merchant.trim() && parseFloat(total) > 0 && parseFloat(myAmt) > 0 && picked.length > 0;

  const inp = { background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", color: C.textPrimary, fontSize: 15, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  function submit() {
    if (!valid) return;
    const tx = mode === "existing" ? transactions.find(t => t.id === selectedTx) : null;
    onAdd({
      id: _txId++,
      merchant: tx ? tx.merchant : merchant.trim(),
      date: tx ? tx.date : new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      total: tx ? tx.total : parseFloat(total),
      myShare: parseFloat(myAmt),
      split: true, people: picked, settled: false,
      category: tx?.category || null, amazonItems: null,
      existingTxId: tx?.id || null,
    });
    onClose();
  }

  return (
    <Sheet onClose={onClose} title="NEW SPLIT">
      <div style={{ display: "flex", gap: 8, marginBottom: 16, marginTop: 8 }}>
        {["existing", "new"].map(m => (
          <button key={m} onClick={() => setMode(m)} style={{ flex: 1, background: mode === m ? C.accent : C.surfaceHigh, border: `1px solid ${mode === m ? C.accent : C.border}`, color: mode === m ? "#0A0A0A" : C.textSecondary, borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {m === "existing" ? "From transactions" : "Enter manually"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "existing" ? (
          <div>
            <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, margin: "0 0 8px" }}>PICK A TRANSACTION</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
              {splitableTxs.length === 0 && <p style={{ color: C.textMuted, fontSize: 13 }}>No transactions imported yet.</p>}
              {splitableTxs.slice(0, 20).map(t => (
                <button key={t.id} onClick={() => { setSelectedTx(t.id); setMyAmt(""); }} style={{ background: selectedTx === t.id ? C.accentDim : C.surfaceHigh, border: `1px solid ${selectedTx === t.id ? C.accent + "66" : C.border}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: C.textPrimary, fontSize: 14 }}>{t.merchant}</span>
                  <span style={{ color: selectedTx === t.id ? C.accent : C.textSecondary, fontSize: 14, fontWeight: 600 }}>${t.total.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div>
              <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, margin: "0 0 6px" }}>MERCHANT</p>
              <input style={inp} placeholder="e.g. Zahav" value={merchant} onChange={e => setMerchant(e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, margin: "0 0 6px" }}>TOTAL BILL</p>
                <input style={inp} placeholder="$0.00" type="number" value={total} onChange={e => setTotal(e.target.value)} />
              </div>
              <div>
                <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, margin: "0 0 6px" }}>MY SHARE</p>
                <input style={inp} placeholder="$0.00" type="number" value={myAmt} onChange={e => setMyAmt(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {(mode === "new" || selectedTx) && (
          <>
            {mode === "existing" && (
              <div>
                <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, margin: "0 0 6px" }}>MY SHARE</p>
                <input style={inp} placeholder="$0.00" type="number" value={myAmt} onChange={e => setMyAmt(e.target.value)} />
              </div>
            )}
            <div>
              <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, margin: "0 0 8px" }}>SPLIT WITH</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PEOPLE.map(p => {
                  const on = picked.includes(p);
                  return (
                    <button key={p} onClick={() => setPicked(prev => on ? prev.filter(x => x !== p) : [...prev, p])} style={{ display: "flex", alignItems: "center", gap: 6, background: on ? C.accentDim : C.surfaceHigh, border: `1px solid ${on ? C.accent + "66" : C.border}`, borderRadius: 20, padding: "7px 12px", cursor: "pointer" }}>
                      <Avatar name={p} size={20} />
                      <span style={{ color: on ? C.accent : C.textSecondary, fontSize: 13, fontWeight: on ? 700 : 400 }}>{p}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {picked.length > 0 && parseFloat(myAmt) > 0 && (
              <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}33`, borderRadius: 12, padding: "12px 14px" }}>
                <p style={{ color: C.yellow, fontSize: 13, margin: 0 }}>
                  Each person owes you <strong>${(((parseFloat(mode === "existing" ? transactions.find(t => t.id === selectedTx)?.total || 0 : total) || 0) - (parseFloat(myAmt) || 0)) / picked.length).toFixed(2)}</strong>
                </p>
              </div>
            )}
          </>
        )}

        <button onClick={submit} disabled={!valid} style={{ background: valid ? C.accent : C.surfaceHigh, border: "none", color: valid ? "#0A0A0A" : C.textMuted, borderRadius: 14, padding: "15px", fontSize: 15, fontWeight: 700, cursor: valid ? "pointer" : "default", marginTop: 4, transition: "background 0.2s" }}>
          Add Split
        </button>
      </div>
    </Sheet>
  );
};

// ── CSV Import screen ──────────────────────────────────────────────
const ImportScreen = ({ onImport, onSkip }) => {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  function processFile(file) {
    if (!file || !file.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const txs = parseChaseCSV(e.target.result);
        if (!txs.length) { setError("No transactions found. Make sure this is a Chase CSV export."); return; }
        onImport(txs);
      } catch { setError("Couldn't parse this file. Try re-downloading from Chase."); }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", background: C.bg }}>
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: 20, background: C.accentDim, border: `1px solid ${C.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, margin: "0 auto 24px" }}>⬆</div>
        <h1 style={{ color: C.textPrimary, fontSize: 26, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-0.5px" }}>Import your transactions</h1>
        <p style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.6, margin: "0 0 32px" }}>
          Download your Chase transaction history as a CSV and drop it here. Your data never leaves your device.
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current.click()}
          style={{ border: `2px dashed ${dragging ? C.accent : C.border}`, borderRadius: 20, padding: "40px 24px", cursor: "pointer", marginBottom: 16, transition: "border-color 0.2s", background: dragging ? C.accentDim : "transparent" }}>
          <p style={{ color: dragging ? C.accent : C.textSecondary, fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Drop CSV here</p>
          <p style={{ color: C.textMuted, fontSize: 13, margin: 0 }}>or tap to browse files</p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
        </div>

        {error && <p style={{ color: C.red, fontSize: 13, marginBottom: 16 }}>{error}</p>}

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px", marginBottom: 24, textAlign: "left" }}>
          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 8px" }}>HOW TO EXPORT FROM CHASE</p>
          {["Go to chase.com → Account activity", "Click Download → CSV", "Select date range → Download"].map((s, i) => (
            <p key={i} style={{ color: C.textSecondary, fontSize: 13, margin: "0 0 4px", display: "flex", gap: 8 }}>
              <span style={{ color: C.accent, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{s}
            </p>
          ))}
        </div>

        <button onClick={onSkip} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 14, cursor: "pointer", textDecoration: "underline" }}>
          Skip for now, use demo data
        </button>
      </div>
    </div>
  );
};

// ── Bottom nav ─────────────────────────────────────────────────────
const BottomNav = ({ active, setActive }) => {
  const tabs = [{ id: "dashboard", icon: "◈", label: "Overview" }, { id: "transactions", icon: "↕", label: "Activity" }, { id: "splits", icon: "⊕", label: "Splits" }, { id: "settings", icon: "⚙", label: "Accounts" }];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 402, background: "rgba(10,10,10,0.94)", backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-around", alignItems: "center", paddingBottom: 28, paddingTop: 12, zIndex: 50 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setActive(t.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: active === t.id ? C.accent : C.textMuted, padding: "4px 12px" }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
          <span style={{ fontSize: 9, letterSpacing: "0.05em", fontWeight: active === t.id ? 700 : 400 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

// ── Dashboard ──────────────────────────────────────────────────────
const Dashboard = ({ transactions, splits, setTab, onReimport }) => {
  const totalCharged = transactions.reduce((s, t) => s + t.total, 0);
  const myRealSpend = transactions.reduce((s, t) => s + t.myShare, 0);
  const pending = splits.filter(s => !s.settled);
  const totalOwed = pending.reduce((s, t) => s + t.amount, 0);
  const byPerson = pending.reduce((acc, s) => { if (!acc[s.person]) acc[s.person] = { person: s.person, total: 0, n: 0 }; acc[s.person].total += s.amount; acc[s.person].n++; return acc; }, {});
  const savings = totalCharged - myRealSpend;

  return (
    <div style={{ padding: "0 20px", paddingBottom: 100 }}>
      <div style={{ paddingTop: 16, paddingBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <p style={{ color: C.textMuted, fontSize: 12, letterSpacing: "0.12em", fontWeight: 500, marginBottom: 4 }}>
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
          </p>
          <h1 style={{ color: C.textPrimary, fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>Overview</h1>
        </div>
        <button onClick={onReimport} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 10, cursor: "pointer" }}>⬆ Import</button>
      </div>

      <div style={{ background: C.accent, borderRadius: 20, padding: "24px 24px 20px", marginBottom: 12, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(0,0,0,0.08)" }} />
        <p style={{ color: "rgba(0,0,0,0.55)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", margin: "0 0 8px" }}>MY REAL SPEND</p>
        <p style={{ color: "#0A0A0A", fontSize: 42, fontWeight: 800, margin: "0 0 4px", letterSpacing: "-1px" }}>${myRealSpend.toFixed(2)}</p>
        <p style={{ color: "rgba(0,0,0,0.45)", fontSize: 13, margin: 0 }}>of ${totalCharged.toFixed(2)} total charged{savings > 0 ? ` · saving $${savings.toFixed(2)}` : ""}</p>
        <div style={{ marginTop: 16, background: "rgba(0,0,0,0.1)", borderRadius: 8, height: 4 }}>
          <div style={{ width: `${Math.min((myRealSpend / (totalCharged || 1)) * 100, 100)}%`, background: "#0A0A0A", borderRadius: 8, height: 4 }} />
        </div>
      </div>

      <div onClick={() => setTab("splits")} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: "20px 24px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
        <div>
          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", margin: "0 0 6px" }}>OWED TO YOU</p>
          <p style={{ color: C.yellow, fontSize: 32, fontWeight: 700, margin: 0 }}>${totalOwed.toFixed(2)}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", margin: "0 0 6px" }}>PEOPLE</p>
          <p style={{ color: C.textPrimary, fontSize: 32, fontWeight: 700, margin: 0 }}>{Object.keys(byPerson).length}</p>
        </div>
      </div>

      {Object.keys(byPerson).length > 0 && (
        <>
          <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 10 }}>PENDING FROM</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {Object.values(byPerson).map(p => (
              <div key={p.person} onClick={() => setTab("splits")} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar name={p.person} />
                  <div>
                    <p style={{ color: C.textPrimary, fontSize: 15, fontWeight: 600, margin: "0 0 2px" }}>{p.person}</p>
                    <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>{p.n} expense{p.n > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <p style={{ color: C.yellow, fontSize: 17, fontWeight: 700, margin: 0 }}>${p.total.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 12 }}>BY CATEGORY</p>
      {ALL_CATS.map(cat => {
        const spend = transactions.filter(t => t.category === cat).reduce((s, t) => s + t.myShare, 0);
        if (!spend) return null;
        return (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <Dot cat={cat} />
            <p style={{ color: C.textSecondary, fontSize: 14, margin: 0, flex: 1 }}>{cat}</p>
            <div style={{ flex: 2, background: C.surfaceHigh, borderRadius: 4, height: 4 }}>
              <div style={{ width: `${(spend / (myRealSpend || 1)) * 100}%`, background: CAT_COLOR[cat], borderRadius: 4, height: 4 }} />
            </div>
            <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 600, margin: 0, minWidth: 56, textAlign: "right" }}>${spend.toFixed(0)}</p>
          </div>
        );
      })}

      {transactions.length === 0 && (
        <div style={{ textAlign: "center", paddingTop: 32 }}>
          <p style={{ color: C.textMuted, fontSize: 14 }}>No transactions yet.</p>
          <button onClick={onReimport} style={{ background: C.accentDim, border: `1px solid ${C.accent}44`, color: C.accent, borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>Import CSV</button>
        </div>
      )}
    </div>
  );
};

// ── Activity ───────────────────────────────────────────────────────
const Activity = ({ transactions, setTransactions, categorizing, onReimport, onAddSplits }) => {
  const [filter, setFilter] = useState("all");
  const [selectedTx, setSelectedTx] = useState(null);
  const [editCatId, setEditCatId] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  const [pendingSplitTx, setPendingSplitTx] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2000); }
  function updateCat(id, cat) { setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: cat } : t)); }
  function markSplit(id) { setSelectedTx(null); setShowAdd(true); setPendingSplitTx(id); }
  function markSettled(id) { setTransactions(prev => prev.map(t => t.id === id ? { ...t, settled: true } : t)); showToast("Marked as settled ✓"); }

  const filtered = transactions.filter(t => {
    if (filter === "split") return t.split;
    if (filter === "personal") return !t.split;
    if (search) return t.merchant.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  const tx = selectedTx ? transactions.find(t => t.id === selectedTx) : null;

  return (
    <div style={{ padding: "0 20px", paddingBottom: 100 }}>
      {toast && <Toast msg={toast} />}
      {tx && <TxDetail tx={tx} onClose={() => setSelectedTx(null)} onUpdateCategory={updateCat} onMarkSplit={markSplit} onMarkSettled={markSettled} />}
      {editCatId && <CatSheet current={transactions.find(t => t.id === editCatId)?.category} onSelect={cat => { updateCat(editCatId, cat); setEditCatId(null); }} onClose={() => setEditCatId(null)} />}
      {showAdd && <AddSplit onClose={() => { setShowAdd(false); setPendingSplitTx(null); }} transactions={transactions} preSelectedTx={pendingSplitTx} onAdd={s => { const perPerson = (s.total - s.myShare) / s.people.length; const newSplits = s.people.map((p, i) => ({ id: Date.now() + i, person: p, merchant: s.merchant, amount: perPerson, date: s.date, settled: false })); onAddSplits(newSplits); if (s.existingTxId) { setTransactions(prev => prev.map(t => t.id === s.existingTxId ? { ...t, split: true, people: s.people, myShare: s.myShare } : t)); } showToast("Split added ✓"); }} />}

      <div style={{ paddingTop: 16, paddingBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <p style={{ color: C.textMuted, fontSize: 12, letterSpacing: "0.12em", fontWeight: 500, marginBottom: 4 }}>
              {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase()}
            </p>
            <h1 style={{ color: C.textPrimary, fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>Activity</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {categorizing && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, animation: "pulse 1s infinite" }} />
                <span style={{ color: C.accent, fontSize: 11, fontWeight: 600 }}>AI sorting</span>
              </div>
            )}
            <button onClick={onReimport} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 10, cursor: "pointer" }}>⬆ Import</button>
          </div>
        </div>

        <input
          placeholder="Search transactions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", background: C.surfaceHigh, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", color: C.textPrimary, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 12 }}
        />

        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {["all", "split", "personal"].map(f => (
            <button key={f} onClick={() => { setFilter(f); setSearch(""); }} style={{ background: filter === f && !search ? C.accent : C.surface, border: `1px solid ${filter === f && !search ? C.accent : C.border}`, color: filter === f && !search ? "#0A0A0A" : C.textSecondary, borderRadius: 20, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", textTransform: "capitalize", flexShrink: 0 }}>{f}</button>
          ))}
        </div>
      </div>

      {transactions.length === 0 && (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <p style={{ color: C.textMuted, fontSize: 14, marginBottom: 12 }}>No transactions imported yet.</p>
          <button onClick={onReimport} style={{ background: C.accentDim, border: `1px solid ${C.accent}44`, color: C.accent, borderRadius: 12, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Import CSV</button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map(t => (
          <div key={t.id} onClick={() => setSelectedTx(t.id)}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + "44"}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                  <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 600, margin: 0 }}>{t.merchant}</p>
                  {t.split && <Pill label="SPLIT" color={C.accent} />}
                  {t.settled && <Pill label="SETTLED" color={C.textMuted} />}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: C.textMuted, fontSize: 12 }}>{t.date}</span>
                  {t.category && <><span style={{ color: C.textMuted, fontSize: 12 }}>·</span>
                    <button onClick={e => { e.stopPropagation(); setEditCatId(t.id); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      <Dot cat={t.category} /><span style={{ color: CAT_COLOR[t.category], fontSize: 12, fontWeight: 600 }}>{t.category}</span><span style={{ color: C.textMuted, fontSize: 10 }}>✎</span>
                    </button></>}
                  {!t.category && <span style={{ color: C.textMuted, fontSize: 12 }}>{categorizing ? "· sorting…" : ""}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 12 }}>
                <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 700, margin: "0 0 2px" }}>${t.myShare.toFixed(2)}</p>
                {t.split && t.myShare !== t.total && <p style={{ color: C.textMuted, fontSize: 11, margin: 0 }}>of ${t.total.toFixed(2)}</p>}
              </div>
            </div>
            {t.split && t.people.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: C.textMuted, fontSize: 11 }}>with</span>
                {t.people.map(p => <span key={p} style={{ background: C.surfaceHigh, color: C.textSecondary, fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 6 }}>{p}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
};

// ── Splits ─────────────────────────────────────────────────────────
const Splits = ({ splits, setSplits, transactions, showAdd, setShowAdd }) => {
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2000); }

  const pending = splits.filter(s => !s.settled);
  const totalOwed = pending.reduce((s, t) => s + t.amount, 0);
  const byPerson = pending.reduce((acc, s) => { if (!acc[s.person]) acc[s.person] = { person: s.person, total: 0, items: [] }; acc[s.person].total += s.amount; acc[s.person].items.push(s); return acc; }, {});

  function settleAll(person) {
    setSplits(prev => prev.map(s => s.person === person ? { ...s, settled: true } : s));
    setExpanded(null);
    showToast(`${person} settled ✓`);
  }

  return (
    <div style={{ padding: "0 20px", paddingBottom: 100 }}>
      {toast && <Toast msg={toast} />}
      {showAdd && (
        <AddSplit
          onClose={() => setShowAdd(false)}
          transactions={transactions}
          onAdd={s => {
            const perPerson = (s.total - s.myShare) / s.people.length;
            const newSplits = s.people.map((p, i) => ({ id: Date.now() + i, person: p, merchant: s.merchant, amount: perPerson, date: s.date, settled: false }));
            setSplits(prev => [...prev, ...newSplits]);
            showToast("Split added ✓");
          }}
        />
      )}

      <div style={{ paddingTop: 16, paddingBottom: 20 }}>
        <p style={{ color: C.textMuted, fontSize: 12, letterSpacing: "0.12em", fontWeight: 500, marginBottom: 4 }}>OUTSTANDING</p>
        <h1 style={{ color: C.textPrimary, fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>Splits</h1>
      </div>

      <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}33`, borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ color: C.yellow, fontSize: 14, fontWeight: 600, margin: 0 }}>Total owed to you</p>
        <p style={{ color: C.yellow, fontSize: 22, fontWeight: 800, margin: 0 }}>${totalOwed.toFixed(2)}</p>
      </div>

      {Object.keys(byPerson).length === 0 && (
        <div style={{ textAlign: "center", paddingTop: 48 }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>✓</p>
          <p style={{ color: C.textSecondary, fontSize: 16, margin: "0 0 6px" }}>All settled up</p>
          <p style={{ color: C.textMuted, fontSize: 13 }}>Tap + to add a split</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Object.values(byPerson).map(p => (
          <div key={p.person}>
            <button onClick={() => setExpanded(expanded === p.person ? null : p.person)} style={{ width: "100%", background: C.surface, border: `1px solid ${expanded === p.person ? C.accent + "66" : C.border}`, borderRadius: expanded === p.person ? "16px 16px 0 0" : 16, padding: "16px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={p.person} size={40} />
                <div style={{ textAlign: "left" }}>
                  <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 600, margin: "0 0 3px" }}>{p.person}</p>
                  <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>{p.items.length} pending</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <p style={{ color: C.yellow, fontSize: 18, fontWeight: 800, margin: 0 }}>${p.total.toFixed(2)}</p>
                <span style={{ color: C.textMuted, fontSize: 11 }}>{expanded === p.person ? "▲" : "▼"}</span>
              </div>
            </button>
            {expanded === p.person && (
              <div style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 16px 16px", paddingBottom: 8 }}>
                {p.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 18px", borderBottom: i < p.items.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div>
                      <p style={{ color: C.textPrimary, fontSize: 14, fontWeight: 500, margin: "0 0 2px" }}>{item.merchant}</p>
                      <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>{item.date}</p>
                    </div>
                    <p style={{ color: C.textSecondary, fontSize: 15, fontWeight: 600, margin: 0 }}>${item.amount.toFixed(2)}</p>
                  </div>
                ))}
                <div style={{ padding: "10px 18px 4px" }}>
                  <button onClick={() => settleAll(p.person)} style={{ width: "100%", background: C.accentDim, border: `1px solid ${C.accent}44`, color: C.accent, borderRadius: 12, padding: "11px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Mark all settled · via Zelle
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => setShowAdd(true)} style={{ position: "fixed", bottom: 90, right: 20, width: 54, height: 54, borderRadius: "50%", background: C.accent, border: "none", color: "#0A0A0A", fontSize: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 24px ${C.accent}44`, zIndex: 40 }}>+</button>
    </div>
  );
};

// ── Settings ───────────────────────────────────────────────────────
const Settings = ({ onReimport, transactionCount }) => {
  const [toast, setToast] = useState(null);
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2000); }

  return (
    <div style={{ padding: "0 20px", paddingBottom: 100 }}>
      {toast && <Toast msg={toast} />}
      <div style={{ paddingTop: 16, paddingBottom: 24 }}>
        <p style={{ color: C.textMuted, fontSize: 12, letterSpacing: "0.12em", fontWeight: 500, marginBottom: 4 }}>MANAGE</p>
        <h1 style={{ color: C.textPrimary, fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>Accounts</h1>
      </div>

      <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 10 }}>DATA SOURCE</p>
      <div style={{ background: C.surface, border: `1px solid #1E6FCC44`, borderRadius: 16, padding: "16px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#1E6FCC22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🏦</div>
        <div style={{ flex: 1 }}>
          <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 600, margin: "0 0 3px" }}>Chase</p>
          <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>CSV import · {transactionCount} transactions loaded</p>
          <p style={{ color: "#1E6FCC", fontSize: 11, fontWeight: 600, margin: "4px 0 0" }}>● Connected via CSV</p>
        </div>
        <button onClick={onReimport} style={{ background: C.surfaceHigh, border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 10, cursor: "pointer" }}>Update</button>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 32, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.amazon + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🛒</div>
        <div style={{ flex: 1 }}>
          <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 600, margin: "0 0 3px" }}>Amazon</p>
          <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>Coming soon — item-level detail</p>
        </div>
        <span style={{ color: C.textMuted, fontSize: 12, fontWeight: 600 }}>Soon</span>
      </div>

      <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 10 }}>AI FEATURES</p>
      <div style={{ background: C.surface, border: `1px solid ${C.accent}33`, borderRadius: 16, padding: "16px 18px", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>✦</div>
          <div style={{ flex: 1 }}>
            <p style={{ color: C.textPrimary, fontSize: 16, fontWeight: 600, margin: "0 0 3px" }}>Auto-categorization</p>
            <p style={{ color: C.textMuted, fontSize: 12, margin: "0 0 8px" }}>Claude reads merchant names and sorts every transaction. Tap any category to override.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent }} />
              <span style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>Active</span>
            </div>
          </div>
        </div>
      </div>

      <p style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 10 }}>HOW TO EXPORT FROM CHASE</p>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" }}>
        {["Go to chase.com → sign in", "Click your checking or credit card account", "Activity → Download → CSV", "Select date range → Download"].map((s, i) => (
          <p key={i} style={{ color: C.textSecondary, fontSize: 13, margin: "0 0 8px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ color: C.accent, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{s}
          </p>
        ))}
      </div>
    </div>
  );
};

// ── Demo data ──────────────────────────────────────────────────────
const DEMO_TX = [
  { id: _txId++, merchant: "Zahav", date: "Jun 14", total: 187.50, myShare: 46.88, split: true, people: ["Riya", "Dev", "Priya"], settled: false, category: "Dining", amazonItems: null, isCredit: false, source: "demo" },
  { id: _txId++, merchant: "Whole Foods Market", date: "Jun 13", total: 94.20, myShare: 94.20, split: false, people: [], settled: false, category: "Groceries", amazonItems: null, isCredit: false, source: "demo" },
  { id: _txId++, merchant: "Uber", date: "Jun 12", total: 22.00, myShare: 11.00, split: true, people: ["Dev"], settled: true, category: "Transport", amazonItems: null, isCredit: false, source: "demo" },
  { id: _txId++, merchant: "Parc Restaurant", date: "Jun 11", total: 312.00, myShare: 78.00, split: true, people: ["Riya", "Dev", "Priya"], settled: false, category: "Dining", amazonItems: null, isCredit: false, source: "demo" },
  { id: _txId++, merchant: "Apple", date: "Jun 10", total: 9.99, myShare: 9.99, split: false, people: [], settled: false, category: "Subscriptions", amazonItems: null, isCredit: false, source: "demo" },
  { id: _txId++, merchant: "Trader Joe's", date: "Jun 9", total: 67.40, myShare: 33.70, split: true, people: ["Riya"], settled: true, category: "Groceries", amazonItems: null, isCredit: false, source: "demo" },
];
const DEMO_SPLITS = [
  { id: 1, person: "Riya", merchant: "Zahav", amount: 46.88, date: "Jun 14", settled: false },
  { id: 2, person: "Dev", merchant: "Zahav", amount: 46.88, date: "Jun 14", settled: false },
  { id: 3, person: "Priya", merchant: "Zahav", amount: 46.87, date: "Jun 14", settled: false },
  { id: 4, person: "Riya", merchant: "Parc Restaurant", amount: 78.00, date: "Jun 11", settled: false },
  { id: 5, person: "Dev", merchant: "Parc Restaurant", amount: 78.00, date: "Jun 11", settled: false },
  { id: 6, person: "Priya", merchant: "Parc Restaurant", amount: 78.00, date: "Jun 11", settled: false },
];

// ── Root ───────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("import"); // import | app
  const [tab, setTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [splits, setSplits] = useState([]);
  const [categorizing, setCategorizing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  async function handleImport(txs) {
    setTransactions(txs);
    setSplits([]);
    setScreen("app");
    setTab("transactions");
    setCategorizing(true);
    const result = await aiCategorize(txs);
    setTransactions(prev => prev.map(t => ({ ...t, category: t.category || result[String(t.id)] || "Other" })));
    setCategorizing(false);
  }

  function handleSkip() {
    setTransactions(DEMO_TX);
    setSplits(DEMO_SPLITS);
    setScreen("app");
  }

  if (screen === "import") return <ImportScreen onImport={handleImport} onSkip={handleSkip} />;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 402, margin: "0 auto", fontFamily: "SF Pro Display, SF Pro Text, -apple-system, BlinkMacSystemFont, sans-serif", position: "relative", overflowX: "hidden" }}>
      <div style={{ height: 62, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8 }}>
        <div style={{ width: 120, height: 34, background: "#000", borderRadius: 20, border: `1px solid ${C.border}` }} />
      </div>
      <div style={{ overflowY: "auto", height: "calc(100vh - 62px)" }}>
        {tab === "dashboard" && <Dashboard transactions={transactions} splits={splits} setTab={setTab} onReimport={() => setScreen("import")} />}
        {tab === "transactions" && <Activity transactions={transactions} setTransactions={setTransactions} categorizing={categorizing} onReimport={() => setScreen("import")} onAddSplits={newSplits => setSplits(prev => [...prev, ...newSplits])} />}
        {tab === "splits" && <Splits splits={splits} setSplits={setSplits} transactions={transactions} showAdd={showAdd} setShowAdd={setShowAdd} />}
        {tab === "settings" && <Settings onReimport={() => setScreen("import")} transactionCount={transactions.length} />}
      </div>
      <BottomNav active={tab} setActive={t => { setTab(t); if (t !== "splits") setShowAdd(false); }} />
    </div>
  );
}
