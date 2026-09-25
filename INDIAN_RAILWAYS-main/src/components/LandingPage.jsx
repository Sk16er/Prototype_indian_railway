/**
 * LandingPage.jsx — Sovereign CRIS-RBMS Authentication Gateway
 *
 * Implements the exact Stitch design specification (Google Stitch Prototype: 8294017856350636210)
 * GIGW-compliant sovereign government portal styling with Tricolor accent,
 * authentic Indian Railways emblems, schematics map, multi-tier login console,
 * Form T-1 onboarding, Form E-102 emergency modal, and JWT authentication.
 */
import React, { useState, useEffect } from 'react';
import { login, isLoggedIn } from '../api';

const EMBLEM_IMG_1 = "https://lh3.googleusercontent.com/aida-public/AB6AXuAbzp5BDDdHwcXOl2OgfBaYYtE0YmZsLikYGESmA-rUauBXFRK7RCGcqlQS3MaGyK3Qq1cFBiyUfv-ue_hIf8RtiaftJt_p5sEdQK4Dc9VsIhvQUUg52F81bKk_Z2o3O5g-Uv3ucZ84oMc8XuM99nEWnWuN_pBX3a_CS3vT8g3-1MIdOxOOr_tw1T7klHaOWNOl21G0oGFYE38-aO6RuUnyFj-VKFbqt2xKptepJ9A6-fcENILFfD6L";
const EMBLEM_IMG_2 = "https://lh3.googleusercontent.com/aida-public/AB6AXuC5USU8NurBvrwTVfB82C2719gxQEtRtMLersi0uy_jXqkQM6qO2Q_AsTYxnKbbo9YNVbYT-zWaqp_Q88GYmo4_dPyYu7sVIF3ZhDU4TubJ75Fq1FA1qgZJNtuBkYt6npBKlzCvpQrpgKsvVhc6RBPYhGragwEEBbSlAXWD7hzFcz_4I7fHXtqet0_nB3wyklpOurx07-_kUsiktRAuK8qb0IWigcT8O8NHft51pEs5qNT6n60oaBcj";
const NETWORK_MAP_IMG = "https://lh3.googleusercontent.com/aida-public/AB6AXuAHLUplcZko8ybkSSgjljez3GY2pLwsWzlg0RKQJSpiL3Er2ZzvnIBFoq8TJLz8NOvRbc9phfPy7Kf7TbknPOPTlH9xQlUcCCG4Q7FORvm2htNJ4_bnXvQBSnFo8poIJ6Ecvma2aHd-aRr-UkgGQJEue-G4x3YxGEtWGSFL0yo4ywpCrbA6lUkPpGt7Hmwk4XFmQF3lP-BO2bDPS-N4bIJ1wunmn_77RpbxC630UpPVinw6RDTvmaGp";

