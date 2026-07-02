/**
 * build-glossary-source.mjs - DeepL 用語集ソース生成スクリプト
 * @description data/Localization・data/References・data/Dictionaries の
 *   人間監修済み対訳（JP↔EN ペア）を走査して、DeepL 用語集として登録できる
 *   ソースファイル（TSV / JSON）を `.cache/deepl/` に生成する。
 *   創作本文（Summary / BodyBlocks 等の文章フィールド）は対象外とし、
 *   固有名詞・用語などの「短い対訳」だけを抽出する（自動生成はしない）。
 * @author 100BeautiesLab.
 * @version 1.1.0
 * @dependencies Node.js >= 18（標準モジュールのみ）
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** リポジトリルート（tools/deepl の 2 階層上）。pkg/ クライアントと同じ流儀で自解決する。 */
const REPO_ROOT = resolve(__dirname, "..", "..");
const DATA_DIR = join(REPO_ROOT, "data");
const OUT_DIR = join(REPO_ROOT, ".cache", "deepl");

/**
 * 用語集に取り込まない「文章系」ベースフィールド名（小文字比較）。
 * これらは創作本文・解説文であり、固有名詞対訳ではないため除外する。
 */
const EXCLUDE_BASE = new Set([
  "about",
  "summary",
  "bodyblocks",
  "transnote",
  "note",
  "desc",
  "description",
  "reading",
  "comments",
]);

/**
 * 漢字直後の「読み仮名グロス」だけを剥がした素形を返す。
 * 例: `算象(アリスマ)諸国` → `算象諸国` / `海陸国(シーバイランド)諸島` → `海陸国諸島`。
 *
 * 対象は「漢字の直後に来る、かなのみの丸括弧」に限定する（全角/半角括弧の両対応）。
 * `(後天的)` `(拡張装備あり)` `(時空遷移者)` など中身に漢字を含む修飾括弧や、
 * 漢字以外（カタカナ・英字）に続く括弧は読みグロスではないため剥がさない（誤爆防止）。
 * @param {string} s - JP 表記
 * @returns {string} 読みグロスを除去した素形
 */
const READING_GLOSS = /(?<=[一-龥々〆ヶ])[（(][ぁ-んゔァ-ヴー・]+[）)]/g;
function stripReadingGloss(s) {
  return typeof s === "string" ? s.replace(READING_GLOSS, "") : s;
}

/** 用語として妥当な対訳かを判定する（短く・改行を含まない文字列ペアのみ採用）。 */
function isValidTerm(jp, en) {
  if (typeof jp !== "string" || typeof en !== "string") return false;
  const j = jp.trim();
  const e = en.trim();
  if (!j || !e) return false;
  if (j === e) return false; // 翻訳差が無い（記号のみ等）はスキップ
  if (j.includes("\n") || e.includes("\n")) return false;
  if (j.length > 60 || e.length > 60) return false;
  return true;
}

/**
 * 1 レコードから JP↔EN 対訳候補を抽出する。
 * - `X_EN` キー → EN=value、JP=record[X] もしくは record[X_JP]
 * - `X_JP` キー → JP=value、EN=record[X] もしくは record[X_EN]
 *   （dict_RaceType のように素キーが EN・`_JP` が和名のケースを吸収する）
 * @param {Object} rec - 対訳レコード
 * @param {string} sourceFile - 出典ファイル名（プロベナンス用）
 * @returns {Array<{jp:string, en:string, base:string, source:string, transPolicy:?string, scope:?Array}>}
 */
