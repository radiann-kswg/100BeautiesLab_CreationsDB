#!/usr/bin/env node
/**
 * patch-aihints.mjs
 *
 * AIHints（二層構造 common / forms）の **scaffold（雛形）** を、
 * 対象 DB の各レコードへ後付けで挿入する自動パッチツール。
 *
 * 目的:
 * - `AIHints` が未付与のレコードに対し、`db_type.json($Def_AIHints)` の二層構造に沿った
 *   骨組みを差し込み、User が編集すれば即運用に乗せられる状態を用意する。
 *
 * 設計原則（重要 / copilot-instructions.md 準拠）:
 * - **創作内容の自動生成はしない。** タグ・台詞・キャラ性の文章などは生成せず、
 *   `TODO: ...` プレースホルダ文字列として挿入する。User が手動で書き起こすこと。
 *   `--suggest` 指定時は、TailsUnit / GenderType / Character 等の**既存フィールドの変換・翻訳**
 *   だけを行い、視覚情報が必要な項目は TODO または翻訳ヒスト形式で残す（創作生成ではない）。
 * - 既存フォーマット（インデント / キー順 / コメント無し JSON）を破壊しないよう、
 *   JSON.parse/stringify ではなく **テキスト挿入** で実装する。
 * - 画像 URL は `Images.corefolder_PNGPath` / `Images.arts_PNGPath` から組み立て、
 *   実ファイルが無い場合は `reference_images: null` を採用。
 * - 既に `AIHints` を持つレコードはデフォルトでスキップ（`--force` で上書き再生成可）。
 *
 * CLI 使い方:
 *   node tools/patch-aihints.mjs --work NumberTales --db Primary --records 41-60
 *   node tools/patch-aihints.mjs --work NumberTales --db Primary --records 41,42,47 --apply
 *   node tools/patch-aihints.mjs --work NumberTales --db Primary --all --apply
 *
 * 既定は dry-run。書き込みには `--apply` が必須。
 * `--force` で既存 AIHints を上書き（要注意）。
 * `--suggest` で既存フィールドから候補値を半自動導出（詳細は printHelpAndExit 参照）。
 *
 * 想定 DB:
 * - `data/Works_<work>/DataBases/db_<db>.json`
 * - 当面は NumberTales / Primary を主対象に検証。他作品でも同じ画像規約なら使える。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ────────────────────────────────────────────────────────────────────────────
// 定数 / パス解決
// ────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** 公開 URL の baseオリジン（CNAME） */
const PUBLIC_ORIGIN = 'https://database.numbertales-radiann.net';

// ────────────────────────────────────────────────────────────────────────────
// CLI 引数のパース
// ────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CliOptions
 * @property {string} work        作品名（例: "NumberTales"）
 * @property {string} db          DB 種別（例: "Primary"）
 * @property {Set<number>|null} records 対象 Num の集合（null は全レコード）
 * @property {boolean} apply      true なら実書き込み（既定は dry-run）
 * @property {boolean} force      true なら既存 AIHints を上書き
 * @property {boolean} suggest    true なら既存フィールドから候補値を導出して埋める（半自動モード）
 * @property {boolean} fixRefs    true なら既存 AIHints の reference_images だけを再構築（タグは保持）
 * @property {boolean} fillTodos   true なら JSON から導出できる TODO 項目を補完（色・視覚系は対象外）
 * @property {boolean} upgradeSchema  true なら既存 AIHints に不足している新スキーマフィールド（silhouette_notes / immutable_constraints / negative_keywords / work_common / alt_modes）を追加する。既存タグ・テキスト類は一切変更しない
 * @property {boolean} genVisionTasks  true なら視覚 TODO のあるレコードの画像リストを .cache/vision-tasks.json に出力して終了
 * @property {boolean} applyVisionResults  true なら .cache/vision-results.json の解析結果を AIHints の視覚 TODO に適用
 * @property {Map<number,Object>|null} visionResultsMap  applyVisionResults 時に main() が注入する Map<num, VisionResult>
 * @property {boolean} forceAiOptout  true なら db_meta.json の `AI_Optout: true` ガードをバイパスする（緊急時のみ）
 * @property {boolean} verbose    詳細ログ
 */

/** @returns {CliOptions} */
function parseArgs(argv) {
    const opts = {
        work: 'NumberTales',
        db: 'Primary',
        records: null,
        apply: false,
        force: false,
        suggest: false,
        fixRefs: false,
        fillTodos: false,
        upgradeSchema: false,
        genVisionTasks: false,
        applyVisionResults: false,
        visionResultsMap: null,
        forceAiOptout: false,
        verbose: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case '--work': opts.work = argv[++i]; break;
            case '--db': opts.db = argv[++i]; break;
            case '--records': opts.records = parseRecordSpec(argv[++i]); break;
            case '--all': opts.records = null; break;
            case '--apply': opts.apply = true; break;
            case '--dry-run': opts.apply = false; break;
            case '--force': opts.force = true; break;
            case '--suggest': opts.suggest = true; break;
            case '--fix-refs': opts.fixRefs = true; break;
            case '--fill-todos': opts.fillTodos = true; break;
            case '--upgrade-schema': opts.upgradeSchema = true; break;
            case '--gen-vision-tasks': opts.genVisionTasks = true; break;
            case '--apply-vision-results': opts.applyVisionResults = true; break;
            case '--force-ai-optout': opts.forceAiOptout = true; break;
            case '--verbose': case '-v': opts.verbose = true; break;
            case '--help': case '-h': printHelpAndExit(); break;
            default:
                if (a.startsWith('--')) {
                    console.error(`Unknown option: ${a}`);
                    process.exit(2);
                }
        }
    }
    return opts;
}

/**
 * "41-60" / "41,42,47" / "41-45,50,55-58" 形式を Set<number> に展開。
 * @param {string} spec
 * @returns {Set<number>}
 */
function parseRecordSpec(spec) {
    const set = new Set();
    for (const chunk of spec.split(',').map(s => s.trim()).filter(Boolean)) {
        const m = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
        if (m) {
            const a = Number(m[1]), b = Number(m[2]);
            for (let n = Math.min(a, b); n <= Math.max(a, b); n++) set.add(n);
        } else if (/^\d+$/.test(chunk)) {
            // 純粋な整数トークン: 数値・文字列の両キーを許容（特殊番号 "000" 等で両形が混在する DB に備える）
            set.add(Number(chunk));
            set.add(chunk);
        } else if (/^[0-9A-Za-z_\-]+$/.test(chunk)) {
            // 特殊番号トークン（例: "000", "2-alt", "10-alt", "67-old"）: 文字列のままセットに追加
            set.add(chunk);
        } else {
            throw new Error(`Invalid --records token: ${chunk}`);
        }
    }
    return set;
}

