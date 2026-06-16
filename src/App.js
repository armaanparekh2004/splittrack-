import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";

// ─── Uber Base design tokens ───────────────────────────────────────
const U = {
  ink:       "#000000",
  inkSub:    "#545454",
  inkMuted:  "#ABABAB",
  canvas:    "#FFFFFF",
  soft:      "#F6F6F6",
  border:    "#EEEEEE",
  pressed:   "#E2E2E2",
  // Category accent colors — small use only (icons/dots)
  red:    "#E53935",
  green:  "#43A047",
  blue:   "#1E88E5",
  purple: "#8E24AA",
  amber:  "#FB8C00",
  pink:   "#E91E8C",
  teal:   "#00897B",
  grey:   "#757575",
};
const CAT = ["Dining","Groceries","Transport","Subscriptions","Shopping","Entertainment","Health","Other"];
const CAT_C = { Dining:U.red, Groceries:U.green, Transport:U.blue, Subscriptions:U.purple, Shopping:U.amber, Entertainment:U.pink, Health:U.teal, Other:U.grey };
const CAT_E = { Dining:"🍽",Groceries:"🛒",Transport:"🚗",Subscriptions:"📱",Shopping:"🛍",Entertainment:"🎬",Health:"💊",Other:"💳" };

// ─── Typography helpers ────────────────────────────────────────────
const T = {
  h1:   { fontSize:28, fontWeight:700, letterSpacing:-0.5, color:U.ink },
  h2:   { fontSize:20, fontWeight:700, color:U.ink },
  h3:   { fontSize:17, fontWeight:700, color:U.ink },
  body: { fontSize:15, fontWeight:400, color:U.ink },
  sub:  { fontSize:13, fontWeight:400, color:U.inkSub },
  tiny: { fontSize:11, fontWeight:700, letterSpacing:0.6, color:U.inkMuted },
  num:  { fontSize:15, fontWeight:700, color:U.ink },
  bigNum:{ fontSize:36, fontWeight:700, letterSpacing:-1, color:U.ink },
};
const txt = (style,extra={})=>({...style,...extra,margin:0,fontFamily:"-apple-system,'SF Pro Text',sans-serif"});

// ─── Spacing ───────────────────────────────────────────────────────
const S = { xs:4, sm:8, md:16, lg:24, xl:32 };

// ─── Chase CSV ─────────────────────────────────────────────────────
let _uid = 1;
function parseCSV(raw) {
  const clean = raw.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const delim = clean.split("\n")[0].includes("\t") ? "\t" : ",";
  const { data } = Papa.parse(clean.trim(), { header:true, skipEmptyLines:true, delimiter:delim });
  if (!data.length) throw new Error("empty");
  return data.map(r => {
    const merchant = (r["Description"]||r["description"]||"Unknown").trim().replace(/\s+/g," ");
    const raw2 = parseFloat((r["Amount"]||r["amount"]||"0").replace(/[^0-9.-]/g,""));
    const isCredit = raw2 > 0;
    const amount = Math.abs(raw2);
    const dateRaw = r["Transaction Date"] || r["Post Date"] || "";
    let date = dateRaw;
    try { const d=new Date(dateRaw); if(!isNaN(d)) date=d.toLocaleDateString("en-US",{month:"short",day:"numeric"}); } catch {}
    const cc = (r["Category"]||"").toLowerCase();
    let category = null;
    if(cc.includes("food")||cc.includes("drink")) category="Dining";
    else if(cc.includes("grocer")) category="Groceries";
    else if(cc.includes("travel")) category="Transport";
    else if(cc.includes("shopping")) category="Shopping";
    else if(cc.includes("health")||cc.includes("medical")) category="Health";
    else if(cc.includes("entertainment")) category="Entertainment";
    return { id:_uid++, merchant, displayName:null, date, total:amount, myShare:amount, split:false, people:[], settled:false, category, isCredit };
  }).filter(t => !t.isCredit && t.total > 0);
}

// ─── AI enrich ────────────────────────────────────────────────────
async function enrich(txs) {
  const todo = txs.filter(t => !t.category || !t.displayName);
  if (!todo.length) return {};
  try {
    const r = await fetch("/api/categorize", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ transactions: todo.map(t=>({id:t.id,merchant:t.merchant,amount:t.total})) })
    });
    const d = await r.json();
    return d.categories || {};
  } catch { return {}; }
}

// ─── Divider ───────────────────────────────────────────────────────
const Div = ({ indent=0 }) => (
  <div style={{ height:1, background:U.border, marginLeft:indent }} />
);

// ─── Icon box ──────────────────────────────────────────────────────
const Icon = ({ emoji, color, size=48 }) => (
  <div style={{ width:size, height:size, borderRadius:12, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.46, flexShrink:0 }}>
    {emoji}
  </div>
);

// ─── Avatar ────────────────────────────────────────────────────────
const Av = ({ name, size=36 }) => (
  <div style={{ width:size, height:size, borderRadius:999, background:U.pressed, display:"flex", alignItems:"center", justifyContent:"center", color:U.ink, fontWeight:700, fontSize:size*0.4, flexShrink:0 }}>
    {name[0].toUpperCase()}
  </div>
);

