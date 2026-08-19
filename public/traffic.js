"use strict";

(() => {
  const host = document.querySelector("[data-public-traffic]");
  if (!host) return;

  const title = document.getElementById("publicTrafficTitle");
  const note = document.getElementById("publicTrafficNote");
  const pageviews = document.getElementById("publicPageviews");
  const visitors = document.getElementById("publicVisitors");
  const number = new Intl.NumberFormat("ja-JP");

  fetch("/api/traffic", { headers: { Accept: "application/json" } })
    .then((response) => {
      if (!response.ok) throw new Error("traffic unavailable");
      return response.json();
    })
    .then((data) => {
      if (!data?.available) throw new Error("traffic unavailable");
      pageviews.textContent = number.format(data.pageviews);
      visitors.textContent = number.format(data.visitors);
      title.textContent = "億メーターの公開アクセス状況";
      note.textContent = "Web Analyticsを有効にしてからの匿名集計です";
      host.dataset.state = "ready";
    })
    .catch(() => {
      title.textContent = "公開集計は準備中です";
      note.textContent = "入力した売上・経費は集計・公開されません";
      host.dataset.state = "unavailable";
    });
})();
