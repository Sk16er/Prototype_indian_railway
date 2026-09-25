import React, { useState, useEffect } from "react";

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "Asia/Kolkata", hour12: false,
      }) + " IST";
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="text-outline font-mono text-body-sm">| {time}</span>;
}

function KpiCard({ label, value, sub, barColor, barWidth, icon }) {
  return (
    <div className="bg-surface-container-low p-gutter-md rounded-xl flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="font-label-md text-label-md uppercase text-on-surface-variant font-bold">{label}</span>
        <span className={`material-symbols-outlined text-2xl ${icon.color}`}>{icon.name}</span>
      </div>
      <div className="my-gutter-xs">{value}{sub}</div>
      <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: barWidth }}></div>
      </div>
    </div>
  );
}

function BlockRow({ row, onAction }) {
  return (
    <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-3 px-3">
        <div className="font-label-md text-label-md font-bold text-primary">{row.id}</div>
        <div className="text-on-surface font-medium">{row.section}</div>
        <div className="font-label-sm text-label-sm text-on-surface-variant">{row.km}</div>
      </td>
      <td className="py-3 px-3">
        <span className={`font-label-sm text-label-sm px-1.5 py-0.5 rounded font-bold uppercase ${row.catBg}`}>{row.cat}</span>
        <div className="text-on-surface font-semibold mt-1">{row.machine}</div>
        <div className="text-on-surface-variant text-label-sm font-label-sm">{row.gang}</div>
      </td>
      <td className="py-3 px-3">
        <div className={`flex items-center gap-1.5 font-bold font-label-md text-label-md ${row.timeColor}`}>
          {row.timePing
            ? <span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-ping"></span>
            : <span className="material-symbols-outlined text-[16px]">{row.timeIcon}</span>}
          <span>{row.window}</span>
        </div>
        <div className={`font-bold font-label-sm text-label-sm mt-0.5 ${row.remColor}`}>{row.remaining}</div>
        <div className="w-24 h-1.5 bg-surface-container-highest rounded-full mt-1 overflow-hidden">
          <div className={`h-full ${row.progColor}`} style={{ width: row.progWidth }}></div>
        </div>
      </td>
      <td className="py-3 px-3">
        <div className="font-label-sm text-label-sm text-primary font-bold">{row.train}</div>
        <div className="text-on-surface-variant text-[11px]">{row.trainDetail}</div>
        <div className={`font-label-sm text-label-sm font-semibold ${row.tsrColor}`}>{row.tsr}</div>
      </td>
      <td className="py-3 px-3">
        <div className="text-primary font-bold font-label-sm text-label-sm">{row.officer}</div>
        <div className="text-on-surface-variant text-[11px]">{row.memo}</div>
        <span className={`font-label-sm text-label-sm px-1 rounded ${row.badgeBg}`}>{row.badge}</span>
      </td>
      <td className="py-3 px-3 text-right">
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={() => onAction?.(`${row.btn1}: ${row.id}`)} className={`font-label-sm text-label-sm uppercase px-2 py-1 rounded shadow-sm ${row.btn1Cls}`}>{row.btn1}</button>
          <button type="button" onClick={() => onAction?.(`${row.btn2}: ${row.id}`)} className={`font-label-sm text-label-sm font-bold ${row.btn2Cls}`}>{row.btn2}</button>
        </div>
      </td>
    </tr>
  );
}