function extractPairs(rec, sourceFile) {
  const out = [];
  const seen = new Set();
  const transPolicy = typeof rec.TransPolicy === "string" ? rec.TransPolicy : null;
  const scope = Array.isArray(rec.Scope) ? rec.Scope : null;

  const push = (jp, en, base) => {
    if (EXCLUDE_BASE.has(String(base).toLowerCase())) return;
    if (!isValidTerm(jp, en)) return;
    const key = `${jp} ${en}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ jp: jp.trim(), en: en.trim(), base, source: sourceFile, transPolicy, scope });
  };

  for (const [key, value] of Object.entries(rec)) {
    if (key.endsWith("_EN")) {
      const base = key.slice(0, -3);
      const jp = typeof rec[base] === "string" ? rec[base] : rec[`${base}_JP`];
      push(jp, value, base);
    } else if (key.endsWith("_JP")) {
      const base = key.slice(0, -3);
      const en = typeof rec[base] === "string" ? rec[base] : rec[`${base}_EN`];
      push(value, en, base);
    }
  }

  // Aliases（JP 異表記の配列）があれば JA→EN の別表記として取り込む
  if (Array.isArray(rec.Aliases) && (rec.Term_EN || rec.Name_EN)) {
    const en = rec.Term_EN || rec.Name_EN;
    for (const alias of rec.Aliases) {
      if (typeof alias === "string") push(alias, en, "Aliases");
    }
  }

  return out;
}

/** data 配下の対象ディレクトリから `prefix_*.json` を読み、全レコードを返す。 */
function collectFromDir(subdir, prefix) {
  const dir = join(DATA_DIR, subdir);
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
  } catch {
    console.warn(`[skip] ディレクトリ未検出: ${subdir}`);
    return [];
  }
  const pairs = [];
  for (const file of files) {
    const full = join(dir, file);
    let json;
    try {
      json = JSON.parse(readFileSync(full, "utf8"));
    } catch (err) {
      console.warn(`[warn] JSON 読込失敗: ${file} (${err.message})`);
      continue;
    }
    const records = Array.isArray(json) ? json : [];
    for (const rec of records) {
      if (rec && typeof rec === "object") {
        pairs.push(...extractPairs(rec, `${subdir}/${file}`));
      }
    }
  }
  return pairs;
}

/**
 * EN側の値に「略号 / 全文」「表記A / 表記B」のような複数の言い回しが
 * 同居している場合、空白を伴うスラッシュ（` / `）または改行で分割し、
 * 各断片を独立した用語候補として返す。区切りが見つからなければ元の
 * 文字列を単一要素の配列として返す（既存挙動と同じ）。
 * `Demotion/Retrograde` のような複合語中のスラッシュ（前後に空白が無い）は
 * 意図的に分割しない（誤爆防止）。
 * @param {string} en - 分割対象の EN 値
 * @returns {string[]} 分割済み断片（前後空白除去・空要素除去）
 */
function splitMultiForm(en) {
  if (typeof en !== "string") return [en];
  const parts = en
    .split(/\s+\/\s+|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [en];
}

/**
 * 2つの EN 訳語が「単数形 / 複数形」だけの差かどうかを判定する。
 * 例: `Regiowner` / `Regiowners`。JP側（日本語）は文法上の数を持たないため、
 * この種の衝突は「どちらかが誤り」ではなく文脈依存の正しい使い分けであり、
 * 用語集側で強制的にどちらかへ固定すると逆の文脈で誤訳を生む。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isPluralPair(a, b) {
  return a === `${b}s` || b === `${a}s`;
}

/**
 * JA→EN マップを構築する。読みグロスを剥いた素形も自動的にソースへ追加して、
 * DB 本文が素形・併記形どちらで出ても英訳が効くようにする（マッチ網羅の拡張）。
 * EN側が `splitMultiForm` で複数断片に分かれる場合は、先頭断片（本文中で
 * 実際に多用される略号・優先表記）を JA→EN の訳語として採用する。
 * 衝突は「同一 JP ソースに異なる EN」が来た場合のみ記録するが、単数/複数形
 * だけの差は文法依存のため用語集へ登録せず、レビュー用に別記する。
 * @param {Array} pairs - 対訳候補
 * @returns {{map: Map, conflicts: Array}}
 */
function buildJaEnMap(pairs) {
  const map = new Map();
  const conflicts = [];
  const grammarExcluded = new Set();
  const add = (jp, en, source) => {
    if (!jp || !en || jp === en) return;
    if (grammarExcluded.has(jp)) return;
    if (!map.has(jp)) {
      map.set(jp, { target: en, source });
      return;
    }
    const existing = map.get(jp);
    if (existing.target === en) return;
    if (isPluralPair(existing.target, en)) {
      map.delete(jp);
      grammarExcluded.add(jp);
      conflicts.push({
        src: jp,
        grammar: true,
        candidates: [existing.target, en],
        file: source,
      });
      return;
    }
    conflicts.push({ src: jp, kept: existing.target, dropped: en, file: source });
  };
  for (const p of pairs) {
    const [primaryEn] = splitMultiForm(p.en);
    add(p.jp, primaryEn, p.source);
    const plain = stripReadingGloss(p.jp);
    if (plain !== p.jp) add(plain, primaryEn, `${p.source} (de-glossed)`);
  }
  return { map, conflicts };
}

/**
 * EN→JA マップを構築する。訳先 JP は常に読みグロスを剥いた素形を採用する
 * （方針: 機械訳にフリガナを混ぜない・素の漢字形を正とする）。
 * これにより「併記形 vs 素形」だけの差は衝突にならない。
 * EN側が `splitMultiForm` で複数断片に分かれる場合は、断片それぞれを別の
 * ソースキーとして登録する（略号・全文のどちらで出現しても同じ JP へ解決できる）。
 *
 * 「正式名（Term_JP）vs 通称（Aliases）」の衝突は、文章の性質（冗長な説明文
 * では通称・略称寄り、該当語自体を定義する文では正式名寄り）で使い分けるべき
 * ものであり、EN→JA の単一キーには機械的に固定できない。そのため登録を見送り
 * `registerDependent` 付きで別記する（訳出は人間が文脈判断する）。
 * それ以外（Aliases 由来同士、または非Aliases同士）で素形が食い違う場合だけを
 * 真の衝突として記録する。
 * @param {Array} pairs - 対訳候補
 * @returns {{map: Map, conflicts: Array}}
 */
function buildEnJaMap(pairs) {
  const map = new Map();
  const conflicts = [];
  const registerExcluded = new Set();
  const add = (en, jpTarget, source, isAlias) => {
    if (!en || !jpTarget || en === jpTarget) return;
    if (registerExcluded.has(en)) return;
    if (!map.has(en)) {
      map.set(en, { target: jpTarget, source, isAlias });
      return;
    }
    const existing = map.get(en);
    if (existing.target === jpTarget) return;
    if (existing.isAlias !== isAlias) {
      map.delete(en);
      registerExcluded.add(en);
      conflicts.push({
        src: en,
        registerDependent: true,
        candidates: [existing.target, jpTarget],
        file: source,
      });
      return;
    }
    conflicts.push({ src: en, kept: existing.target, dropped: jpTarget, file: source });
  };
  for (const p of pairs) {
    const target = stripReadingGloss(p.jp);
    const isAlias = p.base === "Aliases";
    for (const seg of splitMultiForm(p.en)) {
      add(seg, target, p.source, isAlias);
    }
  }
  return { map, conflicts };
}

/** TSV 文字列を生成（DeepL 用語集の TSV 入力形式: `source<TAB>target`）。 */
function toTsv(map) {
  return [...map.entries()].map(([src, v]) => `${src}\t${v.target}`).join("\n") + "\n";
}

function main() {
  const allPairs = [
    ...collectFromDir("Localization", "trans_"),
    ...collectFromDir("References", "ref_"),
    ...collectFromDir("Dictionaries", "dict_"),
  ];

  const jaEn = buildJaEnMap(allPairs);
  const enJa = buildEnJaMap(allPairs);

  mkdirSync(OUT_DIR, { recursive: true });

  writeFileSync(join(OUT_DIR, "glossary_ja-en.tsv"), toTsv(jaEn.map), "utf8");
  writeFileSync(join(OUT_DIR, "glossary_en-ja.tsv"), toTsv(enJa.map), "utf8");

  // 出典付きソース（レビュー・再現用）
  const source = {
    generatedAt: new Date().toISOString(),
    sourceDirs: ["Localization/trans_*", "References/ref_*", "Dictionaries/dict_*"],
    totalPairs: allPairs.length,
    jaEnUnique: jaEn.map.size,
    enJaUnique: enJa.map.size,
    entries: [...jaEn.map.entries()].map(([jp, v]) => ({ jp, en: v.target, source: v.source })),
  };
  writeFileSync(join(OUT_DIR, "glossary_source.json"), JSON.stringify(source, null, 2), "utf8");

  // 衝突ログ（人間レビュー用）
  const conflictLines = [
    "# DeepL 用語集 ソース衝突ログ",
    "",
    `生成: ${source.generatedAt}`,
    "",
    "> 同一 source に複数の訳語が存在したエントリ。先に出現した訳を採用（kept）。",
    "> 読み仮名グロス（漢字(かな)）と素形の差は自動正規化済みのため、ここには出ません。",
    "> `略号 / 全文` のような併記形（` / ` 区切り・改行区切り）も自動分割済みのため、双方向とも登録できていればここには出ません。",
    "> 単数形/複数形だけの差（例: `Regiowner`/`Regiowners`）は JP側に数の情報が無く用語集で強制すると逆の文脈で誤訳になるため、`[文法差につき用語集登録なし]` として自動除外し、双方をレビュー用に併記します。採否は用途に応じて人間が個別に判断してください。",
    "> 正式名（Term_JP）vs 通称（Aliases）の差（例: `『第7の世界創造』`/`多様化社会`）は、冗長な説明文では通称・略称寄り、該当語自体を定義・説明する文では正式名寄りという文脈依存の使い分けがあり、EN→JA の単一キーには固定できないため `[文脈依存につき用語集登録なし]` として自動除外し、双方をレビュー用に併記します。訳出時は文章の性質に応じて人間が個別に判断してください。",
    "> ここに残るのは「素形でも異なる」真の衝突です。必要なら trans_*.json / ref_*.json / dict_*.json 側で正規化してください。",
    "",
    "## JA→EN",
    ...(jaEn.conflicts.length
      ? jaEn.conflicts.map((c) =>
          c.grammar
            ? `- \`${c.src}\` → [文法差につき用語集登録なし] 候補: \`${c.candidates[0]}\` / \`${c.candidates[1]}\` (${c.file})`
            : `- \`${c.src}\` → kept: \`${c.kept}\` / dropped: \`${c.dropped}\` (${c.file})`
        )
      : ["（衝突なし）"]),
    "",
    "## EN→JA",
    ...(enJa.conflicts.length
      ? enJa.conflicts.map((c) =>
          c.registerDependent
            ? `- \`${c.src}\` → [文脈依存につき用語集登録なし] 候補: \`${c.candidates[0]}\` / \`${c.candidates[1]}\` (${c.file})`
            : `- \`${c.src}\` → kept: \`${c.kept}\` / dropped: \`${c.dropped}\` (${c.file})`
        )
      : ["（衝突なし）"]),
    "",
  ];
  writeFileSync(join(OUT_DIR, "glossary-conflicts.md"), conflictLines.join("\n"), "utf8");

  console.log("=== DeepL 用語集ソース生成完了 ===");
  console.log(`抽出対訳ペア(延べ): ${allPairs.length}`);
  console.log(`JA→EN 一意エントリ: ${jaEn.map.size}（衝突 ${jaEn.conflicts.length}）`);
  console.log(`EN→JA 一意エントリ: ${enJa.map.size}（衝突 ${enJa.conflicts.length}）`);
  console.log(`出力先: ${OUT_DIR}`);
}

main();
