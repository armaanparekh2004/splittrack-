import { useState, useRef, useEffect, useCallback } from "react";
import Papa from "papaparse";

// ── Tokens ─────────────────────────────────────────────────────────
const C = {
  bg:"#F7F8FA", card:"#FFFFFF", border:"#EBEBEB",
  accent:"#1DB954", accentDim:"#1DB95418",
  text:"#111111", textSub:"#6B7280", textMuted:"#9CA3AF",
  red:"#EF4444", redDim:"#EF444415",
  yellow:"#F59E0B", yellowDim:"#F59E0B15",
  blue:"#3B82F6", blueDim:"#3B82F615",
  purple:"#8B5CF6",
  dark:"#111111",
};
const ALL_CATS=["Dining","Groceries","Transport","Subscriptions","Shopping","Entertainment","Health","Other"];
const CAT_COLOR={Dining:"#EF4444",Groceries:"#10B981",Transport:"#3B82F6",Subscriptions:"#8B5CF6",Shopping:"#F59E0B",Entertainment:"#EC4899",Health:"#14B8A6",Other:"#9CA3AF"};
const CAT_EMOJI={Dining:"🍽️",Groceries:"🛒",Transport:"🚗",Subscriptions:"📱",Shopping:"🛍️",Entertainment:"🎬",Health:"💊",Other:"💳"};
let _id=2000;

// ── Chase CSV ──────────────────────────────────────────────────────
function parseChaseCSV(text){
  const decoded=text.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
  const delim=decoded.split("\n")[0].includes("\t")?"\t":",";
  const {data}=Papa.parse(decoded.trim(),{header:true,skipEmptyLines:true,delimiter:delim});
  if(!data.length) throw new Error("empty");
  return data.map(row=>{
    const merchant=(row["Description"]||row["description"]||"Unknown").trim().replace(/\s+/g," ");
    const raw=parseFloat((row["Amount"]||row["amount"]||"0").replace(/[^0-9.-]/g,""));
    const isCredit=raw>0; const amount=Math.abs(raw);
    const dateRaw=row["Transaction Date"]||row["Post Date"]||"";
    let date=dateRaw;
    try{const d=new Date(dateRaw);if(!isNaN(d))date=d.toLocaleDateString("en-US",{month:"short",day:"numeric"});}catch{}
    const cc=(row["Category"]||"").toLowerCase();
    let category=null;
    if(cc.includes("food")||cc.includes("drink")) category="Dining";
    else if(cc.includes("grocer")) category="Groceries";
    else if(cc.includes("travel")) category="Transport";
    else if(cc.includes("shopping")) category="Shopping";
    else if(cc.includes("health")||cc.includes("medical")) category="Health";
    else if(cc.includes("entertainment")) category="Entertainment";
    return {id:_id++,merchant,displayName:null,date,total:amount,myShare:amount,split:false,people:[],settled:false,category,isCredit,source:"chase"};
  }).filter(t=>!t.isCredit&&t.total>0);
}

// ── AI: categorize + display names ────────────────────────────────
async function aiEnrich(txs){
  const todo=txs.filter(t=>!t.category||!t.displayName);
  if(!todo.length) return {};
  try{
    const r=await fetch("/api/categorize",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({transactions:todo.map(t=>({id:t.id,merchant:t.merchant,amount:t.total})),mode:"enrich"})});
    const d=await r.json();
    return d.categories||{};
  }catch{return {};}
}

// ── Slide animation helper ─────────────────────────────────────────
const slideStyle=(visible,dir="up")=>({
  transform:visible?"translateY(0)":`translateY(${dir==="up"?"100%":"-100%"})`,
  transition:"transform 0.32s cubic-bezier(0.32,0.72,0,1)",
  willChange:"transform",
});

// ── Haptic ────────────────────────────────────────────────────────
function haptic(){try{if(navigator.vibrate)navigator.vibrate(10);}catch{}}

// ── Atoms ─────────────────────────────────────────────────────────
const Avatar=({name,size=36,color})=>{
  const bg=color||CAT_COLOR[name]||C.accent;
  return <div style={{width:size,height:size,borderRadius:"50%",background:bg+"20",display:"flex",alignItems:"center",justifyContent:"center",color:bg,fontWeight:700,fontSize:size*.38,flexShrink:0}}>{name[0].toUpperCase()}</div>;
};
const CatBadge=({cat})=><span style={{background:CAT_COLOR[cat]+"18",color:CAT_COLOR[cat],fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:20,whiteSpace:"nowrap"}}>{CAT_EMOJI[cat]} {cat}</span>;
const Divider=()=><div style={{height:1,background:C.border,margin:"0 0"}}/>;