function printHelpAndExit() {
    console.log(`Usage: node tools/patch-aihints.mjs [options]

Options:
  --work <name>       作品名（既定: NumberTales）
  --db <name>         DB 名（既定: Primary。例: Secondary, SemiPrimary）
  --records <spec>    対象 Num（例: 41-60, 41,42,47, 41-45,50）
                      特殊番号トークン（"000" / "2-alt" / "10-alt" / "67-old" 等の string Num）も指定可
                      （純整数は number / string 両形式で内部マッチするため後方互換あり）
  --all               全レコード対象
  --apply             実書き込み（指定しない場合は dry-run）
  --force             既存 AIHints がある場合も上書き
  --suggest           TailsUnit / GenderType / Character 等から候補値を自動導出して埋める（半自動）
                      視覚情報が必要な項目（palette / 髪・目など）は TODO / 翻訳ヒント形式で残す
  --fix-refs          既存 AIHints の reference_images だけを再構築する（タグ・テキストは保持）
                      corefolder の旧パス修正や concept-first への移行に使用
  --fill-todos        既存 AIHints の JSON 由来 TODO 項目を補完する（タグ・視覚系は対象外）
                      補完対象: identity_tags(Class), immutable_traits(number marking),
                      age_appearance(ConceptAge), expression_tendency(Character)
                      補完対象外: palette_priority / 髪・目・衣装 など視覚情報が必要なもの
  --upgrade-schema    既存 AIHints に不足している新スキーマフィールドを追加する
                      追加フィールド: work_common, alt_modes (top-level), および各 form に
                      silhouette_notes / immutable_constraints / negative_keywords を付与
                      corefolder 側には User 要望の structural default を投入し、
                      humanoid 側は TODO プレースホルダのみ
                      既存タグ・テキスト類・reference_images は一切変更しない
  --gen-vision-tasks  視覚 TODO のあるレコードの画像パスリストを .cache/vision-tasks.json に出力して終了
                      Agent の view_image 画像解析セッションの入力として使用する
  --apply-vision-results  .cache/vision-results.json に書かれた Agent 解析結果を
                      AIHints の視覚 TODO（palette / hair / eye / outfit）に適用する
                      vision-results.json の形式は VisionResult typedef を参照
  --force-ai-optout   db_meta.json の 'AI_Optout: true' ガードをバイパスする（緊急時のみ）
                      未指定時は AI_Optout: true の DB への書き込みを exit 2 で拒否する
  -v, --verbose       詳細ログ
  -h, --help          このヘルプを表示
`);
    process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// JSON テキスト走査ユーティリティ（バランス括弧でレコード範囲を取る）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 配列要素である各レコードオブジェクトの `{` / `}` 位置を返す。
 * 文字列リテラル内の括弧は無視する。
 * @param {string} text
 * @returns {Array<{ openIdx: number, closeIdx: number }>}
 */
function locateTopLevelRecords(text) {
    const records = [];
    // ルートは配列前提（`[` で始まる）。要素レベル（depth=1）の `{...}` を集める。
    let i = 0;
    // 先頭の `[` を探す
    while (i < text.length && text[i] !== '[') i++;
    if (i >= text.length) throw new Error('Root array `[` not found.');
    i++; // skip `[`

    while (i < text.length) {
        // skip whitespace / commas
        while (i < text.length && /[\s,]/.test(text[i])) i++;
        if (i >= text.length || text[i] === ']') break;
        if (text[i] !== '{') {
            // 想定外（コメントや他要素）。次の文字へ。
            i++;
            continue;
        }
        const openIdx = i;
        const closeIdx = findMatchingBrace(text, openIdx);
        records.push({ openIdx, closeIdx });
        i = closeIdx + 1;
    }
    return records;
}

/**
 * `text[openIdx] === '{'` に対応する `}` のインデックスを返す。
 * 文字列リテラル内は無視。エスケープ `\\` / `\"` を考慮。
 * @param {string} text
 * @param {number} openIdx
 * @returns {number}
 */
function findMatchingBrace(text, openIdx) {
    if (text[openIdx] !== '{') throw new Error(`Expected '{' at ${openIdx}`);
    let depth = 0;
    let inStr = false;
    for (let i = openIdx; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (ch === '\\') { i++; continue; }
            if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error(`Unmatched '{' at ${openIdx}`);
}

// ────────────────────────────────────────────────────────────────────────────
// 画像情報の抽出
// ────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ImageInfo
 * @property {string|null} corefolderUrl  corefolder のメイン画像 URL（実在チェック済み）
 * @property {Array<{url: string, label: string}>} corefolderImages  全 corefolder 画像群（corefolder_PNGPath 全件）
 * @property {Array<{url: string, label: string}>} corefolderArtImages  corefolder アート画像群（arts_PNGPath の corefolders/ 系）
 * @property {Array<{url: string, label: string}>} humanoidImages  humanoid 画像群
 * @property {CommonRefs} common  common.reference_images 向けの形態共通リソース
 */

/**
 * @typedef {Object} CommonRefs
 * @property {string|null} concept           メインコンセプト画像 URL
 * @property {string[]} concept_variants     コンセプトバリアント URL 集（conceptAlt）
 * @property {string|null} catalog           設定画像 URL（catalog/chr-dsgn_catalog<N>）
 * @property {string|null} design_sheet      デザインシート URL（designAlt）
 */

/**
 * レコードオブジェクトから画像 URL を割り出す。
 * @param {any} record  パース済みレコード
 * @param {string} work
 * @param {string} db
 * @returns {ImageInfo}
 */
function resolveImageInfo(record, work, db) {
    const out = {
        corefolderUrl: null,
        corefolderImages: [],
        corefolderArtImages: [],
        humanoidImages: [],
        common: { concept: null, concept_variants: [], catalog: null, design_sheet: null },
    };
    const imgs = record && record.Images;
    if (!imgs || typeof imgs !== 'object') return out;

    const num = record.Num;
    const dbFolder = `DB_${db}`;
    const imagesRoot = path.join(REPO_ROOT, 'data', `Works_${work}`, 'Images', dbFolder);

    /**
     * サブディレクトリ下の実ファイルを検証して公開 URL を返すヘルパー。
     * @param {string} subdir  imagesRoot 以下の相対パス（フォルダ名）
     * @param {string} baseName  拡張子なしのファイル名
     * @returns {string|null}
     */
    const urlIfExists = (subdir, baseName) => {
        const fname = baseName.endsWith('.png') ? baseName : `${baseName}.png`;
        const abs = path.join(imagesRoot, subdir, fname);
        if (!fs.existsSync(abs)) return null;
        return `${PUBLIC_ORIGIN}/data/Works_${work}/Images/${dbFolder}/${subdir}/${fname}`;
    };

    // ── corefolder: 全 corefolder_PNGPath を収集し先頭を corefolderUrl に ──
    const corePaths = Array.isArray(imgs.corefolder_PNGPath) ? imgs.corefolder_PNGPath : [];
    for (let k = 0; k < corePaths.length; k++) {
        const rel = String(corePaths[k]);
        const url = urlIfExists('corefolder', rel);
        if (!url) continue;
        const baseName = path.basename(rel, '.png');
        const label = `cf${k + 1}`;
        out.corefolderImages.push({ url, label: baseName || label });
    }
    if (out.corefolderImages.length > 0) {
        out.corefolderUrl = out.corefolderImages[0].url;
    }

    // ── arts_PNGPath: humanoids/ → humanoidImages、corefolders/ → corefolderArtImages ───
    const artsPaths = Array.isArray(imgs.arts_PNGPath) ? imgs.arts_PNGPath : [];
    for (const raw of artsPaths) {
        const rel = String(raw);
        if (rel.startsWith('humanoids/')) {
            // humanoid art: Num 一致チェック
            const m = rel.match(/art_img([0-9A-Za-z\-]+?)-humanoid([A-Za-z0-9]*)$/);
            if (!m) continue;
            // num が string の特殊番号でも一致できるよう、文字列比較ベースで判定する。
            // 数値 num の場合は数値同士でも比較して後方互換を維持。
            const matchKey = m[1];
            const numStr = String(num);
            const matchNum = Number(matchKey);
            const numNum = typeof num === 'number' ? num : Number(num);
            const isMatch = matchKey === numStr
                || (Number.isFinite(matchNum) && Number.isFinite(numNum) && matchNum === numNum);
            if (!isMatch) continue;
            const fname = `${path.basename(rel)}.png`;
            const subdir = path.dirname(rel);
            const abs = path.join(imagesRoot, 'arts', subdir, fname);
            if (!fs.existsSync(abs)) continue;
            const url = `${PUBLIC_ORIGIN}/data/Works_${work}/Images/${dbFolder}/arts/${subdir}/${fname}`;
            const label = m[2] || 'main';
            out.humanoidImages.push({ url, label });
        } else if (rel.startsWith('corefolders/')) {
            // corefolder art: キャラ番号を含むパスのみ採用
            const fname = `${path.basename(rel)}.png`;
            const subdir = path.dirname(rel);
            const abs = path.join(imagesRoot, 'arts', subdir, fname);
            if (!fs.existsSync(abs)) continue;
            // Num 一致チェック（パス内に数字があれば）
            const numInPath = path.basename(rel).match(/img(\d+)/);
            if (numInPath && Number(numInPath[1]) !== num) continue;
            const url = `${PUBLIC_ORIGIN}/data/Works_${work}/Images/${dbFolder}/arts/${subdir}/${fname}`;
            out.corefolderArtImages.push({ url, label: path.basename(rel) });
        }
        // それ以外のパス（sphericateDay 等のイベント画像・複数キャラ共有 art）はスキップ
    }

    // ── common: 形態共通リソース（1枚に全形態が描かれる素体画像）──────
    // concept (単一 PNG 名)
    if (typeof imgs.concept_PNGName === 'string' && imgs.concept_PNGName) {
        out.common.concept = urlIfExists('concept', imgs.concept_PNGName);
    }
    // conceptAlt (複数 PNG 名) → concept_variants[]
    const conceptAlt = Array.isArray(imgs.conceptAlt_PNGName) ? imgs.conceptAlt_PNGName : [];
    for (const name of conceptAlt) {
        if (typeof name !== 'string' || !name) continue;
        const url = urlIfExists('conceptAlt', name);
        if (url) out.common.concept_variants.push(url);
    }
    // catalog (chr-dsgn_catalog<N>)
    if (typeof imgs.catalog_PNGName === 'string' && imgs.catalog_PNGName) {
        out.common.catalog = urlIfExists('catalog', imgs.catalog_PNGName);
    }
    // designAlt (単一 / 複数どちらも許容。複数なら先頭を design_sheet に採用)
    const designAltRaw = imgs.designAlt_PNGName;
    if (typeof designAltRaw === 'string' && designAltRaw) {
        out.common.design_sheet = urlIfExists('designAlt', designAltRaw);
    } else if (Array.isArray(designAltRaw) && designAltRaw.length > 0) {
        const first = String(designAltRaw[0]);
        out.common.design_sheet = urlIfExists('designAlt', first);
    }

    return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 作品共通リソース（work_common.reference_images）の解決
// ────────────────────────────────────────────────────────────────────────────

/**
 * 作品の `Images/Ref_Glossary/concept-figure/` / `Images/Ref_Reference/concept-figure/`
 * 配下から、コアフォルダ / ヒューマノイド形態の共通設計図画像を収集する。
 *
 * ファイル名の規約（NumberTales 想定）:
 * - `cnsp-fg_NTsCoreFolder.png` / `cnsp-fg_NTsCoreFolder*.png` → corefolder_reference
 * - `cnsp-fg_NTsHumanoid.png`   / `cnsp-fg_NTsHumanoid*.png`   → humanoid_reference
 *
 * 他作品で同等の参照画像を運用する場合は、上記命名規約に合わせるか、
 * 本関数のフィルタ条件を作品別に拡張すること。
 *
 * @param {string} work  作品名（例: "NumberTales"）
 * @returns {{ corefolder_reference: string[], humanoid_reference: string[] }}
 */
function resolveWorkCommonRefs(work) {
    /** @type {{ corefolder_reference: string[], humanoid_reference: string[] }} */
    const out = { corefolder_reference: [], humanoid_reference: [] };

    /** スキャン対象ディレクトリ（作品 Images からの相対パス） */
    const scanDirs = [
        'Ref_Glossary/concept-figure',
        'Ref_Reference/concept-figure',
    ];

    const imagesRoot = path.join(REPO_ROOT, 'data', `Works_${work}`, 'Images');

    for (const dirRel of scanDirs) {
        const absDir = path.join(imagesRoot, dirRel);
        if (!fs.existsSync(absDir)) continue;
        let entries;
        try {
            entries = fs.readdirSync(absDir);
        } catch {
            continue;
        }
        for (const fname of entries) {
            if (!fname.toLowerCase().endsWith('.png')) continue;
            const url = `${PUBLIC_ORIGIN}/data/Works_${work}/Images/${dirRel}/${fname}`;
            // CoreFolder / Humanoid をファイル名で識別
            if (/corefolder/i.test(fname)) {
                if (!out.corefolder_reference.includes(url)) out.corefolder_reference.push(url);
            } else if (/humanoid/i.test(fname)) {
                if (!out.humanoid_reference.includes(url)) out.humanoid_reference.push(url);
            }
        }
    }

    return out;
}

/**
 * `work_common` ブロックを組み立てる。参照画像が一つも見つからなければ `null` を返す。
 *
 * @param {string} work
 * @returns {{ reference_images: { corefolder_reference?: string[], humanoid_reference?: string[] } }|null}
 */
function buildWorkCommonBlock(work) {
    const refs = resolveWorkCommonRefs(work);
    const hasAny = refs.corefolder_reference.length > 0 || refs.humanoid_reference.length > 0;
    if (!hasAny) return null;
    /** @type {Record<string, string[]>} */
    const refObj = {};
    if (refs.corefolder_reference.length > 0) refObj.corefolder_reference = refs.corefolder_reference;
    if (refs.humanoid_reference.length > 0) refObj.humanoid_reference = refs.humanoid_reference;
    return { reference_images: refObj };
}

// ────────────────────────────────────────────────────────────────────────────
// コアフォルダ形態の構造的デフォルト値（User 要望明記の不変制約・ブラックリスト・シルエット記述）
//
// 注意: ここで提供する文字列は **作品の標準的なコアフォルダ構造に対する structural default**
// であり、個別キャラの創作設定ではない。`silhouette_notes` のキャラ固有部分や
// `outfit_features`、`immutable_traits` の番号マーキング位置などは別途 TODO として残し、
// User が手動で記述する運用を前提とする。
// ────────────────────────────────────────────────────────────────────────────

/** コアフォルダ形態でキャラクター単位に再宣言する不変制約（描画してはならない要素） */
const COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS = [
    'do not render arms or hands',
    'do not render legs or feet',
    'do not dress in humanoid casual / fashion outfit',
    'head must remain attached and protruding from the core body via the safety harness',
];

/** コアフォルダ形態でキャラ別に明示するフラットなブラックリスト（画像生成 AI の混入対策） */
const COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS = [
    'feet', 'legs', 'shoes', 'high heels',
    'arms', 'hands',
    'hoodie', 'blazer', 'fashion outfit',
    'bound by rope',
];

/** コアフォルダ形態の標準シルエット記述（視覚言語ベース、1〜2行） */
const COREFOLDER_DEFAULT_SILHOUETTE_NOTES = [
    'spherical core body with the head as the only protruding part on top',
    'core body suspended in place by a belt-like safety device harness',
];

// ────────────────────────────────────────────────────────────────────────────
// scaffold 生成（**創作内容は生成しない**）
// ────────────────────────────────────────────────────────────────────────────

/**
 * GenderType から AI 用の人称タグを推定（構造的マッピング、創作生成ではない）。
 * @param {string|undefined} g
 * @returns {string}
 */
function genderTagOf(g) {
    if (!g || typeof g !== 'string') return 'TODO: 1girl|1boy|1other';
    if (/Female/i.test(g)) return '1girl';
    if (/Male/i.test(g)) return '1boy';
    return '1other';
}

/**
 * ConceptAge から age_appearance を粗く分類（構造的マッピング）。
 * @param {number|undefined} age
 * @returns {string}
 */
// ────────────────────────────────────────────────────────────────────────────
// クラス名 → 英語タグ マッピング（NumberTales DB_Primary 全クラス対応）
// ────────────────────────────────────────────────────────────────────────────

const CLASS_NAMES_EN = new Map([
    ['試験用個体',                    'test unit'],
    ['1桁番(ユニデジッツ)',            'uni-digits class'],
    ['1号機型',                       'type-1 unit'],
    ['10倍番(テンズデジッツ)',         'tens-digits class'],
    ['デシベルモデレーターズ',        'decibel moderators class'],
    ['マスターテールズ9',             'master tails nine class'],
    ['デュアルスリーズ',              'dual-threes class'],
    ['デュアルフォーズ',              'dual-fours class'],
    ['デュアルファイブズ',            'dual-fives class'],
    ['デュアルシックスズ',            'dual-sixes class'],
    ['デュアルセブンズ',              'dual-sevens class'],
    ['バーチャリティテールズ',        'virtuality tails class'],
    ['デュアルエイツ',                'dual-eights class'],
    ['9倍2桁番(ナインズデュアルズ)',   'nines-duals class'],
    ['デュアルキャリーズ',            'dual-carries class'],
    ['2号機型',                       'type-2 unit'],
    ['マスマティカコンストレイント',   'mathematica constraint class'],
    ['デュアルイレブンズ',            'dual-elevens class'],
    ['ワノマチ',                      'wa-no-machi class'],
    ['スクエアエリート',              'square elite class'],
    ['未完成個体',                    'unfinished unit'],
    ['開発システム用個体',            'development system unit'],
    ['調整個体',                      'adjustment unit'],
    ['退任個体',                      'retired unit'],
    ['10号機型',                      'type-10 unit'],
    ['営業補助用個体',                'business support unit'],
    ['開発者',                        'developer'],
    ['最高経営所長',                  'chief executive director'],
    ['最高技術所長',                  'chief technical director'],
]);

/**
 * Class 配列を英語タグ配列に変換する。マッピングにない名称はそのまま残す。
 * @param {string[]|undefined} classArray
 * @returns {string[]}
 */
function classTagsOf(classArray) {
    if (!Array.isArray(classArray) || classArray.length === 0) return [];
    return classArray.map(c => CLASS_NAMES_EN.get(c) ?? c).filter(Boolean);
}

function ageBandOf(age) {
    if (typeof age !== 'number' || !Number.isFinite(age)) return 'TODO: e.g., teenager';
    if (age < 13) return 'child';
    if (age < 16) return 'early teenager';
    if (age < 20) return 'teenager';
    if (age < 30) return 'young adult';
    if (age < 50) return 'adult';
    return 'mature adult';
}

/**
 * 二層 AIHints scaffold を組み立てる。
 * - 創作面（identity_tags 本体、台詞、性格描写など）は **TODO 文字列** で残す。
 * - 構造面（form の有無、reference_images URL、age band、gender tag）は確定値を入れる。
 *
 * @param {any} record
 * @param {ImageInfo} imageInfo
 * @param {string} work       作品名（work_common 解決に使用）
 * @returns {any} AIHints オブジェクト
 */
function buildScaffold(record, imageInfo, work) {
    const num = record.Num;
    const genderTag = genderTagOf(record.GenderType);
    const ageBand = ageBandOf(record.ConceptAge);
    const conceptUrl = imageInfo.common.concept ?? null;
    const artUrls = imageInfo.corefolderArtImages.map(i => i.url);

    const common = {
        identity_tags: [
            `number '${num}' as her/his core identifier`,
            'TODO: add 3-5 more distinctive identity tags',
        ],
        silhouette_features: [
            `TODO: describe silhouette (refer to TailsUnit: ${record.TailsUnit ?? 'N/A'})`,
        ],
        immutable_traits: [
            'digital construct (NumberTales unit)',
            'TODO: add immutable physical traits',
        ],
        expression_tendency: [
            'TODO: e.g., confident smirk / soft smile / neutral gaze',
        ],
        age_appearance: ageBand,
        palette_priority: {
            primary: 'TODO: #RRGGBB (primary color)',
            secondary: 'TODO: #RRGGBB (secondary color)',
            accent: 'TODO: #RRGGBB (accent color)',
        },
        natural_language_description: 'TODO: 1-sentence neutral summary of appearance and demeanor.',
        reference_images: buildCommonReferenceImages(imageInfo.common),
    };

    /** @type {Record<string, any>} */
    const forms = {};

    // corefolder form
    if (imageInfo.corefolderUrl !== null) {
        forms.corefolder = buildCorefolderForm(
            num, genderTag, ageBand, imageInfo.corefolderUrl, conceptUrl, artUrls.length ? artUrls : undefined,
        );
    } else {
        forms.corefolder = null;
    }

    // humanoid form
    if (imageInfo.humanoidImages.length > 0) {
        forms.humanoid = buildHumanoidForm(num, genderTag, ageBand, imageInfo.humanoidImages, conceptUrl);
    }

    // work_common: 作品共通の参照画像（コアフォルダ/ヒューマノイド設計図）
    const workCommon = buildWorkCommonBlock(work);

    return {
        common,
        work_common: workCommon,
        forms,
        // alt_modes: 将来予約（コアフォルダにヒューマノイド衣装を着せるモード等）
        alt_modes: null,
    };
}

/**
 * common.reference_images を組み立てる。
 * - どのスロットも見つからなければ `null` を返し、schema 上の #Null を採用する。
 * - スロット順: main(=concept) を主キーとし、`concept` 名も衰れず明示する。
 *
 * @param {CommonRefs} c
 * @returns {Record<string, any>|null}
 */
function buildCommonReferenceImages(c) {
    const hasAny = c.concept || c.concept_variants.length > 0 || c.catalog || c.design_sheet;
    if (!hasAny) return null;
    /** @type {Record<string, any>} */
    const ref = {};
    if (c.concept) {
        ref.main = c.concept;
        ref.concept = c.concept;
    }
    if (c.concept_variants.length > 0) ref.concept_variants = c.concept_variants;
    if (c.catalog) ref.catalog = c.catalog;
    if (c.design_sheet) ref.design_sheet = c.design_sheet;
    return ref;
}

/**
 * フォーム別の reference_images を組み立てる。
 * concept 画像がある場合はそれを主参照 (`main`) とし、
 * 形態固有画像は `formKey`（`"corefolder"` / `"humanoid"` 等）に格納する。
 * concept がない場合は `main = formSpecificUrl` として従来動作を維持する。
 *
 * @param {string|null} conceptUrl   concept 画像の URL（形態共通デザイン基準）
 * @param {string|null} formSpecificUrl   形態固有の代表画像 URL
 * @param {'corefolder'|'humanoid'} formKey   形態名キー
 * @param {string[]} [extraArts]   追加アート画像 URL 配列（corefolder_arts 等）
 * @returns {Record<string, any>|null}
 */
function buildFormReferenceImages(conceptUrl, formSpecificUrl, formKey, extraArts) {
    /** @type {Record<string, any>} */
    const ref = {};
    if (conceptUrl) {
        // concept が主参照。形態固有画像は名前付きスロットへ。
        ref.main = conceptUrl;
        if (formSpecificUrl) ref[formKey] = formSpecificUrl;
    } else if (formSpecificUrl) {
        // concept なし: 形態固有画像を main として使用（後方互換）
        ref.main = formSpecificUrl;
    } else {
        return null;
    }
    // 追加アート画像（corefolder_arts 等）
    if (extraArts && extraArts.length > 0) {
        ref.corefolder_arts = extraArts;
    }
    return ref;
}

/**
 * @param {number} num
 * @param {string} genderTag
 * @param {string} ageBand
 * @param {string} url          corefolder 代表画像 URL
 * @param {string|null} conceptUrl  concept 画像 URL（形態共通デザイン基準）
 * @param {string[]} [artUrls]  corefolder アート画像 URL 群（arts/corefolders 系）
 */
function buildCorefolderForm(num, genderTag, ageBand, url, conceptUrl, artUrls) {
    return {
        form_tags: ['corefolder form'],
        outfit_features: [
            'TODO: outfit items (hoodie, harness, marking, etc.)',
        ],
        silhouette_notes: [
            ...COREFOLDER_DEFAULT_SILHOUETTE_NOTES,
            `TODO: 1-2 lines of character-specific silhouette notes for #${num} (e.g., distinctive accessory or harness shape)`,
        ],
        immutable_constraints: [...COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS],
        negative_keywords: [...COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS],
        ai_tags: [
            'corefolder form',
            genderTag,
            ageBand,
            'TODO: add hair / eye / tail / outfit tags',
        ],
        negative_visuals: [
            'cat ears',
            `fewer or more than the canonical tail count for #${num}`,
            'humanoid casual outfit',
        ],
        natural_language_description: 'TODO: 1-sentence description of the corefolder form.',
        prompt_export: '',
        negative_prompt_export: '',
        reference_images: buildFormReferenceImages(conceptUrl, url, 'corefolder', artUrls),
    };
}

/**
 * @param {number} num
 * @param {string} genderTag
 * @param {string} ageBand
 * @param {Array<{url: string, label: string}>} images
 * @param {string|null} conceptUrl  concept 画像 URL（形態共通デザイン基準）
 */
function buildHumanoidForm(num, genderTag, ageBand, images, conceptUrl) {
    // 先頭を代表画像として採用。variants は2件目以降を named slot で蓄積。
    const firstUrl = images[0].url;
    /** @type {Record<string, string>} */
    const extraHumanoid = {};
    for (let k = 1; k < images.length; k++) {
        const { url, label } = images[k];
        let key = label || `variant${k}`;
        if (extraHumanoid[key] !== undefined) key = `${key}_${k}`;
        extraHumanoid[key] = url;
    }
    const refs = buildFormReferenceImages(conceptUrl, firstUrl, 'humanoid') ?? { main: firstUrl };
    // 2件目以降の humanoid 画像を named slot として追記
    for (const [k, v] of Object.entries(extraHumanoid)) refs[k] = v;
    return {
        form_tags: ['humanoid form'],
        outfit_features: [
            'TODO: humanoid outfit items',
        ],
        silhouette_notes: [
            `TODO: 1-2 lines describing the humanoid form silhouette for #${num}`,
        ],
        immutable_constraints: [
            `TODO: per-character immutable constraints for humanoid form of #${num}`,
        ],
        negative_keywords: [
            `TODO: per-character negative keywords for humanoid form of #${num}`,
        ],
        ai_tags: [
            'humanoid form',
            genderTag,
            ageBand,
            'TODO: add hair / eye / outfit tags',
        ],
        negative_visuals: [
            'corefolder hoodie',
            'safety harness',
            'cat ears',
        ],
        natural_language_description: 'TODO: 1-sentence description of the humanoid form.',
        prompt_export: '',
        negative_prompt_export: '',
        reference_images: refs,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// --suggest モード: 既存フィールドからタグ候補を導出するヘルパー群
// ────────────────────────────────────────────────────────────────────────────

/**
 * TailsUnit 文字列から動物種・本数・形状を構造化して抽出する。
 * 創作内容の生成ではなく、既存文字列の変換・翻訳処理。
 *
 * @param {string|undefined} tailsUnit
 * @returns {{ animal: string|null, count: number|null, branching: boolean, unit: 'tail'|'feather'|'blade' } | null}
 */
export function parseTailsUnit(tailsUnit) {
    if (!tailsUnit || typeof tailsUnit !== 'string') return null;

    // 日本語動物名 → 英語タグのマッピング（出現順に優先）
    const ANIMAL_MAP = [
        ['キタキツネ', 'arctic fox'], ['キツネ', 'fox'],
        ['シロウサギ', 'white rabbit'], ['ウサギ', 'rabbit'],
        ['オオカミ', 'wolf'],
        ['タヌキ', 'tanuki'],
        ['ネコ', 'cat'],
        ['イヌ', 'dog'],
        ['トラ', 'tiger'], ['ヒョウ', 'leopard'],
        ['クマ', 'bear'], ['パンダ', 'panda'],
        ['キジ', 'pheasant'], ['カラス', 'crow'], ['ハト', 'dove'],
        ['ヘビ', 'snake'], ['ドラゴン', 'dragon'],
        ['ウシ', 'ox'], ['ウマ', 'horse'],
        ['サル', 'monkey'], ['ネズミ', 'mouse'],
        ['トナカイ', 'reindeer'], ['シカ', 'deer'],
        ['ヒツジ', 'sheep'], ['ブタ', 'pig'],
        ['タコ', 'octopus'], ['リス', 'squirrel'],
        ['カメ', 'turtle'], ['ハチ', 'bee'],
    ];

    let animal = null;
    for (const [jp, en] of ANIMAL_MAP) {
        if (tailsUnit.includes(jp)) { animal = en; break; }
    }

    // 本数: "N本" / "N枚" / "Nつ" のパターンを抽出
    const countMatch = tailsUnit.match(/(\d+)(?:本|枚|つ)/);
    const count = countMatch ? Number(countMatch[1]) : null;

    // 形状修飾子
    const branching = tailsUnit.includes('枝分かれ');

    // 単位種別（尾・羽・刃）
    let unit = 'tail';
    if (tailsUnit.includes('羽') || (tailsUnit.includes('枚') && !tailsUnit.includes('本'))) {
        unit = 'feather';
    } else if (tailsUnit.includes('刃') || tailsUnit.includes('ブレード')) {
        unit = 'blade';
    }

    return { animal, count, branching, unit };
}

/**
 * TailsUnit 解析結果から尾の英語説明文字列を生成する。
 * @param {{ animal: string|null, count: number|null, branching: boolean, unit: string } | null} tu
 * @returns {string}
 */
export function buildTailDescription(tu) {
    if (!tu?.animal) return 'TODO: tail description from TailsUnit';
    const parts = [];
    if (tu.branching) parts.push('branching');
    parts.push(tu.animal);
    if (tu.count !== null) {
        if (tu.unit === 'feather') {
            parts.push(tu.count === 1 ? 'single tail feather' : `${tu.count} tail feathers`);
        } else {
            parts.push(tu.count === 1 ? 'single tail' : `${tu.count} tails`);
        }
    } else {
        parts.push('tail(s)');
    }
    return parts.join(' ');
}

/**
 * Character フィールドのテキストから表情傾向タグをキーワードマッピングで抽出する。
 * LLM 生成ではなく、既存設定テキストのキーワード変換。
 *
 * @param {string|undefined} characterText
 * @returns {string[]|null}  タグ候補配列（最大3件）。マッチなければ null。
 */
export function extractExpressionHints(characterText) {
    if (!characterText || typeof characterText !== 'string') return null;

    const MAP = [
        ['楽観', 'optimistic cheerful expression'],
        ['明るい', 'bright cheerful expression'],
        ['クール', 'cool detached expression'],
        ['無口', 'quiet expressionless'],
        ['活発', 'energetic lively expression'],
        ['元気', 'energetic cheerful expression'],
        ['内向', 'shy introverted expression'],
        ['おとなし', 'gentle quiet expression'],
        ['冷静', 'calm composed expression'],
        ['真面目', 'serious earnest expression'],
        ['自信', 'confident expression'],
        ['挑戦', 'daring confident expression'],
        ['頑固', 'stubborn determined expression'],
        ['優しい', 'warm gentle expression'],
        ['勢い', 'spirited energetic expression'],
        ['神秘', 'mysterious calm expression'],
        ['不思議', 'curious wondering expression'],
        ['鋭い', 'sharp focused expression'],
        ['賢い', 'intelligent composed expression'],
        ['天然', 'carefree airheaded expression'],
        ['無邪気', 'innocent carefree expression'],
        ['几帳面', 'precise attentive expression'],
        ['マイペース', 'easygoing relaxed expression'],
        ['陽気', 'cheerful energetic expression'],
        ['穏やか', 'calm peaceful expression'],
        ['不器用', 'earnest awkward expression'],
        ['ツン', 'tsundere defensive expression'],
    ];

    const found = [];
    for (const [jp, en] of MAP) {
        if (characterText.includes(jp)) found.push(en);
    }
    return found.length > 0 ? found.slice(0, 3) : null;
}

/**
 * Summary の先頭文から natural_language_description 用の翻訳ヒントを生成する。
 * 実際の英訳は Agent（Copilot）が行う想定で、日本語原文をヒント付きで埋め込む。
 *
 * @param {string|undefined} summary
 * @returns {string}
 */
function buildNlDescriptionHint(summary) {
    if (!summary || typeof summary !== 'string') {
        return 'TODO: 1-sentence neutral summary of appearance and demeanor.';
    }
    const first = summary.split(/\n|。/)[0].trim();
    if (first.length < 5) return 'TODO: 1-sentence neutral summary.';
    return `[TRANSLATE \u2192 1 English sentence]: ${first}`;
}

/**
 * TailsUnit 解析結果と形態種別から negative_visuals の推定リストを生成する。
 *
 * @param {{ animal: string|null, count: number|null, branching: boolean, unit: string } | null} tu
 * @param {'corefolder'|'humanoid'} formType
 * @returns {string[]}
 */
function buildNegativeVisuals(tu, formType) {
    const negatives = [];
    // キャラクター自身の動物以外の耳タグを禁止（混入しやすい耳を先に列挙）
    if (!tu?.animal || tu.animal !== 'cat')    negatives.push('cat ears');
    if (!tu?.animal || tu.animal !== 'rabbit') negatives.push('rabbit ears');
    // 正規尾数と異なる本数の禁止
    if (tu?.count != null) {
        const tailWord = tu.unit === 'feather' ? 'tail feather(s)' : 'tail(s)';
        negatives.push(`fewer or more than ${tu.count} ${tailWord}`);
    }
    // 形態固有の服装制約
    if (formType === 'corefolder') {
        negatives.push('humanoid casual outfit');
    } else if (formType === 'humanoid') {
        negatives.push('corefolder hoodie');
        negatives.push('safety device harness');
    }
    return negatives;
}

/**
 * --suggest モード向け corefolder 形態 scaffold を生成する。
 * 確定可能な要素（動物耳・尾・gender・age）を埋め込み、
 * 確定タグだけを結合した prompt_export を先行生成する。
 *
 * @param {number} num
 * @param {string} genderTag
 * @param {string} ageBand
 * @param {{ animal: string|null, count: number|null, branching: boolean, unit: string } | null} tu
 * @param {string} url                corefolder 代表画像 URL
 * @param {any} record
 * @param {string|null} conceptUrl    concept 画像 URL（形態共通デザイン基準。main に優先）
 * @param {string[]} [artUrls]        corefolder アート URL 群
 * @returns {any}
 */
function buildSuggestedCorefolderForm(num, genderTag, ageBand, tu, url, record, conceptUrl, artUrls) {
    const tailDesc = buildTailDescription(tu);
    const earTag = tu?.animal ? `${tu.animal} ears` : 'TODO: ear type from TailsUnit';

    const aiTags = [
        'corefolder form',
        genderTag,
        ageBand,
        earTag,
        tailDesc,
        'TODO: hair color and style',
        'TODO: eye color',
        'TODO: corefolder outfit key terms',
    ];
    const negativeVisuals = buildNegativeVisuals(tu, 'corefolder');

    // 確定タグだけ prompt_export に先行生成（TODO は省く）
    const confirmedTags = aiTags.filter(t => !t.startsWith('TODO:'));
    const promptExport = confirmedTags.join(', ');
    const negExport = negativeVisuals.filter(t => !t.startsWith('TODO:')).join(', ');

    // InStory からコアフォルダ形態の記述があれば翻訳ヒントとして提示
    const inStoryRaw = record.InStory;
    const inStoryHint = (typeof inStoryRaw === 'string' && inStoryRaw.length > 5)
        ? `[TRANSLATE COREFOLDER SECTION \u2192 1 sentence]: ${String(inStoryRaw).slice(0, 150)}`
        : 'TODO: 1-sentence description of the corefolder form.';

    return {
        form_tags: ['corefolder form'],
        outfit_features: [
            'TODO: corefolder outfit features (hoodie / harness / marking details)',
        ],
        silhouette_notes: [
            ...COREFOLDER_DEFAULT_SILHOUETTE_NOTES,
            `TODO: 1-2 lines of character-specific silhouette notes for #${num} (e.g., distinctive accessory or harness shape)`,
        ],
        immutable_constraints: [...COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS],
        negative_keywords: [...COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS],
        ai_tags: aiTags,
        negative_visuals: negativeVisuals,
        natural_language_description: inStoryHint,
        prompt_export: promptExport,
        negative_prompt_export: negExport,
        reference_images: buildFormReferenceImages(conceptUrl, url, 'corefolder', artUrls?.length ? artUrls : undefined),
    };
}

/**
 * --suggest モード向け humanoid 形態 scaffold を生成する。
 *
 * @param {number} num
 * @param {string} genderTag
 * @param {string} ageBand
 * @param {{ animal: string|null, count: number|null, branching: boolean, unit: string } | null} tu
 * @param {Array<{url: string, label: string}>} images
 * @param {any} record
 * @param {string|null} conceptUrl  concept 画像 URL（形態共通デザイン基準）
 * @returns {any}
 */
function buildSuggestedHumanoidForm(num, genderTag, ageBand, tu, images, record, conceptUrl) {
    const firstUrl = images[0].url;
    /** @type {Record<string, string>} */
    const extraHumanoid = {};
    for (let k = 1; k < images.length; k++) {
        const { url, label } = images[k];
        let key = label || `variant${k}`;
        if (extraHumanoid[key] !== undefined) key = `${key}_${k}`;
        extraHumanoid[key] = url;
    }
    const refs = buildFormReferenceImages(conceptUrl, firstUrl, 'humanoid') ?? { main: firstUrl };
    for (const [k, v] of Object.entries(extraHumanoid)) refs[k] = v;

    const tailDesc = buildTailDescription(tu);
    const earTag = tu?.animal ? `${tu.animal} ears` : 'TODO: ear type from TailsUnit';

    const aiTags = [
        'humanoid form',
        genderTag,
        ageBand,
        earTag,
        tailDesc,
        'TODO: hair color and style',
        'TODO: eye color',
        'TODO: humanoid outfit key terms',
    ];
    const negativeVisuals = buildNegativeVisuals(tu, 'humanoid');

    const confirmedTags = aiTags.filter(t => !t.startsWith('TODO:'));
    const promptExport = confirmedTags.join(', ');
    const negExport = negativeVisuals.filter(t => !t.startsWith('TODO:')).join(', ');

    return {
        form_tags: ['humanoid form'],
        outfit_features: [
            'TODO: humanoid outfit features',
        ],
        silhouette_notes: [
            `TODO: 1-2 lines describing the humanoid form silhouette for #${num}`,
        ],
        immutable_constraints: [
            `TODO: per-character immutable constraints for humanoid form of #${num}`,
        ],
        negative_keywords: [
            `TODO: per-character negative keywords for humanoid form of #${num}`,
        ],
        ai_tags: aiTags,
        negative_visuals: negativeVisuals,
        natural_language_description: 'TODO: 1-sentence description of the humanoid form.',
        prompt_export: promptExport,
        negative_prompt_export: negExport,
        reference_images: refs,
    };
}

/**
 * --suggest モード向けの二層 AIHints scaffold を組み立てる。
 * 基本 buildScaffold と異なり、既存フィールドから導出できる値を積極的に埋め込む。
 *
 * 自動導出できるフィールド:
 *  - TailsUnit    → 耳タグ / 尾タグ / immutable_traits / negative_visuals
 *  - GenderType   → 1girl / 1boy / 1other（genderTagOf と同じロジック）
 *  - ConceptAge   → age_appearance（ageBandOf と同じロジック）
 *  - Character    → expression_tendency キーワードマッピング
 *  - Summary      → natural_language_description 翻訳ヒント（Agent が英訳して完成）
 *  - Images.*     → reference_images URL（resolveImageInfo 済み）
 *
 * 残る TODO（palette_priority / 視覚系詳細 / InStory 翻訳）は
 * `.github/prompts/aihints-fill.prompt.md` の Agent セッションまたは手動で完成させる。
 *
 * @param {any} record
 * @param {ImageInfo} imageInfo
 * @param {string} work       作品名（work_common 解決に使用）
 * @returns {any} AIHints オブジェクト
 */
function buildSuggestedScaffold(record, imageInfo, work) {
    const num = record.Num;
    const genderTag = genderTagOf(record.GenderType);
    const ageBand = ageBandOf(record.ConceptAge);
    const tu = parseTailsUnit(record.TailsUnit);
    const conceptUrl = imageInfo.common.concept ?? null;
    const artUrls = imageInfo.corefolderArtImages.map(i => i.url);
    const exprHints = extractExpressionHints(record.Character);
    const tailDesc = buildTailDescription(tu);
    const earTag = tu?.animal ? `${tu.animal} ears` : null;

    // identity_tags: Num + 動物種 + TODO（視覚的識別子は Agent / 手動で補完）
    const identityTags = [`number '${num}' as core identifier`];
    if (tu?.animal) identityTags.push(`${tu.animal}-type android unit`);
    identityTags.push('TODO: add 2-3 distinctive visual identity tags');

    // silhouette_features: 耳・尾は確定。髪/目は視覚情報が必要のため TODO。
    const silhouetteFeatures = [];
    if (earTag) silhouetteFeatures.push(earTag);
    silhouetteFeatures.push(tailDesc);
    silhouetteFeatures.push('TODO: hair color and length');
    silhouetteFeatures.push('TODO: eye color');
    // [D] 尾本数テンプレ：TailsUnit から本数 N が判明していれば「上下分袋構造」の TODO を付加
    if (tu?.count != null && tu.count > 0) {
        const unitWord = tu.unit === 'feather' ? 'tail feather(s)' : 'tail(s)';
        silhouetteFeatures.push(
            `exactly ${tu.count} ${unitWord} total: upper trunk forks into TODO bundles of TODO ${unitWord} each, lower trunk has TODO single ${unitWord}, no more no less`,
        );
    }

    // immutable_traits: 構造的に変わらない形質（動物耳・尾の種類/本数）
    const immutableTraits = ['digital construct (NumberTales unit)'];
    if (earTag) immutableTraits.push(`${earTag} (immutable)`);
    if (tu?.animal) {
        const tailSpec = tu.count != null
            ? `${tu.branching ? 'branching ' : ''}${tu.animal} ${tu.count > 1 ? `${tu.count} tails` : 'single tail'} (immutable count)`
            : `${tu.animal} tail(s) (immutable)`;
        immutableTraits.push(tailSpec);
    }
    // [E] 番号ロゴの設置箱所を 1 スロットに固定（複数尾へのバラ擒き抑制）
    immutableTraits.push(
        `TODO: number '${num}' marking placement (single fixed slot, e.g., back center / collar tag / harness front)`,
    );

    // expression_tendency: Character フィールドのキーワードから候補を抽出
    const expressionTendency = exprHints
        ?? ['TODO: expression based on Character field'];

    // natural_language_description: Summary 先頭文を翻訳ヒントとして提示
    const naturalLanguageDescription = buildNlDescriptionHint(record.Summary);

    const common = {
        identity_tags: identityTags,
        silhouette_features: silhouetteFeatures,
        immutable_traits: immutableTraits,
        expression_tendency: expressionTendency,
        age_appearance: ageBand,
        palette_priority: {
            primary: 'TODO: #RRGGBB (primary color)',
            secondary: 'TODO: #RRGGBB (secondary color)',
            accent: 'TODO: #RRGGBB (accent color)',
        },
        natural_language_description: naturalLanguageDescription,
        reference_images: buildCommonReferenceImages(imageInfo.common),
    };

    /** @type {Record<string, any>} */
    const forms = {};

    if (imageInfo.corefolderUrl !== null) {
        forms.corefolder = buildSuggestedCorefolderForm(
            num, genderTag, ageBand, tu, imageInfo.corefolderUrl, record,
            conceptUrl, artUrls.length ? artUrls : undefined,
        );
    } else {
        forms.corefolder = null;
    }

    if (imageInfo.humanoidImages.length > 0) {
        forms.humanoid = buildSuggestedHumanoidForm(
            num, genderTag, ageBand, tu, imageInfo.humanoidImages, record, conceptUrl,
        );
    }

    // work_common: 作品共通の参照画像（コアフォルダ/ヒューマノイド設計図）
    const workCommon = buildWorkCommonBlock(work);

    return {
        common,
        work_common: workCommon,
        forms,
        // alt_modes: 将来予約（コアフォルダにヒューマノイド衣装を着せるモード等）
        alt_modes: null,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// scaffold オブジェクト → 既存ファイル形式に揃えた整形済み JSON テキスト化
// ────────────────────────────────────────────────────────────────────────────

/**
 * AIHints オブジェクトを、レコード本文と同じインデント幅（4 スペース）に揃えた
 * 文字列に変換する。先頭/末尾の改行は含まない（呼び出し側で挿入位置を制御）。
 *
 * @param {any} aihints
 * @returns {string}
 */
function stringifyAihintsBlock(aihints) {
    // 標準の JSON.stringify を4スペースで適用し、各行を4スペース追加インデント。
    const json = JSON.stringify(aihints, null, 4);
    // 既存レコードは ASCII の `"key"` 形式 + UTF-8。JSON.stringify はそのまま準拠。
    return json
        .split('\n')
        .map((line, idx) => (idx === 0 ? line : '    ' + line))
        .join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// レコード単位のパッチ処理
// ────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PatchResult
 * @property {number} num
 * @property {'patched'|'skipped-existing'|'skipped-no-image'|'overwritten'|'refs-fixed'|'todos-filled'|'todos-unchanged'|'schema-upgraded'|'schema-unchanged'|'skipped-no-aihints'} status
 * @property {string} [note]
 */

/**
 * 既存の AIHints の JSON から導出できる TODO 項目のみを補完する（--fill-todos モード専用）。
 * 補完対象: identity_tags(Class), immutable_traits(number marking), age_appearance(ConceptAge),
 *           expression_tendency(Character)。
 * 補完対象外: palette_priority / silhouette_features 髪・目 / outfit_features / ai_tags 視覚系。
 * [TRANSLATE → ...] 形式の翻訳ヒントは変更しない。
 *
 * @param {string} text     ファイル全体テキスト
 * @param {number} openIdx  レコード `{` のインデックス
 * @param {number} closeIdx レコード `}` のインデックス
 * @param {any} record      パース済みレコードオブジェクト
 * @returns {{ text: string, changed: boolean }}
 */
function fillJsonTodosInRecord(text, openIdx, closeIdx, record) {
    const recText = text.slice(openIdx, closeIdx + 1);
    const rec = JSON.parse(recText);
    if (!rec.AIHints) throw new Error('fillJsonTodosInRecord: AIHints key not found');

    const aihints = JSON.parse(JSON.stringify(rec.AIHints));
    const num = rec.Num;
    let changed = false;

    // --- common.identity_tags: TODO → クラスタグ ---
    if (Array.isArray(aihints.common?.identity_tags)) {
        const classTags = classTagsOf(rec.Class);
        if (classTags.length > 0) {
            const expanded = [];
            for (const tag of aihints.common.identity_tags) {
                if (typeof tag === 'string' && tag.startsWith('TODO:')) {
                    // TODO スロットをクラスタグで展開（ただし重複は省く）
                    for (const ct of classTags) {
                        if (!expanded.includes(ct)) { expanded.push(ct); changed = true; }
                    }
                } else {
                    expanded.push(tag);
                }
            }
            aihints.common.identity_tags = expanded;
        }
    }

    // --- common.immutable_traits: number marking TODO → '#NN' marking ---
    if (Array.isArray(aihints.common?.immutable_traits)) {
        aihints.common.immutable_traits = aihints.common.immutable_traits.map(trait => {
            if (typeof trait === 'string' && trait.startsWith('TODO:') && /marking|number/i.test(trait)) {
                changed = true;
                return `'#${num}' number marking (immutable)`;
            }
            return trait;
        });
    }

    // --- common.age_appearance: TODO → ageBandOf ---
    if (typeof aihints.common?.age_appearance === 'string' && aihints.common.age_appearance.startsWith('TODO:')) {
        const band = ageBandOf(rec.ConceptAge);
        if (!band.startsWith('TODO:')) {
            aihints.common.age_appearance = band;
            changed = true;
        }
    }

    // --- common.expression_tendency: TODO → extractExpressionHints ---
    if (Array.isArray(aihints.common?.expression_tendency)) {
        const expanded = [];
        for (const e of aihints.common.expression_tendency) {
            if (typeof e === 'string' && e.startsWith('TODO:')) {
                const hints = extractExpressionHints(rec.Character);
                if (hints && hints.length > 0) {
                    expanded.push(...hints);
                    changed = true;
                } else {
                    expanded.push(e); // 変換できなければ保持
                }
            } else {
                expanded.push(e);
            }
        }
        aihints.common.expression_tendency = expanded;
    }

    // --- common.silhouette_features: TailsUnit から尻尾本数テンプレを追記 ---
    // 目的: 画像生成 AI が尻尾本数を取り違える問題への対策（User 要望 [D]）。
    // 既に "exactly N tails total: ..." 形式のエントリが含まれていれば再追加しない。
    if (Array.isArray(aihints.common?.silhouette_features)) {
        const tu = parseTailsUnit(rec.TailsUnit);
        if (tu?.count != null && tu.count > 0) {
            const unitWord = tu.unit === 'feather' ? 'tail feather(s)' : 'tail(s)';
            const templateRe = /^exactly\s+\d+\s+.*total:\s+upper\s+trunk/i;
            const alreadyHas = aihints.common.silhouette_features.some(
                f => typeof f === 'string' && templateRe.test(f),
            );
            if (!alreadyHas) {
                aihints.common.silhouette_features.push(
                    `exactly ${tu.count} ${unitWord} total: upper trunk forks into TODO bundles of TODO ${unitWord} each, lower trunk has TODO single ${unitWord}, no more no less`,
                );
                changed = true;
            }
        }
    }

    if (!changed) return { text, changed: false };
    const block = stringifyAihintsBlock(aihints);
    return { text: replaceAihintsInRecord(text, openIdx, closeIdx, block), changed: true };
}

/**
 * 既存 AIHints に対し、新しく追加されたスキーマフィールドを差分追加する（--upgrade-schema モード専用）。
 *
 * 差分追加対象（既存タグ・テキスト・reference_images は一切触らない）:
 *   - top-level: `work_common` / `alt_modes`
 *   - 各 form (`corefolder` / `humanoid`):
 *     - `silhouette_notes` / `immutable_constraints` / `negative_keywords`
 *
 * corefolder 側のみ User 要望明記の structural default を投入し、humanoid 側は TODO のみ。
 * 既に存在するフィールドは絶対に上書きしない（key in form チェックで判定）。
 *
 * 追加後はキーを正規順序に並び替えてから書き戻す:
 *   AIHints: common, work_common, forms, alt_modes
 *   form:    form_tags, outfit_features, silhouette_notes, immutable_constraints,
 *            negative_keywords, ai_tags, negative_visuals,
 *            natural_language_description, prompt_export, negative_prompt_export, reference_images
 *
 * @param {string} text         ファイル全体テキスト
 * @param {number} openIdx      レコード `{` のインデックス
 * @param {number} closeIdx     レコード `}` のインデックス
 * @param {any} record          パース済みレコードオブジェクト
 * @param {string} work         作品名（work_common 解決に使用）
 * @returns {{ text: string, changed: boolean }}
 */
function upgradeAihintsSchemaInRecord(text, openIdx, closeIdx, record, work) {
    if (!record.AIHints) return { text, changed: false };

    const aihints = JSON.parse(JSON.stringify(record.AIHints));
    const num = record.Num;
    let changed = false;

    // ── top-level: work_common ────────────────────────────────────
    if (!('work_common' in aihints)) {
        aihints.work_common = buildWorkCommonBlock(work);
        changed = true;
    }

    // ── top-level: alt_modes（予約・null）──────────────────────────
    if (!('alt_modes' in aihints)) {
        aihints.alt_modes = null;
        changed = true;
    }

    // ── 各 form に対して、3 つの新フィールドを差分追加 ───────────
    if (aihints.forms && typeof aihints.forms === 'object') {
        for (const [formKey, form] of Object.entries(aihints.forms)) {
            if (!form || typeof form !== 'object') continue;
            const isCorefolder = formKey === 'corefolder';

            if (!('silhouette_notes' in form)) {
                form.silhouette_notes = isCorefolder
                    ? [
                        ...COREFOLDER_DEFAULT_SILHOUETTE_NOTES,
                        `TODO: 1-2 lines of character-specific silhouette notes for #${num} (e.g., distinctive accessory or harness shape)`,
                    ]
                    : [`TODO: 1-2 lines describing the ${formKey} form silhouette for #${num}`];
                changed = true;
            }
            if (!('immutable_constraints' in form)) {
                form.immutable_constraints = isCorefolder
                    ? [...COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS]
                    : [`TODO: per-character immutable constraints for ${formKey} form of #${num}`];
                changed = true;
            }
            if (!('negative_keywords' in form)) {
                form.negative_keywords = isCorefolder
                    ? [...COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS]
                    : [`TODO: per-character negative keywords for ${formKey} form of #${num}`];
                changed = true;
            }

            // form 内のキー順序を schema 宣言順に揃える（追加フィールドを outfit_features と ai_tags の間に配置）
            aihints.forms[formKey] = reorderObjectKeys(form, [
                'form_tags', 'outfit_features',
                'silhouette_notes', 'immutable_constraints', 'negative_keywords',
                'ai_tags', 'negative_visuals',
                'natural_language_description', 'prompt_export', 'negative_prompt_export',
                'reference_images',
            ]);
        }
    }

    if (!changed) return { text, changed: false };

    // top-level のキー順を common → work_common → forms → alt_modes に揃える
    const ordered = reorderObjectKeys(aihints, ['common', 'work_common', 'forms', 'alt_modes']);
    const block = stringifyAihintsBlock(ordered);
    return { text: replaceAihintsInRecord(text, openIdx, closeIdx, block), changed: true };
}

/**
 * オブジェクトのキーを指定された順序で並び替える。リストに含まれないキーは末尾に元の順序で残す。
 *
 * @param {Record<string, any>} obj
 * @param {string[]} orderedKeys
 * @returns {Record<string, any>}
 */
function reorderObjectKeys(obj, orderedKeys) {
    /** @type {Record<string, any>} */
    const out = {};
    for (const k of orderedKeys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    for (const k of Object.keys(obj)) {
        if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = obj[k];
    }
    return out;
}

/**
 * 既存の AIHints の `reference_images` のみを再構築する（タグ・テキスト類は保持）。
 * --fix-refs モード専用。identity_tags / ai_tags / natural_language_description 等は
 * 一切変更しない。
 *
 * @param {string} text       ファイル全体テキスト
 * @param {number} openIdx    レコード `{` のインデックス
 * @param {number} closeIdx   レコード `}` のインデックス
 * @param {ImageInfo} imageInfo   resolveImageInfo() の返り値
 * @returns {string} 更新後テキスト
 */
function fixRefsInRecord(text, openIdx, closeIdx, imageInfo) {
    const recText = text.slice(openIdx, closeIdx + 1);
    /** @type {Record<string, any>} */
    const record = JSON.parse(recText);
    if (!record.AIHints) throw new Error('fixRefsInRecord: AIHints key not found in record');

    // 元の AIHints をディープコピーして参照画像のみ差し替える
    const aihints = JSON.parse(JSON.stringify(record.AIHints));
    const conceptUrl = imageInfo.common.concept;

    // --- common.reference_images を再構築 ---
    if (aihints.common) {
        aihints.common.reference_images = buildCommonReferenceImages(imageInfo.common);
    }

    // --- forms.corefolder.reference_images を再構築 ---
    if (aihints.forms?.corefolder) {
        const artUrls = imageInfo.corefolderArtImages.map(({ url }) => url);
        aihints.forms.corefolder.reference_images = buildFormReferenceImages(
            conceptUrl,
            imageInfo.corefolderUrl,
            'corefolder',
            artUrls.length > 0 ? artUrls : undefined,
        );
    }

    // --- forms.humanoid.reference_images を再構築 ---
    if (aihints.forms?.humanoid) {
        const firstHumanoidUrl = imageInfo.humanoidImages.length > 0
            ? imageInfo.humanoidImages[0].url
            : null;
        aihints.forms.humanoid.reference_images = buildFormReferenceImages(
            conceptUrl,
            firstHumanoidUrl,
            'humanoid',
        );
    }

    const block = stringifyAihintsBlock(aihints);
    return replaceAihintsInRecord(text, openIdx, closeIdx, block);
}

// ────────────────────────────────────────────────────────────────────────────
// 視覚解析ワークフロー（Agent 連動: gen-vision-tasks / apply-vision-results）
// ────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} VisionResult
 * Agent が view_image で画像を解析し、以下のフィールドを埋めた JSON オブジェクト。
 * .cache/vision-results.json の各要素として保存する。
 *
 * @property {number} num                    対象レコードの Num
 * @property {{ primary: string, secondary: string, accent: string }} [palette]
 *   palette_priority 用 HEX カラー。例: `{ primary: "#4a6fa5", ... }`
 * @property {string} [silhouetteHair]       silhouette_features 用 hair 記述（長め）
 * @property {string} [silhouetteEye]        silhouette_features 用 eye 記述（長め）
 * @property {string} [aiTagsHair]           forms.*.ai_tags 用 hair タグ（短め）
 * @property {string} [aiTagsEye]            forms.*.ai_tags 用 eye タグ（短め）
 * @property {string[]} [corefolderOutfit]   corefolder outfit_features + ai_tags outfit スロット
 * @property {string[]} [humanoidOutfit]     humanoid outfit_features + ai_tags outfit スロット
 * @property {string[]} [corefolderSilhouetteNotes]   forms.corefolder.silhouette_notes の TODO を置換
 * @property {string[]} [humanoidSilhouetteNotes]     forms.humanoid.silhouette_notes の TODO を置換
 * @property {string[]} [corefolderImmutableExtras]   forms.corefolder.immutable_constraints に追加するキャラ側不変制約
 * @property {string[]} [humanoidImmutableExtras]     forms.humanoid.immutable_constraints に追加するキャラ側不変制約
 * @property {string[]} [corefolderNegativeKeywords]  forms.corefolder.negative_keywords に追加するキャラ側NGキーワード
 * @property {string[]} [humanoidNegativeKeywords]    forms.humanoid.negative_keywords に追加するキャラ側NGキーワード
 * @property {string} [numberMarkingPlacement]        common.immutable_traits の "number 'N' marking placement: TODO" を置換する単一スロット記述
 */

/**
 * 視覚 TODO のあるレコードを走査し、Agent 向け画像解析タスクマニフェストを生成する。
 * `.cache/vision-tasks.json` に書き出して終了する（書き込み専用操作）。
 *
 * @param {any[]} db         DB 配列（パース済み）
 * @param {CliOptions} opts
 */
function genVisionTasksToFile(db, opts) {
    const VISUAL_TODO_PATTERN = /^TODO:/;

    /**
     * AIHints オブジェクト内に視覚系 TODO がどのフィールドに残っているかを調べる。
     * @param {any} aihints
     * @returns {string[]} フィールドパスの一覧
     */
    function detectVisualTodos(aihints) {
        const fields = [];
        const pal = aihints.common?.palette_priority;
        if (typeof pal?.primary === 'string' && VISUAL_TODO_PATTERN.test(pal.primary))
            fields.push('common.palette_priority.primary');
        if (typeof pal?.secondary === 'string' && VISUAL_TODO_PATTERN.test(pal.secondary))
            fields.push('common.palette_priority.secondary');
        if (typeof pal?.accent === 'string' && VISUAL_TODO_PATTERN.test(pal.accent))
            fields.push('common.palette_priority.accent');
        if (Array.isArray(aihints.common?.silhouette_features) &&
            aihints.common.silhouette_features.some(f => typeof f === 'string' && /TODO:.*hair/i.test(f)))
            fields.push('common.silhouette_features.hair');
        if (Array.isArray(aihints.common?.silhouette_features) &&
            aihints.common.silhouette_features.some(f => typeof f === 'string' && /TODO:.*eye/i.test(f)))
            fields.push('common.silhouette_features.eye');
        for (const [formKey, form] of Object.entries(aihints.forms ?? {})) {
            if (!form || typeof form !== 'object') continue;
            if (Array.isArray(form.outfit_features) &&
                form.outfit_features.some(f => typeof f === 'string' && VISUAL_TODO_PATTERN.test(f)))
                fields.push(`forms.${formKey}.outfit_features`);
            if (Array.isArray(form.ai_tags) &&
                form.ai_tags.some(t => typeof t === 'string' && VISUAL_TODO_PATTERN.test(t)))
                fields.push(`forms.${formKey}.ai_tags`);
            // 2026-06-08 追加: corefolder 強化フィールドの TODO 検出
            if (Array.isArray(form.silhouette_notes) &&
                form.silhouette_notes.some(f => typeof f === 'string' && VISUAL_TODO_PATTERN.test(f)))
                fields.push(`forms.${formKey}.silhouette_notes`);
            if (Array.isArray(form.immutable_constraints) &&
                form.immutable_constraints.some(f => typeof f === 'string' && VISUAL_TODO_PATTERN.test(f)))
                fields.push(`forms.${formKey}.immutable_constraints`);
            if (Array.isArray(form.negative_keywords) &&
                form.negative_keywords.some(f => typeof f === 'string' && VISUAL_TODO_PATTERN.test(f)))
                fields.push(`forms.${formKey}.negative_keywords`);
        }
        // common.immutable_traits の number marking placement TODO も拾う
        if (Array.isArray(aihints.common?.immutable_traits) &&
            aihints.common.immutable_traits.some(t =>
                typeof t === 'string' && /TODO:\s*number\s+['‘"“]?\S+['’"”]?\s+marking\s+placement/i.test(t)))
            fields.push('common.immutable_traits.number_marking_placement');
        return fields;
    }

    /**
     * 公開 URL → ローカル絶対パスに変換するヘルパー。
     * @param {string} url
     * @returns {string}
     */
    function urlToLocalPath(url) {
        // url = "https://database.numbertales-radiann.net/data/Works_.../..."
        const rel = url.slice(PUBLIC_ORIGIN.length + 1); // "/data/Works_..." の先頭 '/' を除去
        return path.join(REPO_ROOT, ...rel.split('/'));
    }

    const tasks = [];
    for (const record of db) {
        const num = record.Num;
        // num は通常 number だが、特殊番号レコード（例: "000", "2-alt"）は string も許容
        if (num === undefined || num === null || (typeof num !== 'number' && typeof num !== 'string')) continue;
        if (opts.records !== null && !opts.records.has(num)) continue;
        if (!record.AIHints) continue;

        const todoFields = detectVisualTodos(record.AIHints);
        if (todoFields.length === 0) continue;

        // 解析に使う画像を収集（concept 優先）
        const imageInfo = resolveImageInfo(record, opts.work, opts.db);
        const images = [];
        if (imageInfo.common.concept) {
            images.push({
                role: 'concept',
                url: imageInfo.common.concept,
                localPath: urlToLocalPath(imageInfo.common.concept),
            });
        }
        if (imageInfo.corefolderUrl) {
            images.push({
                role: 'corefolder',
                url: imageInfo.corefolderUrl,
                localPath: urlToLocalPath(imageInfo.corefolderUrl),
            });
        }
        if (imageInfo.humanoidImages.length > 0) {
            images.push({
                role: 'humanoid',
                url: imageInfo.humanoidImages[0].url,
                localPath: urlToLocalPath(imageInfo.humanoidImages[0].url),
            });
        }

        tasks.push({
            num,
            name: record.CharaName ?? `#${num}`,
            todoFields,
            images,
            // Agent 向けヒント: 既存の non-TODO ai_tags を参照に提示
            existingTags: (() => {
                const tags = [];
                for (const form of Object.values(record.AIHints.forms ?? {})) {
                    if (!form || typeof form !== 'object') continue;
                    if (Array.isArray(form.ai_tags)) {
                        tags.push(...form.ai_tags.filter(t => !VISUAL_TODO_PATTERN.test(t)));
                    }
                }
                return [...new Set(tags)];
            })(),
        });
    }

    tasks.sort((a, b) => a.num - b.num);

    // .cache/ ディレクトリが無ければ作成
    const cacheDir = path.join(REPO_ROOT, '.cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    const outPath = path.join(cacheDir, 'vision-tasks.json');
    fs.writeFileSync(outPath, JSON.stringify(tasks, null, 2), 'utf8');
    console.log(`Generated vision-tasks.json: ${path.relative(REPO_ROOT, outPath)}`);
    console.log(`  ${tasks.length} records with visual TODO items\n`);

    // タスク一覧を簡略表示
    for (const t of tasks) {
        const imgRoles = t.images.map(i => i.role).join(', ');
        console.log(`  #${t.num} ${t.name} [${imgRoles}] → ${t.todoFields.join(', ')}`);
    }

    console.log('\nNext step: open vision-tasks.json, analyze images with Agent view_image,');
    console.log('then write .cache/vision-results.json and run --apply-vision-results --apply');
}

/**
 * VisionResult の解析データを AIHints オブジェクトに適用し、視覚 TODO を埋める。
 * 変更がなかった場合は `changed: false` を返す。
 *
 * @param {any}          aihints  元の AIHints オブジェクト（変更しない）
 * @param {VisionResult} vr       Agent が埋めた VisionResult
 * @returns {{ aihints: any, changed: boolean }}
 */
function applyVisionResultsToAihints(aihints, vr) {
    // deep copy してから編集する
    const a = JSON.parse(JSON.stringify(aihints));
    let changed = false;

    // ── palette_priority ────────────────────────────────────────────
    if (vr.palette && a.common?.palette_priority) {
        const p = a.common.palette_priority;
        if (vr.palette.primary && typeof p.primary === 'string' && p.primary.startsWith('TODO:')) {
            p.primary = vr.palette.primary; changed = true;
        }
        if (vr.palette.secondary && typeof p.secondary === 'string' && p.secondary.startsWith('TODO:')) {
            p.secondary = vr.palette.secondary; changed = true;
        }
        if (vr.palette.accent && typeof p.accent === 'string' && p.accent.startsWith('TODO:')) {
            p.accent = vr.palette.accent; changed = true;
        }
    }

    // ── common.silhouette_features: hair / eye スロットを置換 ───────
    if (a.common?.silhouette_features) {
        a.common.silhouette_features = a.common.silhouette_features.flatMap(feat => {
            if (typeof feat !== 'string' || !feat.startsWith('TODO:')) return [feat];
            if (/hair/i.test(feat) && vr.silhouetteHair) { changed = true; return [vr.silhouetteHair]; }
            if (/eye/i.test(feat) && vr.silhouetteEye)  { changed = true; return [vr.silhouetteEye]; }
            return [feat]; // 未対応スロットはそのまま
        });
    }

    // ── common.immutable_traits: number 'N' marking placement TODO を置換 ────
    // numberMarkingPlacement は単一スロット描述（例: "back center only"）。
    // 必ず single fixed slot に限定する記述として User が手動で記入する。
    // 既存パターン:
    //   (a) "TODO: number 'N' marking placement (...)" ─ schema upgrade 由来の TODO
    //   (b) "'#N' number marking (immutable)"         ─ 旧 fill-todos 由来
    //   (c) "number 'N' marking ..."                  ─ より一般的な既存記述
    //   (d) "number 'N' as her core identifier" 等    ─ legacy schema-移行 前の素朴な記述
    // のいずれかに合致したら placement で置換する（最初の 1 件のみ。重複は作らない）。
    if (Array.isArray(a.common?.immutable_traits) && typeof vr.numberMarkingPlacement === 'string' && vr.numberMarkingPlacement) {
        const placement = vr.numberMarkingPlacement;
        const markingRe = new RegExp(
            "^TODO:\\s*number\\s+['‘\"“]?\\S+['’\"”]?\\s+marking\\s+placement" +
            "|" +
            "^['‘\"“]?#?\\d+\\S*['’\"”]?\\s+number\\s+marking" +
            "|" +
            "^number\\s+['‘\"“]?#?\\d+['’\"”]?\\s+marking" +
            "|" +
            "^number\\s+['‘\"“]?#?\\d+['’\"”]?\\s+\\S+",
            'i',
        );
        let replacedOnce = false;
        a.common.immutable_traits = a.common.immutable_traits.flatMap(trait => {
            if (typeof trait !== 'string') return [trait];
            if (!replacedOnce && markingRe.test(trait)) {
                replacedOnce = true;
                changed = true;
                return [placement];
            }
            return [trait];
        });
    }

    // ── forms.corefolder ──────────────────────────────────────────
    if (a.forms?.corefolder) {
        const cf = a.forms.corefolder;

        // outfit_features: 単一 TODO エントリ → 配列要素に展開
        if (Array.isArray(cf.outfit_features) && vr.corefolderOutfit?.length) {
            cf.outfit_features = cf.outfit_features.flatMap(f => {
                if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return vr.corefolderOutfit; }
                return [f];
            });
        }

        // silhouette_notes: TODO エントリをキャラ固有描写で置換（User 手動記入値を受ける）
        if (Array.isArray(cf.silhouette_notes) && vr.corefolderSilhouetteNotes?.length) {
            cf.silhouette_notes = cf.silhouette_notes.flatMap(f => {
                if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return vr.corefolderSilhouetteNotes; }
                return [f];
            });
        }

        // immutable_constraints: 追加キャラ固有制約を末尾に追記（重複と structural default は変えない）
        if (Array.isArray(cf.immutable_constraints) && vr.corefolderImmutableExtras?.length) {
            const existing = new Set(cf.immutable_constraints);
            const additions = vr.corefolderImmutableExtras.filter(s => !existing.has(s));
            if (additions.length > 0) {
                cf.immutable_constraints.push(...additions);
                changed = true;
            }
        }

        // negative_keywords: 追加キャラ固有NGキーワードを末尾に追記（重複除去）
        if (Array.isArray(cf.negative_keywords) && vr.corefolderNegativeKeywords?.length) {
            const existing = new Set(cf.negative_keywords);
            const additions = vr.corefolderNegativeKeywords.filter(s => !existing.has(s));
            if (additions.length > 0) {
                cf.negative_keywords.push(...additions);
                changed = true;
            }
        }

        // ai_tags: hair / eye / outfit TODO スロットを置換して prompt_export を更新
        if (Array.isArray(cf.ai_tags)) {
            const hairTag = vr.aiTagsHair ?? vr.silhouetteHair;
            const eyeTag  = vr.aiTagsEye  ?? vr.silhouetteEye;
            cf.ai_tags = cf.ai_tags.flatMap(t => {
                if (typeof t !== 'string' || !t.startsWith('TODO:')) return [t];
                if (/hair/i.test(t) && hairTag)               { changed = true; return [hairTag]; }
                if (/eye/i.test(t)  && eyeTag)                { changed = true; return [eyeTag]; }
                if (/outfit/i.test(t) && vr.corefolderOutfit?.length) { changed = true; return vr.corefolderOutfit; }
                return [t];
            });
            cf.prompt_export = cf.ai_tags.filter(t => !t.startsWith('TODO:')).join(', ');
        }
    }

    // ── forms.humanoid ────────────────────────────────────────────
    if (a.forms?.humanoid) {
        const hu = a.forms.humanoid;

        if (Array.isArray(hu.outfit_features) && vr.humanoidOutfit?.length) {
            hu.outfit_features = hu.outfit_features.flatMap(f => {
                if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return vr.humanoidOutfit; }
                return [f];
            });
        }

        if (Array.isArray(hu.silhouette_notes) && vr.humanoidSilhouetteNotes?.length) {
            hu.silhouette_notes = hu.silhouette_notes.flatMap(f => {
                if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return vr.humanoidSilhouetteNotes; }
                return [f];
            });
        }

        if (Array.isArray(hu.immutable_constraints) && vr.humanoidImmutableExtras?.length) {
            hu.immutable_constraints = hu.immutable_constraints.flatMap(f => {
                if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return vr.humanoidImmutableExtras; }
                return [f];
            });
        }

        if (Array.isArray(hu.negative_keywords) && vr.humanoidNegativeKeywords?.length) {
            hu.negative_keywords = hu.negative_keywords.flatMap(f => {
                if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return vr.humanoidNegativeKeywords; }
                return [f];
            });
        }

        if (Array.isArray(hu.ai_tags)) {
            const hairTag = vr.aiTagsHair ?? vr.silhouetteHair;
            const eyeTag  = vr.aiTagsEye  ?? vr.silhouetteEye;
            hu.ai_tags = hu.ai_tags.flatMap(t => {
                if (typeof t !== 'string' || !t.startsWith('TODO:')) return [t];
                if (/hair/i.test(t) && hairTag)               { changed = true; return [hairTag]; }
                if (/eye/i.test(t)  && eyeTag)                { changed = true; return [eyeTag]; }
                if (/outfit/i.test(t) && vr.humanoidOutfit?.length) { changed = true; return vr.humanoidOutfit; }
                return [t];
            });
            hu.prompt_export = hu.ai_tags.filter(t => !t.startsWith('TODO:')).join(', ');
        }
    }

    return { aihints: a, changed };
}

/**
 * 1ファイル分のパッチ処理。テキスト編集と結果集計を返す。
 * @param {string} text
 * @param {CliOptions} opts
 * @returns {{ newText: string, results: PatchResult[] }}
 */
function patchFileText(text, opts) {
    /** @type {PatchResult[]} */
    const results = [];
    const ranges = locateTopLevelRecords(text);

    // レコード末尾から先頭へ向かって差し込むことで、前方のインデックスを安定保持。
    for (let i = ranges.length - 1; i >= 0; i--) {
        const { openIdx, closeIdx } = ranges[i];
        const recText = text.slice(openIdx, closeIdx + 1);
        let record;
        try {
            record = JSON.parse(recText);
        } catch (e) {
            // 構造異常はスキップ（テスト data.sanity.test.js でカバー済みのはず）
            continue;
        }
        const num = record.Num;
        // num は通常 number だが、特殊番号レコード（例: "000", "2-alt"）は string も許容
        if (num === undefined || num === null || (typeof num !== 'number' && typeof num !== 'string')) continue;
        if (opts.records !== null && !opts.records.has(num)) continue;

        const hasAihints = Object.prototype.hasOwnProperty.call(record, 'AIHints');

        // --fix-refs モード: AIHints が既にあるレコードの reference_images のみ再構築。
        // タグ・テキスト類は一切変更しない。
        if (opts.fixRefs) {
            if (!hasAihints) {
                results.push({ num, status: 'skipped-no-aihints' });
                continue;
            }
            const imageInfo = resolveImageInfo(record, opts.work, opts.db);
            text = fixRefsInRecord(text, openIdx, closeIdx, imageInfo);
            results.push({ num, status: 'refs-fixed' });
            continue;
        }

        // --fill-todos モード: JSON から導出できる TODO 項目のみ補完。
        // palette / 髪・目・衣装など視覚系は変更しない。
        if (opts.fillTodos) {
            if (!hasAihints) {
                results.push({ num, status: 'skipped-no-aihints' });
                continue;
            }
            const { text: newText, changed } = fillJsonTodosInRecord(text, openIdx, closeIdx, record);
            text = newText;
            results.push({ num, status: changed ? 'todos-filled' : 'todos-unchanged' });
            continue;
        }

        // --upgrade-schema モード: 既存 AIHints に欠落している新スキーマフィールドを差分追加。
        // 既存タグ・テキスト・reference_images は一切変更しない。
        if (opts.upgradeSchema) {
            if (!hasAihints) {
                results.push({ num, status: 'skipped-no-aihints' });
                continue;
            }
            const { text: newText, changed } = upgradeAihintsSchemaInRecord(
                text, openIdx, closeIdx, record, opts.work,
            );
            text = newText;
            results.push({ num, status: changed ? 'schema-upgraded' : 'schema-unchanged' });
            continue;
        }

        // --apply-vision-results モード: Agent の画像解析結果を AIHints の視覚 TODO に適用。
        // .cache/vision-results.json から読み込んだ Map を opts.visionResultsMap に期待する。
        if (opts.applyVisionResults) {
            if (!hasAihints) {
                results.push({ num, status: 'skipped-no-aihints' });
                continue;
            }
            const vRes = opts.visionResultsMap?.get(num);
            if (!vRes) {
                results.push({ num, status: 'vision-no-result' });
                continue;
            }
            const { aihints: newAihints, changed } = applyVisionResultsToAihints(record.AIHints, vRes);
            if (!changed) {
                results.push({ num, status: 'vision-unchanged' });
                continue;
            }
            const block = stringifyAihintsBlock(newAihints);
            text = replaceAihintsInRecord(text, openIdx, closeIdx, block);
            results.push({ num, status: 'vision-applied' });
            continue;
        }

        if (hasAihints && !opts.force) {
            results.push({ num, status: 'skipped-existing' });
            continue;
        }

        const imageInfo = resolveImageInfo(record, opts.work, opts.db);
        const hasAnyImage = imageInfo.corefolderUrl !== null
            || imageInfo.humanoidImages.length > 0
            || imageInfo.common.concept !== null
            || imageInfo.common.concept_variants.length > 0
            || imageInfo.common.catalog !== null
            || imageInfo.common.design_sheet !== null;
        if (!hasAnyImage) {
            results.push({ num, status: 'skipped-no-image', note: 'no corefolder / humanoid / common reference image found' });
            continue;
        }

        const scaffold = opts.suggest
            ? buildSuggestedScaffold(record, imageInfo, opts.work)
            : buildScaffold(record, imageInfo, opts.work);
        const block = stringifyAihintsBlock(scaffold);

        if (hasAihints && opts.force) {
            // 既存 AIHints を置換（テキスト範囲を特定して差し替え）
            text = replaceAihintsInRecord(text, openIdx, closeIdx, block);
            results.push({ num, status: 'overwritten' });
        } else {
            // レコードの最後のプロパティとして挿入
            text = appendAihintsToRecord(text, openIdx, closeIdx, block);
            results.push({ num, status: 'patched' });
        }
    }
    return { newText: text, results };
}

/**
 * レコード末尾（`}`）の直前に AIHints プロパティを挿入する。
 * 直前の最後のプロパティ行末に `,` を追加し、新規行で AIHints を書く。
 *
 * @param {string} text
 * @param {number} openIdx  レコード `{` のインデックス（参考）
 * @param {number} closeIdx レコード `}` のインデックス
 * @param {string} block    AIHints 値の JSON テキスト（先頭インデント無し、改行で複数行）
 * @returns {string}
 */
function appendAihintsToRecord(text, openIdx, closeIdx, block) {
    // closeIdx の前で、最後の非空白文字（最終プロパティの行末）を探す。
    let j = closeIdx - 1;
    while (j > openIdx && /\s/.test(text[j])) j--;
    // 最終プロパティ末尾文字（通常は `}` or `"` or `]` or 数字 or `null` の末尾）
    const beforeChar = text[j];
    // 末尾文字の直後にカンマを追加 → 改行 → 4スペース + `"AIHints": <block>` → 改行 → 既存の `}` までの空白
    // closeIdx 直前の空白は元の改行 + インデント。それを尊重して挿入する。
    const tail = text.slice(j + 1, closeIdx); // 通常 `\n  ` （レコード閉じ括弧の前のインデント）
    // 挿入後の構成: `<beforeChar>,\n    "AIHints": <block><tail>}`
    const insertion = `,\n    "AIHints": ${block}`;
    return text.slice(0, j + 1) + insertion + tail + text.slice(closeIdx);
}

/**
 * 既存の `"AIHints": { ... }` ブロックをまるごと差し替える（--force 用）。
 * @param {string} text
 * @param {number} openIdx
 * @param {number} closeIdx
 * @param {string} block
 */
function replaceAihintsInRecord(text, openIdx, closeIdx, block) {
    // レコード範囲内で `"AIHints"` キーを探す（文字列内一致だが、レコード内に他で出現しない前提で十分）。
    const recSlice = text.slice(openIdx, closeIdx + 1);
    const keyRel = recSlice.indexOf('"AIHints"');
    if (keyRel < 0) throw new Error(`AIHints key not found in record at ${openIdx}`);
    const keyAbs = openIdx + keyRel;
    // キー後の `:` を探す
    let p = keyAbs + '"AIHints"'.length;
    while (p < closeIdx && text[p] !== ':') p++;
    p++; // skip ':'
    while (p < closeIdx && /\s/.test(text[p])) p++;
    if (text[p] !== '{') throw new Error(`AIHints value is not an object at ${p}`);
    const valOpen = p;
    const valClose = findMatchingBrace(text, valOpen);
    return text.slice(0, valOpen) + block + text.slice(valClose + 1);
}

// ────────────────────────────────────────────────────────────────────────────
// エントリポイント
// ────────────────────────────────────────────────────────────────────────────

function main() {
    const opts = parseArgs(process.argv.slice(2));
    const dbPath = path.join(
        REPO_ROOT, 'data', `Works_${opts.work}`, 'DataBases', `db_${opts.db}.json`,
    );
    if (!fs.existsSync(dbPath)) {
        console.error(`DB file not found: ${dbPath}`);
        process.exit(1);
    }

    // ---- AI_Optout ガード ----
    // 同作品の db_meta.json を参照し、対象 DB に `AI_Optout: true` がある場合は
    // 原則全モード（suggest / fill-todos / fix-refs / gen-vision-tasks / apply-vision-results）を拒否する。
    // メタ欠損時はチェックをスキップ（既存の DB_Hidden / Works_Hidden と同じ耐性設計）。
    // --force-ai-optout で明示的バイパス可能。
    const dbMetaPath = path.join(
        REPO_ROOT, 'data', `Works_${opts.work}`, 'DataBases', 'db_meta.json',
    );
    if (fs.existsSync(dbMetaPath)) {
        try {
            const dbMeta = JSON.parse(fs.readFileSync(dbMetaPath, 'utf8'));
            const dbEntry = dbMeta?.Databases?.[`#DB_${opts.db}`]
                ?? dbMeta?.Databases?.[`#Ref_${opts.db}`];
            if (dbEntry?.AI_Optout === true) {
                if (opts.forceAiOptout) {
                    console.warn(`[WARN] AI_Optout: true の DB を --force-ai-optout でバイパスします: ${path.relative(REPO_ROOT, dbPath)}`);
                } else {
                    console.error(`[ABORT] 対象 DB は AI_Optout: true が設定されています: ${path.relative(REPO_ROOT, dbPath)}`);
                    console.error('  この DB への AI タグ生成・視覚解析適用・scaffold 作成は拒否されました。');
                    console.error('  どうしても適用したい場合は --force-ai-optout を付与して再実行してください。');
                    process.exit(2);
                }
            }
        } catch (e) {
            // db_meta.json が不正な場合は警告だけ出して継続（止めるほどではない）
            console.warn(`[WARN] db_meta.json の読み込みに失敗 (AI_Optout チェックをスキップ): ${e.message}`);
        }
    }

    const original = fs.readFileSync(dbPath, 'utf8');

    // 念のため事前に JSON 全体パースして整合性を確認
    try {
        JSON.parse(original);
    } catch (e) {
        console.error(`Source DB is not valid JSON: ${e.message}`);
        process.exit(1);
    }

    // --gen-vision-tasks モード: 読み取り専用でタスクマニフェストを生成して終了。
    if (opts.genVisionTasks) {
        const db = JSON.parse(original);
        genVisionTasksToFile(db, opts);
        return;
    }

    // --apply-vision-results モード: vision-results.json を読み込んで Map に変換し opts に注入。
    if (opts.applyVisionResults) {
        const visionPath = path.join(REPO_ROOT, '.cache', 'vision-results.json');
        if (!fs.existsSync(visionPath)) {
            console.error(`vision-results.json not found: ${visionPath}`);
            console.error('Agent の画像解析セッションで .cache/vision-results.json を先に作成してください。');
            process.exit(1);
        }
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(visionPath, 'utf8'));
        } catch (e) {
            console.error(`vision-results.json の解析に失敗: ${e.message}`);
            process.exit(1);
        }
        opts.visionResultsMap = new Map(raw.map(r => [r.num, r]));
        console.log(`Loaded vision-results.json: ${opts.visionResultsMap.size} entries`);
    }

    const { newText, results } = patchFileText(original, opts);

    // 結果サマリ
    const counts = {
        patched: 0, 'skipped-existing': 0, 'skipped-no-image': 0, overwritten: 0,
        'refs-fixed': 0,
        'todos-filled': 0, 'todos-unchanged': 0,
        'schema-upgraded': 0, 'schema-unchanged': 0,
        'vision-applied': 0, 'vision-unchanged': 0, 'vision-no-result': 0,
        'skipped-no-aihints': 0,
    };
    for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
    results.sort((a, b) => a.num - b.num);

    console.log(`\n=== patch-aihints summary (${opts.apply ? 'APPLY' : 'dry-run'}${opts.suggest ? ' / suggest' : ''}) ===`);
    console.log(`  DB: ${path.relative(REPO_ROOT, dbPath)}`);
    console.log(`  target: ${opts.records ? `[${[...opts.records].sort((a,b)=>a-b).join(',')}]` : 'ALL'}`);
    if (opts.fixRefs) {
        console.log(`  refs-fixed=${counts['refs-fixed']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else if (opts.fillTodos) {
        console.log(`  todos-filled=${counts['todos-filled']}, todos-unchanged=${counts['todos-unchanged']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else if (opts.upgradeSchema) {
        console.log(`  schema-upgraded=${counts['schema-upgraded']}, schema-unchanged=${counts['schema-unchanged']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else if (opts.applyVisionResults) {
        console.log(`  vision-applied=${counts['vision-applied']}, vision-unchanged=${counts['vision-unchanged']}, vision-no-result=${counts['vision-no-result']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else {
        console.log(`  patched=${counts.patched}, overwritten=${counts.overwritten}, skipped-existing=${counts['skipped-existing']}, skipped-no-image=${counts['skipped-no-image']}`);
    }
    if (opts.verbose || !opts.apply) {
        for (const r of results) {
            const note = r.note ? `  // ${r.note}` : '';
            console.log(`    #${r.num}: ${r.status}${note}`);
        }
    }

    if (newText === original) {
        console.log('\nNo changes to write.');
        return;
    }

    // 書き込み後の JSON 妥当性を保証
    try {
        JSON.parse(newText);
    } catch (e) {
        console.error(`\nERROR: patched text is not valid JSON. Aborting without writing.\n  ${e.message}`);
        process.exit(1);
    }

    if (!opts.apply) {
        console.log('\n(dry-run) Use --apply to write changes.');
        return;
    }

    fs.writeFileSync(dbPath, newText, 'utf8');
    console.log(`\nWrote ${path.relative(REPO_ROOT, dbPath)}`);
}

// CLI として直接実行された場合のみ main() を起動する（import 時の副作用を防ぐ）。
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
    || import.meta.url.endsWith(path.basename(process.argv[1] ?? ''))) {
    main();
}