function generateCaptcha() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function LandingPage({ onAuthenticated }) {
  // Console tab & tier states
  const [consoleMode, setConsoleMode] = useState('login'); // 'login' | 'reg'
  const [authTier, setAuthTier] = useState('hrms'); // 'hrms' | 'dsc' | 'parichay'

  // Login form state
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [dept, setDept] = useState('');
  const [zone, setZone] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [captchaCode, setCaptchaCode] = useState(generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState('');

  // Async states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Registration Form T-1 state
  const [regHrms, setRegHrms] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regZone, setRegZone] = useState('');
  const [regDivision, setRegDivision] = useState('');
  const [regDscToken, setRegDscToken] = useState('');
  const [regUndertaking, setRegUndertaking] = useState(false);

  // Form E-102 Emergency Modal state
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [emergencyToken, setEmergencyToken] = useState('');

  // GIGW Accessibility & Language controls
  const [fontScale, setFontScale] = useState(0);
  const [highContrast, setHighContrast] = useState(false);
  const [isHindi, setIsHindi] = useState(false);

  // If already authenticated via JWT in sessionStorage, forward automatically
  useEffect(() => {
    if (isLoggedIn()) {
      onAuthenticated?.();
    }
  }, [onAuthenticated]);

  // Adjust root font size according to GIGW accessibility scale
  useEffect(() => {
    document.documentElement.style.fontSize = (16 + fontScale) + 'px';
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [fontScale]);

  const regenerateCaptcha = () => {
    setCaptchaCode(generateCaptcha());
    setCaptchaInput('');
  };

  const playCaptchaAudio = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(captchaCode.split('').join(' '));
      utter.rate = 0.8;
      utter.pitch = 1.0;
      window.speechSynthesis.speak(utter);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (captchaInput.trim().toUpperCase() !== captchaCode) {
      setErrorMessage('Security Check Failed: Invalid CAPTCHA code. Please re-enter.');
      regenerateCaptcha();
      return;
    }

    if (!dept || !zone) {
      setErrorMessage('Mandatory Selection: Please specify your Cadre Department and Zonal Command.');
      return;
    }

    setIsLoading(true);
    try {
      await login(userId, password);
      setSuccessMessage('Demo authentication confirmed. Opening the judge dashboard.');
      setTimeout(() => {
        onAuthenticated?.();
      }, 1200);
    } catch (err) {
      setErrorMessage(err.message || 'Authentication error occurred. The gateway may be unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);
    try {
      await login('judge.demo', 'BandhanDemo2026!');
      onAuthenticated?.();
    } catch (err) {
      setErrorMessage(err.message || 'Demo login failed. Confirm the FastAPI scheduler is running on port 8001.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('Officer Enrollment Form T-1 submitted successfully. Routed to Senior Divisional Personnel Officer (Sr. DPO) for vetting.');
    setTimeout(() => {
      setConsoleMode('login');
      setSuccessMessage('');
    }, 2200);
  };

  const openResetFlow = () => {
    const hrms = prompt('Enter your 6-Character HRMS Employee Code for Password Reset:');
    if (hrms) {
      alert(`Temporary cryptographic reset token dispatched to registered Railway email for officer HRMS ID: ${hrms.toUpperCase()}`);
    }
  };

  const submitEmergencyBypass = () => {
    if (!emergencyToken.trim()) {
      alert('Please enter an 8-digit Station Master / Section Controller Authorization Token.');
      return;
    }
    alert('Emergency Dispatch Ping Transmitted. Divisional Control Room & PCOM alerted with Red Priority flag.');
    setIsEmergencyModalOpen(false);
    setEmergencyToken('');
  };

  return (
    <div className={`bg-[#f4f6f9] text-[#212529] min-h-screen flex flex-col selection:bg-[#003366] selection:text-white ${highContrast ? 'contrast-125' : ''}`} style={{ fontFamily: "'Inter', 'Noto Sans Devanagari', sans-serif" }}>
      
      {/* ═══ Sovereign Tricolor Accent Stripe ═══ */}
      <div className="h-1.5 w-full flex flex-shrink-0">
        <div className="w-1/3 bg-[#FF9933]"></div>
        <div className="w-1/3 bg-white border-t border-b border-slate-200"></div>
        <div className="w-1/3 bg-[#138808]"></div>
      </div>

      {/* ═══ GIGW Official Government Accessibility & Language Top Bar ═══ */}
      <header className="w-full bg-[#1a2332] text-slate-200 text-xs border-b border-slate-700 select-none flex-shrink-0">
        <div className="max-w-[1400px] mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="font-medium text-slate-100">भारत सरकार • GOVERNMENT OF INDIA</span>
            <span className="text-white/30">|</span>
            <span className="text-slate-300">रेल्वे मंत्रालय • MINISTRY OF RAILWAYS</span>
          </div>

          {/* GIGW Utilities */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded border border-white/10 text-[11px]">
              <span className="text-slate-400">Font Size:</span>
              <button className="hover:text-white px-1 text-[11px] font-medium" onClick={() => setFontScale(s => s - 1)} title="Decrease Text Size">A-</button>
              <button className="hover:text-white px-1 font-bold text-xs" onClick={() => setFontScale(0)} title="Standard Text Size">A</button>
              <button className="hover:text-white px-1 text-sm font-semibold" onClick={() => setFontScale(s => s + 1)} title="Increase Text Size">A+</button>
              <span className="text-white/20 mx-1">|</span>
              <button className="hover:text-white flex items-center gap-0.5" onClick={() => setHighContrast(!highContrast)} title="High Contrast Mode">
                <span className="material-symbols-outlined text-[13px]">contrast</span> Contrast
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#003366]/60 px-2 py-0.5 rounded border border-[#002244]">
              <span className="material-symbols-outlined text-[14px] text-amber-300">translate</span>
              <button className="font-semibold text-white hover:text-amber-200 transition-colors text-[11px]" onClick={() => setIsHindi(!isHindi)}>
                {isHindi ? 'हिन्दी / English' : 'English / हिन्दी'}
              </button>
            </div>

            <div className="hidden md:flex items-center gap-1.5 text-emerald-300 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded">
              <span className="material-symbols-outlined text-[13px]">lock</span>
              <span className="font-mono text-[11px] font-semibold">NIC Cloud PKI Secured</span>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ Institution Branding Header (Official IR Navy Blue) ═══ */}
      <div className="w-full bg-[#003366] text-white shadow-md border-b-4 border-amber-500 flex-shrink-0">
        <div className="max-w-[1400px] mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white p-0.5 flex-shrink-0 shadow border border-amber-400 overflow-hidden flex items-center justify-center">
              <img
                alt="Indian Railways Emblem"
                className="w-full h-full object-contain rounded-full"
                src={EMBLEM_IMG_1}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML = '<span class="material-symbols-outlined text-amber-600 text-3xl">train</span>';
                }}
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="font-extrabold text-lg sm:text-xl tracking-tight text-white m-0">CRIS-RAILWAY BLOCK MANAGEMENT SYSTEM (RBMS)</h1>
                <span className="bg-amber-500 text-slate-900 text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded shadow-sm">Sovereign Portal</span>
              </div>
              <p className="text-slate-200 text-xs mt-0.5 mb-0">
                Centre for Railway Information Systems (CRIS) • रेल ब्लॉक प्रबंधन एवं अधिकार प्रणाली • Ministry of Railways
              </p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-3 text-right">
            <div className="bg-white/10 px-3 py-1.5 rounded border border-white/15">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Protected Information Infrastructure</div>
              <div className="text-xs font-semibold text-white">Sec 66F / 43 IT Act 2000 Compliant</div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MAIN WORKSPACE ═══ */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8 items-start">
        
        {/* ── LEFT COLUMN: Portal Information, Bulletins & Guidelines ── */}
        <section className="w-full lg:w-7/12 flex flex-col gap-6">
          
          {/* Welcome Notice Card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200 mb-4">
              <span className="material-symbols-outlined text-[#003366] text-2xl">campaign</span>
              <h2 className="text-base sm:text-lg font-bold text-[#003366] m-0">Sovereign Authentication & Track Possession Guidelines</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mb-4">
              Welcome to the official CRIS-RBMS Single Sign-On Portal. Authorized operating personnel, civil engineering officials (P-Way), traction distribution (TRD) officers, and signaling engineers must authenticate using official credentials or Class-3 Digital Signature Certificates (DSC) to request and administer line blocks.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-[#003366] text-lg mt-0.5">verified_user</span>
                <div>
                  <strong className="text-slate-900 block font-bold mb-0.5">Mandatory 2FA Authentication</strong>
                  <span className="text-slate-600">All sessions are verified via NIC time-based OTP and HRMS directory mapping.</span>
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-[#003366] text-lg mt-0.5">gavel</span>
                <div>
                  <strong className="text-slate-900 block font-bold mb-0.5">Statutory Legal Warning</strong>
                  <span className="text-slate-600">Unauthorized access or tampering with track possession tokens is punishable under law.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Indian Railways Operational Network Map Card */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
              <div className="w-10 h-10 rounded-full bg-white p-0.5 flex-shrink-0 shadow border border-amber-400 overflow-hidden flex items-center justify-center">
                <img
                  alt="Indian Railways Emblem"
                  className="w-full h-full object-contain rounded-full"
                  src={EMBLEM_IMG_2}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = '<span class="material-symbols-outlined text-amber-600 text-2xl">train</span>';
                  }}
                />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#003366] m-0">Indian Railways Operational Network Map</h2>
                <p className="text-xs text-slate-500 m-0">Schematic & Trunk Route Coverage</p>
              </div>
            </div>
            <div className="overflow-hidden rounded border border-slate-200 bg-slate-50">
              <img
                alt="Railway Network Map of India"
                className="w-full h-auto object-contain block max-h-[520px]"
                src={NETWORK_MAP_IMG}
              />
            </div>
          </div>

          {/* Important Circulars & Bulletins */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#003366] text-xl">description</span>
                <h3 className="font-bold text-sm sm:text-base text-slate-800 m-0">Latest Circulars & SOP Updates</h3>
              </div>
              <span className="text-xs font-semibold text-[#003366] cursor-pointer hover:underline">View All Archives</span>
            </div>
            <ul className="flex flex-col gap-3 text-xs p-0 m-0 list-none">
              <li className="flex items-start justify-between gap-4 pb-2.5 border-b border-slate-100">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-sm mt-0.5">fiber_manual_record</span>
                  <div>
                    <a className="font-bold text-slate-800 hover:text-[#003366] no-underline" href="#!">
                      RBMS Circular No. 2025/SK/102: Integration of Electronic Interlocking with Block Safety Tokens
                    </a>
                    <div className="text-slate-500 text-[11px] mt-0.5">Issued by: Executive Director Safety (Railway Board) • Dated: 14 Feb 2025</div>
                  </div>
                </div>
                <span className="bg-blue-50 text-blue-700 font-mono text-[10px] px-2 py-0.5 rounded border border-blue-200 flex-shrink-0">PDF (1.4 MB)</span>
              </li>
              <li className="flex items-start justify-between gap-4 pb-2.5 border-b border-slate-100">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-sm mt-0.5">fiber_manual_record</span>
                  <div>
                    <a className="font-bold text-slate-800 hover:text-[#003366] no-underline" href="#!">
                      Standard Operating Procedure for Emergency Form E-102 Track Handover Bypass
                    </a>
                    <div className="text-slate-500 text-[11px] mt-0.5">Issued by: CPTM / Northern Railway • Dated: 02 Feb 2025</div>
                  </div>
                </div>
                <span className="bg-blue-50 text-blue-700 font-mono text-[10px] px-2 py-0.5 rounded border border-blue-200 flex-shrink-0">PDF (850 KB)</span>
              </li>
              <li className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-sm mt-0.5">fiber_manual_record</span>
                  <div>
                    <a className="font-bold text-slate-800 hover:text-[#003366] no-underline" href="#!">
                      Advisory on SafeNet Token Driver v4.2 Update for Windows 11 Compatibility
                    </a>
                    <div className="text-slate-500 text-[11px] mt-0.5">Issued by: CRIS Security Operations Center • Dated: 28 Jan 2025</div>
                  </div>
                </div>
                <span className="bg-blue-50 text-blue-700 font-mono text-[10px] px-2 py-0.5 rounded border border-blue-200 flex-shrink-0">PDF (520 KB)</span>
              </li>
            </ul>
          </div>

          {/* Help Desk & Support Contacts */}
          <div className="bg-[#002244] text-white rounded-lg p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 border border-white/20">
                <span className="material-symbols-outlined text-amber-300 text-2xl">support_agent</span>
              </div>
              <div>
                <h4 className="font-bold text-sm m-0 text-white">CRIS RBMS 24x7 Helpdesk Control Desk</h4>
                <p className="text-xs text-slate-300 mt-0.5 mb-0">Direct Hotline: 011-24672550 • RailNet: 8884 / 8885</p>
              </div>
            </div>
            <a
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded text-xs transition-colors shadow-sm whitespace-nowrap no-underline cursor-pointer"
              href="mailto:rbms-support@cris.org.in"
            >
              Email Support Desk
            </a>
          </div>
        </section>

        {/* ── RIGHT COLUMN: Secure Login & Registration Console ── */}
        <section className="w-full lg:w-5/12 bg-white rounded-lg shadow-md border border-slate-300 overflow-hidden lg:sticky lg:top-6">
          
          {/* Mode Switcher Tabs */}
          <div className="bg-slate-100 border-b border-slate-300 p-1.5 flex gap-1">
            <button
              className={`flex-1 py-2.5 px-3 rounded font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 border-0 cursor-pointer ${
                consoleMode === 'login'
                  ? 'bg-[#003366] text-white shadow-sm'
                  : 'text-slate-700 hover:text-[#003366] hover:bg-white bg-transparent'
              }`}
              onClick={() => { setConsoleMode('login'); setErrorMessage(''); setSuccessMessage(''); }}
              type="button"
            >
              <span className="material-symbols-outlined text-base">login</span>
              <span>Officer Login • लॉगिन</span>
            </button>
            <button
              className={`flex-1 py-2.5 px-3 rounded font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 border-0 cursor-pointer ${
                consoleMode === 'reg'
                  ? 'bg-[#003366] text-white shadow-sm font-bold'
                  : 'text-slate-700 hover:text-[#003366] hover:bg-white bg-transparent'
              }`}
              onClick={() => { setConsoleMode('reg'); setErrorMessage(''); setSuccessMessage(''); }}
              type="button"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              <span>New Registration (Form T-1)</span>
            </button>
          </div>

          {/* Notification Banners */}
          {errorMessage && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2 font-medium">
              <span className="material-symbols-outlined text-base text-red-600">error</span>
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded flex items-center gap-2 font-medium">
              <span className="material-symbols-outlined text-base text-emerald-600">check_circle</span>
              <span>{successMessage}</span>
            </div>
          )}

          {/* TAB 1: LOGIN FORM */}
          {consoleMode === 'login' && (
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <h2 className="text-[#003366] font-bold text-base sm:text-lg m-0">Sign-In Security Console</h2>
                  <p className="text-slate-500 text-xs m-0">Enter credentials to access Zonal Railway possession module</p>
                </div>
                <span className="material-symbols-outlined text-[#003366] text-2xl">lock_person</span>
              </div>

              <div className="bg-amber-50 border border-amber-300 rounded p-3 text-xs text-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <strong className="block text-[#003366]">Demo Login • SIH Judge Access</strong>
                    <span className="block mt-1">Username: <code>judge.demo</code> · Password: <code>BandhanDemo2026!</code></span>
                    <span className="block mt-1 text-slate-600">Demo-only account for this prototype. Backend required.</span>
                  </div>
                  <button type="button" onClick={handleDemoLogin} disabled={isLoading} aria-busy={isLoading} className="shrink-0 bg-[#8f4e00] text-white px-3 py-2 rounded font-bold disabled:opacity-60">{isLoading ? 'Signing in...' : 'Demo Login'}</button>
                </div>
              </div>


              {/* Multi-Tier Authentication Switcher */}
              <div className="bg-slate-100 p-1 rounded border border-slate-200 flex gap-1 text-xs">
                <button
                  className={`flex-1 py-1.5 px-2 rounded border-0 cursor-pointer flex items-center justify-center gap-1 transition-all ${
                    authTier === 'hrms'
                      ? 'bg-white text-[#003366] font-bold shadow-sm'
                      : 'bg-transparent text-slate-600 hover:text-[#003366] font-medium'
                  }`}
                  onClick={() => setAuthTier('hrms')}
                  type="button"
                >
                  <span className="material-symbols-outlined text-sm">badge</span> HRMS / CRIS ID
                </button>
                <button
                  className={`flex-1 py-1.5 px-2 rounded border-0 cursor-pointer flex items-center justify-center gap-1 transition-all ${
                    authTier === 'dsc'
                      ? 'bg-white text-[#003366] font-bold shadow-sm'
                      : 'bg-transparent text-slate-600 hover:text-[#003366] font-medium'
                  }`}
                  onClick={() => setAuthTier('dsc')}
                  type="button"
                >
                  <span className="material-symbols-outlined text-sm">usb</span> DSC e-Token
                </button>
                <button
                  className={`flex-1 py-1.5 px-2 rounded border-0 cursor-pointer flex items-center justify-center gap-1 transition-all ${
                    authTier === 'parichay'
                      ? 'bg-white text-[#003366] font-bold shadow-sm'
                      : 'bg-transparent text-slate-600 hover:text-[#003366] font-medium'
                  }`}
                  onClick={() => setAuthTier('parichay')}
                  type="button"
                >
                  <span className="material-symbols-outlined text-sm">hub</span> Parichay SSO
                </button>
              </div>

              {/* Actual Form */}
              <form className="flex flex-col gap-4 m-0" onSubmit={handleAuthSubmit}>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-800" htmlFor="login-user-id">
                      {authTier === 'hrms' && 'Official Railway HRMS ID / CRIS Username'}
                      {authTier === 'dsc' && 'Connected SafeNet / eToken USB Serial'}
                      {authTier === 'parichay' && 'Parichay National SSO Identity (@gov.in)'}
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {authTier === 'hrms' && 'e.g., NR-DLI-9821'}
                      {authTier === 'dsc' && 'Auto-detect PKI'}
                      {authTier === 'parichay' && '@gov.in'}
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3 text-slate-400 text-lg pointer-events-none">
                      {authTier === 'hrms' ? 'badge' : authTier === 'dsc' ? 'usb' : 'hub'}
                    </span>
                    <input
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] font-medium"
                      id="login-user-id"
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder={
                        authTier === 'hrms'
                          ? 'Enter 6-char HRMS ID or username'
                          : authTier === 'dsc'
                          ? 'Reading PKI Hardware Token...'
                          : 'officer.username@gov.in'
                      }
                      required
                      type="text"
                      value={userId}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-800" htmlFor="login-password">
                      SSO Cryptographic Password / PIN
                    </label>
                    <button
                      className="text-[11px] text-[#003366] hover:underline font-semibold bg-transparent border-0 p-0 cursor-pointer"
                      onClick={openResetFlow}
                      type="button"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3 text-slate-400 text-lg pointer-events-none">lock</span>
                    <input
                      className="w-full pl-9 pr-10 py-2 bg-white border border-slate-300 rounded text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] font-medium"
                      id="login-password"
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password or token PIN"
                      required
                      type={showPass ? 'text' : 'password'}
                      value={password}
                    />
                    <button
                      className="absolute right-3 text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer flex items-center"
                      onClick={() => setShowPass(!showPass)}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-lg">
                        {showPass ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block mb-1" htmlFor="sel-dept">
                      Operational Department
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] font-medium"
                      id="sel-dept"
                      onChange={(e) => setDept(e.target.value)}
                      required
                      value={dept}
                    >
                      <option disabled value="">Select Cadre</option>
                      <option value="opt">Operating / Traffic (CPTM / DOM)</option>
                      <option value="pway">Civil Engineering (P-Way)</option>
                      <option value="trd">Electrical TRD (OHE Traction)</option>
                      <option value="snt">Signaling & Telecom (S&T)</option>
                      <option value="adm">CRIS System Administration</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-800 block mb-1" htmlFor="sel-zone">
                      Zonal Railway Command
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] font-medium"
                      id="sel-zone"
                      onChange={(e) => setZone(e.target.value)}
                      required
                      value={zone}
                    >
                      <option disabled value="">Select Zone</option>
                      <option value="NR">Northern Railway (NR - HQ Delhi)</option>
                      <option value="WR">Western Railway (WR - HQ Mumbai)</option>
                      <option value="NCR">North Central Railway (NCR - Prayagraj)</option>
                      <option value="CR">Central Railway (CR - CSMT Mumbai)</option>
                      <option value="ER">Eastern Railway (ER - Kolkata)</option>
                      <option value="SCR">South Central Railway (SCR - Secunderabad)</option>
                      <option value="SR">Southern Railway (SR - Chennai)</option>
                      <option value="RB">Railway Board Central Operations</option>
                    </select>
                  </div>
                </div>

                {/* CAPTCHA Box */}
                <div className="bg-slate-50 border border-slate-300 rounded p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-[#003366] text-white px-3 py-1.5 rounded font-mono font-bold tracking-widest text-base shadow-sm select-none">
                      <span>{captchaCode}</span>
                    </div>
                    <button
                      className="p-1 text-slate-600 hover:text-[#003366] bg-transparent border-0 cursor-pointer rounded flex items-center"
                      onClick={regenerateCaptcha}
                      title="Refresh Captcha"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-xl">refresh</span>
                    </button>
                    <button
                      className="p-1 text-slate-600 hover:text-[#003366] bg-transparent border-0 cursor-pointer rounded flex items-center"
                      onClick={playCaptchaAudio}
                      title="Audio Challenge"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-xl">volume_up</span>
                    </button>
                  </div>
                  <div className="flex-1 max-w-[140px]">
                    <input
                      className="w-full px-3 py-1.5 uppercase font-mono text-center bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                      id="captcha-input"
                      maxLength={6}
                      onChange={(e) => setCaptchaInput(e.target.value)}
                      placeholder="ENTER CAPTCHA"
                      required
                      type="text"
                      value={captchaInput}
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  className="w-full py-3 px-4 bg-[#003366] hover:bg-[#002244] active:bg-[#00142c] text-white rounded font-bold text-xs uppercase tracking-wider transition-colors shadow border-0 cursor-pointer flex items-center justify-center gap-2 mt-1 disabled:opacity-75 disabled:cursor-not-allowed"
                  disabled={isLoading}
                  id="btn-login-submit"
                  type="submit"
                >
                  {isLoading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-lg">sync</span>
                      <span>DISPATCHING 2FA OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>SECURE SSO LOGIN • सुरक्षित लॉगिन</span>
                      <span className="material-symbols-outlined text-lg">arrow_forward</span>
                    </>
                  )}
                </button>

                {/* Emergency Form E-102 Link */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 mt-2">
                  <button
                    className="text-[#990000] hover:underline font-bold flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer"
                    onClick={() => setIsEmergencyModalOpen(true)}
                    type="button"
                  >
                    <span className="material-symbols-outlined text-sm">emergency</span>
                    <span>Emergency Possession Clearance (Form E-102)</span>
                  </button>
                  <span className="text-slate-500 font-mono text-[10px]">SOP 2025</span>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: NEW OFFICER ONBOARDING / FORM T-1 */}
          {consoleMode === 'reg' && (
            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <h2 className="text-[#003366] font-bold text-base sm:text-lg m-0">Officer Onboarding (Form T-1)</h2>
                  <p className="text-slate-500 text-xs m-0">New Officer Enrollment & PKI DSC Key Registration</p>
                </div>
                <span className="material-symbols-outlined text-[#003366] text-2xl">how_to_reg</span>
              </div>
              <form className="flex flex-col gap-3 text-xs m-0" onSubmit={handleRegistrationSubmit}>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Employee 6-Character HRMS ID</label>
                  <input
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded uppercase text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] font-medium"
                    onChange={(e) => setRegHrms(e.target.value)}
                    placeholder="e.g., AB4921"
                    required
                    type="text"
                    value={regHrms}
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Official Railway / NIC Email</label>
                  <input
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366] font-medium"
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="officer.name@nic.in / @railnet.gov.in"
                    required
                    type="email"
                    value={regEmail}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">Zone Assignment</label>
                    <select
                      className="w-full px-2 py-2 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                      onChange={(e) => setRegZone(e.target.value)}
                      required
                      value={regZone}
                    >
                      <option value="">Choose Zone</option>
                      <option value="NR">Northern Railway</option>
                      <option value="WR">Western Railway</option>
                      <option value="CR">Central Railway</option>
                      <option value="NCR">North Central Railway</option>
                      <option value="SCR">South Central Railway</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">Division Section</label>
                    <input
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                      onChange={(e) => setRegDivision(e.target.value)}
                      placeholder="e.g., Delhi (DLI)"
                      required
                      type="text"
                      value={regDivision}
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Class-3 DSC Token Serial Number</label>
                  <input
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003366]"
                    onChange={(e) => setRegDscToken(e.target.value)}
                    placeholder="e.g., CCA-PKI-2025-0988"
                    required
                    type="text"
                    value={regDscToken}
                  />
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <input
                    checked={regUndertaking}
                    className="mt-0.5 rounded border-slate-300 text-[#003366] focus:ring-[#003366]"
                    id="chk-undertaking"
                    onChange={(e) => setRegUndertaking(e.target.checked)}
                    required
                    type="checkbox"
                  />
                  <label className="text-[11px] text-slate-600 leading-tight" htmlFor="chk-undertaking">
                    I certify that I am authorized under <strong>Indian Railway Service Conduct Rules</strong> to request track possessions.
                  </label>
                </div>
                <button
                  className="w-full mt-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold uppercase tracking-wider transition-colors shadow-sm border-0 cursor-pointer"
                  type="submit"
                >
                  Submit Dossier for Sr. DPO Audit
                </button>
              </form>
            </div>
          )}
        </section>
      </main>

      {/* ═══ GIGW Statutory Legal & Compliance Footer ═══ */}
      <footer className="w-full bg-[#1a2332] border-t border-slate-700 text-slate-300 text-xs py-6 px-4 mt-auto">
        <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 text-[11px]">
            <a className="hover:text-white transition-colors text-slate-300 no-underline" href="#!">Website Policies</a>
            <span>•</span>
            <a className="hover:text-white transition-colors text-slate-300 no-underline" href="#!">Hyperlinking Policy</a>
            <span>•</span>
            <a className="hover:text-white transition-colors text-slate-300 no-underline" href="#!">Copyright Policy</a>
            <span>•</span>
            <a className="hover:text-white transition-colors text-slate-300 no-underline" href="#!">Terms of Information Security</a>
            <span>•</span>
            <a className="hover:text-white transition-colors text-slate-300 no-underline" href="#!">Help & Documentation</a>
          </div>
          <div className="text-[11px] text-center md:text-right text-slate-400">
            Designed & Maintained by <span className="text-white font-semibold">Centre for Railway Information Systems (CRIS)</span>, New Delhi • Hosted on <span className="text-white font-semibold">NIC Gov Cloud</span>
          </div>
        </div>
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-700/60 pt-3 mt-3 text-[10px] text-slate-400">
          <div>
            © 2025 Ministry of Railways, Government of India. All rights reserved. Sovereign Access Protected under Section 66F IT Act.
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <span className="material-symbols-outlined text-[13px]">verified</span> GIGW / CERT-In Compliant v2.4
            </span>
            <span>•</span>
            <span>Best viewed in Edge / Chrome 100+ (1920x1080)</span>
          </div>
        </div>
      </footer>

      {/* ═══ Emergency Dispatch Possession Modal (Form E-102) ═══ */}
      {isEmergencyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-lg shadow-xl p-6 border-t-4 border-[#990000] relative flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 text-[#990000]">
                <span className="material-symbols-outlined text-2xl">warning</span>
                <h3 className="font-bold text-base sm:text-lg m-0">Form E-102 Emergency Dispatch Override</h3>
              </div>
              <button
                className="text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer p-1"
                onClick={() => setIsEmergencyModalOpen(false)}
                type="button"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed m-0">
              Form E-102 emergency bypass is strictly restricted for severe safety perils (rail fractures, TRD overhead cable snaps, landslides). Every bypass invocation issues an automated red priority signal telegram to the <strong>Principal Chief Operations Manager (PCOM)</strong>.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 flex flex-col gap-2">
              <label className="text-xs font-bold text-amber-900 block" htmlFor="sm-code">
                Station Master / Section Controller Authorization Token
              </label>
              <input
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded text-xs focus:ring-2 focus:ring-[#990000] font-mono outline-none"
                id="sm-code"
                onChange={(e) => setEmergencyToken(e.target.value)}
                placeholder="Enter 8-digit Emergency Authorization Token"
                type="password"
                value={emergencyToken}
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded bg-transparent border-0 cursor-pointer"
                onClick={() => setIsEmergencyModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-xs font-bold bg-[#990000] hover:bg-red-800 text-white rounded uppercase tracking-wider border-0 cursor-pointer shadow-sm"
                onClick={submitEmergencyBypass}
                type="button"
              >
                Transmit Emergency Form E-102
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