// ── Bottom sheet ──────────────────────────────────────────────────
const Sheet=({open,onClose,children,title,height="auto"})=>{
  const [visible,setVisible]=useState(false);
  useEffect(()=>{if(open){setTimeout(()=>setVisible(true),10);}else{setVisible(false);}},[open]);
  if(!open&&!visible) return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={()=>{setVisible(false);setTimeout(onClose,320);}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.4)",opacity:visible?1:0,transition:"opacity 0.3s"}}/>
      <div onClick={e=>e.stopPropagation()} style={{...slideStyle(visible,"up"),position:"relative",background:C.card,borderRadius:"20px 20px 0 0",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -4px 40px rgba(0,0,0,0.12)"}}>
        <div style={{width:40,height:4,borderRadius:2,background:C.border,margin:"12px auto 0"}}/>
        {title&&<div style={{padding:"16px 20px 8px",borderBottom:`1px solid ${C.border}`}}>
          <p style={{color:C.text,fontSize:17,fontWeight:700,margin:0}}>{title}</p>
        </div>}
        <div style={{padding:"0 0 48px"}}>{children}</div>
      </div>
    </div>
  );
};

// ── Page transition ───────────────────────────────────────────────
const Page=({children,active})=>(
  <div style={{opacity:active?1:0,transform:active?"translateX(0)":"translateX(20px)",transition:"opacity 0.22s ease, transform 0.22s ease"}}>
    {children}
  </div>
);

// ── Category picker ───────────────────────────────────────────────
const CatPicker=({open,current,onSelect,onClose})=>(
  <Sheet open={open} onClose={onClose} title="Category">
    <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      {ALL_CATS.map(cat=>(
        <button key={cat} onClick={()=>{haptic();onSelect(cat);}} style={{background:current===cat?CAT_COLOR[cat]+"18":C.bg,border:`1.5px solid ${current===cat?CAT_COLOR[cat]:C.border}`,borderRadius:14,padding:"14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,transition:"all 0.15s"}}>
          <span style={{fontSize:20}}>{CAT_EMOJI[cat]}</span>
          <span style={{color:current===cat?CAT_COLOR[cat]:C.text,fontSize:14,fontWeight:current===cat?700:500}}>{cat}</span>
        </button>
      ))}
    </div>
  </Sheet>
);

// ── Name editor ───────────────────────────────────────────────────
const NameEditor=({open,current,suggestion,onSave,onClose})=>{
  const [val,setVal]=useState(current||suggestion||"");
  useEffect(()=>{if(open)setVal(current||suggestion||"");},[open,current,suggestion]);
  return(
    <Sheet open={open} onClose={onClose} title="Edit name">
      <div style={{padding:"16px 20px"}}>
        <p style={{color:C.textSub,fontSize:13,margin:"0 0 12px"}}>AI suggested name — edit if needed</p>
        <input value={val} onChange={e=>setVal(e.target.value)} style={{width:"100%",background:C.bg,border:`1.5px solid ${C.accent}`,borderRadius:12,padding:"14px",color:C.text,fontSize:16,fontWeight:500,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
        <button onClick={()=>{onSave(val.trim()||current);onClose();}} style={{width:"100%",background:C.accent,border:"none",color:"#fff",borderRadius:12,padding:"14px",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:12}}>Save</button>
      </div>
    </Sheet>
  );
};

// ── Split sheet ───────────────────────────────────────────────────
const SplitSheet=({open,onClose,onSave,transactions,preSelectedTxId=null})=>{
  const [mode,setMode]=useState(preSelectedTxId?"tx":"manual");
  const [txId,setTxId]=useState(preSelectedTxId);
  const [merchant,setMerchant]=useState("");
  const [total,setTotal]=useState("");
  const [myAmt,setMyAmt]=useState("");
  const [people,setPeople]=useState([]);
  const [newName,setNewName]=useState("");
  const [addingPerson,setAddingPerson]=useState(false);
  const PRESETS=["Riya","Dev","Priya","Sam","Zara"];
  const allPeople=[...new Set([...PRESETS,...people])];

  const selTx=transactions.find(t=>t.id===txId);

  // Auto-fill myAmt when tx selected and people change
  useEffect(()=>{
    if(selTx&&people.length>0){
      const share=(selTx.total/(people.length+1));
      setMyAmt(share.toFixed(2));
    }
  },[txId,people.length]);

  useEffect(()=>{
    if(open){setMode(preSelectedTxId?"tx":"manual");setTxId(preSelectedTxId);setPeople([]);setMyAmt("");setMerchant("");setTotal("");}
  },[open,preSelectedTxId]);

  const effTotal=mode==="tx"?(selTx?.total||0):parseFloat(total)||0;
  const effMy=parseFloat(myAmt)||0;
  const perPerson=people.length>0?((effTotal-effMy)/people.length):0;
  const valid=(mode==="tx"?!!selTx:!!(merchant.trim()&&effTotal>0))&&effMy>0&&people.length>0;

  const inp={width:"100%",background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"13px 14px",color:C.text,fontSize:15,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const focusInp=(e)=>{e.target.style.borderColor=C.accent;};
  const blurInp=(e)=>{e.target.style.borderColor=C.border;};

  function submit(){
    if(!valid) return; haptic();
    const m=mode==="tx"?(selTx?.displayName||selTx?.merchant||""):merchant.trim();
    const d=mode==="tx"?(selTx?.date||""):new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
    onSave({merchant:m,date:d,total:effTotal,myShare:effMy,people,existingTxId:mode==="tx"?txId:null});
    onClose();
  }

  return(
    <Sheet open={open} onClose={onClose} title="New split">
      <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
        {/* Mode toggle */}
        <div style={{display:"flex",background:C.bg,borderRadius:12,padding:3}}>
          {[["tx","From transactions"],["manual","Enter manually"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,background:mode===m?C.card:"transparent",border:"none",borderRadius:10,padding:"9px",fontSize:13,fontWeight:mode===m?700:500,color:mode===m?C.text:C.textSub,cursor:"pointer",boxShadow:mode===m?"0 1px 4px rgba(0,0,0,0.1)":"none",transition:"all 0.15s"}}>{l}</button>
          ))}
        </div>

        {mode==="tx"?(
          <div>
            <p style={{color:C.textSub,fontSize:12,fontWeight:600,letterSpacing:"0.05em",margin:"0 0 8px"}}>TRANSACTION</p>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:180,overflowY:"auto",borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              {transactions.filter(t=>t.total>0).slice(0,25).map((t,i)=>(
                <button key={t.id} onClick={()=>{setTxId(t.id);}} style={{background:txId===t.id?C.accentDim:C.card,border:"none",borderBottom:`1px solid ${C.border}`,padding:"12px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background 0.15s"}}>
                  <div style={{textAlign:"left"}}>
                    <p style={{color:C.text,fontSize:14,fontWeight:500,margin:"0 0 2px"}}>{t.displayName||t.merchant}</p>
                    <p style={{color:C.textMuted,fontSize:12,margin:0}}>{t.date}</p>
                  </div>
                  <span style={{color:txId===t.id?C.accent:C.text,fontSize:14,fontWeight:700}}>${t.total.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        ):(
          <>
            <div><p style={{color:C.textSub,fontSize:12,fontWeight:600,letterSpacing:"0.05em",margin:"0 0 6px"}}>MERCHANT</p>
              <input style={inp} placeholder="Zahav" value={merchant} onChange={e=>setMerchant(e.target.value)} onFocus={focusInp} onBlur={blurInp}/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div><p style={{color:C.textSub,fontSize:12,fontWeight:600,letterSpacing:"0.05em",margin:"0 0 6px"}}>TOTAL BILL</p>
                <input style={inp} placeholder="0.00" type="number" value={total} onChange={e=>setTotal(e.target.value)} onFocus={focusInp} onBlur={blurInp}/></div>
              <div><p style={{color:C.textSub,fontSize:12,fontWeight:600,letterSpacing:"0.05em",margin:"0 0 6px"}}>MY SHARE</p>
                <input style={inp} placeholder="0.00" type="number" value={myAmt} onChange={e=>setMyAmt(e.target.value)} onFocus={focusInp} onBlur={blurInp}/></div>
            </div>
          </>
        )}

        {/* People */}
        <div>
          <p style={{color:C.textSub,fontSize:12,fontWeight:600,letterSpacing:"0.05em",margin:"0 0 8px"}}>SPLIT WITH</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {allPeople.map(p=>{
              const on=people.includes(p);
              return(
                <button key={p} onClick={()=>{haptic();setPeople(prev=>on?prev.filter(x=>x!==p):[...prev,p]);}} style={{display:"flex",alignItems:"center",gap:6,background:on?C.accentDim:C.bg,border:`1.5px solid ${on?C.accent:C.border}`,borderRadius:20,padding:"7px 14px",cursor:"pointer",transition:"all 0.15s"}}>
                  <span style={{width:24,height:24,borderRadius:"50%",background:on?C.accent:"#E5E7EB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:on?"#fff":C.textSub}}>{p[0]}</span>
                  <span style={{color:on?C.accent:C.text,fontSize:13,fontWeight:on?700:400}}>{p}</span>
                </button>
              );
            })}
            <button onClick={()=>setAddingPerson(true)} style={{display:"flex",alignItems:"center",gap:6,background:C.bg,border:`1.5px dashed ${C.border}`,borderRadius:20,padding:"7px 14px",cursor:"pointer",color:C.textMuted,fontSize:13}}>+ Add</button>
          </div>
          {addingPerson&&(
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <input autoFocus style={{...inp,flex:1}} placeholder="Name" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newName.trim()){setPeople(p=>[...new Set([...p,newName.trim()])]);setNewName("");setAddingPerson(false);}}} onFocus={focusInp} onBlur={blurInp}/>
              <button onClick={()=>{if(newName.trim()){setPeople(p=>[...new Set([...p,newName.trim()])]);setNewName("");setAddingPerson(false);}}} style={{background:C.accent,border:"none",color:"#fff",borderRadius:12,padding:"0 16px",fontSize:14,fontWeight:700,cursor:"pointer"}}>Add</button>
            </div>
          )}
        </div>

        {/* My share auto-fill */}
        {(mode==="tx"?!!selTx:!!(merchant&&effTotal>0))&&(
          <div>
            <p style={{color:C.textSub,fontSize:12,fontWeight:600,letterSpacing:"0.05em",margin:"0 0 6px"}}>MY SHARE</p>
            <input style={{...inp,borderColor:effMy>0?C.accent:C.border}} placeholder="0.00" type="number" value={myAmt} onChange={e=>setMyAmt(e.target.value)} onFocus={focusInp} onBlur={blurInp}/>
            {people.length>0&&<p style={{color:C.textMuted,fontSize:12,margin:"4px 0 0"}}>Tip: equal split = ${effTotal>0?((effTotal/(people.length+1)).toFixed(2)):"—"} each</p>}
          </div>
        )}

        {/* Summary */}
        {valid&&(
          <div style={{background:C.accentDim,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.accent}30`}}>
            <p style={{color:C.accent,fontSize:15,fontWeight:700,margin:"0 0 4px"}}>{people.length} {people.length===1?"person":"people"} owe you ${perPerson.toFixed(2)} each</p>
            <p style={{color:C.textSub,fontSize:13,margin:0}}>Total ${effTotal.toFixed(2)} · You pay ${effMy.toFixed(2)} · They pay ${(effTotal-effMy).toFixed(2)}</p>
          </div>
        )}

        <button onClick={submit} disabled={!valid} style={{background:valid?C.accent:"#E5E7EB",border:"none",color:valid?"#fff":C.textMuted,borderRadius:14,padding:"16px",fontSize:16,fontWeight:700,cursor:valid?"pointer":"default",transition:"all 0.2s",marginTop:4}}>
          Add split
        </button>
      </div>
    </Sheet>
  );
};

// ── Transaction detail sheet ──────────────────────────────────────
const TxDetailSheet=({open,tx,onClose,onUpdateCategory,onUpdateName,onMarkSplit,onMarkSettled,onSplitSaved,transactions})=>{
  const [catOpen,setCatOpen]=useState(false);
  const [nameOpen,setNameOpen]=useState(false);
  const [splitOpen,setSplitOpen]=useState(false);
  if(!tx) return null;
  const name=tx.displayName||tx.merchant;
  return(
    <>
      <Sheet open={open} onClose={onClose} title={name}>
        <div style={{padding:"0 0 8px"}}>
          {/* Hero */}
          <div style={{padding:"20px 20px 16px",display:"flex",alignItems:"center",gap:16}}>
            <div style={{width:56,height:56,borderRadius:16,background:CAT_COLOR[tx.category]+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>
              {CAT_EMOJI[tx.category]||"💳"}
            </div>
            <div style={{flex:1}}>
              <p style={{color:C.text,fontSize:20,fontWeight:700,margin:"0 0 2px"}}>{name}</p>
              <p style={{color:C.textMuted,fontSize:13,margin:0}}>{tx.merchant !== name ? tx.merchant+" · ":""}{tx.date}</p>
            </div>
          </div>
          <Divider/>

          {/* Amounts */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,padding:"16px 20px"}}>
            <div style={{background:C.bg,borderRadius:14,padding:"14px"}}>
              <p style={{color:C.textMuted,fontSize:11,fontWeight:600,letterSpacing:"0.05em",margin:"0 0 4px"}}>CHARGED</p>
              <p style={{color:C.text,fontSize:22,fontWeight:800,margin:0}}>${tx.total.toFixed(2)}</p>
            </div>
            <div style={{background:C.accentDim,borderRadius:14,padding:"14px",border:`1px solid ${C.accent}30`}}>
              <p style={{color:C.textMuted,fontSize:11,fontWeight:600,letterSpacing:"0.05em",margin:"0 0 4px"}}>MY SHARE</p>
              <p style={{color:C.accent,fontSize:22,fontWeight:800,margin:0}}>${tx.myShare.toFixed(2)}</p>
            </div>
          </div>
          <Divider/>

          {/* Actions list */}
          <div style={{padding:"8px 0"}}>
            {/* Category */}
            <button onClick={()=>setCatOpen(true)} style={{width:"100%",background:"none",border:"none",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>{CAT_EMOJI[tx.category]||"💳"}</span>
                <div style={{textAlign:"left"}}>
                  <p style={{color:C.textMuted,fontSize:12,margin:"0 0 2px"}}>Category</p>
                  <p style={{color:C.text,fontSize:15,fontWeight:600,margin:0}}>{tx.category||"Uncategorized"}</p>
                </div>
              </div>
              <span style={{color:C.textMuted,fontSize:20}}>›</span>
            </button>
            <Divider/>
            {/* Name */}
            <button onClick={()=>setNameOpen(true)} style={{width:"100%",background:"none",border:"none",padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>✏️</span>
                <div style={{textAlign:"left"}}>
                  <p style={{color:C.textMuted,fontSize:12,margin:"0 0 2px"}}>Display name</p>
                  <p style={{color:C.text,fontSize:15,fontWeight:600,margin:0}}>{name}</p>
                </div>
              </div>
              <span style={{color:C.textMuted,fontSize:20}}>›</span>
            </button>
            <Divider/>
            {/* Split info */}
            {tx.split&&tx.people.length>0&&(
              <>
                <div style={{padding:"14px 20px"}}>
                  <p style={{color:C.textMuted,fontSize:12,margin:"0 0 8px"}}>Split with</p>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {tx.people.map(p=>(
                      <div key={p} style={{display:"flex",alignItems:"center",gap:6,background:C.bg,borderRadius:20,padding:"6px 12px"}}>
                        <span style={{width:22,height:22,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{p[0]}</span>
                        <span style={{color:C.text,fontSize:13,fontWeight:500}}>{p}</span>
                        <span style={{color:C.textMuted,fontSize:12}}>${((tx.total-tx.myShare)/tx.people.length).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Divider/>
              </>
            )}
          </div>

          {/* CTA buttons */}
          <div style={{padding:"8px 20px 0",display:"flex",flexDirection:"column",gap:10}}>
            {!tx.split&&(
              <button onClick={()=>{haptic();setSplitOpen(true);}} style={{width:"100%",background:C.accentDim,border:`1.5px solid ${C.accent}44`,color:C.accent,borderRadius:14,padding:"15px",fontSize:15,fontWeight:700,cursor:"pointer"}}>
                Split this expense
              </button>
            )}
            {tx.split&&!tx.settled&&(
              <button onClick={()=>{haptic();onMarkSettled(tx.id);onClose();}} style={{width:"100%",background:"#F59E0B18",border:`1.5px solid ${C.yellow}44`,color:C.yellow,borderRadius:14,padding:"15px",fontSize:15,fontWeight:700,cursor:"pointer"}}>
                ✓ Mark settled · via Zelle
              </button>
            )}
            {tx.settled&&<p style={{textAlign:"center",color:C.accent,fontSize:14,fontWeight:600,margin:"4px 0"}}>✓ Settled</p>}
          </div>
        </div>
      </Sheet>

      <CatPicker open={catOpen} current={tx.category} onSelect={cat=>{onUpdateCategory(tx.id,cat);setCatOpen(false);}} onClose={()=>setCatOpen(false)}/>
      <NameEditor open={nameOpen} current={tx.displayName} suggestion={tx.merchant} onSave={name=>onUpdateName(tx.id,name)} onClose={()=>setNameOpen(false)}/>
      <SplitSheet open={splitOpen} onClose={()=>setSplitOpen(false)} transactions={transactions} preSelectedTxId={tx.id} onSave={s=>{onSplitSaved(s);setSplitOpen(false);onClose();}}/>
    </>
  );
};

// ── Import screen ─────────────────────────────────────────────────
const ImportScreen=({onImport,onSkip})=>{
  const [dragging,setDragging]=useState(false);
  const [error,setError]=useState(null);
  const [loading,setLoading]=useState(false);
  const fileRef=useRef();

  function processFile(file){
    if(!file){return;}
    if(!file.name.toLowerCase().endsWith(".csv")){setError("Upload a .csv file from Chase");return;}
    setLoading(true);setError(null);
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const txs=parseChaseCSV(e.target.result);
        if(!txs.length){setError("No transactions found — check your Chase export");setLoading(false);return;}
        onImport(txs);
      }catch{setError("Couldn't read this file — try re-exporting from Chase");setLoading(false);}
    };
    reader.onerror=()=>{setError("File read error — try again");setLoading(false);};
    reader.readAsText(file);
  }

  return(
    <div style={{minHeight:"100vh",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif"}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{width:80,height:80,borderRadius:24,background:C.accentDim,border:`2px solid ${C.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,margin:"0 auto 28px"}}>📊</div>
        <h1 style={{color:C.text,fontSize:28,fontWeight:800,margin:"0 0 8px",textAlign:"center",letterSpacing:"-0.5px"}}>SplitTrack</h1>
        <p style={{color:C.textSub,fontSize:15,textAlign:"center",margin:"0 0 36px",lineHeight:1.5}}>Import your Chase transactions and track exactly what you owe — and what you're owed.</p>

        <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);processFile(e.dataTransfer.files[0]);}}
          onClick={()=>fileRef.current.click()}
          style={{border:`2px dashed ${dragging?C.accent:C.border}`,borderRadius:20,padding:"36px 24px",cursor:"pointer",marginBottom:16,background:dragging?C.accentDim:C.bg,transition:"all 0.2s",textAlign:"center"}}>
          {loading
            ?<><p style={{color:C.accent,fontSize:16,fontWeight:600,margin:"0 0 4px"}}>Reading file…</p><p style={{color:C.textMuted,fontSize:13,margin:0}}>Just a moment</p></>
            :<><p style={{fontSize:32,margin:"0 0 8px"}}>📂</p><p style={{color:dragging?C.accent:C.text,fontSize:16,fontWeight:600,margin:"0 0 4px"}}>Drop your Chase CSV</p><p style={{color:C.textMuted,fontSize:13,margin:0}}>or tap to browse</p></>}
          <input ref={fileRef} type="file" accept=".csv,.CSV" style={{display:"none"}} onChange={e=>processFile(e.target.files[0])}/>
        </div>

        {error&&<div style={{background:C.redDim,border:`1px solid ${C.red}33`,borderRadius:12,padding:"12px 16px",marginBottom:16}}>
          <p style={{color:C.red,fontSize:14,margin:0}}>{error}</p>
        </div>}

        <div style={{background:C.bg,borderRadius:16,padding:"16px",marginBottom:28}}>
          <p style={{color:C.textSub,fontSize:12,fontWeight:700,letterSpacing:"0.06em",margin:"0 0 10px"}}>HOW TO EXPORT FROM CHASE</p>
          {["chase.com → your account → Activity","Click Download → CSV","Select date range → Download"].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:10,marginBottom:i<2?8:0}}>
              <span style={{width:22,height:22,borderRadius:"50%",background:C.accent,color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</span>
              <p style={{color:C.textSub,fontSize:13,margin:"2px 0 0"}}>{s}</p>
            </div>
          ))}
        </div>

        <button onClick={onSkip} style={{width:"100%",background:"none",border:"none",color:C.textMuted,fontSize:14,cursor:"pointer",textDecoration:"underline"}}>Try with demo data first</button>
      </div>
    </div>
  );
};

// ── Bottom nav ────────────────────────────────────────────────────
const BottomNav=({active,setActive})=>{
  const tabs=[{id:"dashboard",icon:"⊟",label:"Overview"},{id:"transactions",icon:"≡",label:"Activity"},{id:"splits",icon:"⊕",label:"Splits"},{id:"settings",icon:"○",label:"More"}];
  return(
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"rgba(255,255,255,0.94)",backdropFilter:"blur(20px)",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-around",alignItems:"center",paddingBottom:28,paddingTop:10,zIndex:50}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>{haptic();setActive(t.id);}} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,color:active===t.id?C.accent:C.textMuted,padding:"4px 16px",minWidth:60,transition:"color 0.15s"}}>
          <span style={{fontSize:22,lineHeight:1}}>{t.icon}</span>
          <span style={{fontSize:10,fontWeight:active===t.id?700:500,letterSpacing:"0.03em"}}>{t.label}</span>
        </button>
      ))}
    </div>
  );
};

// ── Dashboard ─────────────────────────────────────────────────────
const Dashboard=({transactions,splits,setTab,onReimport})=>{
  const totalCharged=transactions.reduce((s,t)=>s+t.total,0);
  const myRealSpend=transactions.reduce((s,t)=>s+t.myShare,0);
  const pending=splits.filter(s=>!s.settled);
  const totalOwed=pending.reduce((s,t)=>s+t.amount,0);
  const byPerson=pending.reduce((acc,s)=>{if(!acc[s.person])acc[s.person]={person:s.person,total:0,n:0};acc[s.person].total+=s.amount;acc[s.person].n++;return acc;},{});
  const savings=totalCharged-myRealSpend;

  return(
    <div style={{padding:"0 0 100px",background:C.bg,minHeight:"100vh"}}>
      {/* Header */}
      <div style={{background:C.card,padding:"20px 20px 24px",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <p style={{color:C.textMuted,fontSize:12,fontWeight:600,letterSpacing:"0.06em",margin:"0 0 4px"}}>{new Date().toLocaleDateString("en-US",{month:"long",year:"numeric"}).toUpperCase()}</p>
            <h1 style={{color:C.text,fontSize:26,fontWeight:800,margin:0,letterSpacing:"-0.5px"}}>Overview</h1>
          </div>
          <button onClick={onReimport} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.textSub,fontSize:13,fontWeight:600,padding:"8px 14px",borderRadius:20,cursor:"pointer"}}>Import</button>
        </div>
        {/* Spend hero */}
        <div style={{background:`linear-gradient(135deg,${C.accent},#16a34a)`,borderRadius:20,padding:"24px"}}>
          <p style={{color:"rgba(255,255,255,0.7)",fontSize:12,fontWeight:600,letterSpacing:"0.06em",margin:"0 0 6px"}}>MY REAL SPEND</p>
          <p style={{color:"#fff",fontSize:40,fontWeight:800,margin:"0 0 4px",letterSpacing:"-1px"}}>${myRealSpend.toFixed(2)}</p>
          <p style={{color:"rgba(255,255,255,0.65)",fontSize:13,margin:"0 0 14px"}}>of ${totalCharged.toFixed(2)} charged{savings>0?` · saving $${savings.toFixed(2)}`:""}</p>
          <div style={{background:"rgba(255,255,255,0.2)",borderRadius:6,height:4}}>
            <div style={{width:`${Math.min((myRealSpend/(totalCharged||1))*100,100)}%`,background:"rgba(255,255,255,0.9)",borderRadius:6,height:4,transition:"width 0.8s ease"}}/>
          </div>
        </div>
      </div>

      {/* Owed card */}
      <div onClick={()=>setTab("splits")} style={{background:C.card,margin:"0 0 8px",padding:"20px",cursor:"pointer"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <p style={{color:C.textMuted,fontSize:12,fontWeight:600,letterSpacing:"0.06em",margin:"0 0 4px"}}>OWED TO YOU</p>
            <p style={{color:C.yellow,fontSize:30,fontWeight:800,margin:0,letterSpacing:"-0.5px"}}>${totalOwed.toFixed(2)}</p>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{color:C.textMuted,fontSize:12,fontWeight:600,letterSpacing:"0.06em",margin:"0 0 4px"}}>PEOPLE</p>
            <p style={{color:C.text,fontSize:30,fontWeight:800,margin:0}}>{Object.keys(byPerson).length}</p>
          </div>
        </div>
        {Object.keys(byPerson).length>0&&<div style={{marginTop:16,display:"flex",flexDirection:"column",gap:0}}>
          {Object.values(byPerson).map((p,i)=>(
            <div key={p.person}>
              {i>0&&<Divider/>}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:i>0?12:0,paddingBottom:i<Object.keys(byPerson).length-1?12:0}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <Avatar name={p.person} size={32} color={C.accent}/>
                  <p style={{color:C.text,fontSize:15,fontWeight:500,margin:0}}>{p.person}</p>
                </div>
                <p style={{color:C.yellow,fontSize:15,fontWeight:700,margin:0}}>${p.total.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>}
      </div>

      {/* Categories */}
      <div style={{background:C.card,margin:"0 0 8px",padding:"20px"}}>
        <p style={{color:C.textMuted,fontSize:12,fontWeight:600,letterSpacing:"0.06em",margin:"0 0 14px"}}>BY CATEGORY</p>
        {ALL_CATS.map(cat=>{
          const spend=transactions.filter(t=>t.category===cat).reduce((s,t)=>s+t.myShare,0);
          if(!spend) return null;
          return(
            <div key={cat} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <span style={{fontSize:18,flexShrink:0}}>{CAT_EMOJI[cat]}</span>
              <p style={{color:C.textSub,fontSize:14,margin:0,flex:1}}>{cat}</p>
              <div style={{flex:2,background:C.bg,borderRadius:4,height:6}}>
                <div style={{width:`${(spend/(myRealSpend||1))*100}%`,background:CAT_COLOR[cat],borderRadius:4,height:6,transition:"width 0.6s ease"}}/>
              </div>
              <p style={{color:C.text,fontSize:14,fontWeight:700,margin:0,minWidth:52,textAlign:"right"}}>${spend.toFixed(0)}</p>
            </div>
          );
        })}
        {!transactions.length&&<div style={{textAlign:"center",padding:"24px 0"}}>
          <p style={{color:C.textMuted,fontSize:14,margin:"0 0 12px"}}>No transactions yet</p>
          <button onClick={onReimport} style={{background:C.accentDim,border:`1px solid ${C.accent}44`,color:C.accent,borderRadius:12,padding:"10px 20px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Import CSV</button>
        </div>}
      </div>
    </div>
  );
};

// ── Activity ──────────────────────────────────────────────────────
const Activity=({transactions,setTransactions,categorizing,onReimport,onSplitSaved})=>{
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [detailTx,setDetailTx]=useState(null);
  const [splitTxId,setSplitTxId]=useState(null);

  function updateCat(id,cat){setTransactions(prev=>prev.map(t=>t.id===id?{...t,category:cat}:t));}
  function updateName(id,name){setTransactions(prev=>prev.map(t=>t.id===id?{...t,displayName:name}:t));}
  function markSplit(id){setSplitTxId(id);}
  function markSettled(id){setTransactions(prev=>prev.map(t=>t.id===id?{...t,settled:true}:t));}

  const filtered=transactions.filter(t=>{
    if(search) return (t.displayName||t.merchant).toLowerCase().includes(search.toLowerCase());
    if(filter==="split") return t.split;
    if(filter==="personal") return !t.split;
    return true;
  });
  const openTx=detailTx?transactions.find(t=>t.id===detailTx):null;

  return(
    <div style={{background:C.bg,minHeight:"100vh",paddingBottom:100}}>
      <TxDetailSheet open={!!openTx} tx={openTx} onClose={()=>setDetailTx(null)} onUpdateCategory={updateCat} onUpdateName={updateName} onMarkSplit={markSplit} onMarkSettled={markSettled} onSplitSaved={s=>{onSplitSaved(s);}} transactions={transactions}/>
      <SplitSheet open={!!splitTxId} onClose={()=>setSplitTxId(null)} transactions={transactions} preSelectedTxId={splitTxId} onSave={s=>{onSplitSaved(s);setSplitTxId(null);setTransactions(prev=>prev.map(t=>t.id===s.existingTxId?{...t,split:true,people:s.people,myShare:s.myShare}:t));}}/>

      {/* Header */}
      <div style={{background:C.card,padding:"20px",marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h1 style={{color:C.text,fontSize:26,fontWeight:800,margin:0,letterSpacing:"-0.5px"}}>Activity</h1>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {categorizing&&<div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:C.accent,animation:"pulse 1s infinite"}}/><span style={{color:C.accent,fontSize:12,fontWeight:600}}>AI sorting</span></div>}
            <button onClick={onReimport} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.textSub,fontSize:13,fontWeight:600,padding:"7px 12px",borderRadius:20,cursor:"pointer"}}>Import</button>
          </div>
        </div>
        {/* Search */}
        <div style={{position:"relative",marginBottom:12}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:16,color:C.textMuted}}>🔍</span>
          <input placeholder="Search transactions" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 14px 11px 36px",color:C.text,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>
        {/* Filters */}
        <div style={{display:"flex",gap:8}}>
          {["all","split","personal"].map(f=>(
            <button key={f} onClick={()=>{setFilter(f);setSearch("");}} style={{background:filter===f&&!search?C.accent:C.bg,border:`1px solid ${filter===f&&!search?C.accent:C.border}`,color:filter===f&&!search?"#fff":C.textSub,borderRadius:20,padding:"7px 16px",fontSize:13,fontWeight:600,cursor:"pointer",textTransform:"capitalize",transition:"all 0.15s"}}>{f}</button>
          ))}
        </div>
      </div>

      {/* Transaction list */}
      {!transactions.length&&<div style={{textAlign:"center",paddingTop:60}}>
        <p style={{fontSize:40,margin:"0 0 12px"}}>📭</p>
        <p style={{color:C.textSub,fontSize:16,margin:"0 0 4px"}}>No transactions yet</p>
        <p style={{color:C.textMuted,fontSize:13,margin:"0 0 20px"}}>Import your Chase CSV to get started</p>
        <button onClick={onReimport} style={{background:C.accent,border:"none",color:"#fff",borderRadius:12,padding:"12px 24px",fontSize:15,fontWeight:600,cursor:"pointer"}}>Import CSV</button>
      </div>}

      <div style={{background:C.card}}>
        {filtered.map((t,i)=>(
          <div key={t.id}>
            {i>0&&<div style={{height:1,background:C.border,marginLeft:68}}/>}
            <button onClick={()=>{haptic();setDetailTx(t.id);}} style={{width:"100%",background:"none",border:"none",padding:"14px 20px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",transition:"background 0.1s"}}
              onMouseEnter={e=>e.currentTarget.style.background=C.bg}
              onMouseLeave={e=>e.currentTarget.style.background="none"}>
              <div style={{width:44,height:44,borderRadius:12,background:CAT_COLOR[t.category]+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                {CAT_EMOJI[t.category]||"💳"}
              </div>
              <div style={{flex:1,textAlign:"left",minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  <p style={{color:C.text,fontSize:15,fontWeight:600,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.displayName||t.merchant}</p>
                  {t.split&&<span style={{background:C.accentDim,color:C.accent,fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:6,flexShrink:0}}>SPLIT</span>}
                  {t.settled&&<span style={{background:"#9CA3AF18",color:C.textMuted,fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:6,flexShrink:0}}>SETTLED</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:C.textMuted,fontSize:12}}>{t.date}</span>
                  {t.category&&<><span style={{color:C.border,fontSize:12}}>·</span><span style={{color:CAT_COLOR[t.category],fontSize:12,fontWeight:500}}>{t.category}</span></>}
                  {!t.category&&categorizing&&<span style={{color:C.textMuted,fontSize:12}}>· sorting…</span>}
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <p style={{color:C.text,fontSize:15,fontWeight:700,margin:"0 0 2px"}}>${t.myShare.toFixed(2)}</p>
                {t.split&&t.myShare!==t.total&&<p style={{color:C.textMuted,fontSize:11,margin:0}}>of ${t.total.toFixed(2)}</p>}
              </div>
            </button>
          </div>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
};

// ── Splits ────────────────────────────────────────────────────────
const Splits=({splits,setSplits,transactions,showAdd,setShowAdd,onSplitSaved})=>{
  const [expanded,setExpanded]=useState(null);
  const [toast,setToast]=useState(null);
  function showToast(msg){setToast(msg);setTimeout(()=>setToast(null),2200);}

  const pending=splits.filter(s=>!s.settled);
  const totalOwed=pending.reduce((s,t)=>s+t.amount,0);
  const byPerson=pending.reduce((acc,s)=>{if(!acc[s.person])acc[s.person]={person:s.person,total:0,items:[]};acc[s.person].total+=s.amount;acc[s.person].items.push(s);return acc;},{});

  function settleAll(person){setSplits(prev=>prev.map(s=>s.person===person?{...s,settled:true}:s));setExpanded(null);showToast(`${person} settled ✓`);}

  return(
    <div style={{background:C.bg,minHeight:"100vh",paddingBottom:100}}>
      {toast&&<div style={{position:"fixed",bottom:100,left:"50%",transform:"translateX(-50%)",background:C.text,color:"#fff",padding:"10px 20px",borderRadius:20,fontSize:13,fontWeight:600,zIndex:400,whiteSpace:"nowrap"}}>{toast}</div>}
      <SplitSheet open={showAdd} onClose={()=>setShowAdd(false)} transactions={transactions} onSave={s=>{onSplitSaved(s);showToast("Split added ✓");}}/>

      {/* Header */}
      <div style={{background:C.card,padding:"20px",marginBottom:8}}>
        <h1 style={{color:C.text,fontSize:26,fontWeight:800,margin:"0 0 4px",letterSpacing:"-0.5px"}}>Splits</h1>
        <p style={{color:C.textMuted,fontSize:14,margin:0}}>You're owed <strong style={{color:C.yellow}}>${totalOwed.toFixed(2)}</strong></p>
      </div>

      {!Object.keys(byPerson).length&&<div style={{textAlign:"center",paddingTop:60}}>
        <p style={{fontSize:40,margin:"0 0 12px"}}>🎉</p>
        <p style={{color:C.text,fontSize:18,fontWeight:600,margin:"0 0 4px"}}>All settled up</p>
        <p style={{color:C.textMuted,fontSize:14}}>Tap + to add a new split</p>
      </div>}

      <div style={{background:C.card}}>
        {Object.values(byPerson).map((p,pi)=>(
          <div key={p.person}>
            {pi>0&&<Divider/>}
            <button onClick={()=>{haptic();setExpanded(expanded===p.person?null:p.person);}} style={{width:"100%",background:"none",border:"none",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <Avatar name={p.person} size={42} color={C.accent}/>
                <div style={{textAlign:"left"}}>
                  <p style={{color:C.text,fontSize:16,fontWeight:600,margin:"0 0 2px"}}>{p.person}</p>
                  <p style={{color:C.textMuted,fontSize:13,margin:0}}>{p.items.length} outstanding</p>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <p style={{color:C.yellow,fontSize:18,fontWeight:800,margin:0}}>${p.total.toFixed(2)}</p>
                <span style={{color:C.textMuted,fontSize:18,transform:expanded===p.person?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>›</span>
              </div>
            </button>
            {expanded===p.person&&(
              <div style={{background:C.bg,borderTop:`1px solid ${C.border}`}}>
                {p.items.map((item,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px 12px 72px",borderBottom:i<p.items.length-1?`1px solid ${C.border}`:"none"}}>
                    <div><p style={{color:C.text,fontSize:14,fontWeight:500,margin:"0 0 2px"}}>{item.merchant}</p>
                      <p style={{color:C.textMuted,fontSize:12,margin:0}}>{item.date}</p></div>
                    <p style={{color:C.textSub,fontSize:15,fontWeight:600,margin:0}}>${item.amount.toFixed(2)}</p>
                  </div>
                ))}
                <div style={{padding:"12px 20px 16px"}}>
                  <button onClick={()=>settleAll(p.person)} style={{width:"100%",background:C.accentDim,border:`1.5px solid ${C.accent}44`,color:C.accent,borderRadius:14,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                    Mark all settled · via Zelle
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <button onClick={()=>{haptic();setShowAdd(true);}} style={{position:"fixed",bottom:90,right:20,width:56,height:56,borderRadius:"50%",background:C.accent,border:"none",color:"#fff",fontSize:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 20px ${C.accent}55`,zIndex:40}}>+</button>
    </div>
  );
};

// ── Settings ──────────────────────────────────────────────────────
const Settings=({onReimport,txCount})=>(
  <div style={{background:C.bg,minHeight:"100vh",paddingBottom:100}}>
    <div style={{background:C.card,padding:"20px",marginBottom:8}}>
      <h1 style={{color:C.text,fontSize:26,fontWeight:800,margin:0,letterSpacing:"-0.5px"}}>More</h1>
    </div>
    <div style={{background:C.card,marginBottom:8}}>
      <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:44,height:44,borderRadius:12,background:"#1E6FCC18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🏦</div>
        <div style={{flex:1}}>
          <p style={{color:C.text,fontSize:15,fontWeight:600,margin:"0 0 2px"}}>Chase</p>
          <p style={{color:C.textMuted,fontSize:13,margin:0}}>{txCount} transactions · CSV import</p>
        </div>
        <button onClick={onReimport} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.textSub,fontSize:13,fontWeight:600,padding:"7px 14px",borderRadius:20,cursor:"pointer"}}>Update</button>
      </div>
      <Divider/>
      <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:44,height:44,borderRadius:12,background:C.accentDim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>✦</div>
        <div style={{flex:1}}>
          <p style={{color:C.text,fontSize:15,fontWeight:600,margin:"0 0 2px"}}>AI categorization</p>
          <p style={{color:C.textMuted,fontSize:13,margin:0}}>Auto-sorts and names every transaction</p>
        </div>
        <span style={{color:C.accent,fontSize:13,fontWeight:600}}>Active</span>
      </div>
    </div>
  </div>
);

// ── AI enrichment serverless fn ───────────────────────────────────
async function enrichTransactions(txs){
  const todo=txs.filter(t=>!t.category||!t.displayName);
  if(!todo.length) return {};
  try{
    const r=await fetch("/api/categorize",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({transactions:todo.map(t=>({id:t.id,merchant:t.merchant,amount:t.total}))})});
    const d=await r.json();
    return d.categories||{};
  }catch{return {};}
}

// ── Demo ──────────────────────────────────────────────────────────
const DEMO_TX=[
  {id:_id++,merchant:"ZAHAV RESTAURANT",displayName:"Zahav",date:"Jun 14",total:187.50,myShare:46.88,split:true,people:["Riya","Dev","Priya"],settled:false,category:"Dining",isCredit:false,source:"demo"},
  {id:_id++,merchant:"WHOLE FOODS MARKET",displayName:"Whole Foods",date:"Jun 13",total:94.20,myShare:94.20,split:false,people:[],settled:false,category:"Groceries",isCredit:false,source:"demo"},
  {id:_id++,merchant:"UBER *TRIP",displayName:"Uber",date:"Jun 12",total:22.00,myShare:11.00,split:true,people:["Dev"],settled:true,category:"Transport",isCredit:false,source:"demo"},
  {id:_id++,merchant:"PARC RESTAURANT",displayName:"Parc",date:"Jun 11",total:312.00,myShare:78.00,split:true,people:["Riya","Dev","Priya"],settled:false,category:"Dining",isCredit:false,source:"demo"},
  {id:_id++,merchant:"APPLE.COM/BILL",displayName:"Apple Subscription",date:"Jun 10",total:9.99,myShare:9.99,split:false,people:[],settled:false,category:"Subscriptions",isCredit:false,source:"demo"},
  {id:_id++,merchant:"TRADER JOE S #618",displayName:"Trader Joe's",date:"Jun 9",total:67.40,myShare:33.70,split:true,people:["Riya"],settled:true,category:"Groceries",isCredit:false,source:"demo"},
  {id:_id++,merchant:"NJTRANSIT - WEB 2001",displayName:"NJ Transit",date:"Jun 12",total:81.95,myShare:81.95,split:false,people:[],settled:false,category:"Transport",isCredit:false,source:"demo"},
  {id:_id++,merchant:"DD *DOORDASH PAYLESSLI",displayName:"DoorDash",date:"Jun 13",total:42.18,myShare:21.09,split:true,people:["Riya"],settled:false,category:"Dining",isCredit:false,source:"demo"},
];
const DEMO_SPLITS=[
  {id:1,person:"Riya",merchant:"Zahav",amount:46.88,date:"Jun 14",settled:false},
  {id:2,person:"Dev",merchant:"Zahav",amount:46.88,date:"Jun 14",settled:false},
  {id:3,person:"Priya",merchant:"Zahav",amount:46.87,date:"Jun 14",settled:false},
  {id:4,person:"Riya",merchant:"Parc",amount:78.00,date:"Jun 11",settled:false},
  {id:5,person:"Dev",merchant:"Parc",amount:78.00,date:"Jun 11",settled:false},
  {id:6,person:"Priya",merchant:"Parc",amount:78.00,date:"Jun 11",settled:false},
  {id:7,person:"Riya",merchant:"DoorDash",amount:21.09,date:"Jun 13",settled:false},
];

// ── Root ──────────────────────────────────────────────────────────
export default function App(){
  const [screen,setScreen]=useState("import");
  const [tab,setTab]=useState("dashboard");
  const [transactions,setTransactions]=useState([]);
  const [splits,setSplits]=useState([]);
  const [categorizing,setCategorizing]=useState(false);
  const [showAdd,setShowAdd]=useState(false);

  function handleSplitSaved(s){
    const perPerson=parseFloat(((s.total-s.myShare)/s.people.length).toFixed(2));
    const newSplits=s.people.map((p,i)=>({id:Date.now()+i,person:p,merchant:s.merchant,amount:perPerson,date:s.date,settled:false}));
    setSplits(prev=>[...prev,...newSplits]);
    if(s.existingTxId) setTransactions(prev=>prev.map(t=>t.id===s.existingTxId?{...t,split:true,people:s.people,myShare:s.myShare}:t));
  }

  async function handleImport(txs){
    setTransactions(txs);setSplits([]);setScreen("app");setTab("transactions");
    setCategorizing(true);
    const result=await enrichTransactions(txs);
    setTransactions(prev=>prev.map(t=>{
      const r=result[String(t.id)];
      if(!r) return{...t,category:t.category||"Other"};
      // API returns {category, displayName} or just string
      if(typeof r==="string") return{...t,category:t.category||r};
      return{...t,category:t.category||r.category||"Other",displayName:t.displayName||r.displayName||null};
    }));
    setCategorizing(false);
  }

  function handleSkip(){setTransactions(DEMO_TX);setSplits(DEMO_SPLITS);setScreen("app");}

  if(screen==="import") return <ImportScreen onImport={handleImport} onSkip={handleSkip}/>;

  return(
    <div style={{background:C.bg,minHeight:"100vh",maxWidth:430,margin:"0 auto",fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif",position:"relative",overflowX:"hidden"}}>
      {/* Status bar */}
      <div style={{height:54,background:C.card,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:8,position:"sticky",top:0,zIndex:10,borderBottom:`1px solid ${C.border}`}}>
        <div style={{width:126,height:34,background:C.dark,borderRadius:20}}/>
      </div>
      <div style={{minHeight:"calc(100vh - 54px)"}}>
        {tab==="dashboard"&&<Page active={tab==="dashboard"}><Dashboard transactions={transactions} splits={splits} setTab={setTab} onReimport={()=>setScreen("import")}/></Page>}
        {tab==="transactions"&&<Page active={tab==="transactions"}><Activity transactions={transactions} setTransactions={setTransactions} categorizing={categorizing} onReimport={()=>setScreen("import")} onSplitSaved={handleSplitSaved}/></Page>}
        {tab==="splits"&&<Page active={tab==="splits"}><Splits splits={splits} setSplits={setSplits} transactions={transactions} showAdd={showAdd} setShowAdd={setShowAdd} onSplitSaved={handleSplitSaved}/></Page>}
        {tab==="settings"&&<Page active={tab==="settings"}><Settings onReimport={()=>setScreen("import")} txCount={transactions.length}/></Page>}
      </div>
      <BottomNav active={tab} setActive={t=>{setTab(t);if(t!=="splits")setShowAdd(false);}}/>
    </div>
  );
}
