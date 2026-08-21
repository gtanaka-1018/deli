"use strict";

(() => {
  const SUPABASE_SDK_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3";
  const yen = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  });
  const number = new Intl.NumberFormat("ja-JP");

  let client = null;
  let session = null;
  let participation = null;
  let syncing = false;
  let automaticSyncTimer = 0;

  const elements = {};

  document.addEventListener("DOMContentLoaded", initialize);

  async function initialize() {
    bindElements();
    bindEvents();

    try {
      const config = await loadConfig();
      await loadSupabaseSdk();
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });

      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session;

      client.auth.onAuthStateChange((_event, nextSession) => {
        session = nextSession;
        setTimeout(() => refreshAuthentication(), 0);
      });

      elements.unavailable.hidden = true;
      elements.auth.hidden = false;
      await Promise.all([refreshAuthentication(), loadPublicRankings()]);
      openRankingAfterLogin();
    } catch {
      showUnavailable();
    }
  }

  function bindElements() {
    const ids = {
      unavailable: "rankingUnavailable",
      auth: "rankingAuth",
      loginForm: "rankingLoginForm",
      email: "rankingEmail",
      login: "rankingLogin",
      signedIn: "rankingSignedIn",
      signedInEmail: "rankingSignedInEmail",
      logout: "rankingLogout",
      consentForm: "rankingConsentForm",
      consentFields: "rankingConsentFields",
      displayName: "rankingDisplayName",
      consent: "rankingConsent",
      saveConsent: "rankingSaveConsent",
      status: "rankingStatus",
      refresh: "rankingRefresh",
      assetRows: "assetRankingRows",
      salesRows: "salesRankingRows",
    };
    Object.entries(ids).forEach(([key, id]) => {
      elements[key] = document.getElementById(id);
    });
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", sendLoginLink);
    elements.logout.addEventListener("click", logout);
    elements.consentForm.addEventListener("submit", saveParticipation);
    elements.consent.addEventListener("change", updateConsentRequirements);
    elements.refresh.addEventListener("click", loadPublicRankings);
    window.addEventListener("deli:data-saved", scheduleAutomaticSync);
  }

  async function loadConfig() {
    const response = await fetch("/api/ranking-config", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("ranking unavailable");
    const config = await response.json();
    if (!config?.available || !config.url || !config.publishableKey) throw new Error("ranking unavailable");
    return config;
  }

  function loadSupabaseSdk() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SUPABASE_SDK_URL;
      script.async = true;
      script.onload = () => window.supabase?.createClient ? resolve() : reject(new Error("SDK unavailable"));
      script.onerror = () => reject(new Error("SDK unavailable"));
      document.head.append(script);
    });
  }

  function showUnavailable() {
    elements.unavailable.hidden = false;
    elements.unavailable.querySelector("strong").textContent = "ランキングは準備中です";
    elements.unavailable.querySelector("p").textContent = "クラウド設定が完了するまで、端末内の記録は送信されません。";
    elements.auth.hidden = true;
    renderEmptyRow(elements.assetRows, 3, "ランキングは準備中です");
    renderEmptyRow(elements.salesRows, 5, "ランキングは準備中です");
  }

  async function refreshAuthentication() {
    const signedIn = Boolean(session?.user);
    elements.loginForm.hidden = signedIn;
    elements.signedIn.hidden = !signedIn;
    elements.consentForm.hidden = !signedIn;
    elements.consentFields.disabled = !signedIn;
    elements.signedInEmail.textContent = signedIn ? session.user.email || "確認済みユーザー" : "-";

    if (!signedIn) {
      participation = null;
      elements.displayName.value = "";
      elements.consent.checked = false;
      updateConsentRequirements();
      return;
    }

    setStatus("参加状況を確認しています…");
    const { data, error } = await client.rpc("get_my_ranking_status");
    if (error) {
      setStatus("参加状況を取得できませんでした", "error");
      return;
    }

    const status = Array.isArray(data) ? data[0] : data;
    participation = {
      active: status?.is_participating === true,
      displayName: status?.display_name || "",
    };
    elements.displayName.value = participation.displayName;
    elements.consent.checked = participation.active;
    updateConsentRequirements();
    setStatus(participation.active ? "ランキングに参加中です" : "ランキングには参加していません");
  }

  async function sendLoginLink(event) {
    event.preventDefault();
    const email = elements.email.value.trim();
    if (!email || !elements.email.reportValidity()) return;

    elements.login.disabled = true;
    setStatus("ログインリンクを送信しています…");
    const redirectUrl = new URL(window.location.href);
    redirectUrl.hash = "";
    redirectUrl.searchParams.set("screen", "ranking");

    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl.toString() },
    });
    elements.login.disabled = false;
    setStatus(
      error ? "ログインリンクを送信できませんでした" : "メールを確認し、ログインリンクを開いてください",
      error ? "error" : "success"
    );
  }

  async function logout() {
    elements.logout.disabled = true;
    const { error } = await client.auth.signOut();
    elements.logout.disabled = false;
    if (error) setStatus("ログアウトできませんでした", "error");
  }

  function updateConsentRequirements() {
    elements.displayName.required = elements.consent.checked;
    elements.saveConsent.textContent = elements.consent.checked
      ? "参加内容を保存"
      : participation?.active
        ? "掲載を解除する"
        : "参加しない";
    if (!syncing) elements.saveConsent.disabled = !elements.consent.checked && !participation?.active;
  }

  async function saveParticipation(event) {
    event.preventDefault();
    if (!session?.user) return;

    if (!elements.consent.checked) {
      await leaveRankings();
      return;
    }

    const displayName = elements.displayName.value.trim();
    if (!displayName || !elements.displayName.reportValidity()) return;
    await syncCurrentData(displayName, false);
  }

  async function syncCurrentData(displayName, silent) {
    if (syncing || !client || !session?.user) return;
    const snapshot = window.DeliRankingData?.getPublishableSnapshot?.();
    if (!snapshot) {
      if (!silent) setStatus("端末内の集計データを準備できませんでした", "error");
      return;
    }

    syncing = true;
    elements.saveConsent.disabled = true;
    if (!silent) setStatus("ランキングを更新しています…");
    const { error } = await client.rpc("sync_my_rankings", {
      p_display_name: displayName,
      p_net_assets: snapshot.netAssets,
      p_daily_sales: snapshot.dailySales,
    });
    syncing = false;
    elements.saveConsent.disabled = false;

    if (error) {
      if (!silent) setStatus("ランキングを更新できませんでした", "error");
      return;
    }

    participation = { active: true, displayName };
    elements.displayName.value = displayName;
    elements.consent.checked = true;
    updateConsentRequirements();
    if (!silent) setStatus("ランキングへの参加内容を更新しました", "success");
    await loadPublicRankings();
  }

  async function leaveRankings() {
    if (syncing) return;
    syncing = true;
    elements.saveConsent.disabled = true;
    setStatus("掲載データを削除しています…");
    const { error } = await client.rpc("leave_rankings");
    syncing = false;
    elements.saveConsent.disabled = false;

    if (error) {
      setStatus("掲載を解除できませんでした", "error");
      return;
    }

    participation = { active: false, displayName: elements.displayName.value.trim() };
    elements.consent.checked = false;
    updateConsentRequirements();
    setStatus("ランキング掲載を解除し、公開データを削除しました", "success");
    await loadPublicRankings();
  }

  function scheduleAutomaticSync() {
    if (!participation?.active || !elements.consent.checked) return;
    clearTimeout(automaticSyncTimer);
    automaticSyncTimer = setTimeout(() => {
      syncCurrentData(participation.displayName, true).catch(() => {});
    }, 2500);
  }

  async function loadPublicRankings() {
    if (!client) return;
    elements.refresh.disabled = true;
    const [assets, sales] = await Promise.all([
      client.rpc("get_asset_rankings", { p_limit: 100 }),
      client.rpc("get_daily_sales_rankings", { p_limit: 100 }),
    ]);
    elements.refresh.disabled = false;

    if (assets.error || sales.error) {
      renderEmptyRow(elements.assetRows, 3, "ランキングを取得できませんでした");
      renderEmptyRow(elements.salesRows, 5, "ランキングを取得できませんでした");
      return;
    }

    renderAssetRankings(assets.data || []);
    renderSalesRankings(sales.data || []);
  }

  function renderAssetRankings(rows) {
    elements.assetRows.replaceChildren();
    if (rows.length === 0) {
      renderEmptyRow(elements.assetRows, 3, "まだ参加者はいません");
      return;
    }
    rows.forEach((row) => {
      const tableRow = document.createElement("tr");
      appendCell(tableRow, rankLabel(row.rank), "順位", "ranking-rank-cell");
      appendCell(tableRow, row.display_name, "表示名");
      appendCell(tableRow, yen.format(Number(row.net_assets) || 0), "純資産", "ranking-amount-cell");
      elements.assetRows.append(tableRow);
    });
  }

  function renderSalesRankings(rows) {
    elements.salesRows.replaceChildren();
    if (rows.length === 0) {
      renderEmptyRow(elements.salesRows, 5, "直近30日の公開記録はありません");
      return;
    }
    rows.forEach((row) => {
      const tableRow = document.createElement("tr");
      appendCell(tableRow, rankLabel(row.rank), "順位", "ranking-rank-cell");
      appendCell(tableRow, row.display_name, "表示名");
      appendCell(tableRow, formatDate(row.sales_date), "日付");
      appendCell(tableRow, `${number.format(Number(row.delivery_count) || 0)}件`, "件数");
      appendCell(tableRow, yen.format(Number(row.sales_amount) || 0), "金額", "ranking-amount-cell");
      elements.salesRows.append(tableRow);
    });
  }

  function appendCell(row, value, label, className = "") {
    const cell = document.createElement("td");
    cell.textContent = String(value ?? "-");
    cell.dataset.label = label;
    if (className) cell.className = className;
    row.append(cell);
  }

  function renderEmptyRow(host, columns, message) {
    host.replaceChildren();
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columns;
    cell.className = "ranking-empty-cell";
    cell.textContent = message;
    row.append(cell);
    host.append(row);
  }

  function rankLabel(value) {
    const rank = Number(value) || 0;
    return rank > 0 ? `${rank}位` : "-";
  }

  function formatDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return "-";
    const [year, month, day] = String(value).split("-").map(Number);
    return `${year}/${month}/${day}`;
  }

  function setStatus(message, state = "") {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }

  function openRankingAfterLogin() {
    const url = new URL(window.location.href);
    if (url.searchParams.get("screen") !== "ranking") return;
    document.querySelector('[data-screen="ranking"]')?.click();
    url.searchParams.delete("screen");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
})();
