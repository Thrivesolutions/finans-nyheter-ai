/* ============================================================
   Innsikt – henter ekte selskapsdata fra databasen og legger dem inn i
   nøyaktig samme felter som siden alltid har brukt (MOCK.companies[ticker]).
   Selve utseendet og oppsettet i selskap.html / selskaper.html er uendret.
   Krever: supabase-js, auth.js, data.js (MOCK).
   ============================================================ */
(function () {
  "use strict";
  var MOCK = window.MOCK;
  var PALETTE = ["#0F766E", "#1D4ED8", "#7C3AED", "#B45309", "#BE123C", "#0369A1", "#4D7C0F", "#9333EA", "#C2410C", "#0E7490"];
  var FIN_UI = { fin_revenue: "revenue", fin_revenue_growth: "revenueGrowth", fin_ebitda: "ebitda", fin_ebit: "ebit", fin_net_income: "netIncome", fin_eps: "eps", fin_gross_margin: "grossMargin", fin_op_margin: "opMargin", fin_fcf: "fcf", fin_capex: "capex", fin_debt: "debt", fin_net_debt: "netDebt", fin_cash: "cash", fin_shares_out: "sharesOutText" };
  var VAL_UI = { val_pe: "pe", val_ev_ebitda: "evEbitda", val_ev_ebit: "evEbit", val_ps: "ps", val_pb: "pb", val_fcf_yield: "fcfYield", val_div_yield: "divYield" };
  var VAL_COL = { pe: "pe", fwdPe: "fwd_pe", evEbitda: "ev_ebitda", evEbit: "ev_ebit", ps: "ps", pb: "pb", fcfYield: "fcf_yield", divYield: "div_yield" };
  var STOCK_METRICS = ["net_debt", "cash", "debt", "cet1_ratio", "solvency_ratio", "shares_out", "customer_deposits", "gross_loans", "insurance_liabilities", "investment_portfolio"];

  function colorOf(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }
  function nb(v, d) { return Number(v).toLocaleString("nb-NO", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function dnb(iso) { var d = new Date(iso); return isNaN(d) ? String(iso || "") : d.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" }); }
  function num(v) { return v == null || v === "" ? null : Number(v); }
  function pkey(p) {
    var m = /^Q(\d) (\d\d)/.exec(p); if (m) return (2000 + Number(m[2])) * 10 + Number(m[1]);
    m = /^(\d{4})/.exec(p); if (m) return Number(m[1]) * 10 + (/nå/.test(p) ? 9 : 5);
    return 0;
  }
  function uid() { return MOCK.uid ? MOCK.uid() : Math.random().toString(36).slice(2, 10); }

  function fetchAll(table, cols, filter) {
    var out = [];
    function page(from) {
      var q = Auth.db(table).select(cols); q = filter ? filter(q) : q;
      return q.range(from, from + 999).then(function (r) {
        if (r.error) throw r.error;
        out = out.concat(r.data || []);
        return (r.data && r.data.length === 1000) ? page(from + 1000) : out;
      });
    }
    return page(0);
  }
  function one(res) { if (res.error) throw res.error; return res.data; }

  // Tom, men komplett, selskapsstruktur – slik at alle faner kan tegnes selv når ingenting er hentet ennå.
  function blank(c) {
    var G = MOCK.globalDefaults;
    return {
      ticker: c.ticker, name: c.name, exchange: c.exchange || "", sector: c.sector || c.industry || "–",
      color: c.brand_color || colorOf(c.ticker), initials: c.initials || c.ticker.slice(0, 2).toUpperCase(),
      price: 0, changePct: 0, changeAbs: 0, currency: c.currency || "NOK", marketCapText: "–",
      peRatio: null, fwdPe: null, evEbitda: null, evEbit: null, ps: null, pb: null, fcfYield: null, divYield: null,
      week52Low: null, week52High: null, volumeToday: "–", sharesOutText: "–", analystTarget: null,
      inPortfolio: false, thesisSummary: "", keyRisks: [], keyDrivers: [], nextEvent: null, lastReport: null,
      guidanceChange: null, insiderChange: null, priceHistory: [], news: [],
      financials: { unit: "", annual: [], quarterly: [] }, valuationHistory: [],
      estimates: { consensusRevenue: null, consensusRevenuePrior: null, consensusEps: null, consensusEpsPrior: null, consensusEbitda: null, consensusEbitdaPrior: null, revisionTrend: [], guidanceGoals: [], quarterlyBeats: [] },
      events: [], ownership: { topHolders: [], insiderTrades: [], managementHoldings: [] }, leadership: { executives: [], board: [] },
      competitors: [],
      thesis: { whyFollow: "", bull: "", base: "", bear: "", bullDrivers: [], baseDrivers: [], bearDrivers: [], invalidators: [], notes: [] },
      sources: [], factors: [], prompts: JSON.parse(JSON.stringify(G.prompts)), promptOverrides: {}, thresholds: JSON.parse(JSON.stringify(G.thresholds))
    };
  }

  function applySnapshot(o, q) {
    if (!q || q.price == null) return;
    o.price = Number(q.price); o.changePct = num(q.change_pct) || 0; o.changeAbs = num(q.change_abs) || 0;
    if (q.currency) o.currency = q.currency;
    o.marketCapText = q.market_cap_text || "–";
    o.peRatio = num(q.pe_ratio); o.fwdPe = num(q.fwd_pe); o.evEbitda = num(q.ev_ebitda); o.evEbit = num(q.ev_ebit);
    o.ps = num(q.ps); o.pb = num(q.pb); o.fcfYield = num(q.fcf_yield); o.divYield = num(q.div_yield);
    o.week52Low = num(q.week52_low); o.week52High = num(q.week52_high);
    o.volumeToday = q.volume_today != null ? Number(q.volume_today).toLocaleString("nb-NO") : "–";
    o.sharesOutText = q.shares_out_text || "–";
    o.pTbv = num(q.p_tbv);
    o.quoteUpdatedAt = q.updated_at;
    if (q.analyst_target_avg != null) o.analystTarget = { avg: Number(q.analyst_target_avg), count: q.analyst_target_count || 0 };
  }

  function fmtFinValue(uk, v) { return v; }

  // ---------------------------------------------------------------- full innlasting for én selskapsside
  function loadFull(c) {
    var id = c.id, kind = c.reporting_kind || c.kind || "standard";
    return Promise.all([
      Auth.db("company_quote_snapshot").select("*").eq("company_id", id).maybeSingle(),
      fetchAll("company_price_data", "price_timestamp,price", function (q) { return q.eq("company_id", id).eq("resolution", "daily").order("price_timestamp", { ascending: true }); }),
      fetchAll("company_financials", "period,period_type,metric_key,metric_value,unit,source,source_url", function (q) { return q.eq("company_id", id); }),
      Auth.db("company_valuation_history").select("*").eq("company_id", id),
      Auth.db("metric_definitions").select("*").eq("kind", kind),
      Auth.db("company_guidance_goals").select("*").eq("company_id", id),
      Auth.db("company_events").select("*").eq("company_id", id).order("event_date", { ascending: true }),
      Auth.db("company_shareholders").select("*").eq("company_id", id).order("ownership_pct", { ascending: false }),
      Auth.db("company_insider_trades").select("*").eq("company_id", id).order("trade_date", { ascending: false }),
      Auth.db("company_people").select("*").eq("company_id", id),
      Auth.db("company_subsidiaries").select("*").eq("company_id", id).order("name"),
      Auth.db("company_sources").select("*").eq("company_id", id),
      Auth.db("source_categories").select("id,key"),
      Auth.db("company_guidance_rounds").select("*").eq("company_id", id),
      Auth.db("company_event_checks").select("checked_at").eq("company_id", id).order("checked_at", { ascending: false }).limit(1),
      Auth.db("company_thesis").select("*").eq("company_id", id).maybeSingle()
    ]).then(function (r) {
      var q = one(r[0]), px = r[1], fin = r[2], val = one(r[3]) || [], defs = one(r[4]) || [], goals = one(r[5]) || [], events = one(r[6]) || [],
        holders = one(r[7]) || [], insiders = one(r[8]) || [], people = one(r[9]) || [], subs = one(r[10]) || [], csrc = one(r[11]) || [], cats = one(r[12]) || [], rounds = (r[13] && !r[13].error ? r[13].data : []) || [];
      var thesisRow = (r[15] && !r[15].error) ? r[15].data : null;
      var gids = goals.map(function (g) { return g.id; }), sids = csrc.map(function (s) { return s.source_id; });
      return Promise.all([
        gids.length ? Auth.db("company_guidance_goal_updates").select("*").in("goal_id", gids).order("update_date", { ascending: false }) : { data: [] },
        sids.length ? Auth.db("sources").select("id,name,url,trust_score,category_id").in("id", sids) : { data: [] },
        thesisRow ? Auth.db("company_thesis_drivers").select("*").eq("thesis_id", thesisRow.id).order("sort_order", { ascending: true }) : { data: [] },
        thesisRow ? Auth.db("company_thesis_notes").select("*").eq("thesis_id", thesisRow.id).order("created_at", { ascending: true }) : { data: [] },
        loadSignals(id)
      ]).then(function (r2) {
        return { q: q, px: px, fin: fin, val: val, defs: defs, goals: goals, events: events, holders: holders, insiders: insiders, people: people, subs: subs, csrc: csrc, cats: cats, rounds: rounds, upd: one(r2[0]) || [], srcs: one(r2[1]) || [], thesis: { row: thesisRow, drivers: one(r2[2]) || [], notes: one(r2[3]) || [], signals: r2[4] || [] }, evCheck: (r[14] && !r[14].error && r[14].data && r[14].data[0]) || null };
      });
    });
  }

  // Funn som krysser tesen (brukerens egne, lagret av thesis-classify). Tom liste hvis ingen finnes.
  function relTime(iso) {
    var t = new Date(iso); if (isNaN(t)) return "";
    var days = Math.floor((Date.now() - t.getTime()) / 86400000);
    return days <= 0 ? "i dag" : days === 1 ? "i går" : days < 14 ? days + " dager siden" : t.toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  }
  function loadSignals(companyId) {
    return Auth.db("company_thesis_signals").select("*").eq("company_id", companyId).in("status", ["new", "confirmed", "weakened"]).order("updated_at", { ascending: false }).then(function (r) {
      var sigs = (r && !r.error && r.data) || [];
      if (!sigs.length) return [];
      var ids = sigs.map(function (x) { return x.id; });
      return Auth.db("company_thesis_signal_news").select("*").in("signal_id", ids).then(function (rn) {
        var links = (rn && !rn.error && rn.data) || [], nids = links.map(function (l) { return l.news_id; });
        return (nids.length ? Auth.db("company_news").select("id,headline,source,published_at").in("id", nids) : Promise.resolve({ data: [] })).then(function (nn) {
          var by = {}; ((nn && nn.data) || []).forEach(function (n) { by[n.id] = n; });
          return sigs.map(function (x) {
            return { id: x.id, title: x.title, kind: x.kind, effect: x.effect, likelihood: x.likelihood, confirmation: x.confirmation || "", likelihoodBasis: (x.likelihood_basis && x.likelihood_basis.text) || "", horizonText: x.horizon_text || "", horizonBasis: x.horizon_basis || "", rationale: x.rationale || "", status: x.status, tag: x.tag || "",
              items: links.filter(function (l) { return l.signal_id === x.id && by[l.news_id]; }).map(function (l) { var n = by[l.news_id]; return { headline: n.headline, source: n.source || "", time: relTime(n.published_at), stance: l.stance }; }) };
          });
        });
      });
    }, function () { return []; });
  }

  // Kjører vurderingen på nytt (bruker innlogget brukers økt). Returnerer teksten fra tjenesten.
  function runThesisClassify(o) {
    return Auth.client.auth.getSession().then(function (res) {
      var tok = res.data && res.data.session && res.data.session.access_token;
      if (!tok) throw new Error("Du er ikke logget inn");
      return fetch("https://ikcikywavwcixozwjxdk.supabase.co/functions/v1/thesis-classify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, apikey: "sb_publishable_nWHjYfw7hpxdhpAbjGN9NQ_mOn4wpui" }, body: JSON.stringify({ company_id: o.dbId }) });
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok === false) throw new Error(j.error || "Feilet");
      return j.skipped || j.summary || "Ferdig.";
    }).then(function (msg) { return loadSignals(o.dbId).then(function (sigs) { o.thesis.signals = sigs; return msg; }); });
  }

  function compose(c, d, o) {
    var kind = c.reporting_kind || c.kind || "standard";
    o.live = true; o.dbId = c.id; o.kindKey = kind;
    o.color = c.brand_color || o.color; o.initials = c.initials || o.initials;
    applySnapshot(o, d.q);

    // ---- tese (brukerens egen, lagret i databasen)
    var tr = d.thesis || { row: null, drivers: [], notes: [] }, trow = tr.row || {};
    var drv = function (sc) { return tr.drivers.filter(function (x) { return x.scenario === sc; }).map(function (x) { return x.text_value; }); };
    o.thesis = { whyFollow: trow.why_follow || "", bull: trow.bull_text || "", base: trow.base_text || "", bear: trow.bear_text || "",
      bullDrivers: drv("bull"), baseDrivers: drv("base"), bearDrivers: drv("bear"), invalidators: [], signals: tr.signals || [],
      notes: tr.notes.map(function (n) { return { id: n.id, date: n.note_date || (n.created_at || "").slice(0, 10), text: n.text_value }; }) };

    // ---- kursserie (ekte)
    o.realPrices = d.px.map(function (p) { return { t: new Date(p.price_timestamp).getTime(), v: Number(p.price) }; });
    if (o.realPrices.length > 1) o.priceHistory = o.realPrices.slice(-30).map(function (p) { return p.v; });

    // ---- finans: hver rad i siden har en fast nøkkel (slot); hva den betyr for dette selskapet kommer fra metric_definitions
    var slotDef = {}; d.defs.forEach(function (x) { slotDef[x.slot_key] = x; });
    var finLabels = {}, finFmt = {}, finInfo = {}, finNA = {}, valLabels = {}, valNA = {}, valInfo = {};
    var UK_FMT = { pct: "%", per_share: "n2", count: "txt", amount: "u", ratio: "u" };
    Object.keys(FIN_UI).forEach(function (slot) {
      var df = slotDef[slot]; if (!df) return; var key = FIN_UI[slot];
      finLabels[key] = df.label; finFmt[key] = key === "sharesOutText" ? "txt" : (UK_FMT[df.unit_kind] || "u");
      if (kind !== "standard") finInfo[key] = { label: df.label, desc: df.description || df.label, formula: df.formula || "Hentet direkte fra selskapets rapporter." };
      if (df.applicable === false) finNA[key] = df.not_applicable_reason || "Ikke relevant for denne selskapstypen.";
    });
    Object.keys(VAL_UI).forEach(function (slot) {
      var df = slotDef[slot]; if (!df) return; var key = VAL_UI[slot];
      valLabels[key] = df.label;
      if (kind !== "standard") valInfo[key] = { label: df.label, desc: df.description || df.label, formula: df.formula || "Beregnet ut fra rapporterte tall og kursen." };
      if (df.applicable === false) valNA[key] = df.not_applicable_reason || "Ikke relevant for denne selskapstypen.";
    });
    o.finLabels = finLabels; o.finFmt = finFmt; o.finInfo = finInfo; o.finNA = finNA; o.valLabels = valLabels; o.valNA = valNA; o.valInfo = valInfo;

    var metricOfUi = {}; Object.keys(FIN_UI).forEach(function (slot) { var df = slotDef[slot]; if (df) metricOfUi[FIN_UI[slot]] = df.metric_key; });
    var byPM = {}, unitOf = {};
    d.fin.forEach(function (f) { if (f.metric_value == null) return; byPM[f.period_type + "|" + f.period + "|" + f.metric_key] = Number(f.metric_value); if (f.unit) unitOf[f.metric_key] = f.unit; });
    function periods(type) { var s = {}; d.fin.forEach(function (f) { if (f.period_type === type) s[f.period] = 1; }); return Object.keys(s).sort(function (a, b) { return pkey(a) - pkey(b); }); }
    function rowFor(type, p) {
      var row = { period: p };
      Object.keys(metricOfUi).forEach(function (uiKey) {
        var v = byPM[type + "|" + p + "|" + metricOfUi[uiKey]];
        if (uiKey === "sharesOutText") row[uiKey] = v != null ? nb(v, 1) + " mill" : "–";
        else row[uiKey] = v == null ? null : v;
      });
      return row;
    }
    var revMetric = metricOfUi.revenue;
    o.financials = { unit: unitOf[revMetric] || unitOf.total_income || unitOf.premium_income || "", annual: periods("annual").slice(-8).map(function (p) { return rowFor("annual", p); }), quarterly: periods("quarterly").slice(-12).map(function (p) { return rowFor("quarterly", p); }) };

    // ---- verdsettelse
    o.valuationHistory = d.val.slice().sort(function (a, b) { return pkey(a.period) - pkey(b.period); }).map(function (v) {
      var row = { period: v.period };
      Object.keys(VAL_COL).forEach(function (k) { row[k] = num(v[VAL_COL[k]]); });
      var evDef = slotDef.val_ev_ebitda; if (evDef && evDef.metric_key === "p_tbv") row.evEbitda = num(v.p_tbv);
      return row;
    });
    if (slotDef.val_ev_ebitda && slotDef.val_ev_ebitda.metric_key === "p_tbv") o.evEbitda = o.pTbv != null ? o.pTbv : null;

    // ---- nøkkelfelt som avhenger av selskapstype (de to flisene i Oversikt som ikke gir mening for alle)
    function latest(metric, preferQuarter) {
      var rows = d.fin.filter(function (f) { return f.metric_key === metric && f.metric_value != null; });
      var qs = rows.filter(function (f) { return f.period_type === "quarterly"; }), as = rows.filter(function (f) { return f.period_type === "annual"; });
      var pick = (preferQuarter && qs.length) ? qs : (as.length ? as : qs);
      pick.sort(function (a, b) { return pkey(b.period) - pkey(a.period); });
      return pick[0] || null;
    }
    function txt(f, uk, unit) { if (!f) return "–"; var v = Number(f.metric_value); return uk === "pct" ? nb(v, 1) + " %" : nb(v, 1) + (unit ? " " + unit : ""); }
    o.kpiOverride = {};
    var nd = slotDef.fin_net_debt;
    if (nd) {
      var lf = latest(nd.metric_key, true);
      o.kpiOverride["Netto gjeld"] = [nd.metric_key === "net_debt" ? "Netto gjeld" : nd.label, txt(lf, nd.unit_kind, nd.unit_kind === "amount" ? (lf && lf.unit) : "")];
    }
    if (kind !== "standard") o.kpiOverride["EV/EBITDA"] = ["P/B", o.pb != null ? nb(o.pb, 1) : "–"];

    // ---- estimater: selskapets egne mål (guiding). Konsensus er betalt og hentes ikke.
    o.estimates.guidanceGoals = d.goals.map(function (g) {
      var ups = d.upd.filter(function (u) { return u.goal_id === g.id; });
      var status = ["nådd", "ikke-nådd"].indexOf(g.status) > -1 ? g.status : "venter";
      return {
        id: g.id, title: g.title, status: status, conclusion: g.conclusion || (ups[0] && ups[0].text_value) || "",
        updates: ups.map(function (u) { return { date: dnb(u.update_date), direction: ["up", "down", "flat"].indexOf(u.direction) > -1 ? u.direction : "flat", text: u.text_value || "", url: g.source_url || null }; }),
        news: Array.isArray(ups.length && ups[0].linked_news) ? [] : []
      };
    });

    // ---- guiding-runder (frist, kilde, fasit, poeng)
    var goalById = {}; d.goals.forEach(function (g) { goalById[g.id] = g; });
    o.estimates.guidanceRounds = (d.rounds || []).filter(function (r) { var g = goalById[r.goal_id]; return g && !g.hidden; }).map(function (r) {
      var g = goalById[r.goal_id] || {};
      var ups = d.upd.filter(function (u) { return u.round_id === r.id; });
      return {
        id: r.id, goalId: r.goal_id, title: g.title || "", horizon: r.horizon || "", spanMonths: r.span_months != null ? Number(r.span_months) : null, standing: !!g.standing, roundNo: r.round_no || 1,
        target: r.target_text || "", periodLabel: r.period_label || "", setDate: r.set_date, dueDate: r.due_date,
        nextCheckDate: r.next_check_date, nextCheckLabel: r.next_check_label || "", finalCheckDate: r.final_check_date, finalCheckLabel: r.final_check_label || "",
        sourceLabel: r.source_label || "", sourceUrl: r.source_url || "", sourcePage: r.source_page, quote: r.quote_no || "",
        status: r.status === "ferdig" ? "ferdig" : "pågår", outcome: r.outcome, actual: r.actual_text || "", conclusion: r.conclusion || "",
        evidenceQuote: r.evidence_quote_no || "", evidenceLabel: r.evidence_label || "", evidenceUrl: r.evidence_url || "", evidencePage: r.evidence_page,
        closedDate: r.closed_date, changesUp: r.changes_up || 0, changesDown: r.changes_down || 0, score: r.score, scoreReason: r.score_reason || "",
        updates: ups.map(function (u) { return { date: u.update_date, kind: u.kind || "bekreftet", text: u.text_value || "", nextCheck: u.next_check_date, sourceLabel: u.source_label || "", page: u.source_page, url: u.source_url || "" }; })
      };
    });

    // ---- hendelser
    var srcName = function (u) { if (!u) return ""; try { var h = new URL(u).hostname.replace(/^www\./, ""); return /newsweb\.oslobors/.test(h) ? "Børsmelding (Oslo Børs)" : h; } catch (e) { return "Kilde"; } };
    o.events = d.events.map(function (e) { return { id: e.id, date: String(e.event_date).slice(0, 10), type: e.event_type || "Annet", title: e.title, description: e.description || "", source: e.source || "auto", url: e.source_url || null, sourceName: srcName(e.source_url) }; });
    o.eventCheck = d.evCheck ? { at: d.evCheck.checked_at } : null;
    var today = new Date().toISOString().slice(0, 10);
    var up = o.events.filter(function (e) { return e.date >= today; })[0];
    if (up) o.nextEvent = { date: dnb(up.date), label: up.title };
    var lastRep = o.events.filter(function (e) { return e.date < today && /rapport/i.test(e.type); }).pop();
    if (lastRep) o.lastReport = { date: dnb(lastRep.date), label: lastRep.title, summary: lastRep.description || "" };

    // ---- eierskap
    o.ownership = {
      topHolders: (function () {
        var dt = function (h) { return String(h.as_of_date || "").slice(0, 10); };
        var dates = d.holders.map(dt).sort(), latest = dates[dates.length - 1], prevD = dates.filter(function (x) { return x < latest; }).pop(), prev = {};
        d.holders.forEach(function (h) { if (dt(h) === prevD) prev[h.holder_name] = num(h.ownership_pct); });
        return d.holders.filter(function (h) { return dt(h) === latest; }).map(function (h) { var p = num(h.ownership_pct) || 0; return { name: h.holder_name, pct: p, change: prev[h.holder_name] != null ? Math.round((p - prev[h.holder_name]) * 100) / 100 : 0 }; });
      })(),
      holdersAsOf: d.holders.length ? d.holders.map(function (h) { return String(h.as_of_date || "").slice(0, 10); }).sort().pop() : "",
      holdersUrl: (function () { var l = d.holders.slice().sort(function (x, y) { return String(y.as_of_date).localeCompare(String(x.as_of_date)); })[0]; return l ? (l.source_url || "") : ""; })(),
      mgmtUrl: (function () { var l = d.people.filter(function (p) { return p.shares_held != null && p.status === "active" && p.source_url; })[0]; return l ? l.source_url : ""; })(),
      insiderTrades: d.insiders.map(function (t) {
        var shares = num(t.shares) || 0, price = num(t.price); if (price == null) price = (t.value != null && shares) ? Number(t.value) / shares : 0;
        return { name: t.insider_name, role: t.role || "", type: /sell|salg/i.test(t.transaction_type || "") ? "Salg" : "Kjøp", shares: shares, price: price, date: String(t.trade_date).slice(0, 10), time: "", url: t.source_url || "" };
      }),
      managementHoldings: d.people.filter(function (p) { return p.shares_held != null && p.status === "active" && !/vara|observat/i.test(p.role || ""); }).map(function (p) { return { name: p.name, role: p.role || "", shares: Number(p.shares_held) }; })
    };

    // ---- ledelse og struktur
    function person(p) { return { name: p.name, role: p.role || "", since: p.since_year ? String(p.since_year) : "", background: p.background || "", shares: p.shares_held != null ? Number(p.shares_held) : null, independent: typeof p.independent === "boolean" ? p.independent : null, represents: p.represents || "", gap: p.gap_reason || "", verified: p.verified_at || "", url: (p.source_url && !/brreg\.no/.test(p.source_url)) ? p.source_url : "", srcName: srcName((p.source_url && !/brreg\.no/.test(p.source_url)) ? p.source_url : "") }; }
    var livePeople = d.people.filter(function (p) { return !p.status || p.status === "active"; }); // «former» og «duplicate» vises aldri
    o.leadership = { executives: livePeople.filter(function (p) { return p.person_type === "executive"; }).map(person), board: livePeople.filter(function (p) { return p.person_type === "board"; }).map(person) };
    o.leadership.checkedAt = livePeople.reduce(function (m, p) { return p.verified_at && p.verified_at > m ? p.verified_at : m; }, "");
    if (c.parent_name) o.leadership.parent = { name: c.parent_name };
    if (d.subs.length) o.leadership.subsidiaries = d.subs.map(function (s) { return { name: s.name }; });

    // ---- kilder
    var catKey = {}; d.cats.forEach(function (x) { catKey[x.id] = x.key; });
    var srcBy = {}; d.srcs.forEach(function (s) { srcBy[s.id] = s; });
    o.sources = d.csrc.map(function (cs) {
      var s = srcBy[cs.source_id]; if (!s) return null;
      var group = cs.source_group || "news";
      return { id: s.id, name: s.name, url: s.url || "", category: catKey[s.category_id] || (group === "news" ? "custom" : "ir"), trust: s.trust_score || 3, priority: cs.priority || "Middels", on: cs.is_enabled !== false, custom: cs.origin === "user", origin: cs.origin, group: group, what: cs.what_text || "", why: cs.why_text || "", checkedAt: cs.last_checked_at || null, checkStatus: cs.last_check_status || null };
    }).filter(Boolean);
    return o;
  }

  // Slår sammen med eksisterende eksempeldata: det databasen eier overstyrer; det som ennå ikke hentes (nyheter, tese osv.) beholdes.
  function install(ticker) {
    return Auth.db("companies").select("*").eq("ticker", ticker).order("is_active", { ascending: false }).limit(1).then(function (res) {
      var c = (res.data || [])[0];
      if (res.error || !c) return false;
      if (!c.is_active && !MOCK.companies[ticker]) { /* påbegynt selskap – vis det som finnes */ }
      return loadFull(c).then(function (d) {
        var base = MOCK.companies[ticker] ? JSON.parse(JSON.stringify(MOCK.companies[ticker])) : blank(c);
        var fresh = blank(c);
        var keepFromMock = ["news", "thesis", "factors", "prompts", "promptOverrides", "thresholds", "competitors", "thesisSummary", "keyRisks", "keyDrivers", "inPortfolio", "guidanceChange", "insiderChange"];
        var o = fresh; keepFromMock.forEach(function (k) { if (base[k] !== undefined) o[k] = base[k]; });
        o.name = c.name; o.exchange = c.exchange || o.exchange; o.sector = c.sector || c.industry || o.sector;
        o.sources = []; // kilder kommer bare fra databasen
        compose(c, d, o);
        MOCK.companies[ticker] = o;
        return true;
      });
    });
  }

  // ---------------------------------------------------------------- lett innlasting for selskapslisten
  function installList() {
    var out = { added: [], pending: [] };
    return Auth.db("companies").select("id,ticker,name,exchange,currency,sector,industry,kind,initials,brand_color,is_active,onboarding_state")
      .or("is_active.eq.true,onboarding_state.in.(awaiting_start,running,failed)").order("name").then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [], act = rows.filter(function (c) { return c.is_active; }), pend = rows.filter(function (c) { return !c.is_active; });
        var ids = act.map(function (c) { return c.id; }), pids = pend.map(function (c) { return c.id; });
        var since = new Date(Date.now() - 50 * 86400000).toISOString();
        return Promise.all([
          ids.length ? fetchAll("company_price_data", "company_id,price,price_timestamp", function (q) { return q.in("company_id", ids).eq("resolution", "daily").gte("price_timestamp", since).order("price_timestamp", { ascending: true }); }) : [],
          pids.length ? Auth.db("onboarding_runs").select("id,company_id,status,created_at").in("company_id", pids).order("created_at", { ascending: false }) : { data: [] }
        ]).then(function (r) {
          var hist = {}; (r[0] || []).forEach(function (p) { (hist[p.company_id] = hist[p.company_id] || []).push(Number(p.price)); });
          act.forEach(function (c) {
            var o = MOCK.companies[c.ticker];
            if (!o) {
              o = blank(c); MOCK.companies[c.ticker] = o; o.live = true;
              o.name = c.name;
            }
            if (hist[c.id] && hist[c.id].length > 1) o.priceHistory = hist[c.id].slice(-30);
            else if (!o.priceHistory.length) o.priceHistory = [1, 1];
            o.color = c.brand_color || o.color; o.initials = c.initials || o.initials; o.exchange = c.exchange || o.exchange; o.sector = c.sector || o.sector;
            if (MOCK.companyOrder.indexOf(c.ticker) < 0) { MOCK.companyOrder.push(c.ticker); out.added.push(c.ticker); }
          });
          var latest = {}; ((r[1] && r[1].data) || []).forEach(function (x) { if (!latest[x.company_id]) latest[x.company_id] = x; });
          out.pending = pend.map(function (c) { return { id: c.id, ticker: c.ticker, name: c.name, exchange: c.exchange, sector: c.sector, kind: c.kind, initials: c.initials, color: c.brand_color || colorOf(c.ticker), state: c.onboarding_state, run: latest[c.id] || null }; });
          return out;
        });
      });
  }

  // ---- Lagring av tese i databasen (per bruker – skjermet av RLS). Kjøres i kø slik at hurtige endringer ikke kolliderer.
  var thesisQueue = Promise.resolve();
  function saveThesis(o, T) {
    var u = window.Auth && Auth.getUser && Auth.getUser();
    if (!o || !o.dbId || !u) return Promise.resolve(false);
    var snap = JSON.parse(JSON.stringify(T));
    thesisQueue = thesisQueue.then(function () {
      return Auth.db("company_thesis").upsert({ user_id: u.id, company_id: o.dbId, why_follow: snap.whyFollow || "", bull_text: snap.bull || "", base_text: snap.base || "", bear_text: snap.bear || "", updated_at: new Date().toISOString() }, { onConflict: "user_id,company_id" }).select("id").single()
      .then(function (res) {
        if (res.error) throw res.error;
        var tid = res.data.id;
        return Auth.db("company_thesis_drivers").delete().eq("thesis_id", tid).then(function (del) {
          if (del.error) throw del.error;
          var rows = [];
          [["bull", "bullDrivers"], ["base", "baseDrivers"], ["bear", "bearDrivers"]].forEach(function (p) {
            (snap[p[1]] || []).forEach(function (t, i) { rows.push({ thesis_id: tid, scenario: p[0], text_value: t, sort_order: i }); });
          });
          return rows.length ? Auth.db("company_thesis_drivers").insert(rows) : { error: null };
        }).then(function (ins) { if (ins && ins.error) throw ins.error; return tid; });
      });
    }).then(function () { return true; }, function (e) { console.error("[Innsikt] Kunne ikke lagre tesen:", e); return false; });
    return thesisQueue;
  }
  function addThesisNote(o, T, text) {
    var u = window.Auth && Auth.getUser && Auth.getUser();
    if (!o || !o.dbId || !u) return Promise.resolve(null);
    return saveThesis(o, T).then(function () {
      return Auth.db("company_thesis").select("id").eq("company_id", o.dbId).eq("user_id", u.id).single();
    }).then(function (r) {
      if (r.error) throw r.error;
      var d = new Date().toISOString().slice(0, 10);
      return Auth.db("company_thesis_notes").insert({ thesis_id: r.data.id, note_date: d, text_value: text }).select("id").single().then(function (x) { return x.error ? null : { id: x.data.id, date: d, text: text }; });
    }).then(null, function (e) { console.error("[Innsikt] Kunne ikke lagre notatet:", e); return null; });
  }

  window.LiveCompany = { install: install, installList: installList, saveThesis: saveThesis, addThesisNote: addThesisNote, runThesisClassify: runThesisClassify };
})();