// ─── Pill button ───────────────────────────────────────────────────
const Pill = ({ label, onPress, black, small }) => (
  <button onClick={onPress} style={{ background:black?U.ink:U.soft, color:black?"#fff":U.ink, border:"none", borderRadius:999, padding:small?"8px 16px":"14px 24px", fontSize:small?13:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
    {label}
  </button>
);

// ─── Bottom sheet ──────────────────────────────────────────────────
function Sheet({ open, onClose, title, children }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (open) requestAnimationFrame(()=>requestAnimationFrame(()=>setShow(true)));
    else setShow(false);
  }, [open]);
  if (!open && !show) return null;
  return (
    <div onClick={()=>{setShow(false);setTimeout(onClose,300);}} style={{ position:"fixed",inset:0,zIndex:500,display:"flex",flexDirection:"column",justifyContent:"flex-end" }}>
      <div style={{ position:"absolute",inset:0,background:`rgba(0,0,0,${show?0.45:0})`,transition:"background 0.3s" }} />
      <div onClick={e=>e.stopPropagation()} style={{ position:"relative",background:U.canvas,borderRadius:"20px 20px 0 0",maxHeight:"90vh",overflowY:"auto",transform:show?"translateY(0)":"translateY(100%)",transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)" }}>
        <div style={{ width:40,height:4,borderRadius:2,background:U.border,margin:"12px auto 0" }} />
        {title && <>
          <p style={{ ...txt(T.h3), padding:"16px 20px 0" }}>{title}</p>
          <Div />
        </>}
        {children}
        <div style={{ height:40 }} />
      </div>
    </div>
  );
}

// ─── Input ─────────────────────────────────────────────────────────
const Inp = ({ label, value, onChange, placeholder, type="text", hint }) => (
  <div>
    {label && <p style={{ ...txt(T.tiny), marginBottom:S.xs }}>{label.toUpperCase()}</p>}
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type}
      style={{ width:"100%",background:U.soft,border:`1.5px solid ${U.border}`,borderRadius:12,padding:"13px 14px",color:U.ink,fontSize:15,outline:"none",boxSizing:"border-box",fontFamily:"inherit",fontWeight:400 }}
      onFocus={e=>e.target.style.borderColor=U.ink}
      onBlur={e=>e.target.style.borderColor=U.border}
    />
    {hint && <p style={{ ...txt(T.sub), marginTop:4, color:U.inkMuted }}>{hint}</p>}
  </div>
);

// ─── Category picker ───────────────────────────────────────────────
const CatPicker = ({ open, current, onSelect, onClose }) => (
  <Sheet open={open} onClose={onClose} title="Category">
    <div style={{ padding:"12px 0" }}>
      {CAT.map((cat,i) => (
        <div key={cat}>
          <button onClick={()=>{onSelect(cat);}} style={{ width:"100%",background:"none",border:"none",padding:"14px 20px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",fontFamily:"inherit" }}>
            <Icon emoji={CAT_E[cat]} color={CAT_C[cat]} size={40} />
            <p style={{ ...txt(T.body), flex:1 }}>{cat}</p>
            {current===cat && <span style={{ color:U.ink, fontSize:18 }}>✓</span>}
          </button>
          {i<CAT.length-1 && <Div indent={74} />}
        </div>
      ))}
    </div>
  </Sheet>
);

// ─── Name editor ───────────────────────────────────────────────────
const NameEditor = ({ open, current, onSave, onClose }) => {
  const [v, setV] = useState(current||"");
  useEffect(()=>{ if(open) setV(current||""); },[open,current]);
  return (
    <Sheet open={open} onClose={onClose} title="Edit name">
      <div style={{ padding:"16px 20px",display:"flex",flexDirection:"column",gap:S.md }}>
        <Inp value={v} onChange={setV} placeholder="e.g. Zahav" />
        <Pill black label="Save" onPress={()=>{ onSave(v.trim()||current); onClose(); }} />
      </div>
    </Sheet>
  );
};

