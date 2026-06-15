// =====================================================
// engine.js — 予想エンジン(採点・印・買い目・的中/払戻判定)
// 各場ページ(app.js)と結果ページ(results.html)で共用する。
// window.Engine として公開。
// =====================================================

(function () {
  "use strict";

  // 印は☆穴馬と合わせて5頭まで(三連単フォーメーションが24点になる構成)
  const MARKS = ["◎", "○", "▲", "△"];

  // 馬場状態を 良=0 / 稍重=1 / 重=2 / 不良=3 の数値に変換
  const BABA_LEVEL = { "良": 0, "稍": 1, "重": 2, "不": 3 };
  function babaLevel(s) {
    if (!s) return null;
    const lv = BABA_LEVEL[String(s).charAt(0)];
    return lv === undefined ? null : lv;
  }

  // 過去走は数値(旧形式)とオブジェクト {fin, baba, dist, date} の両対応
  function normRuns(recent) {
    return (recent || []).map((r) =>
      typeof r === "number" ? { fin: r, baba: null } : r
    );
  }

  // 各馬のスコア = 近走成績(当日に近い馬場を重視) + 市場評価(オッズ)
  //              + 騎手 + 適性 + 斤量補正
  // 実データには無い項目(騎手勝率・適性など)は自動的にスキップされる
  function scoreHorse(h, todayBaba) {
    let score = 0;

    const runs = normRuns(h.recent);
    if (runs.length > 0) {
      // 直近ほど重い加重 × 馬場の近さで「着順の良さ」を点数化(最大45点相当)
      const recency = [1.0, 0.85, 0.7, 0.55, 0.45, 0.35, 0.3, 0.25];
      const SIM = [1.3, 0.9, 0.6, 0.4]; // 馬場差0(同じ)〜3(真逆)の倍率
      const todayLv = babaLevel(todayBaba);
      let recentScore = 0, wSum = 0;
      runs.forEach((run, i) => {
        let w = recency[i] !== undefined ? recency[i] : 0.2;
        const lv = babaLevel(run.baba);
        if (todayLv != null && lv != null) w *= SIM[Math.abs(lv - todayLv)];
        recentScore += Math.max(0, 11 - run.fin) * w;
        wSum += w;
      });
      score += (recentScore / wSum) * 4.5;
    }

    if (h.odds != null) score += (0.78 / h.odds) * 60;   // 市場評価(最大~40点)
    if (h.jockeyWinRate != null) score += h.jockeyWinRate * 100;
    if (h.aptitude != null) score += h.aptitude * 4;
    if (h.weight != null) score -= (h.weight - 55) * 2;  // 斤量 1kg = 2点

    return score;
  }

  // スコア→勝率(ソフトマックス)
  function winProbs(scores) {
    const tau = 12; // 温度:小さいほど本命寄り
    const exps = scores.map((s) => Math.exp(s / tau));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / total);
  }

  function analyzeRace(race) {
    // オッズ発売前の「0.0」等の異常値は未発売(null)として扱う(0除算防止)
    race.horses.forEach((h) => {
      if (h.odds != null && h.odds <= 1.0) h.odds = null;
    });
    const scores = race.horses.map((h) => scoreHorse(h, race.condition));
    const probs = winProbs(scores);
    const maxScore = Math.max(...scores);

    const rows = race.horses.map((h, i) => ({
      horse: h,
      score: scores[i],
      scorePct: Math.round((scores[i] / Math.max(1, maxScore)) * 100),
      winProb: probs[i],
      // 期待値(1.0が損益分岐)。モデル確率は裾が厚くなりがちなので
      // 市場確率(オッズ逆数)と50:50でブレンドして過大評価を抑える
      ev: h.odds != null
        ? (probs[i] * 0.5 + (0.78 / h.odds) * 0.5) * h.odds
        : null,
      // 純モデル期待値(回収率重視プランで使用)
      modelEv: h.odds != null ? probs[i] * h.odds : null
    }));

    // 人気順位(オッズ昇順。オッズ未発売時はスコア順で代用)
    const allOdds = rows.every((r) => r.horse.odds != null);
    const byPop = [...rows].sort((a, b) =>
      allOdds ? a.horse.odds - b.horse.odds : b.score - a.score
    );
    byPop.forEach((r, i) => { r.popRank = i + 1; });

    const ranked = [...rows].sort((a, b) => b.score - a.score);
    ranked.forEach((r, i) => { r.mark = i < MARKS.length ? MARKS[i] : ""; });

    // ☆穴馬:人気が出走頭数の半分以下の馬の中から、
    // モデル評価(スコア)が最も高い1頭を毎レース選ぶ
    // (ranked はスコア降順なので先頭の該当馬を採用)
    const half = Math.ceil(rows.length / 2);
    const star = ranked.find((r) => !r.mark && r.popRank >= half) || null;
    if (star) star.mark = "☆";

    return { rows, ranked, star };
  }

  function evLabel(ev) {
    if (ev == null) return { text: "－", cls: "ev-low" };
    if (ev >= 1.3) return { text: "◎ 過剰人気薄", cls: "ev-high" };
    if (ev >= 1.0) return { text: "○ 妙味あり", cls: "ev-mid" };
    return { text: "－", cls: "ev-low" };
  }

  // ワイドプラン: ◎○の2頭を軸に、軸同士＋各軸→残りの印(▲△☆)へ流す。
  // 印5頭(◎○▲△☆)なら ◎-○ + ◎/○→▲△☆ で重複を除いて7点。
  // 三連単より控除率が低く当たりやすいため、的中重視の参考プラン。
  function suggestBets(ranked, star) {
    const marked = ranked.filter((r) => r.mark); // ◎○▲△+☆(starはmark付与済み)
    const axes = marked.filter((r) => r.mark === "◎" || r.mark === "○");
    const others = marked.filter((r) => r.mark !== "◎" && r.mark !== "○");
    if (axes.length < 2) return [];
    const nameOf = {};
    marked.forEach((r) => { nameOf[r.horse.num] = r.horse.name; });
    const axisNums = axes.map((r) => r.horse.num);

    const seen = new Set();
    const pairs = [];
    const addPair = (a, b) => {
      if (a === b) return;
      const key = [a, b].sort((x, y) => x - y).join("-");
      if (!seen.has(key)) { seen.add(key); pairs.push([a, b]); }
    };
    addPair(axisNums[0], axisNums[1]);                       // 軸同士
    axisNums.forEach((a) => others.forEach((o) => addPair(a, o.horse.num))); // 各軸→残りの印

    return pairs.map(([a, b]) => ({
      kind: "ワイド", type: "wide", sel: [a, b],
      target: `${a}-${b}`,
      memo: `${nameOf[a]} - ${nameOf[b]}`
    }));
  }

  // ---------- 回収率重視プラン(EV単勝) ----------
  // 大井 2026/6/8〜11 の4日間検証で発見した条件:
  // 「純モデル期待値(勝率×オッズ)が1.0以上 かつ 単勝オッズ5〜20倍」の馬の
  // 単勝のみを買う。該当馬がいないレースは見送る(見送りもプランの一部)。
  // 検証成績: 16点4的中 1,600円→4,140円(回収率259%)。
  // ただしサンプルが小さいため実験的プラン。継続検証が前提。
  // 2026-06-12再学習: 上限を20倍→15倍に変更(16倍以上は6/1〜11で76点2中と
  // 大穴バイアスどおり回収率が悪く、足を引っ張っていたため)
  const VALUE_PARAMS = { minModelEv: 1.0, minOdds: 5.0, maxOdds: 14.9 };

  // 新馬戦などデータ不足レースの判定:
  // レース名に新馬系の文言がある、または過半数の馬に過去走データが無い
  function isNoDataRace(race) {
    if (/新馬|フレッシュチャレンジ/.test(race.name || "")) return true;
    const horses = race.horses || [];
    if (!horses.length) return false;
    const noRun = horses.filter((h) => normRuns(h.recent).length === 0).length;
    return noRun / horses.length > 0.5;
  }

  function valueRows(rows) {
    return rows
      .filter((r) =>
        r.modelEv != null &&
        r.modelEv >= VALUE_PARAMS.minModelEv &&
        r.horse.odds >= VALUE_PARAMS.minOdds &&
        r.horse.odds <= VALUE_PARAMS.maxOdds &&
        normRuns(r.horse.recent).length > 0  // 初出走馬(データなし)は対象外
      )
      .sort((a, b) => b.modelEv - a.modelEv);
  }

  function suggestValueBets(rows) {
    return valueRows(rows).map((r) => ({
      kind: "単勝", type: "tansho", sel: [r.horse.num],
      target: `${r.horse.num}`,
      memo: `${r.horse.name}(単${r.horse.odds.toFixed(1)}倍・期待値${r.modelEv.toFixed(2)})`
    }));
  }

  // EV複勝プラン: 同じ該当馬を複勝で買う堅実版(当たりやすいが配当は低い)
  function suggestPlaceBets(rows) {
    return valueRows(rows).map((r) => ({
      kind: "複勝", type: "fukusho", sel: [r.horse.num],
      target: `${r.horse.num}`,
      memo: `${r.horse.name}(単${r.horse.odds.toFixed(1)}倍・期待値${r.modelEv.toFixed(2)})`
    }));
  }

  // 買い目が実際の着順(order=到達順の馬番)で的中したか判定
  function judgeBet(bet, order) {
    const pos = (num) => {
      const i = order.indexOf(num);
      return i < 0 ? 99 : i + 1;
    };
    switch (bet.type) {
      case "tansho": return pos(bet.sel[0]) === 1;
      case "umaren": return bet.sel.every((x) => pos(x) <= 2);
      case "wide": return bet.sel.every((x) => pos(x) <= 3);
      case "sanrenpuku": return bet.sel.every((x) => pos(x) <= 3);
      case "sanrentan":
        return bet.first.includes(order[0]) &&
               bet.second.includes(order[1]) &&
               bet.third.includes(order[2]);
      default: return false;
    }
  }

  // 買い目1点=100円(フォーメーションはpoints×100円)として、的中と払戻額を計算する
  function betReturn(bet, result) {
    const cost = (bet.points || 1) * 100;
    if (!result || !result.order) return { cost, hit: null, payout: null };
    if (bet.type === "fukusho") {
      // 複勝は払戻表に載っているか=的中(7頭以下は2着までの規則も払戻表が正)
      const table = (result.payouts || {}).fukusho || [];
      const entry = table.find((e) => e.comb[0] === bet.sel[0]);
      return { cost, hit: !!entry, payout: entry ? entry.amount : 0 };
    }
    const hit = judgeBet(bet, result.order);
    if (!hit) return { cost, hit: false, payout: 0 };
    const table = (result.payouts || {})[bet.type] || [];
    let entry = null;
    if (bet.type === "sanrentan") {
      const o = result.order;
      entry = table.find((e) =>
        e.comb.length === 3 && e.comb[0] === o[0] && e.comb[1] === o[1] && e.comb[2] === o[2]
      ) || table[0] || null;
    } else {
      const key = [...bet.sel].sort((x, y) => x - y).join("-");
      entry = table.find((e) => [...e.comb].sort((x, y) => x - y).join("-") === key) || null;
    }
    // 払戻データが無い場合は的中だけ分かる(payout=null)
    return { cost, hit: true, payout: entry ? entry.amount : null };
  }

  // ポイント競馬(play.html)用: 券種(kind)・選んだ馬番(nums)・結果から
  // 100ptあたりの払戻を返す(外れ・払戻データ無しは0)。
  // numsは馬単/三連単は着順どおり、それ以外は順不同で判定する。
  function settleBet(kind, nums, result) {
    if (!result || !result.order) return 0;
    const order = result.order;
    const pos = (n) => { const i = order.indexOf(n); return i < 0 ? 99 : i + 1; };
    let hit;
    switch (kind) {
      case "tansho":     hit = pos(nums[0]) === 1; break;
      case "fukusho":    hit = pos(nums[0]) <= (order.length <= 7 ? 2 : 3); break;
      case "umaren":     hit = nums.every((x) => pos(x) <= 2); break;
      case "wide":       hit = nums.every((x) => pos(x) <= 3); break;
      case "umatan":     hit = pos(nums[0]) === 1 && pos(nums[1]) === 2; break;
      case "sanrenpuku": hit = nums.every((x) => pos(x) <= 3); break;
      case "sanrentan":  hit = order[0] === nums[0] && order[1] === nums[1] && order[2] === nums[2]; break;
      default:           hit = false;
    }
    if (!hit) return 0;
    const ordered = kind === "umatan" || kind === "sanrentan";
    const table = (result.payouts || {})[kind] || [];
    const key = (ordered ? nums : [...nums].sort((a, b) => a - b)).join("-");
    const entry = table.find((e) =>
      (ordered ? e.comb : [...e.comb].sort((a, b) => a - b)).join("-") === key
    );
    return entry ? entry.amount : 0;
  }

  // 場一覧(slug, 表示名)。ページ側のナビ等で共用
  const VENUE_LIST = [
    ["monbetsu", "門別"], ["morioka", "盛岡"], ["mizusawa", "水沢"],
    ["urawa", "浦和"], ["funabashi", "船橋"], ["oi", "大井"], ["kawasaki", "川崎"],
    ["kanazawa", "金沢"], ["kasamatsu", "笠松"], ["nagoya", "名古屋"],
    ["sonoda", "園田"], ["himeji", "姫路"], ["kochi", "高知"], ["saga", "佐賀"]
  ];

  window.Engine = {
    MARKS, VENUE_LIST, babaLevel, normRuns, scoreHorse, winProbs,
    analyzeRace, evLabel, isNoDataRace,
    suggestBets, suggestValueBets, suggestPlaceBets,
    judgeBet, betReturn, settleBet
  };
})();
