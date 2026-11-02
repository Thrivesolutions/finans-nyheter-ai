/* ============================================================
   Innsikt – delt UI-logikk (rene DOM-hjelpere, ingen rammeverk)
   ============================================================ */
(function () {
  "use strict";

  var MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtDate(iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  function fmtDateShort(iso) {
    var d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.getDate() + ". " + MONTHS[d.getMonth()];
  }

  // ---------- localStorage state ----------
  var PREFIX = "innsikt:";
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(PREFIX + key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
    }
  };

  // ---------- chart helpers ----------
  // Returns an SVG polyline "points" string for a line chart, normalized into w x h.
  function linePoints(values, w, h, padTop, padBottom) {
    padTop = padTop || 6; padBottom = padBottom || 6;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    if (min === max) { min -= 1; max += 1; }
    var innerH = h - padTop - padBottom;
    var step = values.length > 1 ? w / (values.length - 1) : w;
    return values.map(function (v, i) {
      var x = Math.round(i * step * 100) / 100;
      var y = Math.round((padTop + innerH - ((v - min) / (max - min)) * innerH) * 100) / 100;
      return x + "," + y;
    }).join(" ");
  }

  function areaPoints(points, w, h) {
    return "0," + h + " " + points + " " + w + "," + h;
  }

  // Builds a waffle/pixel column: given a 0-100 score, returns array of 10 booleans (filled bottom-up)
  function waffleColumn(score, steps) {
    steps = steps || 10;
    var filledCount = Math.round((score / 100) * steps);
    var out = [];
    for (var i = 0; i < steps; i++) out.push(i >= (steps - filledCount));
    return out;
  }

  function sparklineSvg(values, color, w, h) {
    w = w || 100; h = h || 28;
    var pts = linePoints(values, w, h, 2, 2);
    return '<svg width="100%" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2"></polyline></svg>';
  }

  // ---------- generic UI wiring ----------
  function initTabs(root) {
    qsa("[data-tabbar]", root).forEach(function (bar) {
      var group = bar.getAttribute("data-tabbar");
      qsa(".tab", bar).forEach(function (tabBtn) {
        tabBtn.addEventListener("click", function () {
          qsa(".tab", bar).forEach(function (b) { b.classList.remove("active"); });
          tabBtn.classList.add("active");
          var target = tabBtn.getAttribute("data-tab");
          qsa('[data-tabpanel="' + group + '"]', document).forEach(function (p) {
            p.classList.toggle("active", p.getAttribute("data-panel") === target);
          });
          var evt = new CustomEvent("tabchange", { detail: { group: group, target: target } });
          document.dispatchEvent(evt);
        });
      });
    });
  }

  function initAccordions(root) {
    qsa(".accordion-head", root).forEach(function (head) {
      head.addEventListener("click", function () {
        head.parentElement.classList.toggle("open");
      });
    });
  }

  function initModals(root) {
    qsa("[data-modal-open]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-modal-open");
        var overlay = document.getElementById(id);
        if (overlay) overlay.classList.add("open");
      });
    });
    qsa("[data-modal-close]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var overlay = btn.closest(".modal-overlay");
        if (overlay) overlay.classList.remove("open");
      });
    });
    qsa(".modal-overlay", root).forEach(function (ov) {
      ov.addEventListener("click", function (e) {
        if (e.target === ov && !ov.hasAttribute("data-no-outside-close")) ov.classList.remove("open");
      });
    });
  }

  function initToggles(root, onChange) {
    qsa(".toggle[data-toggle]", root).forEach(function (t) {
      t.addEventListener("click", function () {
        var isOn = t.classList.toggle("on");
        if (onChange) onChange(t, isOn);
      });
    });
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- iframe-skall (app-shell.html) ----------
  // Hvis siden lastes inni rammen i app-shell.html, skjul sidens egen sidebar/topbar
  // (skallet har allerede sin egen, permanente versjon) og varsle skallet om hvilken
  // side som nå vises, slik at sidemenyen og brødsmulestien der kan oppdateres - uten
  // at hver enkeltside selv trenger å vite at den vises inni et skall.
  function initEmbeddedShell() {
    if (window === window.top) return; // frittstående sidevisning, ikke i et skall
    document.documentElement.classList.add("embedded");
    function announce() {
      var file = location.pathname.split("/").pop() || "dashboard.html";
      var crumbEl = document.querySelector(".topbar .crumb");
      window.parent.postMessage({
        type: "innsikt:navigated",
        page: file,
        href: file + location.search + location.hash,
        title: document.title,
        crumbHtml: crumbEl ? crumbEl.innerHTML : ""
      }, "*");
    }
    if (document.readyState === "complete") announce();
    else window.addEventListener("load", announce);
  }
  initEmbeddedShell();

  window.App = {
    qs: qs, qsa: qsa,
    fmtDate: fmtDate, fmtDateShort: fmtDateShort,
    store: store,
    linePoints: linePoints, areaPoints: areaPoints, waffleColumn: waffleColumn, sparklineSvg: sparklineSvg,
    initTabs: initTabs, initAccordions: initAccordions, initModals: initModals, initToggles: initToggles,
    debounce: debounce, escapeHtml: escapeHtml
  };
})();
