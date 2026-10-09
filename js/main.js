/* =========================================================
   Madium Client — UI + auth + demo checkout
   ========================================================= */
(function () {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ---------- toast ---------- */
  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-show"), 3400);
  }

  /* =========================================================
     HEADER / NAV / REVEAL / EFFECTS
     ========================================================= */
  const header = $("#header");
  const nav = $("#nav");
  const burger = $("#burger");

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  burger.addEventListener("click", () => {
    burger.classList.toggle("is-open");
    nav.classList.toggle("is-open");
  });
  $$(".nav__link").forEach((a) =>
    a.addEventListener("click", () => {
      burger.classList.remove("is-open");
      nav.classList.remove("is-open");
    })
  );

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add("is-visible"), i * 70);
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  $$("[data-reveal]").forEach((el) => io.observe(el));

  const counterIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = +el.dataset.count;
        const t0 = performance.now();
        const dur = 1600;
        const tick = (t) => {
          const p = Math.min((t - t0) / dur, 1);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString("ru-RU");
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        counterIO.unobserve(el);
      });
    },
    { threshold: 0.5 }
  );
  $$("[data-count]").forEach((el) => counterIO.observe(el));

  /* terminal typing */
  const typeLine = $("#typeLine");
  const lines = [
    "license --check  > OK",
    "update --fetch   > 2.4.1",
    "inject --safe    > READY",
    "play --now       > GG",
  ];
  let li = 0, ci = 0, del = false;
  (function typeLoop() {
    const line = lines[li];
    ci += del ? -1 : 1;
    typeLine.textContent = line.slice(0, ci);
    let wait = del ? 30 : 65;
    if (!del && ci === line.length) { wait = 1500; del = true; }
    else if (del && ci === 0) { del = false; li = (li + 1) % lines.length; wait = 350; }
    setTimeout(typeLoop, wait);
  })();

  $$(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  /* =========================================================
     PLANS
     ========================================================= */
  const PLANS = {
    m30:    { name: "30 дней",  price: 149, days: 30 },
    m90:    { name: "90 дней",  price: 300, days: 90 },
    life:   { name: "LifeTime", price: 450, days: 0 },
    ltbeta: { name: "LT + Beta", price: 700, days: 0, beta: true },
  };

  const fmt = (n) => n.toLocaleString("ru-RU") + " ₽";
  const DAY = 86400000;

  /* =========================================================
     AUTH (demo: localStorage)
     ========================================================= */
  const USERS_KEY = "md_users";
  const SESSION_KEY = "md_session";

  function hashPass(str) {
    let h = 5381;
    const salted = "madium::" + str;
    for (let i = 0; i < salted.length; i++) h = ((h << 5) + h + salted.charCodeAt(i)) >>> 0;
    return "md$" + h.toString(36);
  }

  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveUsers(users) {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) {}
  }

  let user = null; // active account record
  let pendingBuy = null; // plan to open after login

  function sessionStart(email) {
    user = loadUsers()[email.toLowerCase()] || null;
    try { localStorage.setItem(SESSION_KEY, email.toLowerCase()); } catch (e) {}
    if (user && !user.uid) { user.uid = nextUid(); persist(); } // старые аккаунты получают UID
    syncAccountUI(); // профиль, аватар, промокоды и рекорды → из этого аккаунта
  }
  function sessionRestore() {
    let email = null;
    try { email = localStorage.getItem(SESSION_KEY); } catch (e) {}
    if (email && loadUsers()[email]) sessionStart(email);
    else syncAccountUI();
  }
  function sessionEnd() {
    user = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    syncAccountUI();
  }
  function persist() {
    if (!user) return;
    const users = loadUsers();
    users[user.email] = user;
    saveUsers(users);
  }

  const authArea = $("#authArea");

  function planLabel() {
    if (!user || !user.plan || !user.plan.name) return null;
    const p = user.plan;
    if (p.expires) {
      const left = Math.ceil((p.expires - Date.now()) / DAY);
      if (left <= 0) return p.name + " · истёк";
      return p.name + " · " + left + " дн.";
    }
    return p.name;
  }

  function renderAuthArea() {
    if (user) {
      const label = planLabel();
      const avaCls = user.avatar ? " has-img" : user.emoji ? " is-emoji" : "";
      const ava = user.avatar
        ? '<img alt="" src="' + user.avatar + '">'
        : user.emoji || (user.nick[0] || "U").toUpperCase();
      authArea.innerHTML =
        '<button class="user-pill" id="userBtn">' +
          '<span class="user-pill__ava' + avaCls + '">' + ava + "</span>" +
          "<span class=\"user-pill__nick\">" + escapeHtml(user.nick) + "</span>" +
          (label ? '<span class="user-pill__plan">' + escapeHtml(label) + "</span>" : "") +
        "</button>";
      $("#userBtn").addEventListener("click", openAccount);
    } else {
      authArea.innerHTML = '<button class="btn btn--ghost btn--sm" id="loginBtn">Войти</button>';
      $("#loginBtn").addEventListener("click", () => openAuth("login"));
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  /* ---------- modal helpers ---------- */
  function openModal(id) {
    const m = $(id);
    m.classList.add("is-open");
    m.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeModal(m) {
    m.classList.remove("is-open");
    m.setAttribute("aria-hidden", "true");
    if (!$$(".modal.is-open").length) document.body.style.overflow = "";
  }
  $$(".modal").forEach((m) => {
    $$("[data-close]", m).forEach((el) => el.addEventListener("click", () => closeModal(m)));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = $$(".modal.is-open");
    if (open.length) closeModal(open[open.length - 1]);
  });

  /* ---------- auth modal ---------- */
  const authModal = $("#authModal");
  const loginForm = $("#loginForm");
  const registerForm = $("#registerForm");

  function openAuth(tab) {
    switchAuthTab(tab || "login");
    openModal("#authModal");
    setTimeout(() => (tab === "register" ? $("#regNick") : $("#loginEmail")).focus(), 60);
  }

  function switchAuthTab(tab) {
    $$(".auth-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.authTab === tab));
    loginForm.hidden = tab !== "login";
    registerForm.hidden = tab !== "register";
    $("#authTitle").textContent = tab === "login" ? "Вход в аккаунт" : "Создание аккаунта";
    $("#authSub").textContent =
      tab === "login"
        ? "Доступ, ключи и заявки привязаны к аккаунту."
        : "10 секунд — и доступ будет привязан.";
  }

  $$(".auth-tab").forEach((b) =>
    b.addEventListener("click", () => switchAuthTab(b.dataset.authTab))
  );

  function markError(input, on) {
    input.classList.toggle("is-error", !!on);
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const emailEl = $("#loginEmail");
    const passEl = $("#loginPass");
    const email = emailEl.value.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      markError(emailEl, true);
      toast("Введите корректный e-mail");
      return;
    }
    markError(emailEl, false);

    if (!passEl.value) {
      markError(passEl, true);
      toast("Введите пароль");
      return;
    }

    const users = loadUsers();
    if (!users[email] || users[email].pass !== hashPass(passEl.value)) {
      markError(passEl, true);
      toast("Неверный e-mail или пароль");
      return;
    }
    markError(passEl, false);

    sessionStart(email);
    closeModal(authModal);
    toast("С возвращением, " + users[email].nick + "! 👋");
    afterAuth();
  });

  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const nickEl = $("#regNick");
    const emailEl = $("#regEmail");
    const passEl = $("#regPass");
    const pass2El = $("#regPass2");

    const nick = nickEl.value.trim();
    const email = emailEl.value.trim().toLowerCase();
    let ok = true;

    if (nick.length < 3) { markError(nickEl, true); ok = false; } else markError(nickEl, false);
    if (!/^\S+@\S+\.\S+$/.test(email)) { markError(emailEl, true); ok = false; } else markError(emailEl, false);
    if (passEl.value.length < 4) { markError(passEl, true); ok = false; } else markError(passEl, false);
    if (pass2El.value !== passEl.value) { markError(pass2El, true); ok = false; } else markError(pass2El, false);

    if (!ok) { toast("Проверьте поля формы"); return; }

    const users = loadUsers();
    if (users[email]) {
      markError(emailEl, true);
      toast("Аккаунт с таким e-mail уже существует");
      return;
    }

    users[email] = {
      email,
      nick,
      pass: hashPass(passEl.value),
      uid: nextUid(), // порядковый номер аккаунта
      avatar: null,
      emoji: null,
      promos: [],
      scores: {},
      plan: null,
      licenseKey: null,
      buys: 0,
      tickets: 0,
      created: Date.now(),
    };
    saveUsers(users);
    sessionStart(email);
    closeModal(authModal);
    toast("Аккаунт создан — добро пожаловать! 🎉");
    afterAuth();
  });

  function afterAuth() {
    if (pendingBuy) {
      const plan = pendingBuy;
      pendingBuy = null;
      setTimeout(() => openBuy(plan), 250);
    }
  }

  /* ---------- account modal ---------- */
  const accModal = $("#accModal");

  function fillAccount() {
    if (!user) return;
    paintAvatar($("#accAvatar"), (user.nick[0] || "U").toUpperCase());
    $("#accNick").textContent = user.nick;
    $("#accEmail").textContent = user.email;
    $("#accUid").textContent = "UID " + uidLabel();

    const p = user.plan;
    if (p && p.name) {
      $("#accPlanName").textContent = p.name;
      if (p.expires) {
        const left = Math.ceil((p.expires - Date.now()) / DAY);
        $("#accExpiry").textContent = left > 0
          ? new Date(p.expires).toLocaleDateString("ru-RU") + " (" + left + " дн.)"
          : "истёк " + new Date(p.expires).toLocaleDateString("ru-RU");
      } else {
        $("#accExpiry").textContent = "бессрочно";
      }
      $("#accKey").textContent = user.licenseKey || "—";
      $("#accBeta").textContent = p.beta ? "Включён ★" : "Выключен";
      $("#accBeta").classList.toggle("is-on", !!p.beta);
    } else {
      $("#accPlanName").textContent = "Нет активного доступа";
      $("#accExpiry").textContent = "—";
      $("#accKey").textContent = "—";
      $("#accBeta").textContent = "Выключен";
      $("#accBeta").classList.remove("is-on");
    }

    $("#accTickets").textContent = user.tickets || 0;
    $("#accBuys").textContent = user.buys || 0;
  }

  function openAccount() {
    if (!user) return openAuth("login");
    fillAccount();
    openModal("#accModal");
  }

  function syncAccountModal() {
    if (accModal.classList.contains("is-open")) fillAccount();
  }

  $("#accExtend").addEventListener("click", () => {
    closeModal(accModal);
    setTimeout(() => openBuy("life"), 200);
  });

  $("#accLogout").addEventListener("click", () => {
    sessionEnd();
    closeModal(accModal);
    toast("Вы вышли из аккаунта");
  });

  /* =========================================================
     TICKET FORM
     ========================================================= */
  const ticketForm = $("#ticketForm");
  ticketForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let ok = true;
    $$("[required]", ticketForm).forEach((f) => {
      const bad = !f.value.trim() || (f.type === "email" && !/^\S+@\S+\.\S+$/.test(f.value));
      f.classList.toggle("is-error", bad);
      if (bad) ok = false;
    });
    if (!ok) { toast("Заполните обязательные поля корректно"); return; }

    const num = 1043 + Math.floor(Math.random() * 900);
    if (user) {
      user.tickets = (user.tickets || 0) + 1;
      persist();
      renderAuthArea();
      toast("Заявка #" + num + " создана от имени " + user.nick + " 🎫");
    } else {
      toast("Заявка #" + num + " создана · войдите, чтобы видеть её в кабинете");
    }
    ticketForm.reset();
  });

  /* =========================================================
     BUY (demo checkout)
     ========================================================= */
  const buyModal = $("#buyModal");
  const buyForm = $("#buyForm");
  const buySuccess = $("#buySuccess");
  const totalVal = $("#totalVal");
  const promoInput = $("#promo");

  let currentPlan = "life";
  let promoApplied = false;

  function renderTotal() {
    const base = PLANS[currentPlan].price;
    const sum = promoApplied ? Math.round(base * 0.9) : base;
    totalVal.textContent = fmt(sum);
    $("#mTitle").textContent = "Оформление — " + PLANS[currentPlan].name;
    $$(".mp").forEach((b) => b.classList.toggle("is-active", b.dataset.plan === currentPlan));
  }

  function openBuy(planKey) {
    if (!user) {
      pendingBuy = PLANS[planKey] ? planKey : "life";
      openAuth("login");
      toast("Войдите в аккаунт, чтобы оформить доступ");
      return;
    }
    currentPlan = PLANS[planKey] ? planKey : "life";
    buyForm.hidden = false;
    buySuccess.hidden = true;
    promoApplied = false;
    promoInput.value = "";
    $("#buyEmail").value = user.email;
    renderTotal();
    openModal("#buyModal");
  }

  $$("[data-buy]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openBuy(btn.dataset.buy || "life");
    })
  );

  $$(".mp").forEach((b) =>
    b.addEventListener("click", () => {
      currentPlan = b.dataset.plan;
      renderTotal();
    })
  );

  /* promo */
  $("#promoBtn").addEventListener("click", () => {
    const code = promoInput.value.trim().toUpperCase();
    if (code === "GOD10") {
      if (!promoApplied) toast("Промокод применён: скидка 10% 🎉");
      promoApplied = true;
      renderTotal();
    } else if (!code) {
      toast("Введите промокод (подсказка: GOD10)");
    } else {
      toast("Промокод не найден или истёк");
    }
  });

  /* input masks */
  const cardInput = $("#card");
  cardInput.addEventListener("input", () => {
    const digits = cardInput.value.replace(/\D/g, "").slice(0, 16);
    cardInput.value = digits.replace(/(.{4})/g, "$1 ").trim();
    markError(cardInput, false);
  });

  const mmYY = $("#mmYY");
  mmYY.addEventListener("input", () => {
    let v = mmYY.value.replace(/\D/g, "").slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    mmYY.value = v;
    markError(mmYY, false);
  });

  const cvc = $("#cvc");
  cvc.addEventListener("input", () => {
    cvc.value = cvc.value.replace(/\D/g, "").slice(0, 3);
    markError(cvc, false);
  });

  const keyChars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const genKey = () =>
    "MD-" +
    Array.from({ length: 3 }, () =>
      Array.from({ length: 4 }, () => keyChars[Math.floor(Math.random() * keyChars.length)]).join("")
    ).join("-");

  buyForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#buyEmail");
    let ok = true;

    if (!/^\S+@\S+\.\S+$/.test(email.value)) { markError(email, true); ok = false; }
    const digits = cardInput.value.replace(/\D/g, "");
    if (digits.length !== 16) { markError(cardInput, true); ok = false; }
    if (!/^\d{2}\/\d{2}$/.test(mmYY.value)) { markError(mmYY, true); ok = false; }
    if (cvc.value.length !== 3) { markError(cvc, true); ok = false; }

    if (!ok) { toast("Проверьте данные карты и e-mail"); return; }

    const btn = $("#payBtn");
    btn.disabled = true;
    btn.textContent = "Обработка платежа…";

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = "Оплатить";

      const plan = PLANS[currentPlan];
      const key = genKey();

      /* attach plan to account (тот же код, что у промокодов) */
      applyReward({ key: currentPlan, name: plan.name, days: plan.days, beta: plan.beta });
      user.licenseKey = key;
      user.buys = (user.buys || 0) + 1;
      persist();
      syncAccountUI();

      $("#fakeKey").textContent = key;
      buyForm.hidden = true;
      buySuccess.hidden = false;
      toast("Тариф «" + plan.name + "» активирован на аккаунте " + user.nick + " ✓");
      buyForm.reset();
    }, 1400);
  });

  /* =========================================================
     PROFILE · UID · AVATAR · PROMO CODES
     всё привязано к аккаунту из «Войти» (см. sessionStart/sessionEnd)
     ========================================================= */
  const UID_KEY = "md_uid_seq";
  const PROMO_KEY = "md_promos";

  function nextUid() {
    let n = 0;
    try { n = +localStorage.getItem(UID_KEY) || 0; } catch (e) {}
    n += 1;
    try { localStorage.setItem(UID_KEY, String(n)); } catch (e) {}
    return n;
  }

  function uidLabel() {
    if (!user || !user.uid) return "—";
    return String(user.uid).padStart(5, "0");
  }

  /* ---------- мост рекордов: игровые записи живут в аккаунте ---------- */
  window.MadiumScores = {
    get(key) {
      try {
        if (user && user.scores && typeof user.scores[key] === "number") return user.scores[key];
        return +localStorage.getItem(key) || 0;
      } catch (e) { return 0; }
    },
    set(key, val) {
      try {
        const glob = +localStorage.getItem(key) || 0;
        if (val > glob) localStorage.setItem(key, String(val));
      } catch (e) {}
      if (!user) return;
      user.scores = user.scores || {};
      const cur = typeof user.scores[key] === "number" ? user.scores[key] : 0;
      if (val > cur) { user.scores[key] = val; persist(); }
    },
  };

  /* ---------- единый рендер состояния аккаунта ---------- */
  function syncAccountUI() {
    renderAuthArea();
    renderProfile();
    renderPromos();
    syncAccountModal();
    document.dispatchEvent(new CustomEvent("md-auth", { detail: { logged: !!user } }));
  }

  function paintAvatar(el, letter) {
    if (!el) return;
    el.classList.remove("has-img", "is-emoji");
    if (user && user.avatar) {
      el.classList.add("has-img");
      el.innerHTML = '<img alt="" src="' + user.avatar + '">';
    } else if (user && user.emoji) {
      el.classList.add("is-emoji");
      el.textContent = user.emoji;
    } else {
      el.textContent = letter;
    }
  }

  function renderProfile() {
    const guest = $("#profileGuest");
    const grid = $("#profileGrid");
    if (!guest || !grid) return;

    if (!user) {
      guest.hidden = false;
      grid.hidden = true;
      return;
    }
    guest.hidden = true;
    grid.hidden = false;

    paintAvatar($("#pAvatar"), (user.nick[0] || "U").toUpperCase());
    $("#pNick").textContent = user.nick;
    $("#pEmail").textContent = user.email;
    $("#pUid").textContent = "UID " + uidLabel();

    const p = user.plan;
    $("#pPlan").textContent = p && p.name ? p.name : "нет";
    $("#pExpiry").textContent = p && p.name
      ? (p.expires ? new Date(p.expires).toLocaleDateString("ru-RU") : "бессрочно")
      : "—";
    $("#pBuys").textContent = user.buys || 0;

    $$("#emojiRow button").forEach((b) =>
      b.classList.toggle("is-active", !user.avatar && user.emoji === b.dataset.emoji)
    );
  }

  $("#profileLogin").addEventListener("click", () => openAuth("login"));
  $("#profileRegister").addEventListener("click", () => openAuth("register"));

  /* ---------- аватар ---------- */
  $("#avatarBtn").addEventListener("click", () => $("#avatarFile").click());

  $("#avatarFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!user) { openAuth("login"); return; }
    if (!/^image\//.test(file.type)) { toast("Нужен файл-изображение"); return; }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const S = 176;
        const cnv = document.createElement("canvas");
        cnv.width = S; cnv.height = S;
        const g = cnv.getContext("2d");
        const k = Math.max(S / img.width, S / img.height);
        const w = img.width * k, h = img.height * k;
        g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        try { user.avatar = cnv.toDataURL("image/jpeg", 0.82); }
        catch (err) { toast("Не удалось обработать фото"); return; }
        user.emoji = null;
        persist();
        syncAccountUI();
        toast("Фото профиля обновлено 📸");
      };
      img.onerror = () => toast("Не удалось прочитать изображение");
      img.src = reader.result;
    };
    reader.onerror = () => toast("Не удалось прочитать файл");
    reader.readAsDataURL(file);
  });

  $("#avatarReset").addEventListener("click", () => {
    if (!user) return openAuth("login");
    user.avatar = null;
    user.emoji = null;
    persist();
    syncAccountUI();
    toast("Аватар сброшен");
  });

  $("#emojiRow").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-emoji]");
    if (!b || !user) return openAuth("login");
    user.emoji = b.dataset.emoji;
    user.avatar = null;
    persist();
    syncAccountUI();
  });

  /* ---------- промокоды ---------- */
  const PROMO_DEFS = [
    { tag: "DAY1",   name: "1 день",    days: 1 },
    { tag: "WEEK",   name: "7 дней",    days: 7 },
    { tag: "M1",     name: "30 дней",   days: 30 },
    { tag: "M3",     name: "90 дней",   days: 90 },
    { tag: "LIFE",   name: "LifeTime",  days: 0, life: true },
    { tag: "LTB",    name: "LT + Beta", days: 0, life: true, beta: true },
  ];
  const PCODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randChunk = (n) =>
    Array.from({ length: n }, () => PCODE_CHARS[Math.floor(Math.random() * PCODE_CHARS.length)]).join("");

  function loadPromos() {
    try {
      const d = JSON.parse(localStorage.getItem(PROMO_KEY));
      if (d && Array.isArray(d.codes) && d.codes.length) return d;
    } catch (e) {}
    return null;
  }
  function savePromos(d) {
    try { localStorage.setItem(PROMO_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function ensurePromos() {
    const saved = loadPromos();
    if (saved) return saved;

    const d = { codes: [] };
    PROMO_DEFS.forEach((def) => {
      for (let i = 0; i < 2; i++) {
        d.codes.push({
          code: "MD-" + def.tag + "-" + randChunk(4) + "-" + randChunk(4),
          reward: { name: def.name, days: def.days, beta: !!def.beta },
          used: null,
        });
      }
    });
    savePromos(d);
    return d;
  }

  function renderPromos() {
    const list = $("#promoList");
    if (!list) return;
    const d = ensurePromos();

    list.innerHTML = d.codes.map((c) => {
      const owned = !!user && ((user.promos || []).indexOf(c.code) > -1 || c.used === user.email);
      const busy = !!c.used && !owned;
      const kind = c.reward.days ? c.reward.days + " дн." : c.reward.beta ? "LT + β" : "LifeTime";
      const btn = owned ? "Активирован ✓" : busy ? "Занят" : "Копировать";
      return (
        '<div class="pcode' + (owned ? " is-mine" : busy ? " is-used" : "") + '">' +
          '<div class="pcode__reward"><span>' + escapeHtml(c.reward.name) + "</span><b>" + kind + "</b></div>" +
          '<div class="pcode__val">' +
            '<span class="pcode__code">' + escapeHtml(c.code) + "</span>" +
            '<button class="pcode__copy" data-code="' + escapeHtml(c.code) + '"' +
              (owned || busy ? " disabled" : "") + ">" + btn + "</button>" +
          "</div>" +
        "</div>"
      );
    }).join("");

    const mine = user ? (user.promos || []).length : 0;
    const status = $("#promoStatus");
    if (status) status.innerHTML = "Активировано: <b>" + mine + "</b>";
    const pCount = $("#pPromos");
    if (pCount) pCount.textContent = mine;
  }

  $("#promoList").addEventListener("click", (e) => {
    const btn = e.target.closest(".pcode__copy");
    if (!btn || btn.disabled) return;
    const code = btn.dataset.code;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(
        () => toast("Код " + code + " скопирован ✓"),
        () => toast("Скопируйте вручную: " + code)
      );
    } else {
      toast("Скопируйте вручную: " + code);
    }
  });

  /* единая выдача доступа: покупка и промокод используют один путь */
  function applyReward(r) {
    const prev = user.plan;
    let expires = null;
    if (r.days) {
      const base = prev && prev.expires && prev.expires > Date.now() ? prev.expires : Date.now();
      expires = base + r.days * DAY;
    }
    user.plan = {
      key: r.key || "promo",
      name: r.name,
      expires,
      beta: r.beta ? true : !!(prev && prev.beta),
      since: Date.now(),
    };
    if (!user.licenseKey) user.licenseKey = genKey();
    persist();
    renderAuthArea();
    renderProfile();
    syncAccountModal();
  }

  function activatePromo() {
    if (!user) { openAuth("login"); return; }
    const input = $("#promoInput");
    const code = input.value.trim().toUpperCase();
    if (!code) { toast("Введите промокод"); return; }

    const d = ensurePromos();
    const item = d.codes.filter((c) => c.code === code)[0];
    if (!item) { toast("Промокод не найден или истёк"); return; }
    if (item.used) {
      toast(item.used === user.email
        ? "Этот код уже активирован на аккаунте"
        : "Код уже использован другим аккаунтом");
      return;
    }

    applyReward(item.reward);
    item.used = user.email;
    savePromos(d);
    user.promos = (user.promos || []).concat([item.code]);
    persist();
    input.value = "";
    syncAccountUI();
    toast("Промокод активирован: «" + item.reward.name + "» 🎉");
  }

  $("#promoActivate").addEventListener("click", activatePromo);
  $("#promoInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); activatePromo(); }
  });
  $("#promoInput").addEventListener("input", (e) => {
    const pos = e.target.selectionStart;
    e.target.value = e.target.value.toUpperCase();
    try { e.target.setSelectionRange(pos, pos); } catch (err) {}
  });

  $("#promoRegen").addEventListener("click", () => {
    try { localStorage.removeItem(PROMO_KEY); } catch (e) {}
    ensurePromos();
    renderPromos();
    toast("Сгенерированы новые промокоды ✨");
  });

  /* ---------- smooth anchors ---------- */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const y = target.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: y, behavior: "smooth" });
    });
  });

  /* ---------- boot ---------- */
  sessionRestore();
})();
