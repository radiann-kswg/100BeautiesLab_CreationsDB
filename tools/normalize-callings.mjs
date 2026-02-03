/**
 * 呼称フィールド整形ユーティリティ
 *
 * @description
 * JSONC/独自書式（コメントや文字列内の改行を含む）を壊さないため、
 * `FirstPersonCalling` / `SecondPersonCalling` / `ThirdPersonCalling` の「文字列リテラル部分」だけを
 * 走査・置換して整形します。
 *
 * 方針（ユーザー合意済み）:
 * - 未記載の区分を `;` で空埋めしない
 * - ワイルドカードを半角に統一: `＊`→`*`, `～`/`〜`→`~`
 * - `"~君;パイセン"` は `"~君,パイセン"` に修正
 * - `"…;※名前呼び]"` は `"…;[※名前呼び]"` に修正
 * - 明確な区切りミス（例: `彼/彼女/[※名前呼び]`）は意味を変えない範囲で `;` 区切りへ修正
 */

import fs from "node:fs";
import path from "node:path";

const WORKSPACE_ROOT = process.cwd();

/**
 * @param {string} filePath
 * @returns {string}
 */
function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * @param {string} filePath
 * @param {string} text
 */
function writeText(filePath, text) {
  fs.writeFileSync(filePath, text, "utf8");
}

/**
 * @param {string} text
 * @param {number} quoteStartIndex - 先頭の `"` の位置
 * @returns {{valueStart: number, valueEnd: number} | null} valueStart/valueEnd は中身の範囲（`"`は含まない）
 */
function findStringLiteralRange(text, quoteStartIndex) {
  if (text[quoteStartIndex] !== '"') return null;

  const valueStart = quoteStartIndex + 1;
  let i = valueStart;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      // 直前のバックスラッシュの連続数が偶数なら終端
      let backslashCount = 0;
      let j = i - 1;
      while (j >= valueStart && text[j] === "\\") {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        return { valueStart, valueEnd: i };
      }
    }
    i++;
  }
  return null;
}

/**
 * @param {string} text
 * @param {number} fromIndex
 * @returns {number} 次に見つかった `"` の位置（なければ -1）
 */
function findNextQuote(text, fromIndex) {
  return text.indexOf('"', fromIndex);
}

/**
 * @param {string} value
 * @param {"FirstPersonCalling"|"SecondPersonCalling"|"ThirdPersonCalling"} key
 */
function normalizeCallingValue(value, key) {
  let out = value;

  // ワイルドカード統一（全フィールド共通）
  out = out.replaceAll("＊", "*");
  out = out.replaceAll("～", "~");
  out = out.replaceAll("〜", "~");

  // 既知のタイポ修正
  out = out.replaceAll(";※名前呼び]", ";[※名前呼び]");
  out = out.replaceAll(",※名前呼び]", ",[※名前呼び]");
  out = out.replaceAll("\n※名前呼び]", "\n[※名前呼び]");

  // `~君;パイセン` を `~君,パイセン` に（ThirdPersonCallingでの書式未対応箇所）
  if (key === "ThirdPersonCalling") {
    out = out.replaceAll("~君;パイセン", "~君,パイセン");
  }

  // 明確な区切りミスの修正（ThirdPersonCalling中心）
  if (key === "ThirdPersonCalling") {
    out = out.replaceAll("彼/彼女/[※名前呼び]", "彼/彼女;[※名前呼び]");
    out = out.replaceAll("彼/彼女/ [※名前呼び]", "彼/彼女;[※名前呼び]");
  }

  // セミコロン直後の不要スペースを除去（意味は変えず見た目だけ安定化）
  out = out.replaceAll(/;\s+(?=[\[*~A-Za-z0-9ぁ-んァ-ヶ一-龠])/g, ";");

  // First/Second は `;` をカテゴリ区切りとして使う必然が薄いため、
  // 「注釈/補足っぽい `; `」のみを `,` に寄せる（意味を変えない範囲）
  if (key === "FirstPersonCalling" || key === "SecondPersonCalling") {
    out = out.replaceAll(/;\s+/g, ",");
  }

  // カンマの後ろの全角スペース/半角スペースの揺れを軽く整形（強制しない）
  out = out.replaceAll(/,\s+/g, ", ");

  return out;
}

/**
 * @param {string} text
 * @param {string[]} keys
 */
function normalizeTextForKeys(text, keys) {
  let out = text;

  // 先頭から順にスキャンし、各キーの文字列値だけ置換
  let cursor = 0;
  while (cursor < out.length) {
    let nextHit = null;
    for (const key of keys) {
      const idx = out.indexOf(`"${key}"`, cursor);
      if (idx !== -1 && (nextHit === null || idx < nextHit.idx)) {
        nextHit = { idx, key };
      }
    }
    if (!nextHit) break;

    const { idx, key } = nextHit;

    // `:"` まで進む
    const colonIdx = out.indexOf(":", idx);
    if (colonIdx === -1) {
      cursor = idx + 1;
      continue;
    }

    // 値の開始（`"`）を探す
    let q = colonIdx + 1;
    while (q < out.length && (out[q] === " " || out[q] === "\t")) q++;
    if (out[q] !== '"') {
      cursor = q + 1;
      continue;
    }

    const range = findStringLiteralRange(out, q);
    if (!range) {
      cursor = q + 1;
      continue;
    }

    const rawValue = out.slice(range.valueStart, range.valueEnd);
    const newValue = normalizeCallingValue(rawValue, /** @type any */ (key));
    if (newValue !== rawValue) {
      out = out.slice(0, range.valueStart) + newValue + out.slice(range.valueEnd);
      // 置換後の位置へ進める
      cursor = range.valueStart + newValue.length + 1;
    } else {
      cursor = range.valueEnd + 1;
    }
  }

  return out;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function listDbJsonFiles(dir) {
  /** @type {string[]} */
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listDbJsonFiles(full));
      continue;
    }
    if (!entry.isFile()) continue;

    if (!full.endsWith(".json")) continue;
    if (!full.includes(`${path.sep}data${path.sep}`)) continue;
    if (!full.includes(`${path.sep}DataBases${path.sep}`)) continue;
    if (!path.basename(full).startsWith("db_")) continue;
    if (path.basename(full) === "db_meta.json") continue;
    if (path.basename(full) === "db_type.json") continue;

    results.push(full);
  }
  return results;
}

function main() {
  const targetFiles = listDbJsonFiles(WORKSPACE_ROOT);
  const keys = ["FirstPersonCalling", "SecondPersonCalling", "ThirdPersonCalling"];

  let changedFiles = 0;
  for (const filePath of targetFiles) {
    const before = readText(filePath);
    const after = normalizeTextForKeys(before, keys);
    if (after !== before) {
      writeText(filePath, after);
      changedFiles++;
      // eslint-disable-next-line no-console
      console.log(`updated: ${path.relative(WORKSPACE_ROOT, filePath)}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`done. changed files: ${changedFiles}/${targetFiles.length}`);
}

main();