export default function LivePortalMode({ onNavigate, onRefresh, refreshing = false }) {
  const [activeNav, setActiveNav] = useState("active-possessions");
  const [handback, setHandback] = useState([false, false, false, false]);
  const [statusFilter, setStatusFilter] = useState("Live");
  const [actionMessage, setActionMessage] = useState("");

  const navItems = [
    { key: "active-possessions", label: "Active Blocks", description: "Active Possessions", target: "live-ledger", status: "Live" },
    { key: "block-sanctions", label: "Sanctions & Approvals", description: "Block Sanctions & Approvals", target: "live-ledger", status: "All sample blocks" },
    { key: "rolling-block", label: "Rolling Plan", description: "Rolling Block Programme", tab: "calendar" },
    { key: "engineering-machines", label: "Engineering & USFD", description: "Engineering Machines & USFD", target: "live-usfd-alerts" },
    { key: "ohe-power-cut", label: "OHE / S&T Blocks", description: "OHE Power Cut / S&T Joint Blocks", target: "live-joint-matrix" },
    { key: "corridor-punctuality", label: "Corridor Impact", description: "Corridor Punctuality Impact", target: "live-corridor-impact" },
  ];

  const kpis = [
    { label: "Sanctioned Blocks", icon: { name: "traffic_jam", color: "text-primary-container" }, value: <div className="font-display-lg text-display-lg text-primary font-black">142</div>, sub: <div className="font-label-sm text-label-sm text-on-tertiary-container font-bold flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">trending_up</span><span>18 Zonal HQs Synchronized</span></div>, barColor: "bg-primary-container", barWidth: "78%" },
    { label: "Machine Fleets Active", icon: { name: "construction", color: "text-secondary" }, value: <div className="font-display-lg text-display-lg text-secondary font-black">92.4%</div>, sub: <div className="font-label-sm text-label-sm text-on-surface-variant">BCM, CSM, TRT, PQRS Squads</div>, barColor: "bg-secondary", barWidth: "92.4%" },
    { label: "Joint Mega Blocks", icon: { name: "cable", color: "text-tertiary-container" }, value: <div className="font-display-lg text-display-lg text-tertiary-container font-black">28</div>, sub: <div className="font-label-sm text-label-sm text-on-tertiary-container font-bold flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">check_circle</span><span>Civil + 25kV TRD + S&T</span></div>, barColor: "bg-on-tertiary-container", barWidth: "86%" },
    { label: "Speed Restrictions (TSR)", icon: { name: "speed", color: "text-error" }, value: <div className="flex items-baseline gap-2"><span className="font-display-lg text-display-lg text-error font-black">14</span><span className="font-label-sm text-label-sm text-on-surface-variant">8 Relaxed / 24h</span></div>, sub: <div className="font-label-sm text-label-sm text-on-surface-variant">Avg clamp: 30-45 KMPH</div>, barColor: "bg-error", barWidth: "45%" },
    { label: "Corridor Retention", icon: { name: "verified", color: "text-on-tertiary-container" }, value: <div className="font-display-lg text-display-lg text-on-tertiary-container font-black">97.8%</div>, sub: <div className="font-label-sm text-label-sm text-on-surface-variant">Golden Quad & HDN Trunks</div>, barColor: "bg-on-tertiary-container", barWidth: "97.8%" },
  ];

  const blockRows = [
    { id: "BLK-NR-DLI-2025-084", demoStatus: "Live", groups: ["active-possessions", "block-sanctions", "engineering-machines", "corridor-punctuality"], section: "GZB - ALJN Section", km: "KM 118+400 to 132+800 [Dn Main]", cat: "BCM + CSM Tamping", catBg: "bg-primary text-on-primary", machine: "Deep Screening BCM-883", gang: "Machine Gang #09 (14 Staff)", window: "10:30 - 14:30 (4h 00m)", timePing: true, timeColor: "text-on-tertiary-container", timeIcon: "", remaining: "2h 15m remaining", remColor: "text-secondary", progColor: "bg-on-tertiary-container", progWidth: "44%", train: "12301 Rajdhani Exp", trainDetail: "Diverted via 3rd Loop Line", tsr: "Kavach TSR 30 Clamped", tsrColor: "text-on-tertiary-container", officer: "Sr. DEN (Co.) / CPTM", memo: "S&T Memo T-351 Received", badge: "TRD OHE Cut Active", badgeBg: "bg-surface-container-highest text-primary", btn1: "Inspect Live", btn1Cls: "bg-primary hover:bg-primary-container text-on-primary", btn2: "+30m Extension", btn2Cls: "text-secondary hover:underline" },
    { id: "BLK-WR-BCT-2025-112", demoStatus: "Live", groups: ["active-possessions", "block-sanctions", "engineering-machines", "corridor-punctuality"], section: "BCT - ST Corridor", km: "KM 128/4 to 129/2 [Up Through]", cat: "Track Relaying (TRT)", catBg: "bg-secondary text-on-secondary", machine: "TRT-06 Heavy Sleeper Laying", gang: "Engg Div Gang 12", window: "11:00 - 15:30 (4h 30m)", timePing: true, timeColor: "text-on-tertiary-container", timeIcon: "", remaining: "3h 48m remaining", remColor: "text-secondary", progColor: "bg-on-tertiary-container", progWidth: "22%", train: "12951 Tejas Rajdhani", trainDetail: "Handled on Up Slow Line", tsr: "TSR 45 KMPH Imposed", tsrColor: "text-on-tertiary-container", officer: "Sr. DOM / Sr. DEN WR", memo: "S&T Cable Shunt Done", badge: "Joint TRD Clear", badgeBg: "bg-surface-container-highest text-primary", btn1: "Inspect Live", btn1Cls: "bg-primary hover:bg-primary-container text-on-primary", btn2: "Handback Ready", btn2Cls: "text-error hover:underline" },
    { id: "BLK-ECR-DDU-2025-045", demoStatus: "Cleared", groups: ["active-possessions", "rolling-block", "ohe-power-cut", "corridor-punctuality"], section: "Pt. Deen Dayal Upadhyaya Yard", km: "Grid Siding Lines 4 & 5", cat: "25kV OHE Wiring + S&T", catBg: "bg-tertiary-container text-on-tertiary", machine: "Tower Wagon TW-44 & Gang", gang: "TRD Catenary Overhaul", window: "08:00 - 12:00 (4h 00m)", timePing: false, timeColor: "text-error", timeIcon: "hourglass_bottom", remaining: "18 mins remaining", remColor: "text-error", progColor: "bg-error", progWidth: "92%", train: "BOXN Coal Rakes", trainDetail: "Held back at Chandauli Loop", tsr: "Zero Passenger Impact", tsrColor: "text-on-surface-variant", officer: "Sr. DEE (TRD) Approved", memo: "Disconnection Memo Live", badge: "Earth Clamp Active", badgeBg: "bg-error-container text-on-error-container font-bold", btn1: "Cancel / Relinquish", btn1Cls: "bg-error hover:bg-on-error-container text-on-error", btn2: "Test Charge 25kV", btn2Cls: "text-primary hover:underline" },
    { id: "BLK-NCR-JHS-2025-019", demoStatus: "Next 2h", groups: ["active-possessions", "block-sanctions", "rolling-block", "corridor-punctuality"], section: "Gwalior - Jhansi Section", km: "KM 1221/10 to 1224/00 [Up Line]", cat: "Point Machine & EI", catBg: "bg-primary-container text-on-primary-container", machine: "Dual Detection Track Circuit", gang: "S&T Wing Gwalior", window: "13:00 - 16:00 (3h 00m)", timePing: false, timeColor: "text-on-surface-variant", timeIcon: "schedule", remaining: "Starts in 1h 18m", remColor: "text-outline", progColor: "bg-outline", progWidth: "0%", train: "Vande Bharat Exp 20172", trainDetail: "Run on Line 2 without detention", tsr: "Pre-Simulated in COA", tsrColor: "text-on-tertiary-container", officer: "Dy. CSTE (Works)", memo: "Pending Dy. DOM Authorization", badge: "Staging Ready", badgeBg: "bg-surface-container-high text-on-surface", btn1: "Finalize Sanction", btn1Cls: "bg-surface-container-high text-primary hover:bg-surface-container-highest", btn2: "Revise Window", btn2Cls: "text-outline hover:underline" },
  ];

  const handbackItems = [
    { label: "1. Track Clearance & Gauge Verification", desc: "All BCM/CSM machinery clear of Infringement Profile (SOD-2022)." },
    { label: "2. OHE Earth Discharge Rods Removed", desc: "Confirmed 4/4 earthing poles safely stowed. Traction ready for re-charge." },
    { label: "3. S&T Reconnection Memo (T-352)", desc: "Joint signature between Section Engineer (Signal) and Station Director." },
    { label: "4. Speed Restriction (TSR) Board Clamped", desc: "Caution Indicator & Termination Board fixed at KM 118+100 and KM 133+000." },
  ];

  const toggleHandback = (i) => setHandback((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  const announceAction = (message) => setActionMessage(`${message} selected. Demo mode does not send this action to a railway system.`);

  const visibleRows = blockRows.filter((row) => {
    const statusMatches = statusFilter === "All sample blocks" || row.demoStatus === statusFilter;
    return statusMatches && row.groups.includes(activeNav);
  });

  const handlePortalNavigation = (item) => {
    setActiveNav(item.key);
    setStatusFilter(item.status || "All sample blocks");
    if (item.tab) {
      onNavigate?.(item.tab);
      return;
    }
    document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const zoналRankings = [
    { zone: "Northern Railway (NR)", pct: 94.2, blocks: 38, color: "bg-primary", tc: "text-primary" },
    { zone: "Western Railway (WR)", pct: 92.0, blocks: 31, color: "bg-on-tertiary-container", tc: "text-on-tertiary-container" },
    { zone: "Central Railway (CR)", pct: 88.5, blocks: 29, color: "bg-secondary", tc: "text-secondary" },
    { zone: "East Central Railway (ECR)", pct: 85.4, blocks: 22, color: "bg-on-primary-container", tc: "text-on-surface-variant" },
  ];

  const deptWings = [
    { num: "1.", dept: "Civil Engineering", tc: "text-primary", icon: "hardware", ic: "text-primary", desc: "Track renewals, sleeper packing, ballasting & deep screening", items: [{ l: "BCM Gang 09 (GZB)", s: "Active (KM 118)", sc: "text-on-tertiary-container" }, { l: "CSM Tamping #418", s: "Active (KM 122)", sc: "text-on-tertiary-container" }, { l: "DGS Track Stabilizer", s: "Queue Behind", sc: "text-secondary" }], footer: "Sr. DEN Sectional Lead In-Charge", fi: "engineering" },
    { num: "2.", dept: "Electrical TRD", tc: "text-secondary", icon: "bolt", ic: "text-secondary", desc: "25 kV AC contact/catenary wire maintenance & isolator switching", items: [{ l: "Power Cut (Isolator 41)", s: "De-Energized", sc: "text-error" }, { l: "Discharge Rod Grounding", s: "Verified Earthed", sc: "text-on-tertiary-container" }, { l: "Dropper & Cantilever Adj", s: "In Progress (TW-02)", sc: "text-on-tertiary-container" }], footer: "Sr. DEE (TRD) Isolation Permit #884", fi: "electric_meter" },
    { num: "3.", dept: "Signaling (S&T)", tc: "text-tertiary-container", icon: "sensors", ic: "text-tertiary-container", desc: "Point machine detection, axle counter resetting & EI validation", items: [{ l: "Disconnection Memo T-351", s: "Issued to SM", sc: "text-on-tertiary-container" }, { l: "Point 104A/B Overhaul", s: "Lubrication Done", sc: "text-secondary" }, { l: "Digital Axle Counter (BPAC)", s: "Standby Test", sc: "text-on-surface-variant" }], footer: "Sr. DSTE Safety Sign-Off Pending", fi: "cell_tower" },
  ];

  return (
    <div className="flex flex-col w-full">

      {/* Sub-Nav */}
      <nav aria-label="Live portal sections" className="bg-primary-container rounded-lg mb-gutter-lg shadow-md p-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-1">
          {navItems.map((item) => (
            <button type="button" key={item.key} title={item.description} onClick={() => handlePortalNavigation(item)} aria-current={activeNav === item.key ? "location" : undefined}
              className={`flex min-h-10 items-center justify-center text-center px-2 py-2 rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary-fixed ${activeNav === item.key ? "bg-secondary text-on-secondary shadow-inner font-bold" : "text-on-primary-container hover:bg-primary hover:text-on-primary"}`}>
              <span className="text-label-sm leading-tight">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Control Strip */}
      <section className="mb-gutter-lg">
        <div className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-gutter-md mb-gutter-md">
            <div className="flex items-center gap-gutter-md">
              <div className="w-12 h-12 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shadow-md">
                <span className="material-symbols-outlined text-3xl">hub</span>
              </div>
              <div>
                <div className="flex items-center gap-gutter-xs">
                  <span className="font-headline-sm text-headline-sm font-bold text-primary tracking-tight">CRIS-RBMS National Track Block Desk</span>
                  <span className="bg-secondary text-on-secondary px-gutter-xs py-0.5 rounded font-label-sm text-label-sm uppercase">TMS-Core v4.9.1</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Central Operational Authority &bull; Real-time Civil, S&amp;T &amp; TRD Possession Clearing Gateway</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-gutter-sm">
              <div className="flex items-center gap-2 bg-surface-container-low px-gutter-md py-gutter-xs rounded-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-on-tertiary-container animate-pulse"></span>
                <span className="font-label-md text-label-md text-on-surface font-semibold">IR-TMS Telemetry Live</span>
                <LiveClock />
              </div>
              <button onClick={() => onNavigate?.("emergency")} className="bg-primary hover:bg-primary-container text-on-primary font-label-md text-label-md uppercase px-gutter-md py-2.5 rounded-lg flex items-center gap-gutter-xs shadow transition-all">
                <span className="material-symbols-outlined text-lg">post_add</span><span>Request Form E-102</span>
              </button>
              <button onClick={() => onNavigate?.("emergency")} className="bg-error hover:bg-on-error-container text-on-error font-label-md text-label-md uppercase px-gutter-md py-2.5 rounded-lg flex items-center gap-gutter-xs shadow transition-all">
                <span className="material-symbols-outlined text-lg">bolt</span><span>Emergency TRD Cut</span>
              </button>
              <button onClick={() => onNavigate?.("whatif")} className="bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-md text-label-md uppercase px-gutter-md py-2.5 rounded-lg flex items-center gap-gutter-xs shadow-sm transition-all">
                <span className="material-symbols-outlined text-lg">simulation</span><span>COA Impact Sim</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-gutter-md pt-gutter-sm">
            {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
          </div>
        </div>
      </section>

      {/* Filter Toolbar */}
      <section className="mb-gutter-lg">
        <div className="bg-primary text-on-primary p-gutter-md rounded-xl shadow-md flex flex-wrap items-center justify-between gap-gutter-md">
          <div className="flex flex-wrap items-center gap-gutter-md w-full lg:w-auto">
            <div className="flex items-center gap-2 text-secondary-fixed">
              <span className="material-symbols-outlined text-xl">tune</span>
              <span className="font-label-lg text-label-lg font-bold uppercase tracking-wider">Possession Dispatch Desk</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 flex-grow lg:flex-initial">
              {[
                { label: "Railway Zone", opts: ["Northern (NR)", "Western (WR)", "Central (CR)", "North Central (NCR)", "East Central (ECR)"] },
                { label: "Operating Division", opts: ["Delhi (DLI)", "Firozpur (FZR)", "Moradabad (MB)", "Lucknow (LKO)", "Ambala (UMB)"] },
                { label: "Corridor Section", opts: ["NDLS-GZB-ALJN (HDN-1)", "DLI-UMB-ASR", "NZM-MTJ 3rd/4th"] },
                { label: "Track Line Tracked", opts: ["All Running Lines", "Up Main Line", "Down Main Line", "3rd / Suburban Line", "DFC Interconnection"] },
              ].map(({ label, opts }) => (
                <div key={label} className="bg-primary-container px-3 py-1.5 rounded-lg flex flex-col">
                  <label className="font-label-sm text-label-sm text-on-primary-container uppercase font-bold">{label}</label>
                  <select className="bg-transparent font-title-lg text-title-lg text-on-primary font-bold focus:outline-none cursor-pointer">
                    {opts.map((o) => <option key={o} className="bg-primary text-on-primary">{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-gutter-sm">
            <button onClick={() => onNavigate?.("calendar")} className="bg-secondary hover:bg-on-secondary-container text-on-secondary font-label-md text-label-md uppercase px-gutter-md py-2.5 rounded-lg flex items-center gap-1 shadow">
              <span className="material-symbols-outlined text-lg">calendar_month</span><span>52-Wk Rolling Plan</span>
            </button>
            <button type="button" onClick={onRefresh} disabled={refreshing} className="bg-surface-container-lowest text-primary hover:bg-surface-container font-label-md text-label-md uppercase px-gutter-md py-2.5 rounded-lg flex items-center gap-1 shadow disabled:opacity-60">
              <span className={`material-symbols-outlined text-lg ${refreshing ? "animate-spin" : ""}`}>sync</span><span>{refreshing ? "Refreshing..." : "Refresh Feeds"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Operational Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg mb-gutter-xl">
        <div className="xl:col-span-5 flex flex-col gap-gutter-lg">
          <div id="live-corridor-impact" className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-gutter-md">
              <div className="flex items-center gap-gutter-xs">
                <span className="material-symbols-outlined text-primary-container text-2xl">route</span>
                <div>
                  <h2 className="font-headline-sm text-headline-sm font-bold text-primary">National Rail Network Schematic</h2>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">High-Density Corridors (HDN-1, HDN-2) &amp; Electrified Trunks</p>
                </div>
              </div>
              <span className="bg-surface-container-high text-primary px-gutter-xs py-1 rounded font-label-sm text-label-sm font-bold uppercase">GIS &bull; TMS Feed</span>
            </div>
            <div className="relative w-full rounded-lg overflow-hidden bg-primary shadow-inner mb-gutter-md">
              <svg viewBox="0 0 480 340" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                <rect width="480" height="340" fill="#001e40"/>
                {[60,120,180,240,300,360,420].map(x=><line key={x} x1={x} y1="0" x2={x} y2="340" stroke="#1f477b" strokeWidth="0.5"/>)}
                {[60,120,180,240,300].map(y=><line key={y} x1="0" y1={y} x2="480" y2={y} stroke="#1f477b" strokeWidth="0.5"/>)}
                <path d="M 200 60 L 140 170 L 100 280" stroke="#fe9832" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <path d="M 200 60 L 290 80 L 360 110 L 400 150" stroke="#ffb77a" strokeWidth="3" fill="none" strokeLinecap="round"/>
                <path d="M 200 60 L 210 130 L 220 200 L 240 280 L 250 320" stroke="#72de5c" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M 100 280 L 170 295 L 250 320" stroke="#a7c8ff" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <path d="M 400 150 L 370 220 L 340 280 L 310 310 L 250 320" stroke="#a7c8ff" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <path d="M 200 60 L 145 165 L 108 272" stroke="#ff9933" strokeWidth="1.5" strokeDasharray="6 3" fill="none"/>
                <path d="M 200 60 L 295 75 L 365 105" stroke="#ff9933" strokeWidth="1.5" strokeDasharray="6 3" fill="none"/>
                <circle cx="250" cy="72" r="7" fill="#fe9832" opacity="0.9">
                  <animate attributeName="r" values="5;10;5" dur="1.4s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite"/>
                </circle>
                {[{cx:200,cy:60,l:"NDLS"},{cx:100,cy:280,l:"BCT"},{cx:400,cy:150,l:"HWH"},{cx:250,cy:320,l:"MAS"},{cx:290,cy:80,l:"CNB"},{cx:360,cy:110,l:"GYA"}].map(({cx,cy,l})=>(
                  <g key={l}><circle cx={cx} cy={cy} r="5" fill="#a7c8ff" stroke="#003366" strokeWidth="1.5"/><text x={cx+8} y={cy+4} fill="#a7c8ff" fontSize="9" fontFamily="monospace" fontWeight="bold">{l}</text></g>
                ))}
                <rect x="285" y="10" width="145" height="22" rx="4" fill="#003366" opacity="0.95"/>
                <text x="295" y="25" fill="#a7c8ff" fontSize="10" fontFamily="monospace" fontWeight="bold">Kavach 4.0: 1,445 KM Live</text>
                <rect x="10" y="308" width="220" height="22" rx="4" fill="#001e40" opacity="0.9"/>
                <circle cx="22" cy="319" r="4" fill="#fe9832"/>
                <text x="32" y="323" fill="#ffb77a" fontSize="9" fontFamily="sans-serif">HDN-1 - Delhi-Howrah Block Alert</text>
              </svg>
            </div>
            <div className="grid grid-cols-2 gap-gutter-sm mb-gutter-md">
              <div className="bg-surface-container-low p-gutter-sm rounded-lg">
                <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant">Golden Quad Track Health</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="font-headline-sm text-headline-sm font-bold text-primary">96.8%</span>
                  <span className="font-label-sm text-label-sm text-on-tertiary-container font-bold">+1.4% MoM</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Delhi - Mumbai 160 KMPH Upgradation</p>
              </div>
              <div className="bg-surface-container-low p-gutter-sm rounded-lg">
                <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant">USFD Rail Flaw Detection</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="font-headline-sm text-headline-sm font-bold text-tertiary-container">2,840 KM</span>
                  <span className="font-label-sm text-label-sm text-secondary font-bold">14 Gangs</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Zero IMR Rails Unattended &gt;24h</p>
              </div>
            </div>
            <div className="bg-surface-container-low p-gutter-md rounded-lg">
              <div className="flex items-center justify-between mb-gutter-xs">
                <span className="font-label-md text-label-md uppercase font-bold text-primary">Zonal Possession Efficiency (IR-PEI)</span>
                <span className="font-label-sm text-label-sm text-outline">Target: &gt;90%</span>
              </div>
              <div className="space-y-gutter-xs">
                {zoналRankings.map(({ zone, pct, blocks, color, tc }) => (
                  <div key={zone}>
                    <div className="flex justify-between font-label-sm text-label-sm mb-0.5">
                      <span className="font-bold text-on-surface">{zone}</span>
                      <span className={`font-bold ${tc}`}>{pct}% ({blocks} Blocks Completed)</span>
                    </div>
                    <div className="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div className={`h-full ${color}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="live-usfd-alerts" className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-gutter-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-2xl">warning</span>
                <h3 className="font-title-lg text-title-lg font-bold text-primary">Critical Track Flaw Alerts (USFD/IMR)</h3>
              </div>
              <span className="bg-error-container text-on-error-container font-label-sm text-label-sm px-2 py-0.5 rounded font-bold uppercase">3 Urgent Repairs</span>
            </div>
            <div className="space-y-gutter-sm font-body-sm text-body-sm">
              {[
                { title: "[NR/DLI] KM 124/8-10 Dn Line (Ghaziabad-Khurja)", desc: "Internal Transverse Fatigue Defect (IMR-W). Clamped at 30 KMPH.", action: "Immediate Rail Piece Renewal Assigned: Gang 04", ac: "text-error", btn: "Dispatch", bc: "bg-primary text-on-primary" },
                { title: "[NCR/ALD] KM 842/14 Up Line (Prayagraj-Kanpur)", desc: "Weld Flaw detected via SRT-21. Jogged fishplate fixed.", action: "AT Welding scheduled in night shadow window", ac: "text-secondary", btn: "Logged", bc: "bg-surface-container-high text-primary" },
              ].map(({ title, desc, action, ac, btn, bc }) => (
                <div key={title} className="bg-surface-container-low p-gutter-sm rounded-lg flex items-start justify-between">
                  <div className="flex flex-col">
                    <span className="font-label-md text-label-md font-bold text-primary">{title}</span>
                    <span className="text-on-surface-variant">{desc}</span>
                    <span className={`font-bold font-label-sm text-label-sm mt-1 ${ac}`}>{action}</span>
                  </div>
                  <button type="button" onClick={() => announceAction(`${btn} action for ${title}`)} className={`font-label-sm text-label-sm uppercase px-2.5 py-1.5 rounded flex-shrink-0 ml-2 ${bc}`}>{btn}</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-7 flex flex-col">
          <div id="live-ledger" className="bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm flex flex-col h-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-gutter-sm mb-gutter-md">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-headline-sm font-bold text-primary">Active &amp; Granted Block Sanctions Ledger</h2>
                  <span className="bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm px-2 py-0.5 rounded font-bold">{visibleRows.length} sample blocks</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Real-time tracking of track relaying, tamping, deep screening &amp; power blocks</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Filter Status:</span>
                {["All sample blocks", "Live", "Next 2h", "Cleared"].map((filter) => <button type="button" key={filter} onClick={() => setStatusFilter(filter)} aria-pressed={statusFilter === filter} className={`${statusFilter === filter ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface"} font-label-sm text-label-sm px-2 py-1 rounded`}>{filter}{filter === "All sample blocks" ? ` (${blockRows.length})` : ` (${blockRows.filter((row) => row.demoStatus === filter).length})`}</button>)}
              </div>
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-high text-on-surface font-label-sm text-label-sm uppercase">
                    <th className="py-2.5 px-3 rounded-l">Block ID &amp; Location</th>
                    <th className="py-2.5 px-3">Category &amp; Machine Fleet</th>
                    <th className="py-2.5 px-3">Window / Remaining</th>
                    <th className="py-2.5 px-3">Traffic Regulation</th>
                    <th className="py-2.5 px-3">Clearance / Handover</th>
                    <th className="py-2.5 px-3 rounded-r text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-transparent font-body-sm text-body-sm">
                  {visibleRows.map((row) => <BlockRow key={row.id} row={row} onAction={announceAction} />)}
                  {visibleRows.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-on-surface-variant">No sample blocks match this section and status.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-gutter-md pt-gutter-sm flex flex-col sm:flex-row items-center justify-between gap-gutter-sm bg-surface-container-low p-gutter-sm rounded-lg">
              <div className="flex items-center gap-gutter-md text-on-surface-variant font-body-sm text-body-sm">
                <span>Showing <strong>{visibleRows.length}</strong> of <strong>{blockRows.length}</strong> bundled sample possessions</span>
                <span>&bull;</span>
                <span className="text-on-tertiary-container font-bold">100% Shadow Traffic Interlocking Active</span>
              </div>
              <span className="text-label-sm text-on-surface-variant">Synthetic demonstration rows</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Matrix */}
      <section id="live-joint-matrix" className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg mb-gutter-xl">
        <div className="lg:col-span-8 bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-gutter-sm mb-gutter-md">
            <div>
              <div className="flex items-center gap-gutter-xs">
                <span className="material-symbols-outlined text-secondary text-2xl">layers</span>
                <h3 className="font-headline-sm text-headline-sm font-bold text-primary">Inter-Departmental Joint Shadow Matrix</h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Civil (Engg) + Traction (TRD) + Signal &amp; Telecom (S&amp;T) Co-Occupancy Architecture</p>
            </div>
            <span className="font-label-sm text-label-sm bg-tertiary-fixed-dim text-on-tertiary-fixed font-bold px-2 py-1 rounded whitespace-nowrap">Line Closure Saved: 142 Hrs / Week</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md">
            {deptWings.map(({ num, dept, tc, icon, ic, desc, items, footer, fi }) => (
              <div key={dept} className="bg-surface-container-low p-gutter-md rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-gutter-xs mb-gutter-xs">
                    <span className={`font-label-md text-label-md font-bold uppercase ${tc}`}>{num} {dept}</span>
                    <span className={`material-symbols-outlined text-xl ${ic}`}>{icon}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-gutter-sm">{desc}</p>
                  <div className="space-y-1.5 font-body-sm text-body-sm">
                    {items.map(({ l, s, sc }) => (
                      <div key={l} className="flex items-center justify-between bg-surface-container-lowest p-2 rounded">
                        <span className="font-medium text-on-surface">{l}</span>
                        <span className={`font-bold font-label-sm text-label-sm ${sc}`}>{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-gutter-md pt-gutter-xs text-outline font-label-sm text-label-sm flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">{fi}</span><span>{footer}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container-lowest p-gutter-lg rounded-xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-gutter-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-2xl">checklist_rtl</span>
                <h3 className="font-title-lg text-title-lg font-bold text-primary">Safety Handback Protocol</h3>
              </div>
              <span className="bg-error text-on-error font-label-sm text-label-sm font-bold px-2 py-0.5 rounded uppercase">Mandatory</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-gutter-md">Pre-signal normalisation verification before line clearance to Station Master</p>
            <div className="space-y-gutter-sm font-body-sm text-body-sm">
              {handbackItems.map((item, i) => (
                <label key={i} className="flex items-start gap-gutter-sm bg-surface-container-low p-gutter-sm rounded-lg cursor-pointer">
                  <input type="checkbox" checked={handback[i]} onChange={() => toggleHandback(i)} className="mt-1 accent-primary" />
                  <div className="flex flex-col">
                    <span className={`font-label-md text-label-md font-bold ${handback[i] ? "text-on-tertiary-container line-through" : "text-on-surface"}`}>{item.label}</span>
                    <span className="text-on-surface-variant">{item.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-gutter-md pt-gutter-sm">
            <button type="button" disabled={!handback.every(Boolean)} onClick={() => announceAction("Line handback T-402")} className={`w-full font-label-md text-label-md uppercase font-bold py-3 rounded-lg shadow flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${handback.every(Boolean) ? "bg-on-tertiary-container text-on-tertiary" : "bg-primary hover:bg-primary-container text-on-primary"}`}>
              <span className="material-symbols-outlined text-lg">check_circle</span>
              <span>{handback.every(Boolean) ? "Ready: Execute Line Handback (T-402)" : "Execute Line Handback (T-402)"}</span>
            </button>
          </div>
          {actionMessage && <div className="mt-3 bg-on-tertiary-container/10 border border-on-tertiary-container/30 text-on-tertiary-container p-2 rounded text-body-sm" role="status">{actionMessage}</div>}
        </div>
      </section>

      {/* Portal Footer */}
      <footer className="w-full bg-primary text-on-primary border-t-4 border-secondary-container rounded-xl mt-gutter-lg">
        <div className="px-gutter-lg py-gutter-xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter-xl border-b border-primary-container pb-gutter-lg mb-gutter-lg">
            <div className="flex flex-col gap-gutter-sm">
              <span className="font-title-lg text-title-lg text-secondary-fixed font-bold">RBMS PORTAL (TMS)</span>
              <p className="font-body-sm text-body-sm text-on-primary-container leading-relaxed">Sovereign Digital Asset designed and maintained by the Centre for Railway Information Systems (CRIS) for Ministry of Railways, Government of India.</p>
              <div className="flex items-center gap-gutter-md pt-gutter-xs">
                <span className="bg-primary-container text-secondary-fixed text-label-sm font-label-sm px-gutter-sm py-0.5 rounded font-bold">CRIS TMS-v4.9</span>
                <span className="bg-primary-container text-on-primary-container text-label-sm font-label-sm px-gutter-sm py-0.5 rounded">RDSO ISO-9001</span>
              </div>
            </div>
            <div className="flex flex-col gap-gutter-sm">
              <span className="font-title-lg text-title-lg text-secondary-fixed font-bold">Quick Access Links</span>
              <ul className="flex flex-col gap-1 font-body-sm text-body-sm text-on-primary-container">
                {["Safety Circulars & Joint Procedural Orders", "Engineering Possession Manual (IRPWM)", "OHE Power Cut Protocols & ACTM Guide", "Signaling Disconnection Memo (S&T T-351)"].map((l) => <li key={l} className="hover:text-on-primary cursor-pointer">{l}</li>)}
              </ul>
            </div>
            <div className="flex flex-col gap-gutter-sm">
              <span className="font-title-lg text-title-lg text-secondary-fixed font-bold">Compliance & Standards</span>
              <ul className="flex flex-col gap-1 font-body-sm text-body-sm text-on-primary-container">
                {["Guidelines for Indian Govt Websites (GIGW 3.0)", "National Informatics Centre (NIC) Cloud", "CERT-IN Security Compliance Clearance", "Right to Information Act (RTI 2005)"].map((l) => <li key={l} className="hover:text-on-primary cursor-pointer">{l}</li>)}
              </ul>
            </div>
            <div className="flex flex-col gap-gutter-sm">
              <span className="font-title-lg text-title-lg text-secondary-fixed font-bold">Central Emergency Desk</span>
              <p className="font-body-sm text-body-sm text-on-primary-container">Railway Board Safety Cell Control: 011-23386882</p>
              <p className="font-body-sm text-body-sm text-on-primary-container">CRIS TMS 24x7 Helpdesk: 011-24672550</p>
              <div className="mt-gutter-xs p-gutter-sm bg-primary-container rounded border border-on-primary-container/30">
                <span className="font-label-sm text-label-sm text-secondary-fixed font-bold block">RailMadad Passenger &amp; Staff Helpline</span>
                <span className="font-headline-sm text-headline-sm font-bold text-on-primary">Dial 139 (Toll Free)</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between text-on-primary-container font-body-sm text-body-sm gap-gutter-md">
            <div className="flex flex-wrap items-center gap-gutter-md">
              {["Website Policies", "Copyright Policy", "Hyperlinking Policy", "Terms & Conditions", "Privacy Policy"].map((l, i, a) => (
                <React.Fragment key={l}><span className="cursor-pointer hover:text-on-primary">{l}</span>{i < a.length - 1 && <span>&bull;</span>}</React.Fragment>
              ))}
            </div>
            <p className="text-right">&copy; 2025 Ministry of Railways, Govt of India. Powered by CRIS.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
