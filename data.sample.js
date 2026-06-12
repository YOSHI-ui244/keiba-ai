// =====================================================
// data.js — サンプルデータ生成
// 実データ連携時はこのファイルを差し替え、
// window.RACE_DATA に同じ形式のオブジェクトを入れればよい。
// =====================================================

(function () {
  "use strict";

  // 乱数シード固定(リロードしても同じデータになる)
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260611);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

  // ---- 馬名(架空) ----
  const NAME_HEAD = [
    "ゴールド", "シルバー", "サウス", "ノース", "ブレイブ", "スター",
    "キング", "クイーン", "ハヤテ", "サクラ", "ムーン", "サンライズ",
    "トウキョウ", "シティ", "ミラクル", "ファイア", "ウインド", "ライト",
    "スマート", "メイショウ", "ハネダ", "ベイサイド", "ナイト", "ダイナ"
  ];
  const NAME_TAIL = [
    "フラッシュ", "ウィン", "ハート", "スピリット", "クロス", "ドリーム",
    "アロー", "ストーム", "ボーイ", "ライナー", "インパクト", "テイオー",
    "オー", "スカイ", "ロード", "ブリーズ", "フォース", "シチー",
    "イーグル", "コメット"
  ];

  // ---- 騎手(架空・勝率は南関東水準を想定) ----
  const JOCKEYS = [
    { name: "矢島 貴大", winRate: 0.22 },
    { name: "笹原 翔",   winRate: 0.19 },
    { name: "御山 訓",   winRate: 0.17 },
    { name: "和田 慎二", winRate: 0.14 },
    { name: "本橋 幸太", winRate: 0.12 },
    { name: "藤川 凌",   winRate: 0.11 },
    { name: "西村 啓",   winRate: 0.10 },
    { name: "達川 龍",   winRate: 0.09 },
    { name: "町屋 涼",   winRate: 0.08 },
    { name: "石崎 駿",   winRate: 0.07 },
    { name: "高梨 裕",   winRate: 0.06 },
    { name: "今村 才",   winRate: 0.05 },
    { name: "中島 良",   winRate: 0.05 },
    { name: "岡村 健",   winRate: 0.04 },
    { name: "瀬川 翔太", winRate: 0.04 },
    { name: "村上 颯",   winRate: 0.03 }
  ];

  const RACE_NAMES = [
    "C2十一 十二", "C2九 十", "C2七 八", "C2五 六", "C1選抜",
    "3歳三 サラ系", "B3四 五", "B2三", "サンタアニタ賞", "B1選抜",
    "トゥインクル賞", "オフトナイト特別"
  ];
  const DISTANCES = [1000, 1200, 1200, 1400, 1400, 1500, 1600, 1600, 1700, 1800, 1200, 1600];
  const CONDITIONS = ["良", "稍重", "重", "不良"];

  function makeHorseName(used) {
    for (let i = 0; i < 50; i++) {
      const n = pick(NAME_HEAD) + pick(NAME_TAIL);
      if (!used.has(n) && n.length <= 9) { used.add(n); return n; }
    }
    return pick(NAME_HEAD) + randInt(2, 9);
  }

  function makeHorse(num, usedNames, usedJockeys) {
    let j = pick(JOCKEYS);
    for (let i = 0; i < 30 && usedJockeys.has(j.name); i++) j = pick(JOCKEYS);
    usedJockeys.add(j.name);

    // 近走着順(直近が先頭)。能力値ベースで生成する
    const ability = rand(); // 0〜1 の地力
    const recent = [];
    for (let i = 0; i < 5; i++) {
      const noise = rand() * 0.5;
      const fin = Math.max(1, Math.min(14, Math.round((1 - ability) * 10 + noise * 8 - 2)));
      recent.push(fin);
    }

    return {
      num: num,
      name: makeHorseName(usedNames),
      sexAge: pick(["牡", "牝", "セ"]) + randInt(3, 8),
      weight: [54, 54.5, 55, 55.5, 56, 56.5, 57][randInt(0, 6)],
      horseWeight: randInt(420, 540),
      jockey: j.name,
      jockeyWinRate: j.winRate,
      recent: recent,
      aptitude: Math.round(rand() * 10) / 2, // コース・距離適性 0〜5
      ability: ability
    };
  }

  function makeRace(idx) {
    const headCount = randInt(9, 14);
    const usedNames = new Set();
    const usedJockeys = new Set();
    const horses = [];
    for (let n = 1; n <= headCount; n++) {
      horses.push(makeHorse(n, usedNames, usedJockeys));
    }

    // 枠番割り当て(8枠制・外の枠に多頭を入れる簡易版)
    const wakuOf = (num, count) => {
      if (count <= 8) return num;
      const doubled = count - 8; // 2頭入る枠の数(外枠から)
      const firstDoubledWaku = 9 - doubled;
      let waku = 0, slot = 0;
      for (let w = 1; w <= 8; w++) {
        const cap = w >= firstDoubledWaku ? 2 : 1;
        if (num <= slot + cap) { waku = w; break; }
        slot += cap;
      }
      return waku;
    };
    horses.forEach((h) => { h.waku = wakuOf(h.num, headCount); });

    // 単勝オッズ:地力ベース+ばらつき(市場の歪み=妙味の源泉)
    const strengths = horses.map((h) => Math.exp(h.ability * 3 + rand() * 1.2));
    const total = strengths.reduce((a, b) => a + b, 0);
    horses.forEach((h, i) => {
      const p = strengths[i] / total;
      const odds = Math.max(1.1, (0.78 / p)); // 控除率約22%
      h.odds = odds >= 10 ? Math.round(odds) : Math.round(odds * 10) / 10;
    });

    const hour = 15 + Math.floor((idx * 35) / 60);
    const min = (idx * 35) % 60;
    return {
      raceNo: idx + 1,
      name: RACE_NAMES[idx],
      distance: DISTANCES[idx],
      condition: CONDITIONS[randInt(0, 1)],
      startTime: String(hour).padStart(2, "0") + ":" + String(min).padStart(2, "0"),
      horses: horses
    };
  }

  window.RACE_DATA = {
    venue: "大井競馬場",
    date: "2026年6月11日(木)",
    meeting: "第7回大井開催 3日目(トゥインクルレース)",
    races: Array.from({ length: 12 }, (_, i) => makeRace(i))
  };
})();
