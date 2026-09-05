"use strict";

/**
 * クラウド同期（スナップショット金庫方式）。
 *
 * 端末内の localStorage が正本であり続ける。クラウドは全量スナップショットの保管先で、
 * 保存操作の成否は今まで通り端末内保存だけで決まる。オフラインでも入力・保存・集計は
 * これまでと変わらない。
 *
 * 端末間の食い違いはサーバー採番の revision で検出する。自動マージも自動上書きもせず、
 * どちらを残すかを利用者に選ばせる。選ばなかった側もクラウドの履歴に必ず残る。
 */
(() => {
  const SETTINGS_KEY = "deli-cloud-sync-v1";
  const PUSH_DELAY_MS = 8000;
  const MAX_PAYLOAD_CHARS = 4_000_000;

  const elements = {};
  let client = null;
  let session = null;
  let settings = readSettings();
  let status = null;
  let busy = false;
  let pushTimer = 0;
  let conflict = null;
  let ownerMismatch = false;
  let started = false;

  document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    bindEvents();
    renderAccount();
    // ログインしたことがある端末と、ログインリンクから戻ってきた場合だけ
    // クラウドへ問い合わせる。未ログインの利用者はSDKも設定APIも読み込まない。
    if (settings.enabled || returningFromLoginLink()) start().catch(() => {});
  });

  /**
   * メールのログインリンクから戻ってきたかを判定する。
   * ここで start() を呼ばないと、URLに載った認証コードが交換されず、
   * リンクを開いてもログインが完了しないまま終わる。
   */
  function returningFromLoginLink() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("screen") === "settings") return true;
      // PKCEは code、旧来のリンクは URL断片に access_token を載せてくる。
      if (url.searchParams.has("code")) return true;
      if (url.searchParams.has("error_description")) return true;
      return /access_token=|error=/.test(url.hash);
    } catch {
      return false;
    }
  }

  function bindElements() {
    const ids = {
      panel: "cloudSyncPanel",
      unavailable: "cloudSyncUnavailable",
      loginForm: "cloudSyncLoginForm",
      email: "cloudSyncEmail",
      login: "cloudSyncLogin",
      account: "cloudSyncAccount",
      emailLabel: "cloudSyncEmailLabel",
      enabled: "cloudSyncEnabled",
      syncNow: "cloudSyncNow",
      logout: "cloudSyncLogout",
      statusText: "cloudSyncStatus",
      conflict: "cloudSyncConflict",
      conflictDetail: "cloudSyncConflictDetail",
      keepLocal: "cloudSyncKeepLocal",
      keepRemote: "cloudSyncKeepRemote",
      history: "cloudSyncHistory",
      historyList: "cloudSyncHistoryList",
      deleteCloud: "cloudSyncDelete",
    };
    Object.entries(ids).forEach(([key, id]) => {
      elements[key] = document.getElementById(id);
    });
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", sendLoginLink);
    elements.logout.addEventListener("click", logout);
    elements.enabled.addEventListener("change", toggleEnabled);
    elements.syncNow.addEventListener("click", () => synchronize({ manual: true }).catch(() => {}));
    elements.keepLocal.addEventListener("click", () => resolveConflict("local").catch(() => {}));
    elements.keepRemote.addEventListener("click", () => resolveConflict("remote").catch(() => {}));
    elements.deleteCloud.addEventListener("click", deleteCloudData);
    elements.historyList.addEventListener("click", restoreFromHistory);
    elements.history.addEventListener("toggle", () => {
      if (elements.history.open) renderHistory().catch(() => {});
    });
    window.addEventListener("deli:data-saved", onDataSaved);
    document.querySelector('[data-screen="settings"]')?.addEventListener("click", () => {
      // 設定画面を開いたときだけクラウドの状態を取りに行く。
      start().catch(() => {});
    });
  }

  function readSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return defaultSettings();
      return {
        enabled: parsed.enabled === true,
        baseRevision: Number(parsed.baseRevision) || 0,
        deviceId: typeof parsed.deviceId === "string" && parsed.deviceId.length >= 8
          ? parsed.deviceId
          : createDeviceId(),
        lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : "",
        lastSignature: typeof parsed.lastSignature === "string" ? parsed.lastSignature : "",
        userId: typeof parsed.userId === "string" ? parsed.userId : "",
      };
    } catch {
      return defaultSettings();
    }
  }

  function defaultSettings() {
    return { enabled: false, baseRevision: 0, deviceId: createDeviceId(), lastSyncedAt: "", lastSignature: "", userId: "" };
  }

  function createDeviceId() {
    try {
      if (crypto?.randomUUID) return crypto.randomUUID();
    } catch {
      // 生成できない環境では時刻と乱数で代用する。
    }
    return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function writeSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // 設定を保存できなくても、この画面が開いている間の同期は続けられる。
    }
  }

  /** 端末の種類だけを短い日本語で表す。UA文字列そのものは送らない。 */
  function deviceLabel() {
    const ua = navigator.userAgent || "";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    if (/Macintosh/i.test(ua)) return "Mac";
    if (/Windows/i.test(ua)) return "Windows PC";
    return "その他の端末";
  }

  /**
   * 内容の指紋。snapshotState() は呼ぶたびに updatedAt を作り直すため、
   * これを除いて比べないと「変更なし」でも毎回送信することになる。
   */
  function contentSignature(snapshot) {
    const { updatedAt, ...content } = snapshot || {};
    const text = JSON.stringify(content);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${text.length.toString(36)}-${hash.toString(36)}`;
  }

  /** この端末に、まだクラウドへ送っていない変更があるか。 */
  function hasLocalChanges() {
    const snapshot = window.DeliSyncData?.getSnapshot();
    if (!snapshot) return false;
    if (!settings.lastSignature) return true;
    return contentSignature(snapshot) !== settings.lastSignature;
  }

  async function start() {
    if (started) return;
    started = true;

    try {
      client = await window.DeliSupabase.getClient();
    } catch {
      started = false;
      showUnavailable();
      return;
    }

    elements.unavailable.hidden = true;
    elements.loginForm.hidden = false;

    const { data, error } = await client.auth.getSession();
    if (error) {
      setStatus("ログイン状態を確認できませんでした", "error");
      return;
    }
    session = data.session;

    window.DeliSupabase.onAuthStateChange((event, nextSession) => {
      session = nextSession;
      if (event === "SIGNED_OUT") {
        status = null;
        conflict = null;
        ownerMismatch = false;
        settings.baseRevision = 0;
        // settings.userId は残す。次に別のアカウントでログインしたとき、
        // この端末に前の利用者の記録が残っていることを検知するための唯一の手がかりになる。
        writeSettings();
      }
      renderAccount();
      if (session?.user && settings.enabled) synchronize({ manual: false }).catch(() => {});
    });

    renderAccount();
    if (session?.user && settings.enabled) await synchronize({ manual: false }).catch(() => {});
  }

  function showUnavailable() {
    elements.unavailable.hidden = false;
    elements.loginForm.hidden = true;
    elements.account.hidden = true;
    setStatus("", "");
  }

  function renderAccount() {
    const signedIn = Boolean(session?.user);
    elements.loginForm.hidden = signedIn || elements.unavailable.hidden === false;
    elements.account.hidden = !signedIn;
    elements.history.hidden = !signedIn;
    elements.emailLabel.textContent = signedIn ? session.user.email || "確認済みユーザー" : "-";
    elements.enabled.checked = settings.enabled;
    elements.syncNow.disabled = busy || !settings.enabled;
    elements.conflict.hidden = !conflict && !ownerMismatch;
    updateStorageModeLabel();
  }

  function updateStorageModeLabel() {
    const syncing = Boolean(session?.user) && settings.enabled;
    window.DeliSyncData?.setStorageMode(syncing ? "この端末＋クラウドに保存" : "");
  }

  async function sendLoginLink(event) {
    event.preventDefault();
    await start();
    if (!client) return;

    const email = elements.email.value.trim();
    if (!email || !elements.email.reportValidity()) return;

    elements.login.disabled = true;
    setStatus("ログインリンクを送信しています…");
    // 現在のURLから作ると、共有リンクのutmなどが残って許可リストの
    // 完全一致から外れる。常に同じ1本になるようオリジンから組み立てる。
    const redirectUrl = new URL(window.location.origin);
    redirectUrl.searchParams.set("screen", "settings");

    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl.toString() },
    });
    elements.login.disabled = false;
    setStatus(
      error
        ? "ログインリンクを送信できませんでした"
        : "メールを確認し、この端末の同じブラウザーでリンクを開いてください",
      error ? "error" : "success"
    );
  }

  async function logout() {
    if (!client) return;
    elements.logout.disabled = true;
    const { error } = await client.auth.signOut();
    elements.logout.disabled = false;
    if (error) {
      setStatus("ログアウトできませんでした", "error");
      return;
    }
    // 端末内の記録はログアウトしても消さない。共有端末では手動削除を案内する。
    setStatus("ログアウトしました。この端末の記録はそのまま残っています。");
  }

  async function toggleEnabled() {
    settings.enabled = elements.enabled.checked;
    writeSettings();
    renderAccount();

    if (!settings.enabled) {
      setStatus("同期を停止しました。この端末の記録はそのまま使えます。");
      return;
    }
    await start();
    await synchronize({ manual: true }).catch(() => {});
  }

  function onDataSaved() {
    if (!settings.enabled || !session?.user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      synchronize({ manual: false }).catch(() => {});
    }, PUSH_DELAY_MS);
  }

  /**
   * サーバーの状態を見て、送るか・取り込むか・利用者に選ばせるかを決める。
   */
  async function synchronize(options) {
    if (busy || !client || !session?.user || !settings.enabled) return;
    if (window.DeliSyncData?.isSaveBlocked()) {
      setStatus("端末内の保存データに問題があるため同期を止めています", "error");
      return;
    }

    // 別のアカウントの記録がこの端末に残っている間は、送信も自動取り込みもしない。
    if (settings.userId && settings.userId !== session.user.id && window.DeliSyncData?.getRecordCount() > 0) {
      ownerMismatch = true;
      renderOwnerMismatch();
      return;
    }
    ownerMismatch = false;

    busy = true;
    renderAccount();
    if (options.manual) setStatus("同期しています…");

    try {
      status = await fetchStatus();

      if (!status) {
        await push({ force: false, baseRevision: 0, reason: "auto" });
        return;
      }

      const changed = hasLocalChanges();

      if (status.revision === settings.baseRevision) {
        if (changed) await push({ force: false, baseRevision: status.revision, reason: "auto" });
        else setStatus(syncedMessage());
        return;
      }

      // サーバーが進んでいる。この端末に未送信の変更が無ければそのまま取り込む。
      if (!changed) {
        await pullAndApply(null);
        return;
      }

      conflict = { serverRevision: status.revision };
      renderConflict();
    } catch (error) {
      setStatus(describeError(error), "error");
    } finally {
      busy = false;
      renderAccount();
      if (elements.history.open) await renderHistory();
    }
  }

  async function fetchStatus() {
    const { data, error } = await client.rpc("get_my_backup_status");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || row.revision === null || row.revision === undefined) return null;
    return {
      revision: Number(row.revision),
      updatedAt: row.updated_at || "",
      deviceLabel: row.device_label || "",
      recordCount: Number(row.record_count) || 0,
    };
  }

  async function push(options) {
    const snapshot = window.DeliSyncData?.getSnapshot();
    if (!snapshot) throw new Error("snapshot unavailable");

    const signature = contentSignature(snapshot);
    const encoded = await encodeSnapshot(snapshot);
    if (encoded.payload.length > MAX_PAYLOAD_CHARS) {
      throw new Error("記録が大きすぎてクラウドへ送れません。ファイル保存をお使いください。");
    }

    const { data, error } = await client.rpc("push_my_backup", {
      p_payload: encoded.payload,
      p_encoding: encoded.encoding,
      p_schema_version: window.DeliSyncData.getSchemaVersion(),
      p_record_count: window.DeliSyncData.getRecordCount(),
      p_device_id: settings.deviceId,
      p_device_label: deviceLabel(),
      p_client_updated_at: new Date().toISOString(),
      p_base_revision: options.baseRevision,
      p_force: options.force,
      p_reason: options.reason,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (row?.accepted === false) {
      conflict = { serverRevision: Number(row.server_revision) };
      status = {
        revision: Number(row.server_revision),
        updatedAt: row.server_updated_at || "",
        deviceLabel: row.server_device_label || "",
        recordCount: Number(row.server_record_count) || 0,
      };
      renderConflict();
      return;
    }

    settings.baseRevision = Number(row?.revision) || settings.baseRevision;
    settings.lastSyncedAt = new Date().toISOString();
    settings.lastSignature = signature;
    settings.userId = session?.user?.id || settings.userId;
    writeSettings();
    conflict = null;
    status = {
      revision: settings.baseRevision,
      updatedAt: settings.lastSyncedAt,
      deviceLabel: deviceLabel(),
      recordCount: window.DeliSyncData.getRecordCount(),
    };
    setStatus(`クラウドへ保存しました（${formatDateTime(settings.lastSyncedAt)}）`, "success");
  }

  async function pullAndApply(revision) {
    const { data, error } = await client.rpc("pull_my_backup", { p_revision: revision });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.payload) throw new Error("クラウドに保存された記録が見つかりません");

    const snapshot = await decodeSnapshot(row.payload, row.encoding);
    await window.DeliSyncData.applyRemoteSnapshot(snapshot);

    settings.baseRevision = Number(row.revision) || settings.baseRevision;
    settings.lastSyncedAt = new Date().toISOString();
    settings.lastSignature = contentSignature(window.DeliSyncData.getSnapshot());
    settings.userId = session?.user?.id || settings.userId;
    writeSettings();
    conflict = null;
    setStatus(`クラウドの内容を取り込みました（${formatNumber(Number(row.record_count) || 0)}日分）`, "success");
  }

  async function resolveConflict(choice) {
    if (busy) return;
    if (ownerMismatch) {
      if (choice !== "remote") return;
      busy = true;
      renderAccount();
      try {
        await pullAndApply(null);
        ownerMismatch = false;
        elements.conflict.hidden = true;
      } catch (error) {
        setStatus(describeError(error), "error");
      } finally {
        busy = false;
        renderAccount();
      }
      return;
    }
    if (!conflict) return;
    busy = true;
    renderAccount();

    try {
      if (choice === "local") {
        // クラウド側の内容は push 時に履歴へ退避されるため、選ばなかった方も残る。
        await push({ force: true, baseRevision: conflict.serverRevision, reason: "manual" });
      } else {
        await pullAndApply(null);
      }
      conflict = null;
    } catch (error) {
      setStatus(describeError(error), "error");
    } finally {
      busy = false;
      renderAccount();
    }
  }

  /**
   * 前の利用者の記録が残ったまま別のアカウントでログインした状態。
   * 「この端末の内容をクラウドへ送る」は選ばせない。他人のデータを
   * 相手のクラウドへ書き込む事故になるため。
   */
  function renderOwnerMismatch() {
    elements.conflict.hidden = false;
    elements.keepLocal.hidden = true;
    elements.keepRemote.textContent = "クラウドの内容を取り込む";
    elements.conflictDetail.textContent = `この端末には別のアカウントで入力された記録が${formatNumber(window.DeliSyncData?.getRecordCount() || 0)}日分残っています。安全のため、この端末の内容をクラウドへ送ることはできません。クラウドの内容を取り込むか、同期を止めて先にファイル保存をしてください。取り込む前の内容は端末内の復元ポイントに残します。`;
    setStatus("別のアカウントの記録がこの端末に残っています", "error");
  }

  function renderConflict() {
    elements.keepLocal.hidden = false;
    elements.conflict.hidden = false;
    const remote = status
      ? `クラウド：${formatNumber(status.recordCount)}日分（${status.deviceLabel || "別の端末"}・${formatDateTime(status.updatedAt)}）`
      : "クラウド：内容を取得できませんでした";
    const localCount = window.DeliSyncData?.getRecordCount() || 0;
    const local = `この端末：${formatNumber(localCount)}日分`;
    // 記録数が大きく減る選択は事故になりやすいので、選ぶ前に警告する。
    const remoteCount = status?.recordCount || 0;
    const warning = remoteCount > localCount + 5
      ? ` この端末の方が${formatNumber(remoteCount - localCount)}日分少ないため、「この端末の内容を使う」を選ぶと表示上はその分が減ります。`
      : "";
    elements.conflictDetail.textContent = `${local} / ${remote}。どちらを残すか選んでください。選ばなかった側もクラウドの履歴に残ります。${warning}`;
    setStatus("内容が分かれています。残す方を選んでください。", "error");
  }

  async function renderHistory() {
    if (!client || !session?.user) return;
    const { data, error } = await client.rpc("list_my_backup_versions", { p_limit: 30 });
    elements.historyList.replaceChildren();

    if (error) {
      const message = document.createElement("p");
      message.className = "cloud-sync-history-empty";
      message.textContent = "履歴を取得できませんでした";
      elements.historyList.append(message);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      const message = document.createElement("p");
      message.className = "cloud-sync-history-empty";
      message.textContent = "まだ履歴はありません";
      elements.historyList.append(message);
      return;
    }

    rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "cloud-sync-history-item";

      const description = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `${formatNumber(Number(row.record_count) || 0)}日分`;
      const detail = document.createElement("p");
      detail.textContent = `${formatDateTime(row.created_at)}・${row.device_label || "端末不明"}`;
      description.append(title, detail);

      const restore = document.createElement("button");
      restore.className = "text-button muted";
      restore.type = "button";
      restore.dataset.cloudRevision = String(row.revision);
      restore.textContent = "この状態に戻す";

      item.append(description, restore);
      elements.historyList.append(item);
    });
  }

  async function restoreFromHistory(event) {
    const button = event.target.closest("[data-cloud-revision]");
    if (!button || busy) return;
    if (!confirm("この履歴の内容で、この端末の記録を置き換えますか？\n置き換える前の内容は復元ポイントに残します。")) return;

    busy = true;
    renderAccount();
    try {
      await pullAndApply(Number(button.dataset.cloudRevision));
      // 履歴から戻した内容を、あらためて最新としてクラウドへ送る。
      await push({ force: true, baseRevision: settings.baseRevision, reason: "pre-restore" });
    } catch (error) {
      setStatus(describeError(error), "error");
    } finally {
      busy = false;
      renderAccount();
    }
  }

  async function deleteCloudData() {
    if (busy || !client || !session?.user) return;
    if (!confirm(
      "クラウド上の記録と履歴をすべて削除しますか？\nこの端末内の記録とログインアカウントは残ります。"
    )) return;

    busy = true;
    renderAccount();
    const { error } = await client.rpc("delete_my_backup");
    busy = false;

    if (error) {
      setStatus(describeError(error), "error");
      renderAccount();
      return;
    }

    settings.baseRevision = 0;
    settings.enabled = false;
    writeSettings();
    status = null;
    conflict = null;
    renderAccount();
    setStatus("クラウド上のデータを削除し、同期を停止しました", "success");
  }

  /** JSONをgzip+base64へ圧縮する。対応していない環境では生JSONで送る。 */
  async function encodeSnapshot(snapshot) {
    const json = JSON.stringify(snapshot);
    if (typeof CompressionStream !== "function") return { payload: json, encoding: "json" };

    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
      const buffer = await new Response(stream).arrayBuffer();
      return { payload: base64FromBytes(new Uint8Array(buffer)), encoding: "gzip-base64" };
    } catch {
      return { payload: json, encoding: "json" };
    }
  }

  async function decodeSnapshot(payload, encoding) {
    if (encoding !== "gzip-base64") return JSON.parse(payload);
    const bytes = bytesFromBase64(payload);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }

  function base64FromBytes(bytes) {
    let binary = "";
    const chunkSize = 8192;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  function bytesFromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function syncedMessage() {
    return settings.lastSyncedAt
      ? `クラウドと同じ内容です（最終同期：${formatDateTime(settings.lastSyncedAt)}）`
      : "クラウドと同じ内容です";
  }

  function describeError(error) {
    const message = String(error?.message || error || "");
    if (/too many backup writes/i.test(message)) return "送信が続いたため少し待ってから再試行してください";
    if (/authentication required|JWT|401/i.test(message)) return "ログインの有効期限が切れました。もう一度ログインしてください。";
    if (/Failed to fetch|NetworkError/i.test(message)) return "通信できませんでした。電波の良い場所で再試行してください。";
    if (message && !/\[object/.test(message)) return message;
    return "同期できませんでした";
  }

  function setStatus(message, state = "") {
    elements.statusText.textContent = message;
    elements.statusText.dataset.state = state;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "日時不明";
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ja-JP").format(Number(value) || 0);
  }
})();
