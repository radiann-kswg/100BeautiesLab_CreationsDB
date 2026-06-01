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
            set.add(Number(chunk));
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
  --all               全レコード対象
  --apply             実書き込み（指定しない場合は dry-run）
  --force             既存 AIHints がある場合も上書き
  --suggest           TailsUnit / GenderType / Character 等から候補値を自動導出して埋める（半自動）
                      視覚情報が必要な項目（palette / 髪・目など）は TODO / 翻訳ヒント形式で残す
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

    // ── corefolder: `emstk_corefolder<N>-1.png` を最優先で採用 ─────────
    const corePaths = Array.isArray(imgs.corefolder_PNGPath) ? imgs.corefolder_PNGPath : [];
    if (corePaths.length > 0) {
        const first = String(corePaths[0]);
        out.corefolderUrl = urlIfExists('corefolder', first);
    }

    // ── humanoid: arts_PNGPath の `humanoids/<…>/art_img<N>-humanoid<variant?>` ───
    const artsPaths = Array.isArray(imgs.arts_PNGPath) ? imgs.arts_PNGPath : [];
    for (const raw of artsPaths) {
        const rel = String(raw);
        if (!rel.startsWith('humanoids/')) continue;
        const m = rel.match(/art_img(\d+)-humanoid([A-Za-z0-9]*)$/);
        if (!m) continue;
        if (Number(m[1]) !== num) continue; // 安全側: Num 一致のみ採用
        const fname = `${path.basename(rel)}.png`;
        const subdir = path.dirname(rel); // e.g. "humanoids/2023"
        const abs = path.join(imagesRoot, 'arts', subdir, fname);
        if (!fs.existsSync(abs)) continue;
        const url = `${PUBLIC_ORIGIN}/data/Works_${work}/Images/${dbFolder}/arts/${subdir}/${fname}`;
        const label = m[2] || 'main';
        out.humanoidImages.push({ url, label });
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
 * @returns {any} AIHints オブジェクト
 */
function buildScaffold(record, imageInfo) {
    const num = record.Num;
    const genderTag = genderTagOf(record.GenderType);
    const ageBand = ageBandOf(record.ConceptAge);

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
        forms.corefolder = buildCorefolderForm(num, genderTag, ageBand, imageInfo.corefolderUrl);
    } else {
        // 画像が無い場合は null（schema 上 #Null 許容）。User が後で書き換える前提。
        forms.corefolder = null;
    }

    // humanoid form
    if (imageInfo.humanoidImages.length > 0) {
        forms.humanoid = buildHumanoidForm(num, genderTag, ageBand, imageInfo.humanoidImages);
    }
    // humanoid 画像が無ければ humanoid キーごと省略（schema は omittable）

    return { common, forms };
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
 * @param {number} num
 * @param {string} genderTag
 * @param {string} ageBand
 * @param {string} url
 */
function buildCorefolderForm(num, genderTag, ageBand, url) {
    return {
        form_tags: ['corefolder form'],
        outfit_features: [
            'TODO: outfit items (hoodie, harness, marking, etc.)',
        ],
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
        reference_images: { main: url },
    };
}

/**
 * @param {number} num
 * @param {string} genderTag
 * @param {string} ageBand
 * @param {Array<{url: string, label: string}>} images
 */
function buildHumanoidForm(num, genderTag, ageBand, images) {
    // main は最初の要素を採用。variants は2件目以降を `{label: url}` で蓄積。
    const main = images[0].url;
    /** @type {Record<string, string>} */
    const refs = { main };
    for (let k = 1; k < images.length; k++) {
        const { url, label } = images[k];
        // ラベル衝突を避けるためサフィックスで一意化
        let key = label || `variant${k}`;
        if (refs[key] !== undefined) key = `${key}_${k}`;
        refs[key] = url;
    }
    return {
        form_tags: ['humanoid form'],
        outfit_features: [
            'TODO: humanoid outfit items',
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
function parseTailsUnit(tailsUnit) {
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
function buildTailDescription(tu) {
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
function extractExpressionHints(characterText) {
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
 * @param {string} url
 * @param {any} record
 * @returns {any}
 */
function buildSuggestedCorefolderForm(num, genderTag, ageBand, tu, url, record) {
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
        ai_tags: aiTags,
        negative_visuals: negativeVisuals,
        natural_language_description: inStoryHint,
        prompt_export: promptExport,
        negative_prompt_export: negExport,
        reference_images: { main: url },
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
 * @returns {any}
 */
function buildSuggestedHumanoidForm(num, genderTag, ageBand, tu, images, record) {
    const main = images[0].url;
    /** @type {Record<string, string>} */
    const refs = { main };
    for (let k = 1; k < images.length; k++) {
        const { url, label } = images[k];
        let key = label || `variant${k}`;
        if (refs[key] !== undefined) key = `${key}_${k}`;
        refs[key] = url;
    }

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
 * @returns {any} AIHints オブジェクト
 */
function buildSuggestedScaffold(record, imageInfo) {
    const num = record.Num;
    const genderTag = genderTagOf(record.GenderType);
    const ageBand = ageBandOf(record.ConceptAge);
    const tu = parseTailsUnit(record.TailsUnit);
    const exprHints = extractExpressionHints(record.Character);
    const tailDesc = buildTailDescription(tu);
    const earTag = tu?.animal ? `${tu.animal} ears` : null;

    // identity_tags: Num + 動物種 + TODO（視覚的識別子は Agent / 手動で補完）
    const identityTags = [`number '${num}' as core identifier`];
    if (tu?.animal) identityTags.push(`${tu.animal}-type android unit`);
    identityTags.push('TODO: add 2-3 distinctive visual identity tags');

    // silhouette_features: 耳・尾は確定。髪/目は視覚情報が必要なため TODO。
    const silhouetteFeatures = [];
    if (earTag) silhouetteFeatures.push(earTag);
    silhouetteFeatures.push(tailDesc);
    silhouetteFeatures.push('TODO: hair color and length');
    silhouetteFeatures.push('TODO: eye color');

    // immutable_traits: 構造的に変わらない形質（動物耳・尾の種類/本数）
    const immutableTraits = ['digital construct (NumberTales unit)'];
    if (earTag) immutableTraits.push(`${earTag} (immutable)`);
    if (tu?.animal) {
        const tailSpec = tu.count != null
            ? `${tu.branching ? 'branching ' : ''}${tu.animal} ${tu.count > 1 ? `${tu.count} tails` : 'single tail'} (immutable count)`
            : `${tu.animal} tail(s) (immutable)`;
        immutableTraits.push(tailSpec);
    }
    immutableTraits.push('TODO: number marking location (e.g., engraved on shoulder)');

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
        );
    } else {
        forms.corefolder = null;
    }

    if (imageInfo.humanoidImages.length > 0) {
        forms.humanoid = buildSuggestedHumanoidForm(
            num, genderTag, ageBand, tu, imageInfo.humanoidImages, record,
        );
    }

    return { common, forms };
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
 * @property {'patched'|'skipped-existing'|'skipped-no-image'|'overwritten'} status
 * @property {string} [note]
 */

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
        if (typeof num !== 'number') continue;
        if (opts.records !== null && !opts.records.has(num)) continue;

        const hasAihints = Object.prototype.hasOwnProperty.call(record, 'AIHints');
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
            ? buildSuggestedScaffold(record, imageInfo)
            : buildScaffold(record, imageInfo);
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
    const original = fs.readFileSync(dbPath, 'utf8');

    // 念のため事前に JSON 全体パースして整合性を確認
    try {
        JSON.parse(original);
    } catch (e) {
        console.error(`Source DB is not valid JSON: ${e.message}`);
        process.exit(1);
    }

    const { newText, results } = patchFileText(original, opts);

    // 結果サマリ
    const counts = { patched: 0, 'skipped-existing': 0, 'skipped-no-image': 0, overwritten: 0 };
    for (const r of results) counts[r.status]++;
    results.sort((a, b) => a.num - b.num);

    console.log(`\n=== patch-aihints summary (${opts.apply ? 'APPLY' : 'dry-run'}${opts.suggest ? ' / suggest' : ''}) ===`);
    console.log(`  DB: ${path.relative(REPO_ROOT, dbPath)}`);
    console.log(`  target: ${opts.records ? `[${[...opts.records].sort((a,b)=>a-b).join(',')}]` : 'ALL'}`);
    console.log(`  patched=${counts.patched}, overwritten=${counts.overwritten}, skipped-existing=${counts['skipped-existing']}, skipped-no-image=${counts['skipped-no-image']}`);
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

main();
