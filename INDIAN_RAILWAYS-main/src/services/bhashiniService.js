/**
 * bhashiniService.js — Digital India Bhashini (भाषिणी) Translation & Sovereign NMT Service
 * National Language Translation Mission (NLTM), MeitY, Govt. of India
 *
 * Provides bilingual (English <-> Hindi / Regional) translation with specialized
 * Indian Railways (CRIS / Rajbhasha) domain terminology mapping.
 */

// Sovereign Indian Railways Rajbhasha Lexicon for high-precision railway domain translation
export const RAILWAY_LEXICON = {
  // Key nouns & concepts
  "block": "अनुरक्षण ब्लॉक (Maintenance Block)",
  "blocks": "अनुरक्षण ब्लॉक",
  "maintenance": "अनुरक्षण (रखरखाव)",
  "possession": "ट्रैक कब्जा (Track Possession)",
  "section": "रेल खंड (Section)",
  "sections": "रेल खंडों",
  "window": "समय स्लॉट (Window)",
  "feasible window": "व्यवहार्य समय स्लॉट (Feasible Window)",
  "next feasible window": "अगला व्यवहार्य समय स्लॉट",
  "train": "रेलगाड़ी",
  "trains": "गाड़ियों",
  "freight": "मालगाड़ी (Freight)",
  "passenger": "यात्री गाड़ी (Passenger)",
  "detention": "गाड़ी विलंबन (Detention)",
  "delay": "विलंब (Delay)",
  "punctuality": "समयपालन (Punctuality)",
  "schedule": "समय-सारणी (Schedule)",
  "timetable": "मास्टर समय-सारणी (Timetable)",
  "conflict": "समय टकराव (Conflict)",
  "conflicts": "समय टकराव",
  "impact": "परिचालन प्रभाव (Operational Impact)",
  "rejection": "अस्वीकृति",
  "rejected": "अस्वीकृत (योजना से बाहर)",
  "shift": "समय स्थानांतरण (Shift)",
  "shifted": "स्थानांतरित",
  "constraint": "परिचालन बाधा (Constraint)",
  "department": "संबंधित विभाग",
  "departments": "विभाग",
  "civil engineering": "सिविल इंजीनियरिंग (इंजीनियरिंग)",
  "engineering": "सिविल इंजीनियरिंग",
  "traction": "कर्षण विभाग (TRD / Traction)",
  "trd": "कर्षण विभाग (TRD)",
  "s&t": "सिग्नल एवं दूरसंचार (S&T)",
  "signal": "सिग्नल विभाग",
  "operating": "परिचालन विभाग (Operating)",
  "traffic": "रेल यातायात (Traffic)",
  "recommendation": "परिचालन सिफारिश (Recommendation)",
  "evidence": "परिचालन साक्ष्य (Evidence)",
  "freeze window": "24-घंटे फ्रीज विंडो",
  "dynamic risk index": "गतिशील जोखिम सूचकांक (DRI)",
  "dri": "गतिशील जोखिम सूचकांक (DRI)",
  "virtual train": "आभासी रेलगाड़ी (Virtual Train)",
  "shadow block": "छाया ब्लॉक (Shadow Block)",
  "corridor": "रेल गलियारा (Corridor)",
  "optimization": "समय-सारणी अनुकूलन (Optimization)",
  "optimized": "अनुकूलित (Optimized)",
  "optimizer": "अनुकूलन सॉल्वर (Optimizer)",
  "solver": "सीपी-सैट/एएलएनएस सॉल्वर इंजन",
  "gap-fit": "स्लॉट अंतराल अनुकूलता (Gap-Fit)",
  "overdue": "अतिदेय दिन (Overdue Days)",
  "severity": "गंभीरता श्रेणी (Severity Grade)",
  "priority": "प्राथमिकता स्कोर (Priority Score)",
};

// Hindi numerals to standard conversion helpers
export const DAY_MAP = {
  "mon": "सोमवार",
  "tue": "मंगलवार",
  "wed": "बुधवार",
  "thu": "गुरुवार",
  "fri": "शुक्रवार",
  "sat": "शनिवार",
  "sun": "रविवार",
  "monday": "सोमवार",
  "tuesday": "मंगलवार",
  "wednesday": "बुधवार",
  "thursday": "गुरुवार",
  "friday": "शुक्रवार",
  "saturday": "शनिवार",
  "sunday": "रविवार",
};

/**
 * Translates English text to Hindi with Indian Railways domain precision.
 * Falls back to Bhashini Cloud API if BHASHINI_API_KEY is configured.
 */
