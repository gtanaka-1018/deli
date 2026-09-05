"use strict";

/**
 * Supabaseクライアントの共有窓口。
 *
 * ランキングとクラウド同期の両方がログイン状態を使うが、1つのページで createClient を
 * 2回呼ぶと認証トークンの自動更新が二重に動き、セッションの取り合いが起きる。
 * ここで1つだけ作って共有する。
 *
 * 読み込みは遅延させる。ログインしていない利用者のトップページ表示では、SDKも
 * /api/ranking-config も取得しない。
 */
(() => {
  const SDK_URL = "/vendor/supabase-js-2.112.3.js";

  let clientPromise = null;
  const authListeners = new Set();

  function loadSdk() {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-supabase-sdk]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("SDK unavailable")));
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_URL;
      script.async = true;
      script.dataset.supabaseSdk = "true";
      script.onload = () => (window.supabase?.createClient ? resolve() : reject(new Error("SDK unavailable")));
      script.onerror = () => reject(new Error("SDK unavailable"));
      document.head.append(script);
    });
  }

  async function loadConfig() {
    const response = await fetch("/api/ranking-config", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("cloud unavailable");
    const config = await response.json();
    if (!config?.available || !config.url || !config.publishableKey) throw new Error("cloud unavailable");
    return config;
  }

  /**
   * クライアントを取得する。初回だけ設定とSDKを読み込む。
   * クラウドが未設定のときは reject する。呼び出し側は「準備中」として扱う。
   */
  function getClient() {
    if (clientPromise) return clientPromise;

    clientPromise = (async () => {
      const config = await loadConfig();
      await loadSdk();
      const client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });

      client.auth.onAuthStateChange((event, session) => {
        authListeners.forEach((listener) => {
          try {
            listener(event, session);
          } catch {
            // 1つの購読者の失敗で他の購読者を止めない。
          }
        });
      });

      return client;
    })().catch((error) => {
      // 次の操作で再試行できるように、失敗した Promise は保持しない。
      clientPromise = null;
      throw error;
    });

    return clientPromise;
  }

  /** 既に生成済みのときだけクライアントを返す。生成は行わない。 */
  function peekClient() {
    return clientPromise;
  }

  function onAuthStateChange(listener) {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  }

  window.DeliSupabase = Object.freeze({
    getClient,
    peekClient,
    onAuthStateChange,
    SDK_URL,
  });
})();
