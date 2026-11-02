/* ============================================================
   Innsikt – mock datalag
   Alt her er eksempeldata (ikke sanntid). Når ekte API/database
   kobles på senere, er tanken at MOCK.companies[TICKER] erstattes
   av et kall som returnerer samme datastruktur.
   ============================================================ */

(function () {
  "use strict";

  // ---------- Småhjelpere ----------
  function fmtNOK(v) { return (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("nb-NO", { maximumFractionDigits: 2 }); }
  function fmtPct(v, d) { d = d === undefined ? 1 : d; return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d).replace(".", ",") + " %"; }
  function uid() { return Math.random().toString(36).slice(2, 10); }

  // ---------- Delt kildekategori-register ----------
  var SOURCE_CATEGORIES = [
    { id: "wire", name: "Nyhetsbyrå" },
    { id: "finpress", name: "Finansnyheter" },
    { id: "ir", name: "Selskapskilde (IR/pressemelding)" },
    { id: "exchange", name: "Børsmelding / regulatorisk" },
    { id: "social", name: "Sosiale medier" },
    { id: "registry", name: "Offentlig register" },
    { id: "industry", name: "Bransjekilde" },
    { id: "custom", name: "Egendefinert" }
  ];

  var AI_MODELS = [
    { id: "insight-r1", name: "Innsikt Reasoning R1", desc: "Best på dybdeanalyse av rapporter og guiding-endringer" },
    { id: "insight-fast", name: "Innsikt Fast", desc: "Rask klassifisering av nyhetsstrøm og relevans" },
    { id: "insight-explain", name: "Innsikt Explain", desc: "Optimalisert for begrunnede påvirkningsvurderinger" }
  ];

  var PROMPT_TASKS = [
    { id: "summarize", label: "Oppsummer artikkel", desc: "Lager en kort, nøytral oppsummering av en kilde eller artikkel." },
    { id: "relevance", label: "Vurder relevans", desc: "Avgjør hvor relevant en hendelse er for selskapet du overvåker." },
    { id: "impact", label: "Vurder mulig kurspåvirkning", desc: "Gir en påvirkningsscore fra −10 til +10 med begrunnelse." },
    { id: "caseChange", label: "Finn endringer i investeringscaset", desc: "Sjekker om hendelsen endrer bull/base/bear-case eller antakelser." },
    { id: "risk", label: "Oppdag risiko", desc: "Leter etter nye eller forsterkede risikofaktorer." },
    { id: "guidance", label: "Sammenlign med tidligere guiding", desc: "Sammenligner ny informasjon mot forrige guiding fra selskapet." },
    { id: "report", label: "Analyser rapport", desc: "Går gjennom kvartals- eller årsrapporter og trekker ut nøkkelpunkter." },
    { id: "caseAssess", label: "Vurder bull/base/bear-case", desc: "Vurderer hvilket scenario hendelsen trekker sannsynligheten mot." }
  ];

  var DEFAULT_PROMPTS = {
    summarize: "Oppsummer artikkelen i 2-3 nøytrale setninger. Fokuser på fakta, ikke synsing. Utelat generisk markedsprat uten selskapsspesifikk relevans.",
    relevance: "Vurder hvor relevant denne hendelsen er for selskapet på en skala fra 0 til 10. Vekt direkte selskapsspesifikke hendelser høyest (produksjon, guiding, ledelse, kontrakter). Vekt generelle markedsbevegelser lavest.",
    impact: "Vurder hendelsens sannsynlige påvirkning på aksjekursen på en skala fra −10 (svært negativ) til +10 (svært positiv). Begrunn vurderingen kort med henvisning til konkrete fakta i kilden, ikke generelt sentiment.",
    caseChange: "Sammenlign hendelsen med brukerens dokumenterte investeringscase (bull/base/bear, drivere, risikoer og antakelser). Angi om hendelsen styrker, svekker eller er nøytral for casen, og hvilken spesifikk antakelse den eventuelt berører.",
    risk: "Identifiser om hendelsen introduserer en ny risiko eller forsterker en eksisterende risiko i brukerens risikoliste. List opp berørte risikofaktorer eksplisitt.",
    guidance: "Sammenlign eventuelle tall, mål eller forventninger i kilden med selskapets sist kommuniserte guiding. Angi konkret hva som er endret (fra X til Y) dersom det finnes et avvik.",
    report: "Gå gjennom rapporten og trekk ut: omsetning, vekst, marginer, kontantstrøm, guiding for neste periode, og eventuelle vesentlige engangsposter. Fremhev avvik fra konsensus.",
    caseAssess: "Vurder om hendelsen trekker sannsynligheten mot bull-, base- eller bear-scenarioet i brukerens case, og forklar hvorfor med henvisning til konkrete drivere eller risikoer."
  };

  var DEFAULT_THRESHOLDS = { relevanceMin: 4, impactAlert: 6, impactCritical: 8 };

  var DEFAULT_SOURCES = [
    { id: uid(), name: "Reuters", category: "wire", trust: 5, priority: "Høy", on: true, custom: false, url: "https://www.reuters.com" },
    { id: uid(), name: "Bloomberg", category: "wire", trust: 5, priority: "Høy", on: true, custom: false, url: "https://www.bloomberg.com" },
    { id: uid(), name: "E24", category: "finpress", trust: 4, priority: "Middels", on: true, custom: false, url: "https://e24.no" },
    { id: uid(), name: "Dagens Næringsliv", category: "finpress", trust: 4, priority: "Middels", on: true, custom: false, url: "https://www.dn.no" },
    { id: uid(), name: "Finansavisen", category: "finpress", trust: 3, priority: "Middels", on: true, custom: false, url: "https://finansavisen.no" },
    { id: uid(), name: "Oslo Børs meldinger", category: "exchange", trust: 5, priority: "Høy", on: true, custom: false, url: "https://www.oslobors.no" },
    { id: uid(), name: "Finanstilsynet innsideregister", category: "registry", trust: 5, priority: "Høy", on: true, custom: false, url: "https://www.finanstilsynet.no" }
  ];

  var STRATEGIES = [
    { id: "growth", name: "Growth", desc: "Vekter omsetningsvekst, TAM-ekspansjon og estimatrevisjoner høyt. Verdsettelse tillegges mindre vekt.", weights: { revenueGrowth: 5, estimateRevisions: 5, margins: 2, valuation: 1, dividend: 0 } },
    { id: "value", name: "Value", desc: "Vekter lave multipler mot historikk/sektor, FCF yield og balanse høyt.", weights: { valuation: 5, fcfYield: 5, margins: 3, revenueGrowth: 1, dividend: 2 } },
    { id: "quality", name: "Quality", desc: "Vekter marginer, avkastning på kapital og lav gjeld høyt.", weights: { margins: 5, returnOnCapital: 5, debt: 4, revenueGrowth: 2, valuation: 2 } },
    { id: "dividend", name: "Dividend", desc: "Vekter utbytteyield, utdelingsgrad og stabilitet i kontantstrøm høyt.", weights: { dividend: 5, fcf: 4, debt: 3, revenueGrowth: 1, valuation: 2 } },
    { id: "momentum", name: "Momentum", desc: "Vekter kursutvikling, estimatrevisjoner og nyhetsmomentum høyt.", weights: { pricemomentum: 5, estimateRevisions: 4, newsFlow: 4, valuation: 1, dividend: 0 } },
    { id: "eventdriven", name: "Event-driven", desc: "Vekter kommende katalysatorer og hendelser (rapporter, kapitalmarkedsdager, rettssaker) høyt.", weights: { catalysts: 5, newsFlow: 4, guidance: 3, valuation: 1, dividend: 0 } },
    { id: "turnaround", name: "Turnaround", desc: "Vekter marginforbedring, gjeldsreduksjon og endring i guiding-retning høyt.", weights: { marginTrend: 5, debtTrend: 5, guidanceTrend: 4, valuation: 2, dividend: 0 } }
  ];

  // ---------- Selskapsdata ----------
  var companies = {};

  // ===================== EQUINOR (flaggskip – full dybde) =====================
  companies.EQNR = {
    ticker: "EQNR", name: "Equinor ASA", exchange: "Oslo Børs", sector: "Energi",
    color: "#0f766e", initials: "EQ",
    price: 342.50, changePct: 2.4, changeAbs: 8.05, currency: "NOK",
    marketCapText: "1 042 mrd kr", peRatio: 10.2, fwdPe: 9.4, evEbitda: 3.1, evEbit: 5.8, ps: 1.1, pb: 1.9, fcfYield: 9.8, divYield: 4.8,
    week52Low: 278, week52High: 378, volumeToday: "8,4M", sharesOutText: "3,04 mrd",
    analystTarget: { avg: 365, count: 16 },
    inPortfolio: true, watchSince: "12. jan 2026",
    thesisSummary: "Equinor er en lavkost oljeprodusent med sterk kontantstrøm og en voksende fornybarportefølje. Casen bygger på stabil produksjon fra Johan Sverdrup, disiplinert kapitalallokering og attraktiv direkteavkastning, med fornybarsatsingen som en langsiktig opsjon.",
    keyRisks: ["Oljeprisfall under 60 USD/fat svekker kontantstrøm og utbyttekapasitet", "Forsinkelser eller kostnadssprekk i fornybarprosjekter", "Strengere norsk petroleumsbeskatning eller CO2-avgift", "Politisk/regulatorisk risiko i internasjonale posisjoner"],
    keyDrivers: ["Fortsatt høy oljepris (75–85 USD/fat)", "Stabil eller økende produksjon fra Johan Sverdrup", "Fortsatt høy direkteavkastning via utbytte og tilbakekjøp", "Vellykket monetarisering av havvindprosjekter"],
    nextEvent: { date: "24. okt 2026", label: "Q3-rapport 2026" },
    lastReport: { date: "23. jul 2026", label: "Q2-rapport 2026", summary: "Justert resultat på 6,8 mrd USD, litt over konsensus (6,5 mrd USD). Produksjonen kom inn i tråd med guiding. Selskapet bekreftet uendret utbyttepolitikk og annonserte et nytt tilbakekjøpsprogram." },
    guidanceChange: { date: "23. jul 2026", direction: "flat", text: "Produksjonsguiding for 2026 uendret på ca. 2,05 mmboe/d. CAPEX-guiding uendret på 13 mrd USD." },
    insiderChange: { date: "15. sep 2026", text: "Konsernsjef og finansdirektør kjøpte til sammen ca. 3 700 aksjer siste 30 dager. Ingen salg fra konsernledelsen." },

    priceHistory: [318, 316, 320, 314, 317, 322, 319, 325, 321, 328, 324, 330, 327, 333, 329, 335, 331, 338, 334, 340, 337, 341, 336, 342.5],

    news: [
      { id: uid(), source: "E24", time: "2t siden", date: "2026-09-18", category: "Produksjon", headline: "Equinor finner mer olje enn ventet i Nordsjøen-brønn", aiSummary: "Equinor melder om et nytt funn i Nordsjøen med anslått 20–45 millioner fat oljeekvivalenter, betydelig over forhåndsestimatene fra brønnboringen.", impact: 8, impactLabel: "Høy positiv", rationale: "Funnet er større enn ventet og kan forlenge levetiden til eksisterende infrastruktur i området, noe som reduserer fremtidig utbyggingskostnad per fat.", caseAreas: ["Drivere", "Produksjon"], material: true, read: false, flagged: false, note: "" },
      { id: uid(), source: "Reuters", time: "5t siden", date: "2026-09-18", category: "Partnerskap", headline: "Equinor og Aker BP inngår samarbeid om nytt felt i Barentshavet", aiSummary: "Partnerskapet skal dele infrastruktur og redusere utbyggingskostnader, med forventet produksjonsstart fremskyndet med om lag ett år.", impact: 6, impactLabel: "Moderat positiv", rationale: "Lavere break-even og raskere produksjonsstart styrker kontantstrømprofilen på mellomlang sikt, men effekten er begrenset i absolutte tall.", caseAreas: ["Drivere"], material: true, read: false, flagged: false, note: "" },
      { id: uid(), source: "DN", time: "9t siden", date: "2026-09-18", category: "Regulatorisk", headline: "Regjeringen vurderer strengere CO2-avgift for sokkelen", aiSummary: "Et forslag om økt CO2-avgift for petroleumsvirksomhet er sendt på høring, med frist i november. Forslaget kan øke driftskostnadene på norsk sokkel.", impact: -6, impactLabel: "Moderat negativ", rationale: "En vesentlig avgiftsøkning vil presse marginer direkte, men forslaget er ikke vedtatt og kan endres i høringsrunden.", caseAreas: ["Risikoer", "Regulatorisk"], material: true, read: false, flagged: true, note: "" },
      { id: uid(), source: "Bloomberg", time: "1d siden", date: "2026-09-17", category: "Ledelse", headline: "Ny finansdirektør tiltrer i konsernledelsen fra januar", aiSummary: "Skiftet kommer som del av en planlagt lederrokade og er varslet av styret for flere måneder siden.", impact: 1, impactLabel: "Nøytral", rationale: "Planlagt og varslet endring uten indikasjon på strategiskifte. Lav direkte kurspåvirkning forventet.", caseAreas: [], material: false, read: true, flagged: false, note: "" },
      { id: uid(), source: "Finansavisen", time: "1d siden", date: "2026-09-17", category: "Analyse", headline: "Analytiker nedjusterer kursmål på svakere gasspriser", aiSummary: "Kursmålet justeres ned fra 410 til 390 kroner som følge av lavere forventede gasspriser i Europa, men kjøpsanbefalingen opprettholdes.", impact: -3, impactLabel: "Svak negativ", rationale: "Endringen er analytikerdrevet og reflekterer allerede kjent markedsinformasjon om gasspriser, ikke ny selskapsspesifikk informasjon.", caseAreas: ["Drivere"], material: false, read: false, flagged: false, note: "" },
      { id: uid(), source: "Oslo Børs meldinger", time: "2d siden", date: "2026-09-16", category: "Utbytte", headline: "Equinor bekrefter uendret utbyttepolitikk for 2026", aiSummary: "Styret bekrefter at kvartalsvis basisutbytte holdes uendret, og at tilbakekjøpsprogrammet videreføres som planlagt.", impact: 2, impactLabel: "Svak positiv", rationale: "Bekreftelse av eksisterende politikk uten overraskelser, men understøtter direkteavkastnings-tesen.", caseAreas: ["Drivere"], material: false, read: true, flagged: false, note: "" },
      { id: uid(), source: "Reuters", time: "3d siden", date: "2026-09-15", category: "Produksjon", headline: "Johan Sverdrup-feltet produserer over platånivå", aiSummary: "Feltet produserer for tiden over teknisk platånivå takket være høy brønntilgjengelighet, ifølge operatøren.", impact: 5, impactLabel: "Moderat positiv", rationale: "Høyere produksjon fra selskapets viktigste felt understøtter kontantstrømmen i inneværende kvartal direkte.", caseAreas: ["Drivere", "Produksjon"], material: true, read: true, flagged: false, note: "" },
      { id: uid(), source: "E24", time: "4d siden", date: "2026-09-14", category: "Fornybar", headline: "Forsinkelse i havvindprosjekt i Storbritannia", aiSummary: "Equinor melder om en forsinkelse på seks måneder i et havvindprosjekt grunnet leveranseproblemer hos en underleverandør.", impact: -4, impactLabel: "Svak negativ", rationale: "Forsinkelsen påvirker fornybarsegmentet, som i dag utgjør en liten andel av kontantstrømmen, men er en påminnelse om utførelsesrisiko.", caseAreas: ["Risikoer"], material: true, read: false, flagged: false, note: "" }
    ],

    financials: {
      unit: "mrd USD",
      annual: [
        { period: "2022", revenue: 129.6, revenueGrowth: 61.1, ebitda: 76.1, ebit: 62.1, netIncome: 28.7, eps: 9.53, grossMargin: 58.7, opMargin: 47.9, fcf: 26.4, capex: 10.1, debt: 24.5, netDebt: -6.2, cash: 30.7, sharesOutText: "3,10 mrd" },
        { period: "2023", revenue: 94.0, revenueGrowth: -27.5, ebitda: 47.9, ebit: 33.4, netIncome: 14.9, eps: 5.20, grossMargin: 51.0, opMargin: 35.5, fcf: 15.8, capex: 11.0, debt: 25.9, netDebt: -3.1, cash: 29.0, sharesOutText: "3,08 mrd" },
        { period: "2024", revenue: 96.9, revenueGrowth: 3.1, ebitda: 49.5, ebit: 34.8, netIncome: 15.8, eps: 5.58, grossMargin: 51.6, opMargin: 35.9, fcf: 17.1, capex: 11.6, debt: 26.4, netDebt: -1.8, cash: 28.2, sharesOutText: "3,06 mrd" },
        { period: "2025", revenue: 101.2, revenueGrowth: 4.4, ebitda: 52.6, ebit: 36.9, netIncome: 16.9, eps: 5.94, grossMargin: 52.0, opMargin: 36.5, fcf: 18.0, capex: 12.4, debt: 27.1, netDebt: 0.4, cash: 26.7, sharesOutText: "3,05 mrd" },
        { period: "2026E", revenue: 104.8, revenueGrowth: 3.6, ebitda: 54.9, ebit: 38.4, netIncome: 17.8, eps: 6.31, grossMargin: 52.4, opMargin: 36.6, fcf: 18.9, capex: 13.0, debt: 27.5, netDebt: 1.1, cash: 26.4, sharesOutText: "3,04 mrd" }
      ],
      quarterly: [
        { period: "Q3 24", revenue: 24.1, revenueGrowth: 2.0, ebitda: 12.3, ebit: 8.6, netIncome: 3.9, eps: 1.38, grossMargin: 51.0, opMargin: 35.7, fcf: 4.2, capex: 2.9, debt: 26.6, netDebt: -1.4, cash: 28.0, sharesOutText: "3,07 mrd" },
        { period: "Q4 24", revenue: 25.0, revenueGrowth: 2.7, ebitda: 12.9, ebit: 9.0, netIncome: 4.1, eps: 1.45, grossMargin: 51.6, opMargin: 36.0, fcf: 4.6, capex: 3.1, debt: 26.4, netDebt: -1.8, cash: 28.2, sharesOutText: "3,06 mrd" },
        { period: "Q1 25", revenue: 24.6, revenueGrowth: 3.4, ebitda: 12.7, ebit: 8.9, netIncome: 4.0, eps: 1.42, grossMargin: 51.6, opMargin: 36.2, fcf: 4.1, capex: 3.0, debt: 26.8, netDebt: -1.1, cash: 27.9, sharesOutText: "3,06 mrd" },
        { period: "Q2 25", revenue: 25.5, revenueGrowth: 4.1, ebitda: 13.2, ebit: 9.3, netIncome: 4.2, eps: 1.49, grossMargin: 51.8, opMargin: 36.5, fcf: 4.4, capex: 3.1, debt: 27.0, netDebt: -0.4, cash: 27.4, sharesOutText: "3,05 mrd" },
        { period: "Q3 25", revenue: 25.9, revenueGrowth: 7.5, ebitda: 13.5, ebit: 9.5, netIncome: 4.3, eps: 1.52, grossMargin: 52.1, opMargin: 36.7, fcf: 4.6, capex: 3.2, debt: 27.1, netDebt: 0.0, cash: 27.1, sharesOutText: "3,05 mrd" },
        { period: "Q4 25", revenue: 25.2, revenueGrowth: 0.8, ebitda: 13.4, ebit: 9.4, netIncome: 4.4, eps: 1.56, grossMargin: 53.2, opMargin: 37.3, fcf: 4.9, capex: 3.1, debt: 27.1, netDebt: 0.4, cash: 26.7, sharesOutText: "3,05 mrd" },
        { period: "Q1 26", revenue: 25.9, revenueGrowth: 5.3, ebitda: 13.6, ebit: 9.5, netIncome: 4.4, eps: 1.56, grossMargin: 52.5, opMargin: 36.7, fcf: 4.6, capex: 3.2, debt: 27.3, netDebt: 0.7, cash: 26.6, sharesOutText: "3,04 mrd" },
        { period: "Q2 26", revenue: 26.4, revenueGrowth: 3.5, ebitda: 13.9, ebit: 9.7, netIncome: 4.5, eps: 1.60, grossMargin: 52.7, opMargin: 36.7, fcf: 4.8, capex: 3.3, debt: 27.5, netDebt: 1.1, cash: 26.4, sharesOutText: "3,04 mrd" }
      ]
    },

    valuationHistory: [
      { period: "2022", pe: 6.1, fwdPe: 7.0, evEbitda: 2.4, evEbit: 3.0, ps: 0.9, pb: 1.6, fcfYield: 15.2, divYield: 6.8 },
      { period: "2023", pe: 9.8, fwdPe: 9.1, evEbitda: 3.4, evEbit: 4.9, ps: 1.2, pb: 1.7, fcfYield: 10.4, divYield: 5.9 },
      { period: "2024", pe: 10.6, fwdPe: 9.8, evEbitda: 3.6, evEbit: 5.1, ps: 1.15, pb: 1.85, fcfYield: 9.9, divYield: 5.3 },
      { period: "2025", pe: 10.4, fwdPe: 9.6, evEbitda: 3.3, evEbit: 5.5, ps: 1.12, pb: 1.88, fcfYield: 9.9, divYield: 5.0 },
      { period: "2026 (nå)", pe: 10.2, fwdPe: 9.4, evEbitda: 3.1, evEbit: 5.8, ps: 1.1, pb: 1.9, fcfYield: 9.8, divYield: 4.8 }
    ],

    estimates: {
      consensusRevenue: 104.8, consensusRevenuePrior: 106.5,
      consensusEps: 6.31, consensusEpsPrior: 6.55,
      consensusEbitda: 54.9, consensusEbitdaPrior: 56.1,
      revisionTrend: [6.60, 6.58, 6.52, 6.47, 6.41, 6.38, 6.34, 6.31],
      guidanceGoals: [
        {
          id: uid(), title: "Produksjonsguiding 2026", status: "venter",
          conclusion: "Produksjonsmålet ble hevet i februar og har stått uendret siden. Foreløpig ingen tegn til avvik – fasit kommer med årsrapporten i februar 2027.",
          updates: [
            { date: "23. jul 2026", text: "Guiding holdt uendret på ca. 2,05 mmboe/d.", direction: "flat" },
            { date: "6. feb 2026", text: "Guiding satt til ca. 2,05 mmboe/d, opp fra foreløpig plan på 2,0 mmboe/d.", direction: "up" }
          ],
          news: [
            { date: "6. feb 2026", source: "Reuters", headline: "Equinor hever produksjonsguiding for 2026" },
            { date: "23. jul 2026", source: "E24", headline: "Equinor bekrefter produksjonsmål på kapitalmarkedsdag" }
          ]
        },
        {
          id: uid(), title: "CAPEX-guiding 2026", status: "venter",
          conclusion: "Investeringsbudsjettet ble hevet i april grunnet fremskyndede prosjekter, og har stått uendret siden. Høyere capex kan bety mer fremtidig produksjon, men også lavere kontantstrøm på kort sikt.",
          updates: [
            { date: "23. jul 2026", text: "Guiding holdt uendret på 13,0 mrd USD.", direction: "flat" },
            { date: "24. apr 2026", text: "Guiding hevet fra 12,5 til 13,0 mrd USD grunnet fremskyndede prosjekter.", direction: "up" }
          ],
          news: [
            { date: "24. apr 2026", source: "Dagens Næringsliv", headline: "Equinor øker investeringsbudsjettet for 2026" }
          ]
        },
        {
          id: uid(), title: "Produksjonsguiding 2025", status: "nådd",
          conclusion: "Equinor leverte 2,01 mmboe/d i 2025, i tråd med guidingen som ble satt i februar samme år. Målet ble nådd uten justeringer underveis.",
          updates: [
            { date: "5. feb 2025", text: "Guiding satt til ca. 2,0 mmboe/d.", direction: "flat" }
          ],
          news: [
            { date: "5. feb 2025", source: "Reuters", headline: "Equinor legger frem produksjonsmål for 2025" },
            { date: "5. feb 2026", source: "E24", headline: "Equinor leverer produksjon i tråd med guiding i årsrapporten" }
          ]
        }
      ],
      quarterlyBeats: [
        { period: "Q3 25", estRevenue: 25.2, actRevenue: 25.9, estEps: 1.44, actEps: 1.52, result: "beat" },
        { period: "Q4 25", estRevenue: 25.6, actRevenue: 25.2, estEps: 1.58, actEps: 1.56, result: "miss" },
        { period: "Q1 26", estRevenue: 25.3, actRevenue: 25.9, estEps: 1.49, actEps: 1.56, result: "beat" },
        { period: "Q2 26", estRevenue: 26.0, actRevenue: 26.4, estEps: 1.55, actEps: 1.60, result: "beat" }
      ]
    },

    events: [
      { id: uid(), date: "2026-10-24", type: "Rapport", title: "Q3-rapport 2026", description: "Kvartalsrapport og resultatpresentasjon.", source: "auto" },
      { id: uid(), date: "2026-11-05", type: "Utbytte", title: "Ex-dato utbytte", description: "Utbytte: 0,35 USD/aksje.", source: "auto" },
      { id: uid(), date: "2026-11-12", type: "Kapitalmarkedsdag", title: "Kapitalmarkedsdag", description: "Oppdatert strategi og langsiktig guiding.", source: "auto" },
      { id: uid(), date: "2027-02-05", type: "Rapport", title: "Q4- og årsrapport 2026", description: "Årsresultat og utbytteforslag for 2027.", source: "auto" },
      { id: uid(), date: "2027-05-13", type: "Generalforsamling", title: "Ordinær generalforsamling", description: "Godkjenning av årsregnskap og utbytte.", source: "auto" },
      { id: uid(), date: "2026-08-20", type: "Kontrakt", title: "Ny boreriggkontrakt signert", description: "Treårskontrakt for boring i Nordsjøen.", source: "auto" }
    ],

    ownership: {
      topHolders: [
        { name: "Den norske stat / Nærings- og fiskeridepartementet", pct: 67.0, change: 0 },
        { name: "Folketrygdfondet", pct: 3.4, change: 0.1 },
        { name: "BlackRock", pct: 1.6, change: -0.1 },
        { name: "Vanguard Group", pct: 1.1, change: 0.0 },
        { name: "DNB Asset Management", pct: 0.9, change: 0.05 }
      ],
      insiderTrades: [
        { name: "Anders K. Opedal", role: "Konsernsjef", type: "Kjøp", shares: 2500, price: 340.10, date: "2026-09-15", time: "09:14" },
        { name: "Torgrim Reitan", role: "Finansdirektør", type: "Kjøp", shares: 1200, price: 338.50, date: "2026-09-12", time: "10:47" },
        { name: "Kjerstin R. Braathen", role: "Styremedlem", type: "Salg", shares: 800, price: 332.00, date: "2026-09-03", time: "13:05" },
        { name: "Elisabeth Proust", role: "Styremedlem", type: "Kjøp", shares: 450, price: 325.75, date: "2026-08-28", time: "11:22" }
      ],
      managementHoldings: [
        { name: "Anders K. Opedal", role: "Konsernsjef", shares: 41200 },
        { name: "Torgrim Reitan", role: "Finansdirektør", shares: 28600 },
        { name: "Kjerstin R. Braathen", role: "Styremedlem", shares: 6100 }
      ]
    },
    leadership: {
      executives: [
        { name: "Anders K. Opedal", role: "Konsernsjef (CEO)", since: "2020", background: "I Equinor siden 1997. Tidligere konserndirektør for teknologi, prosjekter og boring.", shares: 41200, profile: "Har vært i Equinor siden 1997 og har hatt en rekke lederroller i selskapet, blant annet som konserndirektør for teknologi, prosjekter og boring, før han ble konsernsjef i 2020. Kjent for en forsiktig, industriell tilnærming til strategien: viderefører satsingen på fornybar energi og lavkarbonløsninger ved siden av kjernevirksomheten i olje og gass, uten de store, risikable retningsskiftene enkelte konkurrenter har gjort. Har stått for en periode med relativt stabil drift og forutsigbar kommunikasjon til markedet." },
        { name: "Torgrim Reitan", role: "Finansdirektør (CFO)", since: "2021", background: "Tidligere leder for Equinors virksomhet i USA.", shares: 28600, profile: "Har hatt flere sentrale roller i Equinor over mange år, blant annet som leder for selskapets virksomhet i USA og for naturgassporteføljen, før han ble finansdirektør i 2021. Kjent for en konservativ linje på kapitalallokering og utbyttepolitikk, med vekt på finansiell disiplin fremfor aggressiv vekst. Regnes som en trygg og forutsigbar kommunikator overfor investorer og analytikere." },
        { name: "Geir Tungesvik", role: "Konserndirektør, Prosjekter, Boring og Anskaffelser", since: "2020", background: "Ansvarlig for prosjektgjennomføring og leverandørkjede.", shares: 8400, profile: "Lang fartstid i Equinor innen prosjektledelse og boring, og har ledet flere av selskapets største utbyggingsprosjekter. Kjent for tett oppfølging av kostnader og fremdrift, og for en pragmatisk tilnærming til leverandørsamarbeid." }
      ],
      board: [
        { name: "Jon Erik Reinhardsen", role: "Styreleder", since: "2019", background: "Tidligere konsernsjef i Petroleum Geo-Services.", shares: 3200, profile: "Bred styre- og lederbakgrunn fra olje- og energisektoren, blant annet som konsernsjef i både Petroleum Geo-Services og Aker Solutions. Har sittet som styreleder i Equinor siden 2019, og regnes som en erfaren og samlende styreleder i en periode preget av energiomstilling." },
        { name: "Kjerstin R. Braathen", role: "Styremedlem", since: "2022", background: "Konsernsjef i DNB.", shares: 6100, profile: "Sitter i Equinors styre ved siden av sin hovedrolle som konsernsjef i DNB. Bidrar med finansiell og strategisk kompetanse fra bankvirksomhet, og er en av få personer som har sentrale roller i to av Norges største børsnoterte selskaper samtidig." },
        { name: "Elisabeth Proust", role: "Styremedlem", since: "2021", background: "Tidligere konsernsjef i Point Resources.", shares: 0, profile: "Bakgrunn fra internasjonal olje- og gassvirksomhet, blant annet som konsernsjef i Point Resources. Bidrar med operasjonell og internasjonal erfaring inn i styrearbeidet." }
      ]
    },

    competitors: [
      { ticker: "EQNR", name: "Equinor ASA", marketCapText: "1 042 mrd kr", revenueGrowth: 3.6, opMargin: 36.6, eps: 6.31, fcfYield: 9.8, debt: 27.5, pe: 10.2, evEbitda: 3.1, priceChange: 2.4, highlight: true },
      { ticker: "AKRBP", name: "Aker BP", marketCapText: "312 mrd kr", revenueGrowth: 5.1, opMargin: 41.2, eps: 21.4, fcfYield: 8.1, debt: 68.0, pe: 12.6, evEbitda: 4.0, priceChange: 1.1, highlight: false },
      { ticker: "SHEL", name: "Shell plc", marketCapText: "2 380 mrd kr", revenueGrowth: 1.8, opMargin: 32.0, eps: 3.05, fcfYield: 11.0, debt: 44.0, pe: 9.5, evEbitda: 3.6, priceChange: 0.4, highlight: false },
      { ticker: "BP", name: "BP plc", marketCapText: "780 mrd kr", revenueGrowth: -0.9, opMargin: 26.5, eps: 0.62, fcfYield: 7.4, debt: 47.0, pe: 8.1, evEbitda: 3.9, priceChange: -0.7, highlight: false }
    ],

    thesis: {
      whyFollow: "Kjerneposisjon i porteføljen for eksponering mot energisektoren, med høy og stabil direkteavkastning og en fornybaropsjon jeg ikke betaler for i dagens verdsettelse.",
      bull: "Oljepris holder seg over 80 USD/fat, Johan Sverdrup produserer over platå, og fornybarsatsingen begynner å bidra positivt til kontantstrømmen fra 2028. Multippelekspansjon mot sektorsnitt gir 30–40 % oppside.",
      base: "Oljepris rundt 70–80 USD/fat, stabil produksjon og uendret kapitalallokering. Aksjen følger i hovedsak utbytte og tilbakekjøp, med moderat kursoppgang i takt med resultatvekst.",
      bear: "Oljepris faller under 60 USD/fat over lengre tid, CO2-avgiften økes vesentlig, og fornybarprosjekter forsinkes ytterligere. Utbyttekapasiteten svekkes og multippelen komprimeres.",
      bullDrivers: ["Oljepris > 80 USD/fat", "Johan Sverdrup over platånivå", "Fornybarsegment kontantstrømpositivt fra 2028", "Multippelekspansjon mot sektorsnitt"],
      baseDrivers: ["Oljepris 70–80 USD/fat", "Stabil produksjon på dagens nivå", "Uendret kapitalallokering/utbyttepolitikk"],
      bearDrivers: ["Oljepris < 60 USD/fat over lengre tid", "Vesentlig økt CO2-avgift/petroleumsskatt", "Forsinkelser i fornybarprosjekter", "Geopolitisk risiko i internasjonale posisjoner"],
      invalidators: ["Kutt i utbytte eller tilbakekjøpsprogram", "Produksjon faller under guiding to kvartaler på rad", "Kredittrating nedgradert under A-"],
      notes: [
        { id: uid(), date: "2026-08-02", text: "Øker overbevisning etter sterk Q2. Produksjonen fra Johan Sverdrup overrasker positivt for tredje kvartal på rad." },
        { id: uid(), date: "2026-06-14", text: "Følger CO2-avgiftsforslaget tett – kan bli en vesentlig motvind for marginene dersom det vedtas i nåværende form." }
      ]
    },

    sources: DEFAULT_SOURCES.concat([
      { id: uid(), name: "Equinor Investor Relations", category: "ir", trust: 5, priority: "Høy", on: true, custom: false, url: "https://www.equinor.com/investors" },
      { id: uid(), name: "@Equinor på X", category: "social", trust: 2, priority: "Lav", on: false, custom: false, url: "https://x.com/Equinor" }
    ]),

    factors: [
      { id: uid(), name: "Oljepris (Brent)", description: "Endringer i oljepris påvirker kontantstrøm og utbyttekapasitet direkte.", on: true, priority: "Høy", linkedSources: ["Reuters", "Bloomberg"] },
      { id: uid(), name: "Gasspris (TTF)", description: "Viktig for gassalg til Europa.", on: true, priority: "Middels", linkedSources: ["Reuters"] },
      { id: uid(), name: "Produksjonsvolum", description: "Kvartalsvis produksjon vs. guiding, spesielt Johan Sverdrup.", on: true, priority: "Høy", linkedSources: ["Oslo Børs meldinger", "Equinor Investor Relations"] },
      { id: uid(), name: "CAPEX-endringer", description: "Endringer i investeringsguiding påvirker fri kontantstrøm.", on: true, priority: "Høy", linkedSources: ["Equinor Investor Relations"] },
      { id: uid(), name: "Johan Sverdrup-status", description: "Spesifikk overvåkning av selskapets største felt.", on: true, priority: "Høy", linkedSources: ["Oslo Børs meldinger", "E24"] },
      { id: uid(), name: "Fornybarprosjekter", description: "Havvind og andre fornybarsatsinger – fremdrift og forsinkelser.", on: true, priority: "Middels", linkedSources: ["E24", "Reuters"] },
      { id: uid(), name: "Skatt/CO2-avgift", description: "Endringer i norsk petroleumsbeskatning eller CO2-avgift.", on: true, priority: "Høy", linkedSources: ["DN", "Finansavisen"] },
      { id: uid(), name: "Produksjonsguiding", description: "Endringer i selskapets kommuniserte produksjonsmål.", on: true, priority: "Høy", linkedSources: ["Equinor Investor Relations"] },
      { id: uid(), name: "Utbyttepolitikk", description: "Endringer i basisutbytte eller ekstrautbytte.", on: true, priority: "Middels", linkedSources: ["Oslo Børs meldinger"] },
      { id: uid(), name: "Tilbakekjøpsprogram", description: "Tempo og størrelse på aksjetilbakekjøp.", on: true, priority: "Middels", linkedSources: ["Oslo Børs meldinger"] },
      { id: uid(), name: "Store kontrakter", description: "Nye rigg-, bore- eller leveransekontrakter av vesentlig størrelse.", on: false, priority: "Lav", linkedSources: ["Reuters"] }
    ],

    prompts: JSON.parse(JSON.stringify(DEFAULT_PROMPTS)),
    promptOverrides: { impact: true },
    thresholds: { relevanceMin: 4, impactAlert: 6, impactCritical: 8 }
  };
  companies.EQNR.prompts.impact = "Vurder hendelsens sannsynlige påvirkning på Equinors aksjekurs på en skala fra −10 til +10. Vekt oljepris, produksjonsendringer og CAPEX/guiding tyngst. Vekt generelle markedsbevegelser og makronyheter uten direkte kobling til Equinor svært lavt. Begrunn kort med konkrete tall fra kilden.";

  // ===================== DNB =====================
  companies.DNB = {
    ticker: "DNB", name: "DNB Bank ASA", exchange: "Oslo Børs", sector: "Bank & Finans",
    color: "#1d4ed8", initials: "DN",
    price: 228.80, changePct: 0.6, changeAbs: 1.37, currency: "NOK",
    marketCapText: "338 mrd kr", peRatio: 8.9, fwdPe: 8.5, evEbitda: 6.2, evEbit: 6.9, ps: 3.4, pb: 1.35, fcfYield: 8.2, divYield: 6.9,
    week52Low: 198, week52High: 241, volumeToday: "2,1M", sharesOutText: "1,48 mrd",
    analystTarget: { avg: 235, count: 14 },
    inPortfolio: true, watchSince: "3. mar 2026",
    thesisSummary: "DNB er Norges største bank med solid kapitaldekning og økende rentemarginer. Casen bygger på stabil kredittvekst, høy egenkapitalavkastning og en attraktiv utbyttepolitikk.",
    keyRisks: ["Kraftig renteoppgang eller -nedgang påvirker rentemarginen", "Økte mislighold i næringseiendom", "Strengere kapitalkrav fra Finanstilsynet"],
    keyDrivers: ["Stabil eller økende rentemargin", "Lav mislighold i personmarkedet", "Fortsatt høy utbytte- og tilbakekjøpskapasitet"],
    nextEvent: { date: "22. okt 2026", label: "Q3-rapport 2026" },
    lastReport: { date: "9. jul 2026", label: "Q2-rapport 2026", summary: "Resultat over konsensus drevet av høyere netto renteinntekter. Egenkapitalavkastning på 15,8 %, opp fra 15,1 % i fjor." },
    guidanceChange: { date: "9. jul 2026", direction: "up", text: "Egenkapitalavkastningsmål for 2026 hevet fra >15 % til >16 %." },
    insiderChange: { date: "10. sep 2026", text: "Ingen vesentlige innsidehandler siste 30 dager." },
    priceHistory: [214, 216, 213, 217, 219, 216, 220, 218, 222, 219, 224, 221, 225, 223, 227, 224, 229, 226, 230, 227, 231, 228, 230, 228.8],
    news: [
      { id: uid(), source: "Reuters", time: "4t siden", date: "2026-09-18", category: "Rentemargin", headline: "DNB varsler økt rentemargin i Q3-rapport", aiSummary: "Banken signaliserer at netto rentemargin vil holde seg høy inn i tredje kvartal grunnet fortsatt høyt rentenivå.", impact: 6, impactLabel: "Moderat positiv", rationale: "Høyere rentemargin slår direkte inn på resultatet og understøtter guiding-hevingen fra Q2.", caseAreas: ["Drivere"], material: true, read: false, flagged: false, note: "" },
      { id: uid(), source: "DN", time: "1d siden", date: "2026-09-17", category: "Kredittrisiko", headline: "Økt overvåkning av næringseiendomsporteføljen", aiSummary: "DNB opplyser at de har økt overvåkningen av utsatte segmenter i næringseiendom, uten å melde om økt mislighold så langt.", impact: -3, impactLabel: "Svak negativ", rationale: "Signaliserer økt aktsomhet, men ingen faktisk forverring i tallene ennå.", caseAreas: ["Risikoer"], material: true, read: false, flagged: false, note: "" },
      { id: uid(), source: "E24", time: "2d siden", date: "2026-09-16", category: "Kapital", headline: "DNB oppgraderer mål for egenkapitalavkastning", aiSummary: "Banken hevet sitt langsiktige mål for egenkapitalavkastning fra 15 % til 16 %.", impact: 5, impactLabel: "Moderat positiv", rationale: "Direkte oppjustering av lønnsomhetsmål fra selskapet selv, kommunisert i forbindelse med Q2-rapporten.", caseAreas: ["Drivere", "Estimater"], material: true, read: true, flagged: false, note: "" }
    ],
    financials: {
      unit: "mrd kr",
      annual: [
        { period: "2022", revenue: 62.1, revenueGrowth: 18.2, ebitda: 34.0, ebit: 33.2, netIncome: 27.0, eps: 17.9, grossMargin: 54.8, opMargin: 53.5, fcf: 18.2, capex: 2.1, debt: 410, netDebt: 380, cash: 30, sharesOutText: "1,51 mrd" },
        { period: "2023", revenue: 78.4, revenueGrowth: 26.2, ebitda: 44.8, ebit: 43.9, netIncome: 34.6, eps: 23.3, grossMargin: 57.1, opMargin: 56.0, fcf: 24.1, capex: 2.3, debt: 420, netDebt: 390, cash: 30, sharesOutText: "1,49 mrd" },
        { period: "2024", revenue: 81.9, revenueGrowth: 4.5, ebitda: 46.9, ebit: 46.0, netIncome: 36.5, eps: 24.7, grossMargin: 57.3, opMargin: 56.2, fcf: 25.3, capex: 2.4, debt: 425, netDebt: 395, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "2025", revenue: 84.6, revenueGrowth: 3.3, ebitda: 48.7, ebit: 47.8, netIncome: 37.9, eps: 25.7, grossMargin: 57.6, opMargin: 56.5, fcf: 26.4, capex: 2.4, debt: 430, netDebt: 400, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "2026E", revenue: 87.5, revenueGrowth: 3.4, ebitda: 50.9, ebit: 49.9, netIncome: 39.6, eps: 26.8, grossMargin: 58.2, opMargin: 57.0, fcf: 27.5, capex: 2.5, debt: 432, netDebt: 402, cash: 30, sharesOutText: "1,48 mrd" }
      ],
      quarterly: [
        { period: "Q3 24", revenue: 20.6, revenueGrowth: 4.1, ebitda: 11.8, ebit: 11.6, netIncome: 9.2, eps: 6.2, grossMargin: 57.3, opMargin: 56.3, fcf: 6.4, capex: 0.6, debt: 424, netDebt: 394, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "Q4 24", revenue: 20.9, revenueGrowth: 4.4, ebitda: 12.0, ebit: 11.8, netIncome: 9.3, eps: 6.3, grossMargin: 57.4, opMargin: 56.4, fcf: 6.5, capex: 0.6, debt: 425, netDebt: 395, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "Q1 25", revenue: 21.0, revenueGrowth: 3.5, ebitda: 12.1, ebit: 11.9, netIncome: 9.4, eps: 6.4, grossMargin: 57.6, opMargin: 56.7, fcf: 6.5, capex: 0.6, debt: 427, netDebt: 397, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "Q2 25", revenue: 21.2, revenueGrowth: 3.1, ebitda: 12.3, ebit: 12.1, netIncome: 9.5, eps: 6.5, grossMargin: 58.0, opMargin: 57.1, fcf: 6.6, capex: 0.6, debt: 429, netDebt: 399, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "Q3 25", revenue: 21.3, revenueGrowth: 3.4, ebitda: 12.4, ebit: 12.2, netIncome: 9.6, eps: 6.5, grossMargin: 58.2, opMargin: 57.3, fcf: 6.6, capex: 0.6, debt: 430, netDebt: 400, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "Q4 25", revenue: 21.5, revenueGrowth: 2.9, ebitda: 12.5, ebit: 12.3, netIncome: 9.6, eps: 6.5, grossMargin: 58.1, opMargin: 57.2, fcf: 6.6, capex: 0.6, debt: 430, netDebt: 400, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "Q1 26", revenue: 21.7, revenueGrowth: 3.3, ebitda: 12.7, ebit: 12.4, netIncome: 9.8, eps: 6.6, grossMargin: 58.5, opMargin: 57.6, fcf: 6.8, capex: 0.6, debt: 431, netDebt: 401, cash: 30, sharesOutText: "1,48 mrd" },
        { period: "Q2 26", revenue: 22.0, revenueGrowth: 3.8, ebitda: 12.9, ebit: 12.6, netIncome: 9.9, eps: 6.7, grossMargin: 58.6, opMargin: 57.6, fcf: 6.9, capex: 0.6, debt: 432, netDebt: 402, cash: 30, sharesOutText: "1,48 mrd" }
      ]
    },
    valuationHistory: [
      { period: "2022", pe: 7.4, fwdPe: 7.9, evEbitda: 5.4, evEbit: 5.5, ps: 3.0, pb: 1.15, fcfYield: 10.5, divYield: 7.5 },
      { period: "2023", pe: 8.1, fwdPe: 8.0, evEbitda: 5.8, evEbit: 5.9, ps: 3.2, pb: 1.25, fcfYield: 9.6, divYield: 7.1 },
      { period: "2024", pe: 8.6, fwdPe: 8.3, evEbitda: 6.0, evEbit: 6.2, ps: 3.3, pb: 1.30, fcfYield: 8.9, divYield: 7.0 },
      { period: "2025", pe: 8.8, fwdPe: 8.4, evEbitda: 6.1, evEbit: 6.6, ps: 3.35, pb: 1.32, fcfYield: 8.5, divYield: 6.9 },
      { period: "2026 (nå)", pe: 8.9, fwdPe: 8.5, evEbitda: 6.2, evEbit: 6.9, ps: 3.4, pb: 1.35, fcfYield: 8.2, divYield: 6.9 }
    ],
    estimates: {
      consensusRevenue: 87.5, consensusRevenuePrior: 86.9,
      consensusEps: 26.8, consensusEpsPrior: 26.3,
      consensusEbitda: 50.9, consensusEbitdaPrior: 50.2,
      revisionTrend: [25.6, 25.8, 26.0, 26.2, 26.4, 26.5, 26.6, 26.8],
      guidanceGoals: [
        {
          id: uid(), title: "Egenkapitalavkastningsmål 2026", status: "venter",
          conclusion: "Målet ble hevet i juli etter sterke kvartalstall. Foreløpig på god vei, men fasit kommer først med årsrapporten.",
          updates: [
            { date: "9. jul 2026", text: "Mål hevet fra >15 % til >16 % for 2026.", direction: "up" }
          ],
          news: [
            { date: "9. jul 2026", source: "Finansavisen", headline: "DNB hever avkastningsmål etter sterkt kvartal" }
          ]
        },
        {
          id: uid(), title: "Kostnadsmål 2026", status: "venter",
          conclusion: "Kostnadsmålet er bekreftet uendret gjennom året så langt, uten tegn til avvik.",
          updates: [
            { date: "10. apr 2026", text: "Mål bekreftet uendret på under 40 % kostnadsandel.", direction: "flat" }
          ],
          news: [
            { date: "10. apr 2026", source: "Dagens Næringsliv", headline: "DNB bekrefter kostnadsmål for 2026" }
          ]
        },
        {
          id: uid(), title: "Egenkapitalavkastningsmål 2025", status: "nådd",
          conclusion: "DNB leverte 15,4 % egenkapitalavkastning i 2025, over det bekreftede målet på >15 %.",
          updates: [
            { date: "8. jul 2025", text: "Mål bekreftet på >15 % for 2025.", direction: "flat" }
          ],
          news: [
            { date: "8. jul 2025", source: "Finansavisen", headline: "DNB bekrefter avkastningsmål for 2025" },
            { date: "5. feb 2026", source: "E24", headline: "DNB slår eget avkastningsmål i årsrapporten" }
          ]
        }
      ],
      quarterlyBeats: [
        { period: "Q3 25", estRevenue: 21.0, actRevenue: 21.3, estEps: 6.3, actEps: 6.5, result: "beat" },
        { period: "Q4 25", estRevenue: 21.4, actRevenue: 21.5, estEps: 6.5, actEps: 6.5, result: "beat" },
        { period: "Q1 26", estRevenue: 21.6, actRevenue: 21.7, estEps: 6.5, actEps: 6.6, result: "beat" },
        { period: "Q2 26", estRevenue: 21.8, actRevenue: 22.0, estEps: 6.6, actEps: 6.7, result: "beat" }
      ]
    },
    events: [
      { id: uid(), date: "2026-10-22", type: "Rapport", title: "Q3-rapport 2026", description: "Kvartalsrapport og resultatpresentasjon.", source: "auto" },
      { id: uid(), date: "2026-11-19", type: "Ex-dato", title: "Ex-dato kvartalsutbytte", description: "Kvartalsvis utbytteutbetaling.", source: "auto" },
      { id: uid(), date: "2027-02-04", type: "Rapport", title: "Q4- og årsrapport 2026", description: "Årsresultat og utbytteforslag.", source: "auto" }
    ],
    ownership: {
      topHolders: [
        { name: "DNB-stiftelsen", pct: 9.8, change: 0.0 },
        { name: "Folketrygdfondet", pct: 5.1, change: 0.1 },
        { name: "BlackRock", pct: 2.4, change: 0.0 },
        { name: "Vanguard Group", pct: 1.5, change: 0.0 }
      ],
      insiderTrades: [
        { name: "Kjerstin Braathen", role: "Konsernsjef", type: "Kjøp", shares: 900, price: 227.00, date: "2026-08-20", time: "09:41" },
        { name: "Ida Lerner", role: "Finansdirektør", type: "Kjøp", shares: 600, price: 225.50, date: "2026-08-15", time: "15:18" }
      ],
      managementHoldings: [
        { name: "Kjerstin Braathen", role: "Konsernsjef", shares: 18400 },
        { name: "Ida Lerner", role: "Finansdirektør", shares: 9200 }
      ]
    },
    leadership: {
      executives: [
        { name: "Kjerstin Braathen", role: "Konsernsjef (CEO)", since: "2019", background: "Første kvinnelige konsernsjef i DNB. Tidligere finansdirektør i banken.", shares: 18400, profile: "Har hatt en lang intern karriere i DNB, blant annet som finansdirektør, før hun ble konsernsjef i 2019 som den første kvinnen i rollen. Kjent for en forsiktig, langsiktig linje i bankens strategi, med vekt på kapitalstyrke og risikokontroll fremfor rask vekst. Regnes som en solid og forutsigbar leder i norsk banksektor." },
        { name: "Ida Lerner", role: "Finansdirektør (CFO)", since: "2023", background: "Tidligere leder for konsernøkonomi i DNB.", shares: 9200, profile: "Lang fartstid i konsernøkonomi-funksjonen i DNB før hun ble finansdirektør i 2023. Kjent for grundig finansiell styring og tett oppfølging av bankens kapitalkrav." }
      ],
      board: [
        { name: "Olaug Svarva", role: "Styreleder", since: "2019", background: "Tidligere direktør i Folketrygdfondet.", shares: 1800, profile: "Bred erfaring fra kapitalforvaltning som tidligere administrerende direktør i Folketrygdfondet, en av Norges største institusjonelle investorer. Har vært styreleder i DNB siden 2019 og bidrar med solid innsikt i både forvaltning og eierstyring." },
        { name: "Vigdis Mathisen", role: "Styremedlem (ansatterepresentant)", since: "2020", background: "Ansatterepresentant i styret.", shares: 0, profile: "Valgt av de ansatte til å representere deres interesser i styret siden 2020. Bidrar med innsikt i den daglige driften og arbeidsmiljøet i banken sett fra de ansattes side." }
      ]
    },
    competitors: [
      { ticker: "DNB", name: "DNB Bank ASA", marketCapText: "338 mrd kr", revenueGrowth: 3.4, opMargin: 57.0, eps: 26.8, fcfYield: 8.2, debt: 432, pe: 8.9, evEbitda: 6.2, priceChange: 0.6, highlight: true },
      { ticker: "SEB", name: "SEB", marketCapText: "375 mrd kr", revenueGrowth: 2.1, opMargin: 55.2, eps: 18.4, fcfYield: 7.6, debt: 520, pe: 9.4, evEbitda: 6.6, priceChange: 0.2, highlight: false },
      { ticker: "SWED", name: "Swedbank", marketCapText: "290 mrd kr", revenueGrowth: 1.8, opMargin: 54.0, eps: 15.2, fcfYield: 8.9, debt: 410, pe: 8.2, evEbitda: 6.0, priceChange: -0.3, highlight: false },
      { ticker: "NDA", name: "Nordea", marketCapText: "460 mrd kr", revenueGrowth: 2.6, opMargin: 56.1, eps: 1.28, fcfYield: 8.0, debt: 610, pe: 9.1, evEbitda: 6.4, priceChange: 0.5, highlight: false }
    ],
    thesis: {
      whyFollow: "Stabil kjerneposisjon i finanssektoren med høy og forutsigbar direkteavkastning, som balanserer den mer sykliske energieksponeringen i porteføljen.",
      bull: "Rentenivået holder seg gunstig for bankens marginer, mislighold forblir lavt, og egenkapitalavkastningen stiger videre mot 17–18 %.",
      base: "Stabil drift med egenkapitalavkastning rundt 15–16 %, moderat kredittvekst og fortsatt høyt utbytte.",
      bear: "Kraftig rentenedgang presser marginene, og mislighold i næringseiendom øker vesentlig.",
      bullDrivers: ["Gunstig rentenivå for netto rentemargin", "Lavt mislighold", "Egenkapitalavkastning mot 17–18 %", "Fortsatt kapitalutdeling via utbytte og tilbakekjøp"],
      baseDrivers: ["Egenkapitalavkastning 15–16 %", "Moderat kredittvekst", "Fortsatt høyt utbytte"],
      bearDrivers: ["Kraftig rentenedgang presser marginene", "Økt mislighold i næringseiendom", "Strengere kapitalkrav"],
      invalidators: ["Vesentlig økning i mislighold", "Kutt i utbyttepolitikk"],
      notes: [{ id: uid(), date: "2026-07-10", text: "Sterk Q2 med oppjustert avkastningsmål – styrker casen." }]
    },
    sources: DEFAULT_SOURCES.concat([{ id: uid(), name: "DNB Investor Relations", category: "ir", trust: 5, priority: "Høy", on: true, custom: false, url: "https://www.dnb.no/en/about-us/investor-relations" }]),
    factors: [
      { id: uid(), name: "Styringsrente (Norges Bank)", description: "Direkte påvirkning på rentemargin.", on: true, priority: "Høy", linkedSources: ["Reuters", "DN"] },
      { id: uid(), name: "Mislighold næringseiendom", description: "Overvåker utviklingen i utsatte segmenter.", on: true, priority: "Høy", linkedSources: ["DN", "Finansavisen"] },
      { id: uid(), name: "Kapitaldekning (CET1)", description: "Endringer i kapitalkrav eller -buffer.", on: true, priority: "Middels", linkedSources: ["DNB Investor Relations"] },
      { id: uid(), name: "Utbyttepolitikk", description: "Endringer i utdelingsgrad.", on: true, priority: "Middels", linkedSources: ["Oslo Børs meldinger"] }
    ],
    prompts: JSON.parse(JSON.stringify(DEFAULT_PROMPTS)),
    promptOverrides: {},
    thresholds: { relevanceMin: 4, impactAlert: 6, impactCritical: 8 }
  };

  // ===================== NORSK HYDRO =====================
  companies.NHY = {
    ticker: "NHY", name: "Norsk Hydro ASA", exchange: "Oslo Børs", sector: "Materialer",
    color: "#b45309", initials: "NH",
    price: 61.24, changePct: -1.8, changeAbs: -1.12, currency: "NOK",
    marketCapText: "128 mrd kr", peRatio: 14.8, fwdPe: 12.9, evEbitda: 5.6, evEbit: 9.8, ps: 0.7, pb: 1.1, fcfYield: 5.1, divYield: 3.9,
    week52Low: 54, week52High: 78, volumeToday: "5,6M", sharesOutText: "2,09 mrd",
    analystTarget: { avg: 58, count: 11 },
    inPortfolio: false, watchSince: "2. mai 2026",
    thesisSummary: "Norsk Hydro er eksponert mot aluminiumspris og europeiske strømpriser. Casen er mer syklisk og avhenger av at strømkostnadene ved smelteverkene holder seg konkurransedyktige.",
    keyRisks: ["Høye europeiske strømpriser presser smelteverksmarginer", "Svakere aluminiumspris ved global etterspørselssvikt", "Investeringsoverskridelser i grønn-satsinger"],
    keyDrivers: ["Høyere aluminiumspris", "Lavere strømpriser ved europeiske smelteverk", "Vekst i resirkulert aluminium (lavkarbon-premium)"],
    nextEvent: { date: "21. okt 2026", label: "Q3-rapport 2026" },
    lastReport: { date: "16. jul 2026", label: "Q2-rapport 2026", summary: "EBITDA under konsensus grunnet høyere strømkostnader i Europa. Ledelsen varsler kostnadskutt-program." },
    guidanceChange: { date: "16. jul 2026", direction: "down", text: "Kostnadsguiding for smelteverkene justert opp grunnet strømpriser; nytt kostnadskuttprogram på 1,5 mrd kr annonsert." },
    insiderChange: { date: "1. sep 2026", text: "Et styremedlem solgte 5 000 aksjer i forbindelse med planlagt porteføljerebalansering." },
    priceHistory: [66, 65, 64, 65, 63, 64, 62, 63, 61, 62, 60, 61, 60, 62, 61, 63, 62, 64, 62, 63, 61, 62, 60, 61.24],
    news: [
      { id: uid(), source: "DN", time: "6t siden", date: "2026-09-18", category: "Kostnader", headline: "Strømpriser presser marginer ved smelteverk i Europa", aiSummary: "Høye strømpriser i Tyskland og Norge presser driftsmarginene ved flere av Hydros smelteverk inn i fjerde kvartal.", impact: -6, impactLabel: "Moderat negativ", rationale: "Strøm er en av de største kostnadskomponentene i primærproduksjon av aluminium, og vedvarende høye priser slår direkte inn på EBITDA.", caseAreas: ["Risikoer"], material: true, read: false, flagged: true, note: "" },
      { id: uid(), source: "Reuters", time: "1d siden", date: "2026-09-17", category: "Marked", headline: "Aluminiumsprisen stiger på lavere kinesisk eksport", aiSummary: "Aluminiumsprisen på LME har steget 4 % siste uke etter meldinger om lavere eksport fra Kina.", impact: 5, impactLabel: "Moderat positiv", rationale: "Høyere aluminiumspris slår direkte inn på inntektene, men effekten avhenger av varigheten på prisoppgangen.", caseAreas: ["Drivere"], material: true, read: false, flagged: false, note: "" }
    ],
    financials: {
      unit: "mrd kr",
      annual: [
        { period: "2022", revenue: 227.3, revenueGrowth: 21.4, ebitda: 37.1, ebit: 24.0, netIncome: 15.8, eps: 7.42, grossMargin: 22.5, opMargin: 10.6, fcf: 9.1, capex: 12.4, debt: 34.2, netDebt: 8.1, cash: 26.1, sharesOutText: "2,13 mrd" },
        { period: "2023", revenue: 176.4, revenueGrowth: -22.4, ebitda: 19.8, ebit: 7.6, netIncome: 2.1, eps: 1.01, grossMargin: 16.4, opMargin: 4.3, fcf: 1.2, capex: 13.8, debt: 36.5, netDebt: 12.9, cash: 23.6, sharesOutText: "2,11 mrd" },
        { period: "2024", revenue: 182.9, revenueGrowth: 3.7, ebitda: 22.6, ebit: 9.8, netIncome: 4.4, eps: 2.11, grossMargin: 17.5, opMargin: 5.4, fcf: 2.8, capex: 14.1, debt: 37.0, netDebt: 14.2, cash: 22.8, sharesOutText: "2,10 mrd" },
        { period: "2025", revenue: 189.7, revenueGrowth: 3.7, ebitda: 24.9, ebit: 11.5, netIncome: 5.6, eps: 2.68, grossMargin: 18.0, opMargin: 6.1, fcf: 3.6, capex: 14.6, debt: 37.6, netDebt: 15.0, cash: 22.6, sharesOutText: "2,09 mrd" },
        { period: "2026E", revenue: 196.3, revenueGrowth: 3.5, ebitda: 23.6, ebit: 10.4, netIncome: 4.9, eps: 2.36, grossMargin: 17.3, opMargin: 5.3, fcf: 2.9, capex: 15.2, debt: 38.2, netDebt: 16.1, cash: 22.1, sharesOutText: "2,09 mrd" }
      ],
      quarterly: [
        { period: "Q3 24", revenue: 45.6, revenueGrowth: 2.8, ebitda: 5.6, ebit: 2.3, netIncome: 1.0, eps: 0.48, grossMargin: 17.2, opMargin: 5.0, fcf: 0.6, capex: 3.5, debt: 36.7, netDebt: 13.9, cash: 22.8, sharesOutText: "2,10 mrd" },
        { period: "Q4 24", revenue: 46.9, revenueGrowth: 3.9, ebitda: 6.0, ebit: 2.6, netIncome: 1.2, eps: 0.57, grossMargin: 17.8, opMargin: 5.5, fcf: 0.8, capex: 3.6, debt: 37.0, netDebt: 14.2, cash: 22.8, sharesOutText: "2,10 mrd" },
        { period: "Q1 25", revenue: 46.2, revenueGrowth: 3.1, ebitda: 5.9, ebit: 2.5, netIncome: 1.1, eps: 0.53, grossMargin: 17.6, opMargin: 5.4, fcf: 0.7, capex: 3.6, debt: 37.2, netDebt: 14.5, cash: 22.7, sharesOutText: "2,09 mrd" },
        { period: "Q2 25", revenue: 47.4, revenueGrowth: 3.5, ebitda: 6.3, ebit: 2.9, netIncome: 1.4, eps: 0.67, grossMargin: 18.1, opMargin: 6.1, fcf: 0.9, capex: 3.7, debt: 37.5, netDebt: 14.8, cash: 22.7, sharesOutText: "2,09 mrd" },
        { period: "Q3 25", revenue: 47.8, revenueGrowth: 4.8, ebitda: 6.4, ebit: 3.0, netIncome: 1.5, eps: 0.72, grossMargin: 18.3, opMargin: 6.3, fcf: 1.0, capex: 3.7, debt: 37.5, netDebt: 14.9, cash: 22.6, sharesOutText: "2,09 mrd" },
        { period: "Q4 25", revenue: 47.8, revenueGrowth: 1.9, ebitda: 6.3, ebit: 2.9, netIncome: 1.6, eps: 0.77, grossMargin: 18.0, opMargin: 6.1, fcf: 1.0, capex: 3.7, debt: 37.6, netDebt: 15.0, cash: 22.6, sharesOutText: "2,09 mrd" },
        { period: "Q1 26", revenue: 48.1, revenueGrowth: 4.1, ebitda: 6.0, ebit: 2.6, netIncome: 1.2, eps: 0.58, grossMargin: 17.5, opMargin: 5.4, fcf: 0.7, capex: 3.8, debt: 37.9, netDebt: 15.5, cash: 22.4, sharesOutText: "2,09 mrd" },
        { period: "Q2 26", revenue: 48.9, revenueGrowth: 3.2, ebitda: 5.8, ebit: 2.4, netIncome: 1.1, eps: 0.53, grossMargin: 16.8, opMargin: 4.9, fcf: 0.6, capex: 3.8, debt: 38.0, netDebt: 15.8, cash: 22.2, sharesOutText: "2,09 mrd" }
      ]
    },
    valuationHistory: [
      { period: "2022", pe: 6.9, fwdPe: 8.9, evEbitda: 3.0, evEbit: 4.6, ps: 0.48, pb: 0.85, fcfYield: 12.0, divYield: 5.9 },
      { period: "2023", pe: 39.5, fwdPe: 18.2, evEbitda: 5.1, evEbit: 13.3, ps: 0.60, pb: 0.90, fcfYield: 1.5, divYield: 4.4 },
      { period: "2024", pe: 27.0, fwdPe: 16.1, evEbitda: 4.9, evEbit: 11.4, ps: 0.65, pb: 0.98, fcfYield: 3.6, divYield: 4.0 },
      { period: "2025", pe: 19.8, fwdPe: 14.6, evEbitda: 5.2, evEbit: 10.5, ps: 0.68, pb: 1.05, fcfYield: 4.5, divYield: 4.0 },
      { period: "2026 (nå)", pe: 14.8, fwdPe: 12.9, evEbitda: 5.6, evEbit: 9.8, ps: 0.7, pb: 1.1, fcfYield: 5.1, divYield: 3.9 }
    ],
    estimates: {
      consensusRevenue: 196.3, consensusRevenuePrior: 198.5,
      consensusEps: 2.36, consensusEpsPrior: 2.55,
      consensusEbitda: 23.6, consensusEbitdaPrior: 25.0,
      revisionTrend: [2.70, 2.66, 2.62, 2.58, 2.52, 2.46, 2.40, 2.36],
      guidanceGoals: [
        {
          id: uid(), title: "Kostnadsguiding 2026", status: "venter",
          conclusion: "Guidingen ble justert opp i juli grunnet høyere strømpriser, og selskapet annonserte samtidig et kostnadskuttprogram på 1,5 mrd kr for å kompensere. Negativt for marginene på kort sikt.",
          updates: [
            { date: "16. jul 2026", text: "Guiding justert opp grunnet strømpriser. Kostnadskuttprogram på 1,5 mrd kr annonsert.", direction: "up" }
          ],
          news: [
            { date: "16. jul 2026", source: "E24", headline: "Hydro varsler høyere kostnader og nytt kuttprogram" }
          ]
        },
        {
          id: uid(), title: "CAPEX-guiding 2026", status: "venter",
          conclusion: "Investeringsbudsjettet er bekreftet uendret gjennom året så langt.",
          updates: [
            { date: "17. apr 2026", text: "Guiding bekreftet uendret på ca. 15 mrd kr.", direction: "flat" }
          ],
          news: [
            { date: "17. apr 2026", source: "Dagens Næringsliv", headline: "Hydro bekrefter investeringsplan for 2026" }
          ]
        },
        {
          id: uid(), title: "Kostnadsguiding 2025", status: "ikke-nådd",
          conclusion: "Kostnadene endte høyere enn guidet for 2025, grunnet økte strømpriser gjennom året. Målet ble ikke nådd.",
          updates: [
            { date: "15. jul 2025", text: "Guiding bekreftet uendret for 2025.", direction: "flat" }
          ],
          news: [
            { date: "15. jul 2025", source: "E24", headline: "Hydro bekrefter kostnadsmål for 2025" },
            { date: "4. feb 2026", source: "Reuters", headline: "Hydro bommer på eget kostnadsmål for 2025" }
          ]
        }
      ],
      quarterlyBeats: [
        { period: "Q3 25", estRevenue: 47.5, actRevenue: 47.8, estEps: 0.70, actEps: 0.72, result: "beat" },
        { period: "Q4 25", estRevenue: 48.2, actRevenue: 47.8, estEps: 0.80, actEps: 0.77, result: "miss" },
        { period: "Q1 26", estRevenue: 48.5, actRevenue: 48.1, estEps: 0.63, actEps: 0.58, result: "miss" },
        { period: "Q2 26", estRevenue: 49.5, actRevenue: 48.9, estEps: 0.60, actEps: 0.53, result: "miss" }
      ]
    },
    events: [
      { id: uid(), date: "2026-10-21", type: "Rapport", title: "Q3-rapport 2026", description: "Kvartalsrapport og resultatpresentasjon.", source: "auto" },
      { id: uid(), date: "2026-11-10", type: "Ex-dato", title: "Ex-dato utbytte", description: "Årlig utbytteutbetaling.", source: "auto" }
    ],
    ownership: {
      topHolders: [
        { name: "Nærings- og fiskeridepartementet", pct: 34.3, change: 0.0 },
        { name: "Folketrygdfondet", pct: 6.9, change: 0.0 },
        { name: "BlackRock", pct: 2.0, change: -0.1 }
      ],
      insiderTrades: [{ name: "Styremedlem (navn tilbakeholdt)", role: "Styremedlem", type: "Salg", shares: 5000, price: 62.80, date: "2026-09-01", time: "10:05" }],
      managementHoldings: [{ name: "Eivind Kallevik", role: "Konsernsjef", shares: 62000 }]
    },
    leadership: {
      executives: [
        { name: "Eivind Kallevik", role: "Konsernsjef (CEO)", since: "2023", background: "Tidligere finansdirektør i Hydro.", shares: 62000, profile: "Gikk fra rollen som finansdirektør til konsernsjef i 2023, og har dermed god kjennskap til selskapets økonomi fra innsiden. Kjent for tett oppfølging av kostnadsdisiplin, særlig i en periode med høye strømpriser som har presset marginene i aluminiumsvirksomheten." },
        { name: "Trond Olaf Christophersen", role: "Finansdirektør (CFO)", since: "2023", background: "Tidligere leder for konsernøkonomi og styring.", shares: 15000, profile: "Lang fartstid i konsernøkonomi- og styringsfunksjonen i Hydro før han ble finansdirektør i 2023. Kjent for grundig og detaljorientert økonomistyring." }
      ],
      board: [
        { name: "Dag Mejdell", role: "Styreleder", since: "2020", background: "Tidligere konsernsjef i Posten Norge.", shares: 5000, profile: "Bred styreerfaring fra flere store norske selskaper, blant annet som konsernsjef i Posten Norge over mange år. Har vært styreleder i Hydro siden 2020 og regnes som en erfaren og stø styreleder i krevende omstillingsperioder." },
        { name: "Cathrine Klouman", role: "Styremedlem", since: "2021", background: "Tidligere partner i konsulentbransjen.", shares: 0, profile: "Bakgrunn fra strategi- og omstillingsprosjekter som partner i konsulentbransjen. Bidrar med ekstern strategisk kompetanse inn i styrearbeidet." }
      ]
    },
    competitors: [
      { ticker: "NHY", name: "Norsk Hydro ASA", marketCapText: "128 mrd kr", revenueGrowth: 3.5, opMargin: 5.3, eps: 2.36, fcfYield: 5.1, debt: 38.2, pe: 14.8, evEbitda: 5.6, priceChange: -1.8, highlight: true },
      { ticker: "ALCOA", name: "Alcoa", marketCapText: "95 mrd kr", revenueGrowth: 2.1, opMargin: 4.8, eps: 1.10, fcfYield: 4.2, debt: 28.0, pe: 16.2, evEbitda: 6.0, priceChange: -0.9, highlight: false },
      { ticker: "RIO", name: "Rio Tinto", marketCapText: "980 mrd kr", revenueGrowth: 1.4, opMargin: 28.0, eps: 42.1, fcfYield: 8.9, debt: 120, pe: 9.6, evEbitda: 4.9, priceChange: 0.3, highlight: false }
    ],
    thesis: {
      whyFollow: "Syklisk satsing på industrimetaller med en lavkarbon-fordel i aluminium, kjøpt på svakhet i strømpris-drevne marginer.",
      bull: "Strømprisene i Europa faller tilbake, aluminiumsprisen stiger videre, og lavkarbon-premiumet vokser i takt med strengere EU-regulering.",
      base: "Fortsatt press på marginer fra strømpriser, delvis kompensert av moderat høyere aluminiumspris.",
      bear: "Strømpriser forblir høye over flere år samtidig som aluminiumsprisen faller på svakere global etterspørsel.",
      bullDrivers: ["Lavere europeiske strømpriser", "Høyere aluminiumspris", "Vekst i lavkarbon-premium"],
      baseDrivers: ["Fortsatt moderat høye strømpriser", "Moderat høyere aluminiumspris", "Uendret kostnadsnivå"],
      bearDrivers: ["Vedvarende høye strømpriser", "Svakere global etterspørsel/fallende aluminiumspris", "Investeringsoverskridelser"],
      invalidators: ["EBITDA-margin under 8 % over to kvartaler på rad"],
      notes: [{ id: uid(), date: "2026-07-16", text: "Svak Q2 grunnet strømpriser – følger kostnadskuttprogrammet tett fremover." }]
    },
    sources: DEFAULT_SOURCES.slice(0, 6),
    factors: [
      { id: uid(), name: "Aluminiumspris (LME)", description: "Direkte inntektsdriver.", on: true, priority: "Høy", linkedSources: ["Reuters"] },
      { id: uid(), name: "Europeiske strømpriser", description: "Viktigste kostnadsdriver for smelteverkene.", on: true, priority: "Høy", linkedSources: ["DN", "Reuters"] },
      { id: uid(), name: "Kostnadskuttprogram", description: "Fremdrift på annonserte kostnadskutt.", on: true, priority: "Middels", linkedSources: ["E24"] }
    ],
    prompts: JSON.parse(JSON.stringify(DEFAULT_PROMPTS)),
    promptOverrides: {},
    thresholds: { relevanceMin: 4, impactAlert: 6, impactCritical: 8 }
  };

  // ===================== KAHOOT! =====================
  companies.KAHOT = {
    ticker: "KAHOT", name: "Kahoot! ASA", exchange: "Oslo Børs", sector: "Teknologi",
    color: "#7c3aed", initials: "KH",
    price: 19.42, changePct: 5.1, changeAbs: 0.94, currency: "NOK",
    marketCapText: "9,8 mrd kr", peRatio: 38.6, fwdPe: 24.1, evEbitda: 18.2, evEbit: 26.4, ps: 6.1, pb: 4.2, fcfYield: 3.2, divYield: 0.0,
    week52Low: 13.1, week52High: 22.6, volumeToday: "3,9M", sharesOutText: "505 mill.",
    analystTarget: { avg: 21.5, count: 9 },
    inPortfolio: false, watchSince: "20. jun 2026",
    thesisSummary: "Kahoot! er en spekulativ vekstcase innen edtech/engagement-programvare. Casen avhenger av at abonnementsveksten i bedriftssegmentet fortsetter og at lønnsomheten forbedres.",
    keyRisks: ["Avtagende vekst i bedriftsabonnementer", "Økt konkurranse fra gratis alternativer", "Oppkjøpsspekulasjon kan skape volatilitet uten fundamental endring"],
    keyDrivers: ["Fortsatt vekst i betalte bedriftsabonnementer", "Forbedret EBITDA-margin", "Mulig oppkjøpsinteresse fra private equity"],
    nextEvent: { date: "29. okt 2026", label: "Q3-rapport 2026" },
    lastReport: { date: "21. jul 2026", label: "Q2-rapport 2026", summary: "Omsetningsvekst på 14 % år-over-år, drevet av bedriftssegmentet. EBITDA-margin forbedret til 22 % fra 18 %." },
    guidanceChange: { date: "21. jul 2026", direction: "up", text: "Full-års omsetningsvekst-guiding hevet fra 10-13 % til 12-15 %." },
    insiderChange: { date: "5. sep 2026", text: "Styreleder kjøpte 50 000 aksjer i det åpne markedet." },
    priceHistory: [16.8, 17.1, 16.5, 17.4, 17.0, 17.8, 17.3, 18.1, 17.6, 18.4, 17.9, 18.6, 18.0, 18.8, 18.3, 19.0, 18.5, 19.2, 18.7, 19.4, 18.9, 19.6, 18.8, 19.42],
    news: [
      { id: uid(), source: "Bloomberg", time: "8t siden", date: "2026-09-18", category: "M&A", headline: "Kahoot! vurderes for oppkjøp av private equity-fond", aiSummary: "Ifølge kilder Bloomberg siterer vurderer et internasjonalt private equity-fond et mulig bud på Kahoot!, uten at noe er bekreftet av selskapet.", impact: 8, impactLabel: "Høy positiv", rationale: "Oppkjøpsspekulasjon driver ofte kortsiktig kursoppgang via en potensiell budpremie, men er ubekreftet og kan reverseres raskt.", caseAreas: ["Drivere"], material: true, read: false, flagged: true, note: "" },
      { id: uid(), source: "E24", time: "2d siden", date: "2026-09-16", category: "Vekst", headline: "Kahoot! rapporterer sterk vekst i bedriftssegmentet", aiSummary: "Bedriftssegmentet vokser raskere enn resten av virksomheten og utgjør nå over 60 % av abonnementsinntektene.", impact: 6, impactLabel: "Moderat positiv", rationale: "Bedriftssegmentet har høyere marginer enn utdanningssegmentet, så vekstmiksen understøtter lønnsomhetsforbedringen.", caseAreas: ["Drivere", "Estimater"], material: true, read: true, flagged: false, note: "" }
    ],
    financials: {
      unit: "mill kr",
      annual: [
        { period: "2022", revenue: 890, revenueGrowth: 24.0, ebitda: 62, ebit: -40, netIncome: -95, eps: -0.19, grossMargin: 88.0, opMargin: -4.5, fcf: -30, capex: 45, debt: 120, netDebt: -180, cash: 300, sharesOutText: "498 mill." },
        { period: "2023", revenue: 1010, revenueGrowth: 13.5, ebitda: 110, ebit: 5, netIncome: -20, eps: -0.04, grossMargin: 88.5, opMargin: 0.5, fcf: 15, capex: 50, debt: 110, netDebt: -220, cash: 330, sharesOutText: "500 mill." },
        { period: "2024", revenue: 1140, revenueGrowth: 12.9, ebitda: 165, ebit: 62, netIncome: 30, eps: 0.06, grossMargin: 89.0, opMargin: 5.4, fcf: 55, capex: 52, debt: 105, netDebt: -260, cash: 365, sharesOutText: "503 mill." },
        { period: "2025", revenue: 1265, revenueGrowth: 11.0, ebitda: 215, ebit: 108, netIncome: 68, eps: 0.135, grossMargin: 89.3, opMargin: 8.5, fcf: 90, capex: 55, debt: 100, netDebt: -300, cash: 400, sharesOutText: "504 mill." },
        { period: "2026E", revenue: 1445, revenueGrowth: 14.2, ebitda: 290, ebit: 168, netIncome: 118, eps: 0.234, grossMargin: 89.6, opMargin: 11.6, fcf: 135, capex: 58, debt: 95, netDebt: -345, cash: 440, sharesOutText: "505 mill." }
      ],
      quarterly: [
        { period: "Q3 24", revenue: 290, revenueGrowth: 12.0, ebitda: 45, ebit: 18, netIncome: 8, eps: 0.016, grossMargin: 89.0, opMargin: 6.2, fcf: 14, capex: 13, debt: 103, netDebt: -270, cash: 373, sharesOutText: "503 mill." },
        { period: "Q4 24", revenue: 320, revenueGrowth: 12.6, ebitda: 55, ebit: 24, netIncome: 12, eps: 0.024, grossMargin: 89.2, opMargin: 7.5, fcf: 20, capex: 14, debt: 100, netDebt: -300, cash: 400, sharesOutText: "504 mill." },
        { period: "Q1 25", revenue: 295, revenueGrowth: 10.5, ebitda: 48, ebit: 21, netIncome: 11, eps: 0.022, grossMargin: 89.1, opMargin: 7.1, fcf: 17, capex: 13, debt: 100, netDebt: -305, cash: 405, sharesOutText: "504 mill." },
        { period: "Q2 25", revenue: 315, revenueGrowth: 11.5, ebitda: 55, ebit: 26, netIncome: 15, eps: 0.030, grossMargin: 89.4, opMargin: 8.3, fcf: 21, capex: 14, debt: 100, netDebt: -310, cash: 410, sharesOutText: "504 mill." },
        { period: "Q3 25", revenue: 325, revenueGrowth: 12.1, ebitda: 60, ebit: 30, netIncome: 18, eps: 0.036, grossMargin: 89.5, opMargin: 9.2, fcf: 24, capex: 14, debt: 98, netDebt: -320, cash: 418, sharesOutText: "504 mill." },
        { period: "Q4 25", revenue: 335, revenueGrowth: 4.7, ebitda: 62, ebit: 31, netIncome: 20, eps: 0.040, grossMargin: 89.6, opMargin: 9.3, fcf: 26, capex: 15, debt: 95, netDebt: -330, cash: 425, sharesOutText: "505 mill." },
        { period: "Q1 26", revenue: 340, revenueGrowth: 15.3, ebitda: 68, ebit: 36, netIncome: 24, eps: 0.048, grossMargin: 89.7, opMargin: 10.6, fcf: 29, capex: 14, debt: 95, netDebt: -335, cash: 430, sharesOutText: "505 mill." },
        { period: "Q2 26", revenue: 358, revenueGrowth: 13.7, ebitda: 78, ebit: 43, netIncome: 29, eps: 0.057, grossMargin: 89.9, opMargin: 12.0, fcf: 33, capex: 15, debt: 95, netDebt: -345, cash: 440, sharesOutText: "505 mill." }
      ]
    },
    valuationHistory: [
      { period: "2022", pe: -55.0, fwdPe: 40.0, evEbitda: 22.0, evEbit: -35.0, ps: 5.8, pb: 3.6, fcfYield: -1.1, divYield: 0.0 },
      { period: "2023", pe: -80.0, fwdPe: 35.0, evEbitda: 15.5, evEbit: 210.0, ps: 5.5, pb: 3.8, fcfYield: 0.6, divYield: 0.0 },
      { period: "2024", pe: 120.0, fwdPe: 30.0, evEbitda: 12.8, evEbit: 34.0, ps: 5.9, pb: 3.9, fcfYield: 2.1, divYield: 0.0 },
      { period: "2025", pe: 62.0, fwdPe: 27.5, evEbitda: 16.0, evEbit: 32.0, ps: 6.0, pb: 4.0, fcfYield: 2.7, divYield: 0.0 },
      { period: "2026 (nå)", pe: 38.6, fwdPe: 24.1, evEbitda: 18.2, evEbit: 26.4, ps: 6.1, pb: 4.2, fcfYield: 3.2, divYield: 0.0 }
    ],
    estimates: {
      consensusRevenue: 1445, consensusRevenuePrior: 1410,
      consensusEps: 0.234, consensusEpsPrior: 0.215,
      consensusEbitda: 290, consensusEbitdaPrior: 275,
      revisionTrend: [0.195, 0.202, 0.208, 0.212, 0.218, 0.224, 0.229, 0.234],
      guidanceGoals: [
        {
          id: uid(), title: "Omsetningsvekst-guiding 2026", status: "venter",
          conclusion: "Veksttakten ble hevet i juli etter sterk utvikling i første halvår. Foreløpig ingen tegn til at dette ikke skal holde.",
          updates: [
            { date: "21. jul 2026", text: "Guiding hevet fra 10-13 % til 12-15 % vekst.", direction: "up" }
          ],
          news: [
            { date: "21. jul 2026", source: "Finansavisen", headline: "Kahoot hever vekstguiding etter sterkt halvår" }
          ]
        },
        {
          id: uid(), title: "EBITDA-margin-mål 2026", status: "venter",
          conclusion: "Marginmålet er bekreftet uendret gjennom året så langt.",
          updates: [
            { date: "24. apr 2026", text: "Mål bekreftet uendret på 18-20 % margin.", direction: "flat" }
          ],
          news: [
            { date: "24. apr 2026", source: "E24", headline: "Kahoot bekrefter marginmål for 2026" }
          ]
        },
        {
          id: uid(), title: "Omsetningsvekst-guiding 2025", status: "nådd",
          conclusion: "Kahoot leverte 12 % omsetningsvekst i 2025, innenfor det guidede intervallet på 10-13 %.",
          updates: [
            { date: "20. jul 2025", text: "Guiding satt til 10-13 % vekst for 2025.", direction: "flat" }
          ],
          news: [
            { date: "20. jul 2025", source: "Finansavisen", headline: "Kahoot setter vekstmål for 2025" },
            { date: "3. feb 2026", source: "E24", headline: "Kahoot leverer vekst innenfor eget mål" }
          ]
        }
      ],
      quarterlyBeats: [
        { period: "Q3 25", estRevenue: 318, actRevenue: 325, estEps: 0.033, actEps: 0.036, result: "beat" },
        { period: "Q4 25", estRevenue: 330, actRevenue: 335, estEps: 0.038, actEps: 0.040, result: "beat" },
        { period: "Q1 26", estRevenue: 332, actRevenue: 340, estEps: 0.044, actEps: 0.048, result: "beat" },
        { period: "Q2 26", estRevenue: 350, actRevenue: 358, estEps: 0.052, actEps: 0.057, result: "beat" }
      ]
    },
    events: [
      { id: uid(), date: "2026-10-29", type: "Rapport", title: "Q3-rapport 2026", description: "Kvartalsrapport og resultatpresentasjon.", source: "auto" },
      { id: uid(), date: "2026-09-25", type: "Produktlansering", title: "Lansering av ny AI-funksjon i bedriftsprodukt", description: "Ny funksjon for automatisk generering av quiz fra dokumenter.", source: "auto" }
    ],
    ownership: {
      topHolders: [
        { name: "General Atlantic", pct: 14.2, change: 0.0 },
        { name: "Datum International (grunnleggerne)", pct: 11.8, change: -0.2 },
        { name: "Folketrygdfondet", pct: 3.1, change: 0.1 }
      ],
      insiderTrades: [{ name: "Styreleder (navn tilbakeholdt)", role: "Styreleder", type: "Kjøp", shares: 50000, price: 18.20, date: "2026-09-05", time: "12:40" }],
      managementHoldings: [{ name: "Eilert Hanoa", role: "Konsernsjef", shares: 1250000 }]
    },
    leadership: {
      executives: [
        { name: "Eilert Hanoa", role: "Konsernsjef (CEO)", since: "2014", background: "Medgründer av Kahoot!. Tidligere partner i Northzone.", shares: 1250000, profile: "Medgründer av Kahoot! og konsernsjef siden oppstarten i 2014, med bakgrunn som partner i venturefondet Northzone før det. Kjent for en vekstorientert, risikovillig strategi med flere oppkjøp for å bygge ut produktporteføljen utover det opprinnelige quiz-konseptet i skolen. Har vært sentral i å ta selskapet fra en norsk oppstart til global aktør innen læring og engasjement." },
        { name: "Erik Harrell", role: "Finansdirektør (CFO)", since: "2022", background: "Tidligere finansdirektør i flere skalerbare techselskaper.", shares: 45000, profile: "Bakgrunn som finansdirektør i flere internasjonale, skalerbare teknologiselskaper før han kom til Kahoot! i 2022. Kjent for erfaring med å bygge finansiell infrastruktur i raskt voksende selskaper." }
      ],
      board: [
        { name: "Øystein Eriksen Søreide", role: "Styreleder", since: "2020", background: "Tidligere adm. dir. i Abelia.", shares: 12000, profile: "Bakgrunn fra næringslivsorganisasjonen Abelia, med erfaring fra teknologi- og kunnskapsbedrifter i Norge. Har vært styreleder i Kahoot! siden 2020." },
        { name: "Manon Lorent", role: "Styremedlem", since: "2022", background: "Tidligere Chief Digital Officer i Sanofi.", shares: 0, profile: "Bred internasjonal erfaring fra digital transformasjon i store selskaper, blant annet som Chief Digital Officer i Sanofi. Bidrar med teknologi- og digitaliseringskompetanse inn i styrearbeidet." }
      ]
    },
    competitors: [
      { ticker: "KAHOT", name: "Kahoot! ASA", marketCapText: "9,8 mrd kr", revenueGrowth: 14.2, opMargin: 11.6, eps: 0.234, fcfYield: 3.2, debt: 95, pe: 38.6, evEbitda: 18.2, priceChange: 5.1, highlight: true },
      { ticker: "DUOL", name: "Duolingo", marketCapText: "185 mrd kr", revenueGrowth: 38.0, opMargin: 14.0, eps: 1.85, fcfYield: 2.1, debt: 0, pe: 95.0, evEbitda: 55.0, priceChange: 1.8, highlight: false },
      { ticker: "TWLO", name: "Miro (privat, referanse)", marketCapText: "n/a", revenueGrowth: 25.0, opMargin: 10.0, eps: 0, fcfYield: 0, debt: 0, pe: 0, evEbitda: 0, priceChange: 0, highlight: false }
    ],
    thesis: {
      whyFollow: "Spekulativ vekstposisjon med opsjon på både organisk margeforbedring og en mulig oppkjøpspremie.",
      bull: "Bedriftssegmentet fortsetter å vokse >20 % årlig, EBITDA-marginen når 25 %+, og selskapet blir et reelt oppkjøpsmål.",
      base: "Omsetningsvekst på 12-15 % med gradvis marginforbedring, uten oppkjøp.",
      bear: "Veksten i bedriftssegmentet avtar til under 10 %, konkurransen fra gratisalternativer øker, og oppkjøpsspekulasjonen viser seg grunnløs.",
      bullDrivers: ["Vekst i bedriftsabonnementer > 20 %", "EBITDA-margin mot 25 %+", "Reell oppkjøpsinteresse"],
      baseDrivers: ["Omsetningsvekst 12–15 %", "Gradvis marginforbedring", "Ingen oppkjøp"],
      bearDrivers: ["Vekst i bedriftssegmentet under 10 %", "Økt konkurranse fra gratisalternativer", "Oppkjøpsspekulasjon viser seg grunnløs"],
      invalidators: ["To kvartaler på rad med vekst under 8 %"],
      notes: [{ id: uid(), date: "2026-07-21", text: "Sterk Q2 med marginforbedring til 22 % EBITDA-margin – casen styrkes." }]
    },
    sources: DEFAULT_SOURCES.slice(0, 5).concat([{ id: uid(), name: "@Kahoot på X", category: "social", trust: 3, priority: "Lav", on: true, custom: false, url: "https://x.com/kahoot" }]),
    factors: [
      { id: uid(), name: "Bedriftsabonnement-vekst", description: "Viktigste vekstdriver.", on: true, priority: "Høy", linkedSources: ["E24"] },
      { id: uid(), name: "Oppkjøpsrykter", description: "Overvåker M&A-relatert nyhetsflyt.", on: true, priority: "Høy", linkedSources: ["Bloomberg", "Reuters"] },
      { id: uid(), name: "EBITDA-margin-utvikling", description: "Sporer fremdrift mot marginmål.", on: true, priority: "Middels", linkedSources: ["E24"] }
    ],
    prompts: JSON.parse(JSON.stringify(DEFAULT_PROMPTS)),
    promptOverrides: {},
    thresholds: { relevanceMin: 3, impactAlert: 6, impactCritical: 8 }
  };

  // ---------- Global defaults ----------
  var globalDefaults = {
    sources: DEFAULT_SOURCES,
    sourceCategories: SOURCE_CATEGORIES,
    aiModels: AI_MODELS,
    selectedModel: "insight-explain",
    prompts: DEFAULT_PROMPTS,
    promptTasks: PROMPT_TASKS,
    thresholds: DEFAULT_THRESHOLDS
  };

  // Plattformbruk for AI-assistenten. Mockede tall inntil ekte API-kjøringer logges.
  var AI_USAGE = { totalRuns: 486, runsToday: 18, totalCostNOK: 612 };

  window.MOCK = {
    companies: companies,
    companyOrder: ["DNB"], // kun DNB under utvikling; øvrige selskaper ligger fortsatt i MOCK.companies og kan legges tilbake her
    globalDefaults: globalDefaults,
    strategies: STRATEGIES,
    aiUsage: AI_USAGE,
    fmtNOK: fmtNOK,
    fmtPct: fmtPct,
    uid: uid
  };
})();
