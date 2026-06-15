// =====================================================
// app.js — 各場ページの画面描画
// 予想ロジック本体は engine.js(window.Engine)を使う
// =====================================================

(function () {
  "use strict";

  const E = window.Engine;
  const WAKU_COLORS = {
    1: { bg: "#ffffff", fg: "#222" }, 2: { bg: "#222222", fg: "#fff" },
    3: { bg: "#e8332a", fg: "#fff" }, 4: { bg: "#2b62c4", fg: "#fff" },
    5: { bg: "#f6d521", fg: "#222" }, 6: { bg: "#3aa655", fg: "#fff" },
    7: { bg: "#f08c1d", fg: "#fff" }, 8: { bg: "#e88ba7", fg: "#222" }
  };

  const $ = (id) => document.getElementById(id);
  let currentRace = 0;
  // 自動更新でのリロード後も、見ていたレースを維持する(タブごとに保存)
  const RACE_KEY = "lastRace:" + location.pathname + location.search;
  (function restoreRace() {
    try {
      const saved = sessionStorage.getItem(RACE_KEY);
      if (saved != null) {
        const idx = RACE_DATA.races.findIndex((r) => String(r.raceNo) === saved);
        if (idx >= 0) currentRace = idx;
      }
    } catch (e) { /* sessionStorage不可は無視 */ }
  })();

  function renderTabs() {
    const nav = $("race-tabs");
    nav.innerHTML = "";
    RACE_DATA.races.forEach((race, i) => {
      const btn = document.createElement("button");
      btn.className = "race-tab" + (i === currentRace ? " active" : "");
      btn.innerHTML = `<span class="tab-no">${race.raceNo}R</span><span class="tab-time">${race.startTime}</span>`;
      btn.addEventListener("click", () => { currentRace = i; render(); });
      nav.appendChild(btn);
    });
  }

  function renderRaceHeader(race) {
    let resultHtml = "";
    if (race.result && race.result.order) {
      const nameOf = (num) => {
        const h = race.horses.find((x) => x.num === num);
        return h ? h.name : "";
      };
      resultHtml = `<p class="result-line">結果: ` +
        race.result.order.slice(0, 3)
          .map((num, i) => `<b>${i + 1}着</b> ${num} ${nameOf(num)}`)
          .join("&nbsp;/ ") + `</p>`;
    }
    $("race-header").innerHTML = `
      <div class="race-no-badge">${race.raceNo}R</div>
      <div>
        <h2 class="race-name">${race.name}</h2>
        <p class="race-meta">
          ダート${race.distance}m / 馬場:${race.condition} /
          発走 ${race.startTime} / ${race.horses.length}頭
        </p>
        ${resultHtml}
      </div>`;
  }

  function renderTable(rows, condition, result, noData) {
    const todayLv = E.babaLevel(condition);
    const finOf = {};
    if (result && result.order) {
      result.order.forEach((num, i) => { finOf[num] = i + 1; });
    }
    const tbody = $("shutsuba-body");
    tbody.innerHTML = "";
    rows.forEach((r) => {
      const h = r.horse;
      const wc = WAKU_COLORS[h.waku];
      const ev = E.evLabel(r.ev);
      const runs = E.normRuns(h.recent).slice(0, 5);
      const recentHtml = runs.length
        ? runs.map((run) => {
            const same = todayLv != null && E.babaLevel(run.baba) === todayLv;
            const title = run.baba ? `馬場:${run.baba} ${run.dist || ""}` : "";
            return `<span class="${same ? "same-baba" : ""}" title="${title}">${run.fin}</span>`;
          }).join("-")
        : "—";
      // 結果がある場合: 3着以内はバッジ、印を打った馬は着順を表示
      const fin = finOf[h.num];
      const finHtml = fin
        ? (fin <= 3
            ? `<span class="fin-badge fin-${fin}">${fin}着</span>`
            : (r.mark ? `<span class="fin-plain">${fin}着</span>` : ""))
        : "";
      // 便利指標: 中央/転入バッジ・脚質・スピード指数
      const centralBadge = h.transfer
        ? `<span class="badge-jra badge-transfer" title="JRA(中央)から転入">転入</span>`
        : h.central
          ? `<span class="badge-jra" title="JRA(中央)出走経験あり">中央</span>`
          : "";
      const styleHtml = h.style
        ? `<span class="style-${h.style}">${h.style}</span>` : "—";
      const spdHtml = h.spd != null
        ? `<span class="spd-idx${h.spd >= 110 ? " spd-hi" : ""}">${h.spd}</span>` : "—";

      const tr = document.createElement("tr");
      if (!noData && r.mark === "◎") tr.className = "row-honmei";
      // 新馬戦などデータ不足レースでは印・スコア・勝率・妙味を出さない
      const predCells = noData
        ? `<td>—</td><td>—</td><td>—</td>`
        : `<td><div class="score-bar"><div class="score-fill" style="width:${r.scorePct}%"></div><span>${Math.round(r.score)}</span></div></td>
           <td>${(r.winProb * 100).toFixed(1)}%</td>
           <td class="${ev.cls}">${ev.text}</td>`;
      tr.innerHTML = `
        <td class="mark${r.mark === "☆" ? " mark-star" : ""}">${noData ? "" : r.mark}</td>
        <td><span class="waku" style="background:${wc.bg};color:${wc.fg}">${h.waku}</span></td>
        <td class="uma-num">${h.num}</td>
        <td class="uma-name">${h.name}${centralBadge}${finHtml}<span class="horse-weight">${h.horseWeight != null ? h.horseWeight + "kg" : ""}</span></td>
        <td>${h.sexAge}</td>
        <td>${h.weight != null ? h.weight : "—"}</td>
        <td>${h.jockey}</td>
        <td class="style-cell">${styleHtml}</td>
        <td class="spd-cell">${spdHtml}</td>
        <td class="recent">${recentHtml}</td>
        <td class="odds">${h.odds != null ? h.odds.toFixed(1) : "—"}</td>
        ${predCells}`;
      tbody.appendChild(tr);
    });
  }

  function renderBets(bets, result, ulId, emptyMsg) {
    const ul = $(ulId || "bets-list");
    if (!ul) return;
    ul.innerHTML = "";
    if (!bets.length) {
      const li = document.createElement("li");
      li.className = "bets-empty";
      li.textContent = emptyMsg || "該当なし";
      ul.appendChild(li);
      return;
    }
    let invested = 0, returned = 0, judged = false;
    bets.forEach((b) => {
      const li = document.createElement("li");
      let judgeHtml = "";
      const ret = E.betReturn(b, result);
      if (ret.hit !== null) {
        judged = true;
        invested += ret.cost;
        returned += ret.payout || 0;
        judgeHtml = ret.hit
          ? `<span class="bet-hit">的中${ret.payout != null ? " " + ret.payout.toLocaleString() + "円" : ""}</span>`
          : `<span class="bet-miss">✕</span>`;
      }
      li.innerHTML = `<span class="bet-kind">${b.kind}</span><span class="bet-target">${b.target}</span>${judgeHtml}<span class="bet-memo">${b.memo}</span>`;
      ul.appendChild(li);
    });
    // 結果があるレースは収支(各100円購入として)を表示
    if (judged) {
      const li = document.createElement("li");
      li.className = "bets-total";
      const rate = invested ? Math.round((returned / invested) * 100) : 0;
      const diff = returned - invested;
      li.innerHTML =
        `<span class="bet-kind">収支</span>` +
        `<span class="bet-target">${invested.toLocaleString()}円 → ${returned.toLocaleString()}円</span>` +
        `<span class="${diff >= 0 ? "bet-hit" : "bet-miss"}">回収率 ${rate}%</span>`;
      ul.appendChild(li);
    }
  }

  function makeComment(race, ranked, star) {
    const a = ranked[0], b = ranked[1];
    const gap = a.score - b.score;
    const confidence = gap > 8 ? "鉄板級" : gap > 4 ? "信頼度は高め" : "混戦模様";
    const parts = [];
    const aRuns = E.normRuns(a.horse.recent);
    const recentTxt = aRuns.length > 0
      ? `近走${aRuns.slice(0, 3).map((r) => r.fin).join("・")}着と安定しており、`
      : "";
    const jockeyTxt = a.horse.jockeyWinRate != null
      ? `${a.horse.jockey}騎手(勝率${Math.round(a.horse.jockeyWinRate * 100)}%)`
      : `${a.horse.jockey}騎手`;
    parts.push(
      `本命は${a.horse.num}番${a.horse.name}。${recentTxt}${jockeyTxt}とのコンビで${confidence}。`
    );
    parts.push(
      `対抗は${b.horse.num}番${b.horse.name}。${race.distance}mへの適性が高く、逆転まで視野に入る。`
    );
    if (star) {
      const todayLv = E.babaLevel(race.condition);
      const goodSame = E.normRuns(star.horse.recent).find(
        (r) => todayLv != null && E.babaLevel(r.baba) === todayLv && r.fin <= 3
      );
      parts.push(
        `☆穴馬は${star.popRank}番人気(取得時点)の${star.horse.num}番${star.horse.name}。` +
        (goodSame
          ? `当日と同じ馬場(${race.condition})で${goodSame.fin}着の実績があり、一発の魅力。`
          : `人気以上に走れる下地があり、ワイドで押さえたい。`)
      );
    }
    return parts.join(" ");
  }

  // EV判定に使ったオッズの鮮度を表示する
  // (パリミュチュエルの払戻は最終オッズで決まるため、判定は発走直前ほど正確)
  function oddsStatus(race) {
    if (RACE_DATA.isArchive) return "✅ 検証ページ: 最終オッズでEV判定しています";
    if (race.result) return "🏁 レース確定: 着順と収支を表示しています";
    if (RACE_DATA.isPreview) {
      return "⭐ 前日版: オッズ未発売のためEVプランは当日(発走15分前ごろ)に確定します。予想印・スコアは出馬表確定時点のものです";
    }
    const upd = race.oddsUpdatedAt ||
      (RACE_DATA.fetchedAt ? RACE_DATA.fetchedAt.slice(11, 16) : null);
    if (!upd || !race.startTime) return "";
    const toMin = (s) => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(3, 5), 10);
    const diff = toMin(race.startTime) - toMin(upd);
    if (diff <= 20) {
      return `🔔 ${upd}時点のオッズで判定(発走${race.startTime}) — 直前版`;
    }
    return `⏳ ${upd}時点のオッズによる暫定判定 — オッズは発走直前まで変動するため、発走15分前ごろに自動更新されます`;
  }

  function render() {
    const race = RACE_DATA.races[currentRace];
    try { sessionStorage.setItem(RACE_KEY, String(race.raceNo)); } catch (e) { /* 無視 */ }
    const noData = E.isNoDataRace(race);
    const { rows, ranked, star } = E.analyzeRace(race);
    renderTabs();
    renderRaceHeader(race);
    renderTable(rows, race.condition, race.result, noData);
    const skipMsg = noData
      ? "新馬戦(初出走馬中心)のため予想対象外です"
      : "このレースに条件を満たす馬はいません(見送り)";
    renderBets(noData ? [] : E.suggestBets(ranked, star), race.result, "sanrentan-list", skipMsg);
    renderBets(noData ? [] : E.suggestValueBets(rows), race.result, "value-bets-list", skipMsg);
    renderBets(noData ? [] : E.suggestPlaceBets(rows), race.result, "place-bets-list", skipMsg);
    const status = noData ? "" : oddsStatus(race);
    document.querySelectorAll(".odds-status-slot").forEach((el) => {
      el.textContent = status;
      el.style.display = status ? "" : "none";
    });
    $("race-comment").textContent = noData
      ? "新馬戦(初出走馬中心)のため過去走データがなく、このレースの予想は見送ります。"
      : makeComment(race, ranked, star);
    $("comment-note").textContent = noData ? "" :
      `※ 当日の馬場(${race.condition})に近い馬場状態だった過去走を重視して採点しています。` +
      `近走欄の金色の数字は当日と同じ馬場状態での着順です。`;
  }

  // ---------- アーカイブ(過去の検証)と翌日プレビュー ----------
  function todayYmd() {
    const n = new Date();
    return n.getFullYear() * 10000 + (n.getMonth() + 1) * 100 + n.getDate() + "";
  }

  function renderArchiveLinks() {
    const wrap = $("archive-links");
    if (!wrap) return;
    const cur = (location.search.match(/date=(\d{8})/) || [])[1] || null;
    const today = todayYmd();
    const fmt = (d) => `${parseInt(d.slice(4, 6), 10)}月${parseInt(d.slice(6, 8), 10)}日`;
    const parts = [];
    if (cur) {
      parts.push(cur > today
        ? `<span class="archive-banner">【${fmt(cur)}の予想(前日版)】出馬表確定後の先行予想です。オッズ発売後、当日に評価・EVプランが確定します</span>`
        : `<span class="archive-banner">【${fmt(cur)}の予想検証】予想は前日までのデータのみで算出し、実際の結果と照合しています</span>`);
      parts.push(`<a href="./">→ 本日の予想にもどる</a>`);
    }
    (window.ARCHIVE_DATES || []).forEach((d) => {
      if (d === cur) return;
      parts.push(d > today
        ? `<a href="?date=${d}" class="tomorrow-link">⭐ ${fmt(d)}の予想(前日版)</a>`
        : `<a href="?date=${d}">${fmt(d)}の予想・結果</a>`);
    });
    parts.push(`<a href="../results.html">📊 予想成績(回収率)</a>`);
    wrap.innerHTML = parts.join("");
    wrap.style.display = "";
  }

  const fetchedTxt = RACE_DATA.fetchedAt
    ? `<span class="fetched-at">出馬表取得: ${RACE_DATA.fetchedAt}</span>`
    : `<span class="fetched-at">サンプルデータ表示中</span>`;
  // 直前オッズ更新(10分間隔タスク)の最終時刻。出馬表の取得時刻とは別に表示する
  const oddsTxt = RACE_DATA.oddsUpdatedAt
    ? `<span class="fetched-at odds-updated">オッズ更新: ${RACE_DATA.oddsUpdatedAt}</span>`
    : "";
  $("kaisai-info").innerHTML =
    `<span>${RACE_DATA.venue}</span><span>${RACE_DATA.meeting}</span>${fetchedTxt}${oddsTxt}`;

  // レース日付を大きく表示するストリップ(ヘッダー直下)
  (function renderDateStrip() {
    const tag = RACE_DATA.isArchive
      ? `<span class="date-strip-tag tag-archive">結果検証</span>`
      : RACE_DATA.isPreview
        ? `<span class="date-strip-tag tag-preview">前日版予想</span>`
        : `<span class="date-strip-tag tag-live">本日の予想</span>`;
    const strip = document.createElement("div");
    strip.className = "date-strip";
    strip.innerHTML = `📅 <b>${RACE_DATA.date}</b> <span class="date-strip-venue">${RACE_DATA.venue}</span>${tag}`;
    document.querySelector(".site-header").after(strip);
  })();
  // ---------- 同日開催の他場ナビ ----------
  // 当日表示: today.js(取得時に生成される開催場マニフェスト)から作る
  // アーカイブ/前日版表示: 同じ日付の data-YYYYMMDD.js がある場を HEAD で探す
  (async function renderVenueNav() {
    const cur = (location.search.match(/date=(\d{8})/) || [])[1] || null;
    let entries = [];
    try {
      if (cur) {
        const checks = await Promise.all(E.VENUE_LIST.map(async ([slug, name]) => {
          try {
            const res = await fetch(`../${slug}/data-${cur}.js`, { method: "HEAD", cache: "no-store" });
            return res.ok ? [slug, name] : null;
          } catch (e) { return null; }
        }));
        entries = checks.filter(Boolean).map(([slug, name]) => [slug, name, `../${slug}/?date=${cur}`]);
      } else {
        const res = await fetch("../today.js", { cache: "no-store" });
        if (res.ok) {
          const m = (await res.text()).match(/window\.TODAY_VENUES = (\{.*\});/s);
          if (m) {
            entries = Object.entries(JSON.parse(m[1]).venues || {})
              .map(([slug, name]) => [slug, name, `../${slug}/`]);
          }
        }
      }
    } catch (e) { /* マニフェストなし */ }
    if (entries.length < 2) return;
    const nav = document.createElement("div");
    nav.className = "venue-nav";
    nav.innerHTML = `<span class="venue-nav-label">${cur ? "同日開催:" : "本日開催:"}</span>` +
      entries.map(([slug, name, href]) =>
        `${name}競馬場` === RACE_DATA.venue
          ? `<span class="venue-nav-current">${name}</span>`
          : `<a href="${href}">${name}</a>`
      ).join("");
    const anchor = $("archive-links");
    anchor.parentNode.insertBefore(nav, anchor);
  })();

  renderArchiveLinks();
  render();

  // ---------- 自動更新 ----------
  // 当日ページのみ: 3分ごとに data.js の更新(直前オッズ反映)を確認し、
  // 変わっていたらリロードする。アーカイブ表示(?date=)では何もしない。
  if (!RACE_DATA.isArchive && !location.search.match(/date=\d{8}/)) {
    const resultCount = RACE_DATA.races.filter((r) => r.result).length;
    const loadedStamp =
      (RACE_DATA.oddsUpdatedAt || "") + "|" + (RACE_DATA.fetchedAt || "") + "|" + resultCount;
    setInterval(async () => {
      try {
        const res = await fetch("data.js", { cache: "no-store" });
        if (!res.ok) return;
        const txt = await res.text();
        const odds = (txt.match(/"oddsUpdatedAt": "([^"]+)"/) || [])[1] || "";
        const fetched = (txt.match(/"fetchedAt": "([^"]+)"/) || [])[1] || "";
        const results = (txt.match(/"result":/g) || []).length;
        if (odds + "|" + fetched + "|" + results !== loadedStamp) location.reload();
      } catch (e) { /* オフライン等は無視 */ }
    }, 3 * 60 * 1000);
  }
})();
