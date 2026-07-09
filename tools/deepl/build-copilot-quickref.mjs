/**
 * build-copilot-quickref.mjs - Copilot 用 固有名詞対訳 早見表ジェネレータ
 * @description build-glossary-source.mjs が生成する監修済み対訳ソース
 *   (`.cache/deepl/glossary_source.json`) を読み、GitHub Copilot が参照
 *   しやすい Markdown 早見表 `docs/localization-glossary-quickref.md` を
 *   出力する。目的は 2 つ:
 *     1. Copilot Chat / Agent が `_EN` 補助時に固有名詞対訳を外さないための
 *        リポジトリ内リファレンス（`.github/instructions/` から参照）。
 *     2. インライン補完（ゴーストテキスト）用の「隣接タブ文脈」ソース。
 *        補完はカスタム指示ファイルを読まないため、本ファイルを開いておくことで
 *        近傍文脈として対訳を可視化する。
 *   創作本文（Summary / BodyBlocks 等）は元スクリプト側で除外済みであり、
 *   本ジェネレータは短い固有名詞対訳のみを整形する（自動生成・意訳はしない）。
 * @author 100BeautiesLab.
 * @version 1.0.0
 * @dependencies Node.js >= 18（標準モジュールのみ）/ build-glossary-source.mjs の出力
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** リポジトリルート（tools/deepl の 2 階層上）。既存スクリプトと同じ流儀で自解決。 */
const REPO_ROOT = resolve(__dirname, "..", "..");
const SOURCE_JSON = join(REPO_ROOT, ".cache", "deepl", "glossary_source.json");
const BUILD_SCRIPT = join(__dirname, "build-glossary-source.mjs");
const OUT_FILE = join(REPO_ROOT, "docs", "localization-glossary-quickref.md");

/**
 * 出典パス（例: "References/ref_Race.json"）→ 日本語の分類見出し。
 * 未知の出典はファイル名をそのまま見出しに使う（欠損耐性）。
 */
const SOURCE_LABELS = {
  "Localization/trans_FamilyName.json": "人名（姓・代理）",
  "Localization/trans_PersonName.json": "人名",
  "Localization/trans_PlaceName.json": "地名（国・地名）",
  "Localization/trans_Regions.json": "地方・地域",
  "Localization/trans_Titles.json": "称号・肩書",
  "Localization/trans_Occupation.json": "職業",
  "Localization/trans_Items.json": "アイテム・道具",
  "Localization/trans_Phenomenon.json": "現象・事象",
  "Localization/trans_ServiceInfra.json": "サービス・インフラ",
  "References/ref_Race.json": "種族",
  "References/ref_Faction.json": "組織・派閥（References）",
  "References/ref_Region8.json": "八地域",
  "References/ref_Society.json": "社会",
  "References/ref_Vocabulary.json": "語彙",
  "Dictionaries/dict_Area.json": "エリア",
  "Dictionaries/dict_Artifact.json": "アーティファクト",
  "Dictionaries/dict_Faction.json": "組織・派閥（Dictionaries）",
  "Dictionaries/dict_RaceType.json": "種族タイプ",
};

/** Markdown テーブルセル内の `\` と `|` を安全化する。固有名詞に稀に含まれるため。 */
function escapeCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
}

/**
 * 対訳ソース JSON を取得する。無ければ build-glossary-source.mjs を実行して再生成。
 * @returns {{generatedAt:string, entries:Array<{jp:string,en:string,source:string}>}}
 * @throws {Error} 生成後もソースが読めない場合
 */
function loadSource() {
  if (!existsSync(SOURCE_JSON)) {
    // .cache は Git 管轄外のため、初回や CI では未生成。都度ビルドして担保する。
    execFileSync("node", [BUILD_SCRIPT], { stdio: "inherit" });
  }
  const raw = JSON.parse(readFileSync(SOURCE_JSON, "utf8"));
  if (!raw || !Array.isArray(raw.entries)) {
    throw new Error("glossary_source.json に entries 配列が見つかりません");
  }
  return raw;
}

/**
 * entries を出典ごとにグルーピングし、JP の五十音順に近い並び（localeCompare）で整える。
 * @param {Array<{jp:string,en:string,source:string}>} entries
 * @returns {Map<string, Array<{jp:string,en:string}>>} 出典キー → 対訳配列
 */
function groupBySource(entries) {
  const groups = new Map();
  for (const { jp, en, source } of entries) {
    if (!jp || !en) continue;
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push({ jp, en });
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.jp.localeCompare(b.jp, "ja"));
  }
  return groups;
}

/** 早見表 Markdown 本文を組み立てて返す。 */
function renderMarkdown(source) {
  const groups = groupBySource(source.entries);
  const total = source.entries.length;
  // 既知ラベル順 → 未知出典（アルファベット順）で安定出力する。
  const known = Object.keys(SOURCE_LABELS).filter((k) => groups.has(k));
  const unknown = [...groups.keys()]
    .filter((k) => !SOURCE_LABELS[k])
    .sort((a, b) => a.localeCompare(b));
  const orderedSources = [...known, ...unknown];

  const lines = [];
  lines.push("<!-- 自動生成ファイル: 直接編集しないでください。 -->");
  lines.push(
    "<!-- 再生成: `npm run deepl:build-quickref`（辞書 trans_/ref_/dict_ を更新したら実行） -->",
  );
  lines.push("");
  lines.push("# ローカライズ固有名詞 早見表（Copilot 参照用）");
  lines.push("");
  lines.push(
    "> **これは監修済み辞書から抽出した「固有名詞 JP↔EN 対訳」の早見表です。**",
  );
  lines.push(
    "> `data/Localization/trans_*.json` / `data/References/ref_*.json` / `data/Dictionaries/dict_*.json` の人間監修済み対訳のみを機械抽出したもので、意訳・創作本文は含みません。",
  );
  lines.push("");
  lines.push("## 使い方");
  lines.push("");
  lines.push(
    "- **Copilot Chat / Agent**: `.github/instructions/localization-en.instructions.md` から本ファイルを参照します。`_EN` を埋めるとき、下表にある固有名詞はこの対訳に固定してください（勝手に別訳を作らない）。",
  );
  lines.push(
    "- **インライン補完（ゴーストテキスト）**: 補完はカスタム指示ファイルを読み込みません。英訳作業中は本ファイルを隣のタブで開いておくと、近傍文脈として対訳が補完に反映されやすくなります。",
  );
  lines.push(
    "- **正典はあくまで辞書本体**。表に無い語・揺れがある語は `data/**/trans_*.json` 等の辞書と `docs/localization-en-rules.md` を確認してください。最終採否は User 判断です。",
  );
  lines.push("");
  lines.push(
    `- 収録: **${total} 対訳**（延べ抽出。生成日時: ${source.generatedAt ?? "N/A"}）`,
  );
  lines.push("");

  for (const src of orderedSources) {
    const label = SOURCE_LABELS[src] ?? src;
    const rows = groups.get(src);
    if (!rows || rows.length === 0) continue;
    lines.push(`## ${label}`);
    lines.push("");
    lines.push(`<small>出典: \`data/${src}\`</small>`);
    lines.push("");
    lines.push("| 日本語 | English |");
    lines.push("| --- | --- |");
    for (const { jp, en } of rows) {
      lines.push(`| ${escapeCell(jp)} | ${escapeCell(en)} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

const source = loadSource();
const md = renderMarkdown(source);
writeFileSync(OUT_FILE, md, "utf8");
console.log(`=== Copilot 早見表 生成完了 ===`);
console.log(`対訳: ${source.entries.length} 件`);
console.log(`出力: ${OUT_FILE}`);
