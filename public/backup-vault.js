"use strict";

/**
 * 端末内バックアップ保管庫。
 *
 * localStorage だけに保存していると、保存データが壊れたときや容量上限に達したときに
 * 記録がまとめて失われる。ここでは IndexedDB に同じ内容の控えと世代付きの復元ポイントを
 * 置き、localStorage が読めなくなった場合の復旧元にする。
 *
 * 同一ブラウザー内の保険であり、クラウド同期の代わりにはならない。サイトデータの
 * 一括削除や機種変更では IndexedDB も一緒に消えるため、その用途にはファイル保存と
 * クラウド同期を使う。
 */
(() => {
  const DB_NAME = "okumeter-vault";
  const DB_VERSION = 1;
  const MIRROR_STORE = "mirror";
  const RESTORE_STORE = "restorePoints";
  const QUARANTINE_STORE = "quarantine";
  const MIRROR_KEY = "latest";
  const MAX_RESTORE_POINTS = 12;

  let dbPromise = null;

  function supported() {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  }

  function openDatabase() {
    if (!supported()) return Promise.reject(new Error("IndexedDB unavailable"));
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(MIRROR_STORE)) db.createObjectStore(MIRROR_STORE);
        if (!db.objectStoreNames.contains(RESTORE_STORE)) {
          db.createObjectStore(RESTORE_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(QUARANTINE_STORE)) {
          db.createObjectStore(QUARANTINE_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB blocked"));
    }).catch((error) => {
      // 次回の呼び出しで開き直せるように、失敗した Promise は保持しない。
      dbPromise = null;
      throw error;
    });

    return dbPromise;
  }

  function runTransaction(storeName, mode, operation) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (error) {
        reject(error);
        return;
      }
      const store = transaction.objectStore(storeName);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(result && result.__request ? result.__request.result : result);
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    }));
  }

  function wrap(request) {
    return { __request: request };
  }

  /** 直近スナップショットの控えを保存する。保存できなくても呼び出し側は続行してよい。 */
  async function mirror(snapshot) {
    if (!snapshot) return false;
    try {
      await runTransaction(MIRROR_STORE, "readwrite", (store) => wrap(store.put({
        snapshot,
        savedAt: new Date().toISOString(),
      }, MIRROR_KEY)));
      return true;
    } catch {
      return false;
    }
  }

  /** 控えを読み出す。壊れている・存在しない場合は null。 */
  async function readMirror() {
    try {
      const entry = await runTransaction(MIRROR_STORE, "readonly", (store) => wrap(store.get(MIRROR_KEY)));
      if (!entry || typeof entry !== "object" || !entry.snapshot) return null;
      return { snapshot: entry.snapshot, savedAt: entry.savedAt || "" };
    } catch {
      return null;
    }
  }

  /**
   * 復元ポイントを追加する。読み込み前や削除前など、取り返しがつかない操作の直前に呼ぶ。
   * 同じ理由の直近ポイントが1分以内にある場合は作り直さず、世代を無駄に消費しない。
   */
  async function saveRestorePoint(snapshot, reason, nowIso) {
    if (!snapshot) return null;
    const savedAt = nowIso || new Date().toISOString();
    const entry = {
      id: `${savedAt}-${reason}`,
      reason,
      savedAt,
      recordCount: countRecords(snapshot),
      snapshot,
    };
    try {
      const existing = await listRestorePoints();
      const duplicate = existing.find((item) => (
        item.reason === reason && Math.abs(Date.parse(item.savedAt) - Date.parse(savedAt)) < 60_000
      ));
      if (duplicate) return duplicate.id;

      await runTransaction(RESTORE_STORE, "readwrite", (store) => wrap(store.put(entry)));
      await pruneRestorePoints();
      return entry.id;
    } catch {
      return null;
    }
  }

  function countRecords(snapshot) {
    const records = snapshot && typeof snapshot === "object" ? snapshot.records : null;
    return records && typeof records === "object" ? Object.keys(records).length : 0;
  }

  /** 復元ポイントの一覧を新しい順で返す。スナップショット本体は含めない。 */
  async function listRestorePoints() {
    try {
      const entries = await runTransaction(RESTORE_STORE, "readonly", (store) => wrap(store.getAll()));
      if (!Array.isArray(entries)) return [];
      return entries
        .filter((entry) => entry && entry.id && entry.snapshot)
        .map((entry) => ({
          id: entry.id,
          reason: entry.reason || "",
          savedAt: entry.savedAt || "",
          recordCount: Number(entry.recordCount) || countRecords(entry.snapshot),
        }))
        .sort((left, right) => String(right.savedAt).localeCompare(String(left.savedAt)));
    } catch {
      return [];
    }
  }

  /** 指定した復元ポイントのスナップショットを取り出す。 */
  async function readRestorePoint(id) {
    try {
      const entry = await runTransaction(RESTORE_STORE, "readonly", (store) => wrap(store.get(id)));
      return entry && entry.snapshot ? entry.snapshot : null;
    } catch {
      return null;
    }
  }

  async function pruneRestorePoints() {
    const entries = await listRestorePoints();
    const surplus = entries.slice(MAX_RESTORE_POINTS);
    if (surplus.length === 0) return;
    try {
      await runTransaction(RESTORE_STORE, "readwrite", (store) => {
        surplus.forEach((entry) => store.delete(entry.id));
      });
    } catch {
      // 上限を超えた古い世代が残るだけで、復元自体には影響しない。
    }
  }

  /**
   * 壊れて読めなかった生データを退避する。上書きで失わないための最後の砦。
   * localStorage は容量が逼迫している可能性が高いため、控えは IndexedDB へ置く。
   */
  async function quarantine(rawText, nowIso) {
    if (typeof rawText !== "string" || rawText === "") return "";
    const id = `corrupt-${nowIso || new Date().toISOString()}`;
    try {
      await runTransaction(QUARANTINE_STORE, "readwrite", (store) => wrap(store.put({
        id,
        savedAt: nowIso || new Date().toISOString(),
        raw: rawText,
      })));
      return id;
    } catch {
      return "";
    }
  }

  /** 退避した壊れたデータの一覧。中身は返さない。 */
  async function listQuarantined() {
    try {
      const entries = await runTransaction(QUARANTINE_STORE, "readonly", (store) => wrap(store.getAll()));
      if (!Array.isArray(entries)) return [];
      return entries
        .filter((entry) => entry && entry.id)
        .map((entry) => ({ id: entry.id, savedAt: entry.savedAt || "", size: String(entry.raw || "").length }))
        .sort((left, right) => String(right.savedAt).localeCompare(String(left.savedAt)));
    } catch {
      return [];
    }
  }

  async function readQuarantined(id) {
    try {
      const entry = await runTransaction(QUARANTINE_STORE, "readonly", (store) => wrap(store.get(id)));
      return entry?.raw || "";
    } catch {
      return "";
    }
  }

  /** 1件の復元ポイントを削除する。 */
  async function deleteRestorePoint(id) {
    try {
      await runTransaction(RESTORE_STORE, "readwrite", (store) => wrap(store.delete(id)));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 控え・復元ポイント・退避データをすべて消す。
   * 端末を手放すときや共有端末で使い終わったときのための出口。
   */
  async function clearAll() {
    let cleared = true;
    for (const storeName of [MIRROR_STORE, RESTORE_STORE, QUARANTINE_STORE]) {
      try {
        await runTransaction(storeName, "readwrite", (store) => wrap(store.clear()));
      } catch {
        cleared = false;
      }
    }
    return cleared;
  }

  /** 保存領域の使用量を返す。取得できない環境では null。 */
  async function usage() {
    try {
      if (!navigator.storage?.estimate) return null;
      const estimate = await navigator.storage.estimate();
      const used = Number(estimate.usage);
      const quota = Number(estimate.quota);
      if (!Number.isFinite(used) || !Number.isFinite(quota) || quota <= 0) return null;
      return { used, quota, ratio: used / quota };
    } catch {
      return null;
    }
  }

  window.DeliVault = Object.freeze({
    supported,
    mirror,
    readMirror,
    saveRestorePoint,
    listRestorePoints,
    readRestorePoint,
    quarantine,
    listQuarantined,
    readQuarantined,
    deleteRestorePoint,
    clearAll,
    usage,
    MAX_RESTORE_POINTS,
  });
})();
