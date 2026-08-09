(() => {
  "use strict";

  // ---------------------------------------------------------------------
  // PWA : enregistrement du service worker (chargement instantané,
  // tolérance aux coupures réseau, installation sur écran d'accueil)
  // ---------------------------------------------------------------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker non enregistré :", err.message);
      });
    });
  }

  // ---------------------------------------------------------------------
  // App native (Capacitor uniquement) : masque l'écran de démarrage et
  // configure la barre de statut. Ne fait rien dans un navigateur normal.
  // ---------------------------------------------------------------------
  if (window.Capacitor?.isNativePlatform?.()) {
    window.Capacitor.Plugins?.StatusBar?.setBackgroundColor?.({ color: "#1B2A4A" }).catch(() => {});
    window.Capacitor.Plugins?.StatusBar?.setStyle?.({ style: "DARK" }).catch(() => {});
    window.addEventListener("load", () => {
      setTimeout(() => {
        window.Capacitor.Plugins?.SplashScreen?.hide?.().catch(() => {});
      }, 300);
    });
  }

  const API_BASE = (() => {
    // Dans le navigateur (PWA comprise), le frontend et l'API sont servis par
    // le même serveur Render : une URL relative suffit.
    // Dans l'app native (Capacitor), il n'y a pas de "même origine" : il faut
    // pointer explicitement vers ton backend déployé.
    // 👉 Remplace l'URL ci-dessous par la tienne une fois déployé sur Render.
    const RENDER_API_URL = "https://ma-vie-app.onrender.com/api";

    const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    return isNative ? RENDER_API_URL : "/api";
  })();
  let state = {
    token: localStorage.getItem("mavie_token") || null,
    user: null,
    documents: [],
    transactions: [],
  };

  // ---------------------------------------------------------------------
  // Utilitaires API
  // ---------------------------------------------------------------------
  async function api(path, { method = "GET", body, isForm = false } = {}) {
    const headers = {};
    if (state.token) headers["Authorization"] = `Bearer ${state.token}`;
    if (!isForm) headers["Content-Type"] = "application/json";

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });

    let data = {};
    try { data = await res.json(); } catch (_) { /* pas de contenu JSON */ }

    if (!res.ok) {
      throw new Error(data.message || "Une erreur est survenue.");
    }
    return data;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function formatMoney(n) {
    const val = Math.round(Number(n) || 0);
    return `${val.toLocaleString("fr-FR")} ${state.user?.currency || "FCFA"}`;
  }

  // ---------------------------------------------------------------------
  // AUTHENTIFICATION
  // ---------------------------------------------------------------------
  const authScreen = document.getElementById("auth-screen");
  const appEl = document.getElementById("app");

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("login-form").classList.toggle("hidden", tab.dataset.tab !== "login");
      document.getElementById("register-form").classList.toggle("hidden", tab.dataset.tab !== "register");
    });
  });

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: { email: form.get("email"), password: form.get("password") },
      });
      onAuthSuccess(data);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = document.getElementById("register-error");
    errorEl.textContent = "";
    try {
      const data = await api("/auth/register", {
        method: "POST",
        body: {
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        },
      });
      onAuthSuccess(data);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.querySelectorAll(".logout-trigger").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.token = null;
      state.user = null;
      localStorage.removeItem("mavie_token");
      document.getElementById("login-form").reset();
      document.getElementById("register-form").reset();
      document.getElementById("login-error").textContent = "";
      document.getElementById("register-error").textContent = "";
      appEl.classList.add("hidden");
      authScreen.classList.remove("hidden");
    });
  });

  function onAuthSuccess(data) {
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("mavie_token", data.token);
    authScreen.classList.add("hidden");
    appEl.classList.remove("hidden");
    document.getElementById("user-name-display").textContent = data.user.name;
    loadAll();
  }

  async function tryResumeSession() {
    if (!state.token) return;
    try {
      const data = await api("/auth/me");
      state.user = data.user;
      authScreen.classList.add("hidden");
      appEl.classList.remove("hidden");
      document.getElementById("user-name-display").textContent = data.user.name;
      loadAll();
    } catch (_) {
      state.token = null;
      localStorage.removeItem("mavie_token");
    }
  }

  // ---------------------------------------------------------------------
  // NAVIGATION
  // ---------------------------------------------------------------------
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
      document.getElementById(`view-${btn.dataset.view}`).classList.remove("hidden");
    });
  });

  // ---------------------------------------------------------------------
  // MODALS
  // ---------------------------------------------------------------------
  function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
  function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

  document.getElementById("open-doc-modal").addEventListener("click", () => openModal("doc-modal"));
  document.getElementById("open-tx-modal").addEventListener("click", () => {
    document.querySelector('#tx-form [name="date"]').value = new Date().toISOString().slice(0, 10);
    openModal("tx-modal");
  });
  document.getElementById("edit-budget-btn").addEventListener("click", () => {
    document.querySelector('#budget-form [name="monthlyBudget"]').value = state.user?.monthlyBudget || 0;
    openModal("budget-modal");
  });
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".modal").classList.add("hidden"));
  });

  // ---------------------------------------------------------------------
  // DOCUMENTS
  // ---------------------------------------------------------------------
  document.getElementById("doc-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("doc-error");
    errorEl.textContent = "";
    const formData = new FormData(e.target);
    try {
      await api("/documents", { method: "POST", isForm: true, body: formData });
      closeModal("doc-modal");
      e.target.reset();
      await loadDocuments();
      await loadDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  async function loadDocuments() {
    const data = await api("/documents");
    state.documents = data.documents;
    renderDocuments();
  }

  const DOC_LABELS = {
    carte_identite: "Carte d'identité", passeport: "Passeport", permis: "Permis",
    diplome: "Diplôme", contrat: "Contrat", facture: "Facture", certificat: "Certificat", autre: "Autre",
  };

  function renderDocuments() {
    const container = document.getElementById("documents-list");
    if (!state.documents.length) {
      container.innerHTML = `<div class="empty-state">Aucun document pour l'instant. Ajoute ta carte d'identité, ton passeport ou tes diplômes.</div>`;
      return;
    }
    const now = new Date();
    container.innerHTML = state.documents.map((doc) => {
      let badge = "";
      if (doc.expirationDate) {
        const days = Math.ceil((new Date(doc.expirationDate) - now) / 86400000);
        if (days < 0) badge = `<span class="item-badge item-badge--danger">Expiré</span>`;
        else if (days <= 60) badge = `<span class="item-badge item-badge--warning">Expire dans ${days}j</span>`;
      }
      return `
        <div class="item-card">
          <div class="item-main">
            <span class="item-title">${escapeHtml(doc.title)}</span>
            <span class="item-meta">${DOC_LABELS[doc.type] || "Autre"}${doc.expirationDate ? ` · Expire le ${new Date(doc.expirationDate).toLocaleDateString("fr-FR")}` : ""}</span>
            ${badge}
          </div>
          <div class="item-actions">
            ${doc.fileUrl ? `<a class="icon-btn" href="${doc.fileUrl}" target="_blank" rel="noopener" title="Voir le fichier"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.83 18.43a2 2 0 0 1-2.83-2.83l8.49-8.49"/></svg></a>` : ""}
            <button class="icon-btn" data-delete-doc="${doc._id}" title="Supprimer"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
          </div>
        </div>`;
    }).join("");

    container.querySelectorAll("[data-delete-doc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Supprimer ce document ?")) return;
        await api(`/documents/${btn.dataset.deleteDoc}`, { method: "DELETE" });
        await loadDocuments();
        await loadDashboard();
      });
    });
  }

  // ---------------------------------------------------------------------
  // FINANCE
  // ---------------------------------------------------------------------
  document.getElementById("tx-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("tx-error");
    errorEl.textContent = "";
    const form = new FormData(e.target);
    try {
      await api("/finance", {
        method: "POST",
        body: {
          type: form.get("type"),
          amount: Number(form.get("amount")),
          category: form.get("category"),
          date: form.get("date"),
          description: form.get("description"),
        },
      });
      closeModal("tx-modal");
      e.target.reset();
      await loadTransactions();
      await loadDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById("budget-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("budget-error");
    errorEl.textContent = "";
    const form = new FormData(e.target);
    try {
      const data = await api("/auth/budget", {
        method: "PATCH",
        body: { monthlyBudget: Number(form.get("monthlyBudget")) },
      });
      state.user = data.user;
      closeModal("budget-modal");
      await loadDashboard();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  async function loadTransactions() {
    const data = await api("/finance");
    state.transactions = data.transactions;
    renderTransactions();
  }

  const CATEGORY_LABELS = {
    salaire: "Salaire", transport: "Transport", logement: "Logement", alimentation: "Alimentation",
    sante: "Santé", education: "Éducation", loisirs: "Loisirs", abonnement: "Abonnement",
    epargne: "Épargne", dette: "Dette", autre: "Autre",
  };

  function renderTransactions() {
    const container = document.getElementById("transactions-list");
    if (!state.transactions.length) {
      container.innerHTML = `<div class="empty-state">Aucune transaction pour l'instant. Ajoute tes revenus et dépenses.</div>`;
      return;
    }
    container.innerHTML = state.transactions.map((tx) => `
      <div class="item-card">
        <div class="item-main">
          <span class="item-title">${escapeHtml(tx.description) || CATEGORY_LABELS[tx.category]}</span>
          <span class="item-meta">${CATEGORY_LABELS[tx.category] || "Autre"} · ${new Date(tx.date).toLocaleDateString("fr-FR")}</span>
        </div>
        <div class="item-actions">
          <span class="item-amount item-amount--${tx.type}">${tx.type === "revenu" ? "+" : "-"}${formatMoney(tx.amount)}</span>
          <button class="icon-btn" data-delete-tx="${tx._id}" title="Supprimer"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        </div>
      </div>`).join("");

    container.querySelectorAll("[data-delete-tx]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Supprimer cette transaction ?")) return;
        await api(`/finance/${btn.dataset.deleteTx}`, { method: "DELETE" });
        await loadTransactions();
        await loadDashboard();
      });
    });
  }

  // ---------------------------------------------------------------------
  // TABLEAU DE BORD
  // ---------------------------------------------------------------------
  let categoryChart = null;

  async function loadDashboard() {
    const data = await api("/dashboard");

    document.getElementById("stat-solde").textContent = formatMoney(data.solde.soldeGlobal);
    document.getElementById("stat-revenus").textContent = formatMoney(data.solde.revenusMois);
    document.getElementById("stat-depenses").textContent = formatMoney(data.solde.depensesMois);
    document.getElementById("stat-reste").textContent =
      data.solde.resteAAllouer !== null ? formatMoney(data.solde.resteAAllouer) : "Pas de budget défini";

    // Barre de budget
    const pct = data.solde.budgetMensuel > 0
      ? Math.min((data.solde.depensesMois / data.solde.budgetMensuel) * 100, 100)
      : 0;
    document.getElementById("budget-bar-fill").style.width = `${pct}%`;
    document.getElementById("budget-bar-caption").textContent = data.solde.budgetMensuel > 0
      ? `${formatMoney(data.solde.depensesMois)} dépensés sur ${formatMoney(data.solde.budgetMensuel)}`
      : "Aucun budget défini — clique sur Modifier pour en créer un.";

    // Assistant intelligent
    const insightsList = document.getElementById("insights-list");
    if (!data.insights.length) {
      insightsList.innerHTML = `<li class="insight-empty">Rien à signaler pour le moment.</li>`;
    } else {
      insightsList.innerHTML = data.insights.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
    }

    renderCategoryChart(data.depensesParCategorie);
  }

  function renderCategoryChart(byCategory) {
    const ctx = document.getElementById("category-chart");
    const labels = Object.keys(byCategory).map((c) => CATEGORY_LABELS[c] || c);
    const values = Object.values(byCategory);

    if (categoryChart) categoryChart.destroy();

    if (!labels.length) {
      const parent = ctx.parentElement;
      ctx.style.display = "none";
      if (!parent.querySelector(".chart-empty")) {
        const p = document.createElement("p");
        p.className = "chart-empty empty-state";
        p.textContent = "Pas encore de dépenses ce mois-ci.";
        parent.appendChild(p);
      }
      return;
    }
    ctx.style.display = "block";
    const existingEmpty = ctx.parentElement.querySelector(".chart-empty");
    if (existingEmpty) existingEmpty.remove();

    categoryChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: ["#C6923C", "#1B2A4A", "#4C7A5F", "#B5482E", "#8C7D5A", "#2C3E63", "#D9A441", "#6E8F7D", "#A65A3A", "#4A4438"],
          borderWidth: 0,
        }],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { font: { family: "Work Sans" }, boxWidth: 12 } } },
      },
    });
  }

  async function loadAll() {
    await Promise.all([loadDocuments(), loadTransactions(), loadDashboard()]);
  }

  tryResumeSession();
})();