export async function translateViaBhashini(text, sourceLang = "en", targetLang = "hi") {
  if (!text) return "";
  if (sourceLang === targetLang) return text;

  // Try Bhashini HTTP API if available in environment or window config
  const apiKey = (typeof window !== "undefined" && window.__BHASHINI_API_KEY__) || null;
  if (apiKey) {
    try {
      const response = await fetch("https://dhruva-api.bhashini.gov.in/services/inference/pipeline", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": apiKey,
        },
        body: JSON.stringify({
          pipelineTasks: [{
            taskType: "translation",
            config: {
              language: {
                sourceLanguage: sourceLang,
                targetLanguage: targetLang,
              }
            }
          }],
          inputData: {
            input: [{ source: text }]
          }
        }),
      });
      if (response.ok) {
        const json = await response.json();
        const translated = json?.pipelineResponse?.[0]?.output?.[0]?.target;
        if (translated) return translated;
      }
    } catch {
      // Fall through to sovereign domain translation engine
    }
  }

  // Sovereign Indian Railways Domain Translation Engine (Offline / Airgapped Standard)
  return sovereignRailwayTranslate(text, targetLang);
}

/**
 * Sovereign Domain Translator conforming to Ministry of Railways Rajbhasha Standards
 */
export function sovereignRailwayTranslate(text, targetLang = "hi") {
  if (!text || targetLang !== "hi") return text || "";

  let out = text;

  // 1. Rejection reason patterns
  if (out.includes("was not placed in the 7-day plan")) {
    out = out.replace(/Block \*\*([^*]+)\*\* was not placed in the 7-day plan on section ([^.]+)\. Next feasible window: ([^.]+)\./i,
      "ब्लॉक **$1** को रेल खंड $2 पर 7-दिवसीय योजना में शामिल नहीं किया गया। अगला व्यवहार्य समय स्लॉट: $3.");
  } else if (out.includes("had its shift rejected")) {
    out = out.replace(/Block \*\*([^*]+)\*\* had its shift rejected on section ([^.]+)\. Next feasible window: ([^.]+)\./i,
      "ब्लॉक **$1** का समय स्थानांतरण खंड $2 पर अस्वीकृत हुआ। अगला व्यवहार्य समय स्लॉट: $3.");
  } else if (out.includes("Nearest feasible window for")) {
    out = out.replace(/Nearest feasible window for block \*\*([^*]+)\*\*: \*\*([^*]+)\*\* \(([^)]+)\)\./i,
      "ब्लॉक **$1** के लिए निकटतम व्यवहार्य समय स्लॉट: **$2** ($3).");
    out = out.replace(/Nearest feasible window for section \*\*([^*]+)\*\*: \*\*([^*]+)\*\* \(([^)]+)\)\./i,
      "रेल खंड **$1** के लिए निकटतम व्यवहार्य समय स्लॉट: **$2** ($3).");
  } else if (out.includes("WHAT-IF: shifting block")) {
    out = out.replace(/WHAT-IF: shifting block \*\*([^*]+)\*\* by \*\*([^*]+)\*\*\. (.*)/i,
      "व्हाट-इफ सिमुलेशन: ब्लॉक **$1** को **$2** समय स्थानांतरित करना। $3");
  } else if (out.includes("context:")) {
    out = out.replace(/Section \*\*([^*]+)\*\* context: (\d+) trains, (\d+) maintenance blocks scheduled\./i,
      "रेल खंड **$1** विवरण: $2 गाड़ियां, $3 अनुरक्षण ब्लॉक निर्धारित हैं।");
  }

  // 2. Schedule Optimization Patterns
  if (out.includes("Schedule Optimization")) {
    out = out.replace(/Schedule Optimization: BANDHAN ([^.]+)\. (.*)/i,
      "समय-सारणी अनुकूलन: बंधन $1। $2");
  }
  out = out.replace(/Optimization complete!/gi, "समय-सारणी अनुकूलन सफलतापूर्वक पूर्ण!");
  out = out.replace(/ALNS \/ CP-SAT Solver evaluated/gi, "एएलएनएस / सीपी-सैट सॉल्वर द्वारा मूल्यांकन");
  out = out.replace(/Saved ([\d.]+) min avg train delay/gi, "औसत गाड़ी विलंब में $1 मिनट की बचत");
  out = out.replace(/Resolved ([\d.]+) conflicting blocks/gi, "$1 विरोधी ब्लॉकों का सफलतापूर्वक समाधान");
  out = out.replace(/Corridor availability increased to ([\d.]+)%/gi, "रेल गलियारे की उपलब्धता बढ़कर $1% हुई");

  // 3. Verdict / Recommendation standard patterns
  out = out.replace(/Feasible — low traffic impact window verified\./gi,
    "व्यवहार्य (Feasible) — कम यातायात प्रभाव वाला विंडो सत्यापित।");
  out = out.replace(/Feasible — no trains in shifted window\./gi,
    "व्यवहार्य — स्थानांतरित विंडो में कोई गाड़ी टकराव नहीं।");
  out = out.replace(/Shift approved — no conflicts at shifted window\./gi,
    "स्थानांतरण स्वीकृत — नए समय स्लॉट में कोई परिचालन टकराव नहीं।");
  out = out.replace(/Not recommended — high traffic daytime window causes (\d+(?:\.\d+)?) min delay\./gi,
    "असंस्तुत (Not Recommended) — व्यस्त दिन के समय $1 मिनट गाड़ी विलंबन होगा।");
  out = out.replace(/Not recommended — (\d+) train\(s\) conflict at shifted window, delay increases (\d+(?:\.\d+)?) → (\d+(?:\.\d+)?) min\./gi,
    "असंस्तुत — स्थानांतरित समय में $1 गाड़ी टकराव, विलंब $2 से बढ़कर $3 मिनट हो जाएगा।");
  out = out.replace(/Move block to ([^.]+)\. Predicted impact: ([^—]+)— (.*)/gi,
    "ब्लॉक को $1 पर स्थानांतरित करें। अनुमानित प्रभाव: $2 — $3");
  out = out.replace(/low-traffic window\./gi, "निम्न-यातायात समय स्लॉट।");
  out = out.replace(/moderate-traffic window, confirm with Control Room\./gi, "मध्यम-यातायात समय स्लॉट, नियंत्रण कक्ष से पुष्टि करें।");
  out = out.replace(/No free window found in 7-day horizon — escalate for manual scheduling\./gi, "7-दिवसीय क्षितिज में कोई खाली विंडो उपलब्ध नहीं — मैन्युअल शेड्यूलिंग हेतु प्रेषित करें।");
  out = out.replace(/No feasible window in 7-day horizon\./gi, "7-दिवसीय क्षितिज में कोई व्यवहार्य समय स्लॉट उपलब्ध नहीं।");
  out = out.replace(/Feasible — schedule at ([^.]+)\. Expected impact: ([^.]+)\./gi,
    "व्यवहार्य — $1 पर शेड्यूल करें। अनुमानित प्रभाव: $2.");

  // 4. Freeze Lock & Safety Patterns
  out = out.replace(/Inside 24-hour freeze window/gi, "24-घंटे फ्रीज विंडो के अंतर्गत");
  out = out.replace(/Emergency override granted \(DRI >= 0.85\)/gi, "आपातकालीन ओवरराइड स्वीकृत (DRI ≥ 0.85)");
  out = out.replace(/Override blocked \(DRI < 0.85\)/gi, "ओवरराइड अवरुद्ध (DRI < 0.85)");
  out = out.replace(/Safety critical defect requires immediate possession/gi, "सुरक्षा-महत्वपूर्ण दोष हेतु तत्काल ट्रैक कब्जे की आवश्यकता");

  // 5. Day names in English to Hindi
  Object.keys(DAY_MAP).forEach((d) => {
    const regex = new RegExp(`\\b${d}\\b`, "gi");
    out = out.replace(regex, DAY_MAP[d]);
  });

  return out;
}