// ─── Split sheet ───────────────────────────────────────────────────
const SplitSheet = ({ open, onClose, onSave, transactions, preId=null }) => {
  const [mode, setMode] = useState("tx");
  const [txId, setTxId] = useState(preId);
  const [merchant, setMerchant] = useState("");
  const [total, setTotal] = useState("");
  const [myAmt, setMyAmt] = useState("");
  const [people, setPeople] = useState([]);
  const [newName, setNewName] = useState("");
  const [addingPerson, setAddingPerson] = useState(false);

  const PRESETS = ["Riya","Dev","Priya","Sam","Zara"];
  const allPeople = [...new Set([...PRESETS,...people])];
  const selTx = transactions.find(t=>t.id===txId);

  // Auto-fill myAmt as equal share when tx + people change
  useEffect(()=>{
    if(selTx && people.length>0) {
      setMyAmt((selTx.total/(people.length+1)).toFixed(2));
    }
  },[txId, people.length]);

  useEffect(()=>{
    if(open){ setMode(preId?"tx":"tx"); setTxId(preId); setPeople([]); setMyAmt(""); setMerchant(""); setTotal(""); setAddingPerson(false); setNewName(""); }
  },[open,preId]);

  const effTotal = mode==="tx" ? (selTx?.total||0) : (parseFloat(total)||0);
  const effMy = parseFloat(myAmt)||0;
  const perPerson = people.length>0 ? (effTotal-effMy)/people.length : 0;
  const valid = (mode==="tx"?!!selTx:!!(merchant.trim()&&effTotal>0)) && effMy>0 && people.length>0;

  function submit() {
    if(!valid) return;
    const m = mode==="tx" ? (selTx?.displayName||selTx?.merchant||"") : merchant.trim();
    const d = mode==="tx" ? (selTx?.date||"") : new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
    onSave({ merchant:m, date:d, total:effTotal, myShare:effMy, people, existingTxId:mode==="tx"?txId:null });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="New split">
      <div style={{ padding:"0 20px 0", display:"flex", flexDirection:"column", gap:S.md }}>
        {/* Mode toggle */}
        <div style={{ display:"flex", background:U.soft, borderRadius:12, padding:3, marginTop:S.md }}>
          {[["tx","From transactions"],["manual","Enter manually"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{ flex:1,background:mode===m?U.canvas:"transparent",border:"none",borderRadius:10,padding:"9px",fontSize:13,fontWeight:mode===m?700:400,color:mode===m?U.ink:U.inkSub,cursor:"pointer",fontFamily:"inherit",boxShadow:mode===m?"0 1px 3px rgba(0,0,0,0.1)":"none",transition:"all 0.15s" }}>
              {l}
            </button>
          ))}
        </div>

        {mode==="tx" ? (
          <div>
            <p style={{ ...txt(T.tiny), marginBottom:S.sm }}>SELECT TRANSACTION</p>
            <div style={{ border:`1px solid ${U.border}`, borderRadius:12, overflow:"hidden", maxHeight:220, overflowY:"auto" }}>
              {transactions.filter(t=>t.total>0).slice(0,30).map((t,i)=>(
                <div key={t.id}>
                  {i>0 && <Div indent={56} />}
                  <button onClick={()=>setTxId(t.id)} style={{ width:"100%",background:txId===t.id?U.soft:U.canvas,border:"none",padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",fontFamily:"inherit" }}>
                    <div style={{ textAlign:"left" }}>
                      <p style={{ ...txt(T.body), marginBottom:2 }}>{t.displayName||t.merchant}</p>
                      <p style={{ ...txt(T.sub) }}>{t.date}</p>
                    </div>
                    <p style={{ ...txt(T.num), color:txId===t.id?U.ink:U.inkSub }}>${t.total.toFixed(2)}</p>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <Inp label="Merchant" value={merchant} onChange={setMerchant} placeholder="e.g. Zahav" />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:S.sm }}>
              <Inp label="Total bill" value={total} onChange={setTotal} placeholder="0.00" type="number" />
              <Inp label="My share" value={myAmt} onChange={setMyAmt} placeholder="0.00" type="number" />
            </div>
          </>
        )}

        {/* People */}
        <div>
          <p style={{ ...txt(T.tiny), marginBottom:S.sm }}>SPLIT WITH</p>
          <div style={{ display:"flex", flexWrap:"wrap", gap:S.sm }}>
            {allPeople.map(p => {
              const on = people.includes(p);
              return (
                <button key={p} onClick={()=>setPeople(prev=>on?prev.filter(x=>x!==p):[...prev,p])} style={{ display:"flex",alignItems:"center",gap:6,background:on?U.ink:U.soft,border:"none",borderRadius:999,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s" }}>
                  <span style={{ width:22,height:22,borderRadius:"50%",background:on?"rgba(255,255,255,0.2)":U.pressed,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:on?"#fff":U.ink }}>{p[0]}</span>
                  <span style={{ color:on?"#fff":U.ink, fontSize:13, fontWeight:on?700:400 }}>{p}</span>
                </button>
              );
            })}
            <button onClick={()=>setAddingPerson(true)} style={{ background:U.soft,border:`1px dashed ${U.border}`,borderRadius:999,padding:"8px 14px",cursor:"pointer",color:U.inkMuted,fontSize:13,fontFamily:"inherit" }}>+ Add</button>
          </div>
          {addingPerson && (
            <div style={{ display:"flex", gap:S.sm, marginTop:S.sm }}>
              <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&newName.trim()){ setPeople(p=>[...new Set([...p,newName.trim()])]); setNewName(""); setAddingPerson(false); }}}
                placeholder="Name" style={{ flex:1,background:U.soft,border:`1px solid ${U.border}`,borderRadius:10,padding:"11px 13px",color:U.ink,fontSize:14,outline:"none",fontFamily:"inherit" }}
                onFocus={e=>e.target.style.borderColor=U.ink} onBlur={e=>e.target.style.borderColor=U.border}
              />
              <button onClick={()=>{ if(newName.trim()){ setPeople(p=>[...new Set([...p,newName.trim()])]); setNewName(""); setAddingPerson(false); }}} style={{ background:U.ink,border:"none",color:"#fff",borderRadius:10,padding:"0 16px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>Add</button>
            </div>
          )}
        </div>

        {/* My share — shown after tx selected, auto-filled */}
        {mode==="tx" && selTx && (
          <Inp label="My share" value={myAmt} onChange={setMyAmt} type="number"
            hint={people.length>0 ? `Equal split = $${(selTx.total/(people.length+1)).toFixed(2)} each` : ""}
            placeholder="0.00"
          />
        )}

        {/* Summary */}
        {valid && (
          <div style={{ background:U.soft, borderRadius:12, padding:"14px 16px" }}>
            <p style={{ ...txt(T.body), fontWeight:700, marginBottom:4 }}>{people.length} {people.length===1?"person":"people"} owe you ${perPerson.toFixed(2)} each</p>
            <p style={{ ...txt(T.sub) }}>Total ${effTotal.toFixed(2)} · You pay ${effMy.toFixed(2)}</p>
          </div>
        )}

        <div style={{ paddingBottom:8 }}>
          <Pill black={valid} label="Add split" onPress={submit} />
        </div>
      </div>
    </Sheet>
  );
};

// ─── Tx detail sheet ───────────────────────────────────────────────
const TxDetail = ({ open, tx, onClose, onCat, onName, onSplit, onSettle, onSplitSaved, transactions }) => {
  const [catOpen, setCatOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  if (!tx) return null;
  const name = tx.displayName || tx.merchant;

  return (<>
    <Sheet open={open} onClose={onClose} title={name}>
      {/* Amounts */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:S.sm, padding:`${S.md}px ${S.md}px` }}>
        <div style={{ background:U.soft, borderRadius:12, padding:S.md }}>
          <p style={{ ...txt(T.tiny), marginBottom:S.xs }}>CHARGED</p>
          <p style={{ ...txt(T.bigNum) }}>${tx.total.toFixed(2)}</p>
        </div>
        <div style={{ background:U.soft, borderRadius:12, padding:S.md }}>
          <p style={{ ...txt(T.tiny), marginBottom:S.xs }}>MY SHARE</p>
          <p style={{ ...txt(T.bigNum) }}>${tx.myShare.toFixed(2)}</p>
        </div>
      </div>
      <Div />

      {/* Row list */}
      {[
        { label:"Category", value:tx.category||"—", icon:CAT_E[tx.category]||"💳", iconColor:CAT_C[tx.category]||U.grey, onPress:()=>setCatOpen(true) },
        { label:"Display name", value:name, icon:"✏️", iconColor:U.grey, onPress:()=>setNameOpen(true) },
      ].map((row,i)=>(
        <div key={i}>
          <button onClick={row.onPress} style={{ width:"100%",background:"none",border:"none",padding:"14px 20px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",fontFamily:"inherit" }}>
            <Icon emoji={row.icon} color={row.iconColor} size={40} />
            <div style={{ flex:1, textAlign:"left" }}>
              <p style={{ ...txt(T.tiny), marginBottom:3 }}>{row.label.toUpperCase()}</p>
              <p style={{ ...txt(T.body) }}>{row.value}</p>
            </div>
            <span style={{ color:U.inkMuted, fontSize:20, lineHeight:1 }}>›</span>
          </button>
          <Div indent={74} />
        </div>
      ))}

      {/* Split people */}
      {tx.split && tx.people.length>0 && (
        <>
          <div style={{ padding:"14px 20px" }}>
            <p style={{ ...txt(T.tiny), marginBottom:S.sm }}>SPLIT WITH</p>
            <div style={{ display:"flex", gap:S.sm, flexWrap:"wrap" }}>
              {tx.people.map(p=>(
                <div key={p} style={{ display:"flex",alignItems:"center",gap:6,background:U.soft,borderRadius:999,padding:"6px 12px" }}>
                  <Av name={p} size={22} />
                  <span style={{ ...txt(T.sub) }}>{p}</span>
                  <span style={{ ...txt(T.sub), color:U.inkMuted }}>${((tx.total-tx.myShare)/tx.people.length).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <Div />
        </>
      )}

      {/* CTAs */}
      <div style={{ padding:`${S.md}px ${S.md}px 0`, display:"flex", flexDirection:"column", gap:S.sm }}>
        {!tx.split && <Pill black label="Split this expense" onPress={()=>setSplitOpen(true)} />}
        {tx.split&&!tx.settled && (
          <button onClick={()=>{onSettle(tx.id);onClose();}} style={{ width:"100%",background:U.soft,border:"none",borderRadius:999,padding:"14px 24px",fontSize:15,fontWeight:700,cursor:"pointer",color:U.ink,fontFamily:"inherit" }}>
            ✓ Mark settled via Zelle
          </button>
        )}
        {tx.settled && <p style={{ textAlign:"center", ...txt(T.sub), paddingBottom:8 }}>✓ Settled</p>}
      </div>
    </Sheet>

    <CatPicker open={catOpen} current={tx.category} onSelect={cat=>{onCat(tx.id,cat);setCatOpen(false);}} onClose={()=>setCatOpen(false)} />
    <NameEditor open={nameOpen} current={name} onSave={n=>onName(tx.id,n)} onClose={()=>setNameOpen(false)} />
    <SplitSheet open={splitOpen} onClose={()=>setSplitOpen(false)} transactions={transactions} preId={tx.id} onSave={s=>{onSplitSaved(s);setSplitOpen(false);onClose();}} />
  </>);
};

// ─── Import screen ─────────────────────────────────────────────────
const ImportScreen = ({ onImport }) => {
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef();

  function process(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { setErr("Please select a .csv file"); return; }
    setLoading(true); setErr(null);
    const r = new FileReader();
    r.onload = e => {
      try {
        const txs = parseCSV(e.target.result);
        if (!txs.length) { setErr("No transactions found — re-export from Chase"); setLoading(false); return; }
        onImport(txs);
      } catch { setErr("Couldn't read this file — try re-exporting"); setLoading(false); }
    };
    r.onerror = () => { setErr("Read error — try again"); setLoading(false); };
    r.readAsText(file);
  }

  // Full-screen, no scroll, fixed layout
  return (
    <div style={{ position:"fixed", inset:0, background:U.canvas, display:"flex", flexDirection:"column", fontFamily:"-apple-system,'SF Pro Text',sans-serif" }}>
      {/* Top section */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:`0 ${S.lg}px` }}>
        <div style={{ width:72, height:72, borderRadius:20, background:U.soft, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, marginBottom:S.lg }}>📊</div>
        <h1 style={{ ...txt(T.h1), textAlign:"center", marginBottom:S.sm }}>SplitTrack</h1>
        <p style={{ ...txt(T.sub), textAlign:"center", lineHeight:1.5, maxWidth:280 }}>Import your Chase transactions. Track what you spend and what you're owed.</p>
      </div>

      {/* Drop zone */}
      <div style={{ padding:`0 ${S.lg}px`, marginBottom:S.md }}>
        <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);process(e.dataTransfer.files[0]);}}
          onClick={()=>ref.current.click()}
          style={{ border:`2px dashed ${drag?U.ink:U.border}`, borderRadius:16, padding:"28px 24px", cursor:"pointer", background:drag?U.soft:U.canvas, transition:"all 0.2s", textAlign:"center" }}>
          {loading
            ? <p style={{ ...txt(T.body), fontWeight:700 }}>Reading file…</p>
            : <>
                <p style={{ ...txt(T.body), fontWeight:700, marginBottom:4 }}>{drag?"Drop it!":"Drop your Chase CSV here"}</p>
                <p style={{ ...txt(T.sub) }}>or tap to browse</p>
              </>}
          <input ref={ref} type="file" accept=".csv,.CSV" style={{ display:"none" }} onChange={e=>process(e.target.files[0])} />
        </div>
        {err && <p style={{ ...txt(T.sub), color:U.red, marginTop:S.sm, textAlign:"center" }}>{err}</p>}
      </div>

      {/* How to export */}
      <div style={{ margin:`0 ${S.lg}px ${S.md}px`, background:U.soft, borderRadius:16, padding:`${S.md}px` }}>
        <p style={{ ...txt(T.tiny), marginBottom:S.sm }}>HOW TO EXPORT FROM CHASE</p>
        {["chase.com → your account → Activity","Click Download → CSV","Pick a date range → Download"].map((s,i)=>(
          <div key={i} style={{ display:"flex", gap:S.sm, marginBottom:i<2?8:0 }}>
            <span style={{ width:22, height:22, borderRadius:"50%", background:U.ink, color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</span>
            <p style={{ ...txt(T.sub), marginTop:2 }}>{s}</p>
          </div>
        ))}
      </div>

      {/* Bottom safe area */}
      <div style={{ height:40 }} />
    </div>
  );
};

// ─── Bottom nav ────────────────────────────────────────────────────
const Nav = ({ tab, setTab }) => {
  const tabs = [
    { id:"dashboard", icon:"⊟", label:"Overview" },
    { id:"transactions", icon:"≡",  label:"Activity"  },
    { id:"splits",       icon:"⊕",  label:"Splits"    },
    { id:"settings",     icon:"○",  label:"More"      },
  ];
  return (
    <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:U.canvas, borderTop:`1px solid ${U.border}`, display:"flex", zIndex:100 }}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)} style={{ flex:1, background:"none", border:"none", cursor:"pointer", padding:"10px 0 28px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, color:tab===t.id?U.ink:U.inkMuted, fontFamily:"inherit", transition:"color 0.15s" }}>
          <span style={{ fontSize:22, lineHeight:1 }}>{t.icon}</span>
          <span style={{ fontSize:10, fontWeight:tab===t.id?700:400, letterSpacing:"0.02em" }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

// ─── Dashboard ─────────────────────────────────────────────────────
const Dashboard = ({ txs, splits, setTab, onImport }) => {
  const total   = txs.reduce((s,t)=>s+t.total,0);
  const mySpend = txs.reduce((s,t)=>s+t.myShare,0);
  const owed    = splits.filter(s=>!s.settled).reduce((s,t)=>s+t.amount,0);
  const byP     = splits.filter(s=>!s.settled).reduce((a,s)=>{if(!a[s.person])a[s.person]={p:s.person,n:0,t:0};a[s.person].t+=s.amount;a[s.person].n++;return a;},{});
  const savings = total - mySpend;

  return (
    <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, bottom:82, overflowY:"auto", background:U.soft }}>
      {/* Header */}
      <div style={{ background:U.canvas, padding:`${S.lg+4}px ${S.md}px ${S.md}px` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:S.lg }}>
          <h1 style={{ ...txt(T.h1) }}>Overview</h1>
          <button onClick={onImport} style={{ background:U.soft, border:`1px solid ${U.border}`, color:U.ink, borderRadius:999, padding:"8px 16px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Import</button>
        </div>
        {/* Spend block */}
        <div style={{ background:U.ink, borderRadius:16, padding:`${S.lg}px ${S.md}px ${S.md}px` }}>
          <p style={{ ...txt(T.tiny), color:"rgba(255,255,255,0.5)", marginBottom:S.xs }}>MY REAL SPEND</p>
          <p style={{ fontSize:42, fontWeight:700, color:"#fff", letterSpacing:-1, margin:`0 0 ${S.xs}px`, fontFamily:"-apple-system,sans-serif" }}>${mySpend.toFixed(2)}</p>
          <p style={{ ...txt(T.sub), color:"rgba(255,255,255,0.5)" }}>of ${total.toFixed(2)} charged{savings>0?` · $${savings.toFixed(2)} covered by splits`:""}</p>
          <div style={{ marginTop:S.md, background:"rgba(255,255,255,0.15)", borderRadius:6, height:3 }}>
            <div style={{ width:`${Math.min((mySpend/(total||1))*100,100)}%`, background:"#fff", borderRadius:6, height:3 }} />
          </div>
        </div>
      </div>

      {/* Owed */}
      <div style={{ height:S.sm }} />
      <div onClick={()=>setTab("splits")} style={{ background:U.canvas, cursor:"pointer" }}>
        <div style={{ padding:`${S.md}px`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <p style={{ ...txt(T.tiny), marginBottom:S.xs }}>OWED TO YOU</p>
            <p style={{ fontSize:32, fontWeight:700, letterSpacing:-0.5, margin:0, fontFamily:"-apple-system,sans-serif" }}>${owed.toFixed(2)}</p>
          </div>
          <div style={{ textAlign:"right" }}>
            <p style={{ ...txt(T.tiny), marginBottom:S.xs }}>PEOPLE</p>
            <p style={{ fontSize:32, fontWeight:700, letterSpacing:-0.5, margin:0, fontFamily:"-apple-system,sans-serif" }}>{Object.keys(byP).length}</p>
          </div>
        </div>
        {Object.keys(byP).length>0 && <>
          <Div />
          {Object.values(byP).map((p,i)=>(
            <div key={p.p}>
              {i>0&&<Div indent={56} />}
              <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:14 }}>
                <Av name={p.p} size={32} />
                <p style={{ ...txt(T.body), flex:1 }}>{p.p}</p>
                <p style={{ ...txt(T.num) }}>${p.t.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </>}
      </div>

      {/* Categories */}
      <div style={{ height:S.sm }} />
      <div style={{ background:U.canvas, padding:`${S.md}px` }}>
        <p style={{ ...txt(T.tiny), marginBottom:S.md }}>SPENDING BY CATEGORY</p>
        {CAT.map(cat=>{
          const spend = txs.filter(t=>t.category===cat).reduce((s,t)=>s+t.myShare,0);
          if(!spend) return null;
          return (
            <div key={cat} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{CAT_E[cat]}</span>
              <p style={{ ...txt(T.sub), flex:1 }}>{cat}</p>
              <div style={{ flex:2, background:U.soft, borderRadius:3, height:4 }}>
                <div style={{ width:`${(spend/(mySpend||1))*100}%`, background:CAT_C[cat], borderRadius:3, height:4 }} />
              </div>
              <p style={{ ...txt(T.num), minWidth:52, textAlign:"right" }}>${spend.toFixed(0)}</p>
            </div>
          );
        })}
        {!txs.length && <p style={{ ...txt(T.sub), textAlign:"center", padding:`${S.lg}px 0` }}>No transactions yet. Import your Chase CSV.</p>}
      </div>
      <div style={{ height:S.sm }} />
    </div>
  );
};

// ─── Activity ──────────────────────────────────────────────────────
const Activity = ({ txs, setTxs, categorizing, onImport, onSplitSaved }) => {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState(null);
  const [splitId, setSplitId] = useState(null);

  const upCat  = (id,c) => setTxs(p=>p.map(t=>t.id===id?{...t,category:c}:t));
  const upName = (id,n) => setTxs(p=>p.map(t=>t.id===id?{...t,displayName:n}:t));
  const settle = (id)   => setTxs(p=>p.map(t=>t.id===id?{...t,settled:true}:t));

  const list = txs.filter(t => {
    if(search) return (t.displayName||t.merchant).toLowerCase().includes(search.toLowerCase());
    if(filter==="split") return t.split;
    if(filter==="personal") return !t.split;
    return true;
  });
  const det = detailId ? txs.find(t=>t.id===detailId) : null;

  return (
    <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, bottom:82, display:"flex", flexDirection:"column", background:U.soft }}>
      <TxDetail open={!!det} tx={det} onClose={()=>setDetailId(null)} onCat={upCat} onName={upName} onSplit={id=>setSplitId(id)} onSettle={settle} onSplitSaved={s=>{onSplitSaved(s);setTxs(p=>p.map(t=>t.id===s.existingTxId?{...t,split:true,people:s.people,myShare:s.myShare}:t));}} transactions={txs} />
      <SplitSheet open={!!splitId} onClose={()=>setSplitId(null)} transactions={txs} preId={splitId} onSave={s=>{onSplitSaved(s);setTxs(p=>p.map(t=>t.id===s.existingTxId?{...t,split:true,people:s.people,myShare:s.myShare}:t));}} />

      {/* Fixed header */}
      <div style={{ background:U.canvas, padding:`${S.lg+4}px ${S.md}px ${S.sm}px`, flexShrink:0 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:S.md }}>
          <h1 style={{ ...txt(T.h1) }}>Activity</h1>
          <div style={{ display:"flex", gap:S.sm, alignItems:"center" }}>
            {categorizing && <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <div style={{ width:6,height:6,borderRadius:"50%",background:U.ink,animation:"pulse 1s infinite" }} />
              <span style={{ ...txt(T.tiny) }}>AI SORTING</span>
            </div>}
            <button onClick={onImport} style={{ background:U.soft,border:`1px solid ${U.border}`,color:U.ink,borderRadius:999,padding:"7px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>Import</button>
          </div>
        </div>
        {/* Search */}
        <div style={{ position:"relative", marginBottom:S.sm }}>
          <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:15,color:U.inkMuted }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search"
            style={{ width:"100%",background:U.soft,border:"none",borderRadius:12,padding:"11px 14px 11px 36px",color:U.ink,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit" }} />
        </div>
        {/* Filters */}
        <div style={{ display:"flex", gap:S.sm }}>
          {["all","split","personal"].map(f=>(
            <button key={f} onClick={()=>{setFilter(f);setSearch("");}} style={{ background:filter===f&&!search?U.ink:U.soft, color:filter===f&&!search?"#fff":U.ink, border:"none", borderRadius:999, padding:"7px 16px", fontSize:13, fontWeight:filter===f&&!search?700:400, cursor:"pointer", fontFamily:"inherit", textTransform:"capitalize" }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Scrollable list */}
      <div style={{ flex:1, overflowY:"auto", background:U.canvas, marginTop:S.sm }}>
        {!txs.length && (
          <div style={{ textAlign:"center", padding:`${S.xl}px ${S.md}px` }}>
            <p style={{ fontSize:40,margin:`0 0 ${S.md}px` }}>📭</p>
            <p style={{ ...txt(T.h3), marginBottom:S.xs }}>No transactions</p>
            <p style={{ ...txt(T.sub), marginBottom:S.lg }}>Import your Chase CSV to get started</p>
            <Pill black label="Import CSV" onPress={onImport} />
          </div>
        )}
        {list.map((t,i)=>(
          <div key={t.id}>
            {i>0 && <Div indent={72} />}
            <button onClick={()=>setDetailId(t.id)} style={{ width:"100%",background:"none",border:"none",padding:"13px 16px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",fontFamily:"inherit" }}>
              <Icon emoji={CAT_E[t.category]||"💳"} color={CAT_C[t.category]||U.grey} size={44} />
              <div style={{ flex:1, textAlign:"left", minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                  <p style={{ ...txt(T.body), overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.displayName||t.merchant}</p>
                  {t.split&&<span style={{ background:U.soft,color:U.inkSub,fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,flexShrink:0 }}>SPLIT</span>}
                </div>
                <p style={{ ...txt(T.sub) }}>{t.date}{t.category?` · ${t.category}`:""}{!t.category&&categorizing?" · sorting…":""}</p>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <p style={{ ...txt(T.num) }}>${t.myShare.toFixed(2)}</p>
                {t.split&&t.myShare!==t.total&&<p style={{ ...txt(T.sub), fontSize:11 }}>of ${t.total.toFixed(2)}</p>}
              </div>
            </button>
          </div>
        ))}
        <div style={{ height:S.md }} />
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
};

// ─── Splits ────────────────────────────────────────────────────────
const Splits = ({ splits, setSplits, txs, showAdd, setShowAdd, onSplitSaved }) => {
  const [exp, setExp] = useState(null);
  const [toast, setToast] = useState(null);
  const showT = msg => { setToast(msg); setTimeout(()=>setToast(null),2000); };

  const pending = splits.filter(s=>!s.settled);
  const owed = pending.reduce((s,t)=>s+t.amount,0);
  const byP = pending.reduce((a,s)=>{ if(!a[s.person])a[s.person]={p:s.person,t:0,items:[]}; a[s.person].t+=s.amount; a[s.person].items.push(s); return a; },{});

  return (
    <div style={{ position:"fixed", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, bottom:82, display:"flex", flexDirection:"column", background:U.soft }}>
      {toast && <div style={{ position:"absolute",top:S.lg,left:"50%",transform:"translateX(-50%)",background:U.ink,color:"#fff",padding:"10px 20px",borderRadius:999,fontSize:13,fontWeight:700,zIndex:600,whiteSpace:"nowrap" }}>{toast}</div>}
      <SplitSheet open={showAdd} onClose={()=>setShowAdd(false)} transactions={txs} onSave={s=>{onSplitSaved(s);showT("Split added ✓");}} />

      {/* Fixed header */}
      <div style={{ background:U.canvas, padding:`${S.lg+4}px ${S.md}px ${S.md}px`, flexShrink:0 }}>
        <h1 style={{ ...txt(T.h1), marginBottom:4 }}>Splits</h1>
        <p style={{ ...txt(T.sub) }}>You're owed <span style={{ fontWeight:700, color:U.ink }}>${owed.toFixed(2)}</span></p>
      </div>

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:"auto", marginTop:S.sm }}>
        {!Object.keys(byP).length && (
          <div style={{ background:U.canvas, textAlign:"center", padding:`${S.xl}px ${S.md}px` }}>
            <p style={{ fontSize:40, margin:`0 0 ${S.sm}px` }}>🎉</p>
            <p style={{ ...txt(T.h3), marginBottom:S.xs }}>All settled up</p>
            <p style={{ ...txt(T.sub) }}>Tap + to add a new split</p>
          </div>
        )}

        <div style={{ background:U.canvas }}>
          {Object.values(byP).map((p,pi)=>(
            <div key={p.p}>
              {pi>0 && <Div />}
              <button onClick={()=>setExp(exp===p.p?null:p.p)} style={{ width:"100%",background:"none",border:"none",padding:"16px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",fontFamily:"inherit" }}>
                <div style={{ display:"flex", alignItems:"center", gap:S.md }}>
                  <Av name={p.p} size={44} />
                  <div style={{ textAlign:"left" }}>
                    <p style={{ ...txt(T.body), fontWeight:700, marginBottom:3 }}>{p.p}</p>
                    <p style={{ ...txt(T.sub) }}>{p.items.length} outstanding</p>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:S.sm }}>
                  <p style={{ ...txt(T.num), fontSize:17 }}>${p.t.toFixed(2)}</p>
                  <span style={{ color:U.inkMuted, fontSize:18, display:"inline-block", transform:exp===p.p?"rotate(90deg)":"rotate(0deg)", transition:"transform 0.2s" }}>›</span>
                </div>
              </button>
              {exp===p.p && (
                <div style={{ background:U.soft, padding:`0 ${S.md}px` }}>
                  {p.items.map((item,i)=>(
                    <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:i<p.items.length-1?`1px solid ${U.border}`:"none" }}>
                      <div>
                        <p style={{ ...txt(T.body), marginBottom:2 }}>{item.merchant}</p>
                        <p style={{ ...txt(T.sub) }}>{item.date}</p>
                      </div>
                      <p style={{ ...txt(T.num) }}>${item.amount.toFixed(2)}</p>
                    </div>
                  ))}
                  <div style={{ paddingBottom:S.md, paddingTop:S.sm }}>
                    <button onClick={()=>{ setSplits(prev=>prev.map(s=>s.person===p.p?{...s,settled:true}:s)); setExp(null); showT(`${p.p} settled ✓`); }} style={{ width:"100%",background:U.canvas,border:`1px solid ${U.border}`,color:U.ink,borderRadius:999,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>
                      Mark all settled · Zelle
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ height:S.md }} />
      </div>

      {/* FAB */}
      <button onClick={()=>setShowAdd(true)} style={{ position:"absolute",bottom:S.lg,right:S.lg,width:56,height:56,borderRadius:"50%",background:U.ink,border:"none",color:"#fff",fontSize:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.25)",zIndex:40 }}>+</button>
    </div>
  );
};

// ─── Settings ──────────────────────────────────────────────────────
const More = ({ onImport, txCount }) => (
  <div style={{ position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,bottom:82,background:U.soft,overflowY:"auto" }}>
    <div style={{ background:U.canvas,padding:`${S.lg+4}px ${S.md}px ${S.md}px`,marginBottom:S.sm }}>
      <h1 style={{ ...txt(T.h1) }}>More</h1>
    </div>
    <div style={{ background:U.canvas }}>
      <div style={{ padding:`${S.md}px`, display:"flex",alignItems:"center",gap:S.md }}>
        <Icon emoji="🏦" color={U.blue} size={44} />
        <div style={{ flex:1 }}>
          <p style={{ ...txt(T.body), fontWeight:700, marginBottom:2 }}>Chase</p>
          <p style={{ ...txt(T.sub) }}>{txCount} transactions · CSV import</p>
        </div>
        <button onClick={onImport} style={{ background:U.soft,border:`1px solid ${U.border}`,color:U.ink,borderRadius:999,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit" }}>Update</button>
      </div>
      <Div indent={72} />
      <div style={{ padding:`${S.md}px`, display:"flex",alignItems:"center",gap:S.md }}>
        <Icon emoji="✦" color={U.ink} size={44} />
        <div style={{ flex:1 }}>
          <p style={{ ...txt(T.body), fontWeight:700, marginBottom:2 }}>AI categorization</p>
          <p style={{ ...txt(T.sub) }}>Auto-sorts and names every transaction</p>
        </div>
        <span style={{ ...txt(T.sub), fontWeight:700, color:U.ink }}>On</span>
      </div>
    </div>
  </div>
);

// ─── Root ──────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("import");
  const [tab,    setTab]    = useState("dashboard");
  const [txs,    setTxs]    = useState([]);
  const [splits, setSplits] = useState([]);
  const [ai,     setAi]     = useState(false);
  const [showAdd,setShowAdd]= useState(false);

  function saveSplit(s) {
    const per = parseFloat(((s.total-s.myShare)/s.people.length).toFixed(2));
    const ns = s.people.map((p,i)=>({ id:Date.now()+i,person:p,merchant:s.merchant,amount:per,date:s.date,settled:false }));
    setSplits(prev=>[...prev,...ns]);
    if(s.existingTxId) setTxs(prev=>prev.map(t=>t.id===s.existingTxId?{...t,split:true,people:s.people,myShare:s.myShare}:t));
  }

  async function importTxs(raw) {
    setTxs(raw); setSplits([]); setScreen("app"); setTab("transactions"); setAi(true);
    const res = await enrich(raw);
    setTxs(prev=>prev.map(t=>{
      const r = res[String(t.id)];
      if(!r) return {...t,category:t.category||"Other"};
      if(typeof r==="string") return {...t,category:t.category||r};
      return {...t,category:t.category||r.category||"Other",displayName:t.displayName||r.displayName||null};
    }));
    setAi(false);
  }

  if (screen==="import") return <ImportScreen onImport={importTxs} />;

  return (
    <div style={{ maxWidth:430,margin:"0 auto",fontFamily:"-apple-system,'SF Pro Text',sans-serif",background:U.soft,height:"100dvh",overflow:"hidden",position:"relative" }}>
      {tab==="dashboard"    && <Dashboard txs={txs} splits={splits} setTab={setTab} onImport={()=>setScreen("import")} />}
      {tab==="transactions" && <Activity  txs={txs} setTxs={setTxs} categorizing={ai} onImport={()=>setScreen("import")} onSplitSaved={saveSplit} />}
      {tab==="splits"       && <Splits    splits={splits} setSplits={setSplits} txs={txs} showAdd={showAdd} setShowAdd={setShowAdd} onSplitSaved={saveSplit} />}
      {tab==="settings"     && <More      onImport={()=>setScreen("import")} txCount={txs.length} />}
      <Nav tab={tab} setTab={t=>{setTab(t);if(t!=="splits")setShowAdd(false);}} />
    </div>
  );
}
