/* ============================================================
   Innsikt – ekte pålogging og database-tilkobling (Supabase)
   Krever at supabase-js er lastet FØR dette scriptet.
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "https://ikcikywavwcixozwjxdk.supabase.co";
  var SUPABASE_KEY = "sb_publishable_nWHjYfw7hpxdhpAbjGN9NQ_mOn4wpui";
  var SCHEMA = "finance_plattform";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("[Innsikt] Supabase-biblioteket mangler. Sjekk at supabase-js lastes før auth.js.");
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Alle spørringer mot plattform-dataene skal gå mot finance_plattform-skjemaet,
  // isolert fra andre ting i samme Supabase-prosjekt.
  function db(table) {
    return client.schema(SCHEMA).from(table);
  }

  var currentUser = null;
  var currentSession = null;
  var ready = false;

  function initials(nameOrEmail) {
    var s = (nameOrEmail || "").trim();
    if (!s) return "?";
    var parts = s.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  // Oppretter rad i app_users + standardinnstillinger første gang en bruker logger inn.
  // Rører aldri andre brukeres data (RLS sikrer dette uansett).
  function ensureAppUser(user) {
    return db("app_users").upsert(
      { id: user.id, email: user.email },
      { onConflict: "id", ignoreDuplicates: true }
    ).then(function () {
      return Promise.all([
        db("user_preferences").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true }),
        db("user_notification_settings").upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id", ignoreDuplicates: true })
      ]);
    });
  }

  function init() {
    if (ready) return Promise.resolve(currentUser);
    return client.auth.getSession().then(function (res) {
      currentSession = res.data ? res.data.session : null;
      currentUser = currentSession ? currentSession.user : null;
      ready = true;
      return currentUser;
    });
  }

  // Kalles øverst på hver side som krever innlogging. Sender til logg-inn.html
  // hvis ingen er innlogget, og kommer tilbake til samme side etterpå.
  function cachedUser() {
    try {
      var raw = localStorage.getItem("sb-" + SUPABASE_URL.replace("https://", "").split(".")[0] + "-auth-token");
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.user ? o.user : (o && o.currentSession && o.currentSession.user) || null;
    } catch (e) { return null; }
  }

  // Raskt: har vi en lagret innlogging vises siden med en gang, og sjekken skjer i bakgrunnen.
  // Uten lagret innlogging holdes siden skjult til sjekken er ferdig (som før).
  function requireAuth() {
    var cu = cachedUser();
    if (cu) {
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { paintUserCard(cu); });
      else paintUserCard(cu);
      document.documentElement.classList.add("auth-ready");
    }
    return init().then(function (user) {
      if (!user) {
        var back = encodeURIComponent(location.pathname.split("/").pop() + location.search);
        location.href = "logg-inn.html?redirect=" + back;
        return null;
      }
      paintUserCard(user);
      document.documentElement.classList.add("auth-ready");
      // Oppretting av brukerrader trengs bare første gang, og skjer i bakgrunnen.
      var flag = "innsikt-user-ok-" + user.id;
      var done = false;
      try { done = !!localStorage.getItem(flag); } catch (e) {}
      if (!done) ensureAppUser(user).then(function () { try { localStorage.setItem(flag, "1"); } catch (e) {} }, function () {});
      return user;
    });
  }

  // Fyller inn navn/avatar i sidebaren med ekte brukerdata (erstatter tidligere "Emil"-hardkoding),
  // og kobler på "logg ut"-knappen hvis siden har en.
  function paintUserCard(user) {
    var nameEl = document.getElementById("sidebarName");
    var avatarEl = document.getElementById("sidebarAvatar");
    var label = (user.user_metadata && user.user_metadata.display_name) || user.email;
    if (nameEl) nameEl.textContent = label;
    if (avatarEl) avatarEl.textContent = initials(label);
    var signOutBtn = document.getElementById("signOutBtn");
    if (signOutBtn && !signOutBtn._wired) {
      signOutBtn._wired = true;
      signOutBtn.addEventListener("click", function () { signOut(); });
    }
  }

  function signOut() {
    return client.auth.signOut().then(function () {
      location.href = "logg-inn.html";
    });
  }

  window.Auth = {
    client: client,
    db: db,
    schema: SCHEMA,
    init: init,
    requireAuth: requireAuth,
    signOut: signOut,
    getUser: function () { return currentUser; }
  };
})();