/**
 * Formats a bilingual evidence line: English descriptor alongside official Rajbhasha Hindi.
 */
export function formatBilingualEvidence(englishLine) {
  if (!englishLine) return { en: "", hi: "" };

  const line = String(englishLine);

  if (line.startsWith("Constraint fired:")) {
    const val = line.replace("Constraint fired:", "").trim();
    return {
      en: line,
      hi: `लागू परिचालन बाधा (Constraint): ${val.replace(/`/g, "")}`,
    };
  }
  if (line.startsWith("Trains occupying section:")) {
    const val = line.replace("Trains occupying section:", "").trim();
    return {
      en: line,
      hi: `खंड पर उपस्थित रेलगाड़ियां (Trains): ${val === "none recorded" || val === "none" ? "कोई नहीं" : val}`,
    };
  }
  if (line.startsWith("Department:")) {
    const val = line.replace("Department:", "").trim();
    const deptHi = RAILWAY_LEXICON[val.toLowerCase()] || val;
    return {
      en: line,
      hi: `संबंधित विभाग (Department): ${deptHi}`,
    };
  }
  if (line.startsWith("Next feasible window:")) {
    const val = line.replace("Next feasible window:", "").trim();
    return {
      en: line,
      hi: `अगला व्यवहार्य समय स्लॉट (Next Window): ${sovereignRailwayTranslate(val)}`,
    };
  }
  if (line.startsWith("Predicted train impact at next window:")) {
    const val = line.replace("Predicted train impact at next window:", "").trim();
    return {
      en: line,
      hi: `अगले विंडो पर अनुमानित गाड़ी प्रभाव: ${val.replace(/min/g, "मिनट")}`,
    };
  }
  if (line.startsWith("Conflicts:")) {
    const val = line.replace("Conflicts:", "").trim();
    return {
      en: line,
      hi: `परिचालन टकराव (Conflicts): ${val}`,
    };
  }
  if (line.startsWith("Avg train delay:")) {
    const val = line.replace("Avg train delay:", "").trim();
    return {
      en: line,
      hi: `औसत गाड़ी विलंब (Avg Delay): ${val.replace(/min/g, "मिनट")}`,
    };
  }
  if (line.startsWith("Feasibility:")) {
    const val = line.replace("Feasibility:", "").trim();
    return {
      en: line,
      hi: `व्यवहार्यता (Feasibility): ${val.includes("Feasible") && !val.includes("Not") ? "✓ व्यवहार्य (स्वीकार्य)" : "✗ अव्यवहार्य (अस्वीकार्य)"}`,
    };
  }
  if (line.startsWith("Section:")) {
    return {
      en: line,
      hi: `रेल खंड विवरण: ${line}`,
    };
  }
  if (line.startsWith("Duration needed:")) {
    const val = line.replace("Duration needed:", "").trim();
    return {
      en: line,
      hi: `आवश्यक समयावधि: ${val.replace(/h/g, " घंटे")}`,
    };
  }
  if (line.startsWith("Original window:")) {
    const val = line.replace("Original window:", "").trim();
    return {
      en: line,
      hi: `मूल समय स्लॉट (Original Window): ${sovereignRailwayTranslate(val)}`,
    };
  }
  if (line.startsWith("Shifted window:")) {
    const val = line.replace("Shifted window:", "").trim();
    return {
      en: line,
      hi: `स्थानांतरित समय स्लॉट (Shifted Window): ${sovereignRailwayTranslate(val)}`,
    };
  }
  if (line.startsWith("Solver:")) {
    const val = line.replace("Solver:", "").trim();
    return {
      en: line,
      hi: `अनुकूलन सॉल्वर (Solver Engine): ${val}`,
    };
  }
  if (line.startsWith("Delay reduction:")) {
    const val = line.replace("Delay reduction:", "").trim();
    return {
      en: line,
      hi: `गाड़ी विलंबन में कमी: ${val}`,
    };
  }
  if (line.startsWith("Possessions used:")) {
    const val = line.replace("Possessions used:", "").trim();
    return {
      en: line,
      hi: `उपयोग किए गए ब्लॉक (Possessions): ${val}`,
    };
  }
  if (line.startsWith("Gap-fit quality:")) {
    const val = line.replace("Gap-fit quality:", "").trim();
    return {
      en: line,
      hi: `स्लॉट अंतराल अनुकूलता (Gap-Fit Quality): ${val}`,
    };
  }

  return {
    en: line,
    hi: sovereignRailwayTranslate(line),
  };
}

/**
 * Text-to-Speech (TTS) Voice Announcer via Web Speech API (Bhashini voice emulation)
 */
export function speakBhashiniVoice(text, lang = "hi-IN") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();
    // Clean markdown bold, code tags, and bullets
    const cleanText = text
      .replace(/[*`_#]/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 0.95;

    // Pick optimal Hindi or Indian English voice if available
    const voices = window.speechSynthesis.getVoices();
    if (lang.startsWith("hi")) {
      const hiVoice = voices.find(
        (v) =>
          v.lang.includes("hi") ||
          v.name.toLowerCase().includes("hindi") ||
          v.name.toLowerCase().includes("india")
      );
      if (hiVoice) utterance.voice = hiVoice;
    } else {
      const enVoice = voices.find(
        (v) => v.lang.includes("en-IN") || v.lang.includes("en-GB")
      );
      if (enVoice) utterance.voice = enVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Bhashini TTS not supported or blocked:", err);
  }
}

/**
 * Speech-to-Text (ASR) Voice Dictation via Web Speech API
 */
export function createBhashiniRecognizer(onResult, onError, onEnd, lang = "hi-IN") {
  if (typeof window === "undefined") return null;

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = lang;

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      onResult(transcript);
    };
    recognition.onerror = (e) => onError && onError(e.error);
    recognition.onend = () => onEnd && onEnd();

    return recognition;
  } catch {
    return null;
  }
}
