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
 * @property {boolean} migrateSilhouetteStructure  true なら既存 `silhouette_notes: #String[]` を `{ body_description, attached_items }` 構造へ機械分類で移行する
 * @property {boolean} rewriteCorefolderNld  true なら corefolder.natural_language_description を球体本体テンプレで再生成する（humanoid 衣装語を排除）
 * @property {boolean} forceRewriteNld  true なら既に確定済みのテンプレ風 NLD も上書き対象にする
 * @property {boolean} genVisionTasks  true なら視覚 TODO のあるレコードの画像リストを .cache/vision-tasks.json に出力して終了
 * @property {boolean} applyVisionResults  true なら .cache/vision-results.json の解析結果を AIHints の視覚 TODO に適用
 * @property {Map<number,Object>|null} visionResultsMap  applyVisionResults 時に main() が注入する Map<num, VisionResult>
 * @property {boolean} applyAppearanceDetail  true なら `AppearanceDetail`（構造化フィールド）を正として AIHints の AI タグ系を再構築する。
 *   `IdentityMotif`（自由文）の後継として将来的な完全移行を見据えた並行モード。詳細は buildAihintsFromAppearanceDetail 参照
 * @property {boolean} forceAiOptout  true なら db_meta.json の `AI_Optout: true` ガードをバイパスする（緊急時のみ）
 * @property {Map<string,boolean>} secondaryOptoutMap  sec_SeriesTitle → AI_Optout。main() が _Secondaries から構築して注入
 * @property {boolean} secondaryDefaultOptout  sec_SeriesTitle が null のデフォルトエントリに AI_Optout: true がある場合
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
        migrateSilhouetteStructure: false,
        rewriteCorefolderNld: false,
        forceRewriteNld: false,
        genVisionTasks: false,
        applyVisionResults: false,
        visionResultsMap: null,
        applyAppearanceDetail: false,
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
            case '--migrate-silhouette-structure': opts.migrateSilhouetteStructure = true; break;
            case '--rewrite-corefolder-nld': opts.rewriteCorefolderNld = true; break;
            case '--force-rewrite-nld': opts.forceRewriteNld = true; break;
            case '--apply-identitymotif': opts.applyIdentityMotif = true; break;
            case '--apply-appearancedetail': opts.applyAppearanceDetail = true; break;
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
                      ※ 2026-06-09 以降、silhouette_notes は { body_description, attached_items } object 形式で生成する
  --migrate-silhouette-structure  既存の flat array 形式 silhouette_notes を
                      { body_description: [...], attached_items: [...] } object 形式へ機械分類で移行する
                      humanoid 衣装語（coat / dress / shoes 等）は attached_items 側へ分類
                      レビュー 2026-06-09 対応専用モード。冪等
  --rewrite-corefolder-nld  forms.corefolder.natural_language_description を球体本体テンプレで再生成する
                      テンプレ: "Corefolder form: a spherical cushion-like body in {base color},
                                with the number '{N}' {marking placement}; {key accessory if any}."
                      {base color} は silhouette_notes.body_description から、
                      {marking placement} は common.immutable_traits の number marking 行から抽出する
                      抽出失敗時は "TODO:" マーカーを残してログに警告を出す
                      既存値が "[TRANSLATE" / "A corefolder form character featuring" / "Corefolder form: ...wears..." 形式の場合は無条件で再生成
                      既に球体本体テンプレ形式の場合はスキップ（--force-rewrite-nld で上書き可）
  --force-rewrite-nld  既に球体本体テンプレ形式の corefolder NLD も上書き再生成する
  --apply-identitymotif   レコードの IdentityMotif フィールドを **正** として AIHints の AI タグ系を再構築する
                      対象 (rebuild): forms.<formation>.form_tags / outfit_features / silhouette_notes
                                      / ai_tags / negative_visuals / prompt_export / negative_prompt_export
                                      / natural_language_description (corefolder のみ template 生成)
                                      common.identity_tags / silhouette_features (formation 共通部分)
                      対象 (structural default 再投入): forms.corefolder.immutable_constraints
                                      / negative_keywords / silhouette_notes.body_description 先頭行
                      対象 (clear to null): forms.humanoid.immutable_constraints / negative_keywords
                                      / natural_language_description
                                      common.immutable_traits / expression_tendency / palette_priority
                                      / natural_language_description
                      据え置き: common.age_appearance / reference_images
                                      forms.*.reference_images / work_common / alt_modes
                      IdentityMotif が無い/全空のレコードは AI タグ系を空配列にクリアして fallback
                      IdentityMotif の Motif_EN を keyword 分類辞書で form_tags / outfit_features
                      / silhouette_notes.body_description / silhouette_notes.attached_items に振り分ける
                      未分類エントリは outfit_features 末尾に追記して取りこぼしを防ぐ
                      negative_visuals は対向 formation の Motif_EN diff から body 系を除外して構築
  --apply-appearancedetail  レコードの AppearanceDetail（構造化フィールド）を **正** として AIHints の AI タグ系を再構築する
                      IdentityMotif の後継を見据えた並行モード（IdentityMotif は据え置き、上書きしない）
                      Formation（null=共通 / corefolder / humanoid）と DesignElement（Motif / CostumeItem / Expression /
                      Ear / BodyType / Halo / Emblem / Tag / NumberMark）で機械的に分類し、Attrs（vdict_* / value_* / about_*）
                      から英語フレーズを合成する。TailsUnit / Height_cm / ConceptAge は引き続き構造的正源として優先
                      DesignElement=NumberMark → immutable_traits（common は Formation=null のみ、corefolder NLD へも反映）
                      DesignElement=Expression → common.expression_tendency（IdentityMotif モードでは未対応だった項目）
                      AppearanceDetail が無い/全空のレコードは AI タグ系を空配列にクリアして fallback（IdentityMotif モードと同じ規約）
                      value_EN が欠落し value_JP のみ使えた場合は [JA] ... 付きで出力し警告ログに記録（要手動翻訳）
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
];

/** コアフォルダ形態でキャラ別に明示するフラットなブラックリスト（画像生成 AI の混入対策） */
const COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS = [
    'feet', 'legs', 'shoes', 'high heels',
    'arms', 'hands',
    'hoodie', 'blazer', 'fashion outfit',
    'bound by rope',
];

/** コアフォルダ形態の標準シルエット記述を object 形式で返すヘルパー。
 *
 * 2026-06-09 以降、`silhouette_notes` は flat array ではなく
 * `{ body_description: #String[], attached_items: #String[] }` の object 形式で表現される。
 * structural default は body_description 側にだけ投入し、attached_items はキャラ固有の
 * リボン / スカーフ / ハーネス / ハロー 等を User が追記するスロットとして空配列で生成する。
 *
 * @param {number|string} num    対象レコードの Num（TODO プレースホルダ生成用）
 * @param {'corefolder'|'humanoid'} formKey
 * @returns {{ body_description: string[], attached_items: string[] }}
 */
function buildDefaultSilhouetteNotes(num, formKey) {
    const isCorefolder = formKey === 'corefolder';
    if (isCorefolder) {
        return {
            body_description: [
                'spherical core body with the head as the only protruding part on top',
                `TODO: 1-2 lines of character-specific body description for #${num} (base color, surface markings, facial expression typical)`,
            ],
            attached_items: [
                `TODO: list character-specific attached items for #${num} (ribbon / collar / scarf / hairband / harness etc. - NO humanoid clothing words like coat / dress / pants / shoes)`,
            ],
        };
    }
    return {
        body_description: [
            `TODO: 1-2 lines describing the ${formKey} form body / silhouette for #${num}`,
        ],
        attached_items: [
            `TODO: list character-specific attached items / accessories for the ${formKey} form of #${num}`,
        ],
    };
}

/**
 * 既存の flat array 形式 silhouette_notes を
 * `{ body_description, attached_items }` object 形式へ機械分類するヘルパー。
 *
 * 分類ロジック（キーワードベース、例外ケースはトレース出力）:
 * - 以下のキーワードを含む entry は attached_items として分類:
 *   harness / ribbon / hairband / hair clip / hair pin / hairpiece / hair bundle
 *   / head ornament / scarf / collar / choker / halo / nimbus / shawl / cape
 *   / cloak / blindfold / wristband / cuffs / hood / charm / tag / pin / brooch
 *   / beads / necklace / earring / bow / bell / accessory / wrapped around / draped
 *   / container / case / enclosed / barrel-shaped / hazard / warning-stand
 *   / caution stripe / sleeping pose / curled up
 * - それ以外は body_description として分類。
 * - なお表情や expression typical の記述は顔面に関する body_description として扱う。
 *
 * @param {string[]} entries
 * @returns {{ body_description: string[], attached_items: string[] }}
 */
function migrateSilhouetteFlatArray(entries) {
    /** @type {{ body_description: string[], attached_items: string[] }} */
    const out = { body_description: [], attached_items: [] };
    if (!Array.isArray(entries)) return out;

    const ATTACHED_RE = /(harness|\bribbon\b|\bhairband\b|hair ?clip|hair ?pin|hairpiece|hair bundle|head ornament|\bscarf\b|\bcollar\b|\bchoker\b|\bhalo\b|nimbus|\bshawl\b|\bcape\b|\bcloak\b|\bblindfold\b|\bwristband\b|\bcuffs\b|\bhood\b|\bcharm\b|\bbrooch\b|\bbeads\b|necklace|earring|\bbow\b|\bbell\b|accessory|wrapped around|wrapped by|draped (?:over|under|across)|container|\bcase\b|enclosed in|barrel-shaped|hazard|warning-stand|caution stripe|caution\/hazard|sleeping pose|curled up|curled-up|chest tag|chest patch|trial \/ test version|under adjustment|cargo case)/i;

    for (const raw of entries) {
        if (typeof raw !== 'string' || raw.length === 0) continue;
        const stripped = raw.trim();
        if (!stripped) continue;
        // 構造デフォルト（球体本体の記述）は必ず body_description
        if (/^spherical core body /i.test(stripped) || /head as the only protruding/i.test(stripped)) {
            out.body_description.push(stripped);
            continue;
        }
        // TODO プレースホルダは表現により振り分け
        if (/^TODO:/i.test(stripped)) {
            if (ATTACHED_RE.test(stripped)) out.attached_items.push(stripped);
            else out.body_description.push(stripped);
            continue;
        }
        // attached_items キーワードを含む entry は attached_items へ
        if (ATTACHED_RE.test(stripped)) {
            out.attached_items.push(stripped);
        } else {
            out.body_description.push(stripped);
        }
    }

    // どちらも空にならないように、空の側に TODO を一列追加（スキーマは #String[] または #Null だが、
    // 空配列と null の使い分けにブレを作らないため attached_items が空の場合はそのまま空配列とする）。
    return out;
}

// ─────────────────────────────────────────────────────────────────────
// corefolder.natural_language_description テンプレ生成ヘルパー
//
// テンプレ: "Corefolder form: a spherical cushion-like body in {base color},
//          with the number '{N}' {marking placement}; {key accessory if any}."
//
// {base color} は silhouette_notes.body_description から、
// {marking placement} は common.immutable_traits の number marking 行から抽出する。
// humanoid 衣装語（coat / dress / hoodie / blazer / pants / shoes 等）は一切参照しない。
// ─────────────────────────────────────────────────────────────────────

/**
 * body_description 配列から base color を抽出するヘルパー。
 * 例: "vivid yellow base coloring with paler yellow tail tips" → "vivid yellow"
 *      "reddish-pink fox with peach gradient on the body" → "reddish-pink"
 *      "warm brown / chestnut base coloring with pink-tipped tails" → "warm brown / chestnut"
 *
 * @param {string[]|undefined} bodyDescriptions
 * @returns {string|null}
 */
function extractBaseColor(bodyDescriptions) {
    if (!Array.isArray(bodyDescriptions)) return null;
    for (const raw of bodyDescriptions) {
        if (typeof raw !== 'string' || /^TODO:/i.test(raw) || /^spherical core body /i.test(raw)) continue;
        const lower = raw.trim();
        // pattern 1: "X base coloring" / "X base color"
        let m = lower.match(/^([A-Za-z][A-Za-z\-\s\/]*?)\s+base\s+color(?:ing)?\b/i);
        if (m) return m[1].trim().replace(/\s+/g, ' ');
        // pattern 2: "X fox with ..."
        m = lower.match(/^([A-Za-z][A-Za-z\-\s\/]*?)\s+fox\s+with\b/i);
        if (m) return m[1].trim().replace(/\s+/g, ' ');
        // pattern 3: "X fox" 誮頭
        m = lower.match(/^([A-Za-z][A-Za-z\-\s\/]*?)\s+fox\b/i);
        if (m) return m[1].trim().replace(/\s+/g, ' ');
        // pattern 4: "X palette" / "X coloring"
        m = lower.match(/^([A-Za-z][A-Za-z\-\s\/]*?)\s+(palette|coloring)\b/i);
        if (m) return m[1].trim().replace(/\s+/g, ' ');
    }
    return null;
}

/**
 * common.immutable_traits から number marking 情報を抽出するヘルパー。
 * 返り値は `{ kind: 'normal'|'none', phrase: string }` または null。
 *
 * 抽出ルール:
 * - "no number marking is drawn ..." 型は kind='none' で固定句を返す
 * - "small/dark/green/colored ... number 'N' marking ..." → "number 'N' marking ..."
 * - "number identifier (is rendered as ...)" → "number identifier rendered as ..."
 * - "Roman-numeral 'X' marking ..." / "kanji '...' marking ..." → そのまま
 * - 中央の "is rendered" / "is printed" などは "rendered" / "printed" に短縮
 * - 末尾の "single fixed slot" / "only one slot" / "no separate ..." / "no Arabic-numeral ..." は除去
 *
 * @param {string[]|undefined} immutableTraits
 * @param {number|string} num
 * @returns {{ kind: 'normal'|'none', phrase: string } | null}
 */
function extractMarkingInfo(immutableTraits, num) {
    if (!Array.isArray(immutableTraits)) return null;
    const numEsc = String(num).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const trimTail = (s) => s
        .replace(/[,;]\s*single fixed slot\b.*$/i, '')
        .replace(/[,;]\s*only one slot\b.*$/i, '')
        .replace(/[,;]\s*no separate\b.*$/i, '')
        .replace(/[,;]\s*no Arabic-numeral\b.*$/i, '')
        .replace(/\s+$/, '')
        .trim();

    // 中央の "is rendered" → "rendered" 短縮（複数回該当を許容）
    const normalizeVerbs = (s) => s
        .replace(/\bis\s+(rendered|printed|drawn|written|marked|displayed|shown|formatted|inscribed|embroidered|split|placed|positioned|located|stamped|engraved|etched)\b/gi, '$1')
        .replace(/\bare\s+(rendered|printed|drawn|written|marked|displayed|shown|formatted|inscribed|embroidered|split|placed|positioned|located|stamped|engraved|etched)\b/gi, '$1');

    const SUBJECT_RE = /\b(number|marking|Roman[\- ]numeral|kanji|katakana|hiragana)\b/i;
    const numToken = new RegExp(`['"‘’]?#?${numEsc}['"‘’]?`);

    for (const t of immutableTraits) {
        if (typeof t !== 'string') continue;
        const trimmed = t.trim();
        // 'none' 系: マーキングなしを明示している
        if (/^no\s+(number\s+|Arabic[- ]numeral\s+|kanji\s+)?marking\s+(is\s+)?drawn\b/i.test(trimmed)
            || /^no\s+number\s+identifier\s+is\s+printed\b/i.test(trimmed)) {
            return { kind: 'none', phrase: 'no number identifier printed on the body' };
        }

        const sm = trimmed.match(SUBJECT_RE);
        if (!sm) continue;

        // この entry が対象 num の marking 記述か簡易判定
        const hasOurNumber = numToken.test(trimmed);
        const isGenericIdentifier = /\bnumber\s+identifier\b/i.test(trimmed);
        const isAlternateRendering = /\b(Roman[\- ]numeral|kanji|katakana|hiragana)\b/i.test(trimmed);
        const hasMarking = /\bmarking\b/i.test(trimmed);
        if (!hasOurNumber && !isGenericIdentifier && !isAlternateRendering && !hasMarking) continue;

        // subject keyword 位置から抽出して動詞短縮 → 末尾 trim
        let phrase = trimmed.slice(sm.index);
        phrase = normalizeVerbs(phrase);
        phrase = trimTail(phrase);
        return { kind: 'normal', phrase };
    }
    return null;
}

/**
 * attached_items 配列から代表アクセサリ句を抽出するヘルパー。
 * 先頭 1 件を採用し、";" で区切られていれば最初のクラストだけを返す。
 * TODO プレースホルダと "expression typical" 以降の表情記述は除去する。
 *
 * @param {string[]|undefined} attachedItems
 * @returns {string|null}
 */
function extractAccessoryPhrase(attachedItems) {
    if (!Array.isArray(attachedItems) || attachedItems.length === 0) return null;
    for (const raw of attachedItems) {
        if (typeof raw !== 'string' || /^TODO:/i.test(raw)) continue;
        const clauses = raw.split(/;/);
        let phrase = clauses[0].trim();
        // "...; consistently X expression typical" 型の末尾を除去
        phrase = phrase.replace(/,?\s*consistently\b[^,]*?expression typical\b.*$/i, '');
        phrase = phrase.replace(/,?\s*expression typical\b.*$/i, '');
        if (phrase) return phrase.trim();
    }
    return null;
}

/**
 * 上記ヘルパーを組み合わせて corefolder.natural_language_description をテンプレ付与する。
 * 抽出不可ケースでは TODO マーカーを残して警告をログに出す。
 *
 * @param {any} record  パース済みレコード
 * @param {{ warnings?: string[] }} [diag]  警告収集用
 * @returns {string|null}
 */
function buildCorefolderNldFromTemplate(record, diag) {
    const cf = record?.AIHints?.forms?.corefolder;
    if (!cf) return null;
    const num = record.Num;
    const sn = cf.silhouette_notes;
    // 新構造 (object) / 旧構造 (flat array) の両方を許容
    /** @type {string[]} */
    let body, attached;
    if (sn && !Array.isArray(sn) && typeof sn === 'object') {
        body = Array.isArray(sn.body_description) ? sn.body_description : [];
        attached = Array.isArray(sn.attached_items) ? sn.attached_items : [];
    } else if (Array.isArray(sn)) {
        const migrated = migrateSilhouetteFlatArray(sn);
        body = migrated.body_description;
        attached = migrated.attached_items;
    } else {
        body = [];
        attached = [];
    }

    // body_description で抽出できない場合は attached_items 側もフォールバックとして試みる
    // （migration で body 記述と accessory 記述が混じった entry が attached_items に入った場合の救済）
    const baseColor = extractBaseColor(body) ?? extractBaseColor(attached);
    const marking = extractMarkingInfo(record.AIHints?.common?.immutable_traits, num);
    const accessory = extractAccessoryPhrase(attached);
    const numStr = String(num);

    const colorPart = baseColor ?? `TODO: base color for #${numStr}`;
    let markingClause;
    if (!marking) {
        markingClause = `with the number '${numStr}' TODO: marking placement for #${numStr}`;
    } else if (marking.kind === 'none') {
        markingClause = `with ${marking.phrase}`;
    } else {
        markingClause = `with the ${marking.phrase}`;
    }
    const accessoryPart = accessory ? `; ${accessory}` : '';

    if (!baseColor && diag) {
        (diag.warnings ??= []).push(`#${numStr}: base color could not be extracted; left as TODO`);
    }
    if (!marking && diag) {
        (diag.warnings ??= []).push(`#${numStr}: number marking placement could not be extracted; left as TODO`);
    }

    return `Corefolder form: a spherical cushion-like body in ${colorPart}, ${markingClause}${accessoryPart}.`;
}

/**
 * 既存の corefolder NLD が「上書き対象」かどうかを判定する。
 *
 * 上書き対象 (true) の例:
 * - 空文字 / 未設定
 * - "[TRANSLATE COREFOLDER SECTION ..." プレースホルダ
 * - "A corefolder form character featuring..." 型のダミー生成記述
 * - "TODO:" 始まり
 * - humanoid 衣装語 (hoodie / blazer / coat / dress / pants / shoes 等) を含む
 * - "outfit" 等の humanoid 衣装一般語を含む
 * - 標準テンプレ "Corefolder form: a spherical cushion-like body in ..." に一致しない
 *
 * 据え置き (false) の例:
 * - 標準テンプレ形で humanoid 衣装語を含まないもの
 *
 * @param {string|undefined} existing
 * @returns {boolean}
 */
function shouldRewriteCorefolderNld(existing) {
    if (typeof existing !== 'string' || !existing.trim()) return true;
    const s = existing.trim();
    if (/^\[TRANSLATE/i.test(s)) return true;
    if (/^A corefolder form character featuring\b/i.test(s)) return true;
    if (/^TODO:/i.test(s)) return true;
    // humanoid 衣装語チェック（標準テンプレでも humanoid 衣装語が混入していれば上書き）
    // ※ "outfit" 単独は corefolder の costume variant 等で正当に出現し得るため対象外。
    //   具体的な衣服名（hoodie / blazer / coat / dress / pants / shoes 等）のみを対象とする。
    const humanoidGarmentRe = /\b(hoodie|blazer|coat|jacket|dress|bodysuit|pants|shorts|skirt|trousers|shoes|boots|socks|sneakers|loafers|stockings|leggings)\b/i;
    if (humanoidGarmentRe.test(s)) return true;
    // 標準テンプレ形か厳格チェック
    const isTemplate = /^Corefolder form:\s*a spherical cushion-like body in\b/i.test(s);
    if (isTemplate) return false;
    // 標準テンプレ形でない Corefolder form: ... は全て上書き対象
    return true;
}

// ─────────────────────────────────────────────────────────────────────

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
 * Height_cm から英語の体格バンド文字列を返す（IdentityMotif 駆動再構築での
 * silhouette_features / ai_tags の正源として使用する）。
 * @param {number|undefined|null} height
 * @returns {string|null}
 */
function heightBandOf(height) {
    if (typeof height !== 'number' || !Number.isFinite(height)) return null;
    if (height < 140) return `petite stature (about ${height}cm)`;
    if (height < 150) return `short stature (about ${height}cm)`;
    if (height < 160) return `average stature (about ${height}cm)`;
    if (height < 170) return `slightly tall stature (about ${height}cm)`;
    return `tall stature (about ${height}cm)`;
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
        silhouette_notes: buildDefaultSilhouetteNotes(num, 'corefolder'),
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
        silhouette_notes: buildDefaultSilhouetteNotes(num, 'humanoid'),
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
    // 注意: 'safety device harness' は 15(トウゴ)固有の設定。標準キャラのデフォルトには含めない
    if (formType === 'corefolder') {
        negatives.push('humanoid casual outfit');
    } else if (formType === 'humanoid') {
        negatives.push('corefolder hoodie');
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
        silhouette_notes: buildDefaultSilhouetteNotes(num, 'corefolder'),
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
        silhouette_notes: buildDefaultSilhouetteNotes(num, 'humanoid'),
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
 * @property {'patched'|'skipped-existing'|'skipped-no-image'|'overwritten'|'refs-fixed'|'todos-filled'|'todos-unchanged'|'schema-upgraded'|'schema-unchanged'|'identitymotif-applied'|'identitymotif-unchanged'|'identitymotif-cleared'|'identitymotif-no-source'|'appearancedetail-applied'|'appearancedetail-unchanged'|'appearancedetail-cleared'|'appearancedetail-no-source'|'skipped-no-aihints'} status
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
                form.silhouette_notes = buildDefaultSilhouetteNotes(num, isCorefolder ? 'corefolder' : formKey);
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
            //  silhouette_notes は 2026-06-09 以降 { body_description, attached_items } object 形式
            //  なので、配列形式 (legacy) と object 形式の双方に対応する
            const snTodoCheck = (arr) => Array.isArray(arr) && arr.some(f => typeof f === 'string' && VISUAL_TODO_PATTERN.test(f));
            if (Array.isArray(form.silhouette_notes) && snTodoCheck(form.silhouette_notes)) {
                fields.push(`forms.${formKey}.silhouette_notes`);
            } else if (form.silhouette_notes && typeof form.silhouette_notes === 'object' && !Array.isArray(form.silhouette_notes)) {
                if (snTodoCheck(form.silhouette_notes.body_description))
                    fields.push(`forms.${formKey}.silhouette_notes.body_description`);
                if (snTodoCheck(form.silhouette_notes.attached_items))
                    fields.push(`forms.${formKey}.silhouette_notes.attached_items`);
            }
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
        // 2026-06-09 以降は silhouette_notes が object 形式 { body_description, attached_items } となるため、
        //  - vr.corefolderSilhouetteNotes / vr.corefolderBodyDescription は body_description 側へ
        //  - vr.corefolderAttachedItems は attached_items 側へ を心がける
        if (cf.silhouette_notes && !Array.isArray(cf.silhouette_notes) && typeof cf.silhouette_notes === 'object') {
            const bodyVals = vr.corefolderBodyDescription?.length
                ? vr.corefolderBodyDescription
                : (vr.corefolderSilhouetteNotes?.length ? vr.corefolderSilhouetteNotes : null);
            if (bodyVals && Array.isArray(cf.silhouette_notes.body_description)) {
                cf.silhouette_notes.body_description = cf.silhouette_notes.body_description.flatMap(f => {
                    if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return bodyVals; }
                    return [f];
                });
            }
            if (vr.corefolderAttachedItems?.length && Array.isArray(cf.silhouette_notes.attached_items)) {
                cf.silhouette_notes.attached_items = cf.silhouette_notes.attached_items.flatMap(f => {
                    if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return vr.corefolderAttachedItems; }
                    return [f];
                });
            }
        } else if (Array.isArray(cf.silhouette_notes) && vr.corefolderSilhouetteNotes?.length) {
            // legacy: 旧型 flat array 互換
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

        // silhouette_notes: 2026-06-09 以降は object 形式 { body_description, attached_items } を含むため
        // 両形式に対応する
        if (hu.silhouette_notes && !Array.isArray(hu.silhouette_notes) && typeof hu.silhouette_notes === 'object') {
            const bodyVals = vr.humanoidBodyDescription?.length
                ? vr.humanoidBodyDescription
                : (vr.humanoidSilhouetteNotes?.length ? vr.humanoidSilhouetteNotes : null);
            if (bodyVals && Array.isArray(hu.silhouette_notes.body_description)) {
                hu.silhouette_notes.body_description = hu.silhouette_notes.body_description.flatMap(f => {
                    if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return bodyVals; }
                    return [f];
                });
            }
            if (vr.humanoidAttachedItems?.length && Array.isArray(hu.silhouette_notes.attached_items)) {
                hu.silhouette_notes.attached_items = hu.silhouette_notes.attached_items.flatMap(f => {
                    if (typeof f === 'string' && f.startsWith('TODO:')) { changed = true; return vr.humanoidAttachedItems; }
                    return [f];
                });
            }
        } else if (Array.isArray(hu.silhouette_notes) && vr.humanoidSilhouetteNotes?.length) {
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

// ─────────────────────────────────────────────────────────────────────────
// silhouette_notes 構造移行 (--migrate-silhouette-structure モード)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 1レコード分の silhouette_notes を flat array → object 形式へ移行する。
 *
 * - 全 form（corefolder / humanoid / 他）を走査
 * - 既に object 形式の form はスキップ（冪等）
 * - flat array の form のみ migrateSilhouetteFlatArray() で機械分類して置換
 * - 変更があった場合はキー順を schema 宣言順に揃えて書き戻す
 *
 * @param {string} text
 * @param {number} openIdx
 * @param {number} closeIdx
 * @param {any} record
 * @returns {{ text: string, changed: boolean }}
 */
function migrateSilhouetteStructureInRecord(text, openIdx, closeIdx, record) {
    if (!record.AIHints?.forms) return { text, changed: false };
    const aihints = JSON.parse(JSON.stringify(record.AIHints));
    let changed = false;

    for (const [formKey, form] of Object.entries(aihints.forms ?? {})) {
        if (!form || typeof form !== 'object') continue;
        if (Array.isArray(form.silhouette_notes)) {
            form.silhouette_notes = migrateSilhouetteFlatArray(form.silhouette_notes);
            changed = true;
            // schema 宣言順を保持
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
    const block = stringifyAihintsBlock(aihints);
    return { text: replaceAihintsInRecord(text, openIdx, closeIdx, block), changed: true };
}

// ─────────────────────────────────────────────────────────────────────────
// corefolder NLD 再生成 (--rewrite-corefolder-nld モード)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 1レコード分の forms.corefolder.natural_language_description を球体本体テンプレートで再生成する。
 *
 * - forceRewrite=false の場合、既に標準テンプレ形（"Corefolder form: a spherical cushion-like body in ..."）で
 *   humanoid 衣装語を含まないものはスキップ
 * - forceRewrite=true の場合、全レコードで再生成
 *
 * @param {string} text
 * @param {number} openIdx
 * @param {number} closeIdx
 * @param {any} record
 * @param {boolean} forceRewrite
 * @returns {{ text: string, changed: boolean, warnings: string[] }}
 */
function rewriteCorefolderNldInRecord(text, openIdx, closeIdx, record, forceRewrite) {
    /** @type {string[]} */
    const warnings = [];
    const cf = record.AIHints?.forms?.corefolder;
    if (!cf) return { text, changed: false, warnings };

    const existing = cf.natural_language_description;
    if (!forceRewrite && !shouldRewriteCorefolderNld(existing)) {
        return { text, changed: false, warnings };
    }

    const diag = { warnings: /** @type {string[]} */ ([]) };
    const newNld = buildCorefolderNldFromTemplate(record, diag);
    if (!newNld) {
        warnings.push(`#${record.Num}: could not build corefolder NLD (no AIHints.forms.corefolder)`);
        return { text, changed: false, warnings };
    }
    for (const w of diag.warnings) warnings.push(w);

    if (existing === newNld) return { text, changed: false, warnings };

    const aihints = JSON.parse(JSON.stringify(record.AIHints));
    aihints.forms.corefolder.natural_language_description = newNld;
    const block = stringifyAihintsBlock(aihints);
    return { text: replaceAihintsInRecord(text, openIdx, closeIdx, block), changed: true, warnings };
}

// ─────────────────────────────────────────────────────────────────────────
// IdentityMotif 駆動 AIHints 再構築 (--apply-identitymotif モード)
//
// IdentityMotif フィールド (`[{ Formation, Motif: { Motif_JP, Motif_EN } }, ...]`) を
// **AI タグの正** として、AIHints の forms / common 配下の AI 関連配列を再生成する。
//
// 設計方針 (User 確定スコープ: max C + 未分類B + 厳密Y):
//  - rebuild  : forms.<form>.{form_tags, outfit_features, silhouette_notes, ai_tags,
//               negative_visuals, prompt_export, negative_prompt_export}, corefolder NLD
//               common.{identity_tags, silhouette_features} (formation 共通部)
//  - reinject : forms.corefolder.{immutable_constraints, negative_keywords},
//               forms.corefolder.silhouette_notes.body_description 先頭の球体本体行
//  - clear    : forms.humanoid.{immutable_constraints, negative_keywords, NLD},
//               common.{immutable_traits, expression_tendency, palette_priority, NLD}
//  - preserve : common.age_appearance / reference_images,
//               forms.*.reference_images, top-level work_common / alt_modes
//
// 未分類エントリは取りこぼし防止のため必ず outfit_features 末尾に追記する。
// IdentityMotif が無い／全空のレコードは AI タグ配列を空にクリアする fallback。
// ─────────────────────────────────────────────────────────────────────────

/**
 * IdentityMotif の Motif_EN エントリを正規化する（重複検出と diff 用）。
 * 小文字化 + 括弧内除去 + 連続空白圧縮。元文字列は別途保持する想定。
 *
 * @param {string|null|undefined} s
 * @returns {string}
 */
function normalizeMotifEntry(s) {
    return String(s ?? '')
        .toLowerCase()
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Motif_EN エントリ 1 件を keyword 辞書で分類する。
 * 戻り値: 'form' | 'attached' | 'outfit' | 'body' | 'misc'
 *
 * 優先順位:
 *   1. 'form'     : 単純な "<formation> form" 一致
 *   2. last word  : エントリ末尾の主名詞を 4 辞書で照会
 *   3. 2nd-last word : 末尾が辞書未収載の場合の代替主名詞
 *   4. 全文 fallback : OUTFIT_FALLBACK_RE > ATTACHED_FALLBACK_RE > BODY_FALLBACK_RE
 *   5. 'misc'     : いずれも当てはまらず（outfit_features 末尾に追記される）
 *
 * 注意: 括弧内補足語は分類に影響させない（例 "fox ears(hidden under hood)" は body）。
 *
 * @param {string} entry
 * @returns {'form'|'attached'|'outfit'|'body'|'misc'}
 */
function classifyMotifEntry(entry) {
    if (typeof entry !== 'string') return 'misc';
    const raw = entry.trim();
    if (!raw) return 'misc';

    // 1. form_tag: 単一 "<formation> form" のみを 'form' とする
    if (/^(corefolder|humanoid)\s+form$/i.test(raw)) return 'form';

    // 括弧内除去 + 小文字化 + ハイフン・スラッシュ等で分割
    const stripped = raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const words = stripped.toLowerCase().split(/[\s\-\/,]+/).filter(Boolean);
    const lastWord = words[words.length - 1] ?? '';
    const w2 = words.length >= 2 ? words[words.length - 2] : '';

    const ATTACHED_NOUNS = new Set([
        'harness', 'ribbon', 'ribbons', 'collar', 'choker', 'halo', 'nimbus',
        'hairpin', 'hairpins', 'hairband', 'headband', 'headphones',
        'pendant', 'pendants', 'necklace', 'necklaces', 'brooch', 'beads', 'bead',
        'bell', 'earring', 'earrings', 'bracelet', 'bracelets', 'wristband', 'wristbands',
        'cuff', 'cuffs', 'scarf', 'sash', 'shawl', 'mantle', 'badge', 'badges',
        'charm', 'charms', 'goggles', 'glasses', 'monocle', 'mask', 'eyepatch',
        'blindfold', 'tag', 'tags', 'label', 'labels', 'patch', 'patches',
        'emblem', 'emblems', 'pin', 'crest', 'crests', 'insignia',
        'ornament', 'ornaments', 'accessory', 'accessories', 'neckerchief',
        'gohei', 'hologram', 'holograms', 'wimple', 'wimple-like',
        'tail-tufts', 'eye-mask',
    ]);

    const OUTFIT_NOUNS = new Set([
        'hoodie', 'hood', 'jacket', 'coat', 'blazer', 'dress', 'skirt', 'shorts', 'pants',
        'trousers', 'slacks', 'stockings', 'leggings', 'tights', 'socks',
        'boots', 'shoes', 'sandals', 'heels', 'sneakers', 'loafers', 'geta',
        'uniform', 'suit', 'vest', 'robe', 'kimono', 'outfit', 'attire',
        'clothing', 'garment', 'gown', 'tunic', 'apron', 'jersey', 'polo',
        'haori', 'hakama', 'obi', 'tailcoat', 'cape', 'cloak',
        'bodysuit', 'leotard', 'swimsuit', 'shirt', 'blouse', 'sweater',
        'cardigan', 'top', 'tops', 'tee', 't-shirt', 'camisole',
        'belt', 'waistband', 'sleeves', 'sleeve', 'cap', 'caps', 'hat',
        'helmet', 'beret', 'habit', 'jumper', 'turtleneck',
        'marking', 'markings', 'stripe', 'stripes', 'striped',
        'pose', 'mode', 'variant', 'variants', 'style', 'aesthetic',
        'tattoo', 'mark', 'marks', 'identifier',
    ]);

    const BODY_NOUNS = new Set([
        'hair', 'ears', 'ear', 'tail', 'tails', 'eyes', 'eye', 'smile', 'expression',
        'gaze', 'look', 'face', 'body', 'build', 'silhouette', 'figure', 'stature',
        'breasts', 'bust', 'complexion', 'skin', 'lips',
        'teenager', 'adult', 'child', 'young', 'mature', 'elderly',
        '1girl', '1boy', '1other', 'androgynous', 'feminine', 'masculine', 'male', 'female',
        'ponytail', 'twin-tails', 'twintails', 'braid', 'bob', 'bun', 'side-tail',
        'grin', 'tan', 'fox', 'cat', 'wolf', 'tanuki',
        'fangs', 'horns', 'wings', 'paws',
        'composure', 'humanoid', 'cushion-like', 'spherical',
    ]);

    if (ATTACHED_NOUNS.has(lastWord)) return 'attached';
    if (OUTFIT_NOUNS.has(lastWord)) return 'outfit';
    if (BODY_NOUNS.has(lastWord)) return 'body';

    if (w2) {
        if (ATTACHED_NOUNS.has(w2)) return 'attached';
        if (OUTFIT_NOUNS.has(w2)) return 'outfit';
        if (BODY_NOUNS.has(w2)) return 'body';
    }

    // 全文 fallback (順序: attached > outfit > body)
    const ATTACHED_FALLBACK_RE = /\b(harness|ribbon|collar|choker|halo|nimbus|hairpin|hairband|headband|headphones|necklace|pendant|brooch|beads|bell|earring|bracelet|wristband|cuffs?|sash|shawl|mantle|charm|goggles|glasses|monocle|mask|eyepatch|blindfold|emblem|tag|patch|label|crest|insignia|badge|ornament|accessory|neckerchief|gohei|hologram|prayer beads|fox-tail mantle|hair clip|hair pin)\b/i;
    if (ATTACHED_FALLBACK_RE.test(stripped)) return 'attached';
    const OUTFIT_FALLBACK_RE = /\b(hoodie|jacket|coat|blazer|dress|skirt|shorts|pants|trousers|slacks|stockings|leggings|tights|socks|boots|shoes|sandals|heels|sneakers|uniform|suit|vest|robe|kimono|outfit|attire|clothing|gown|tunic|apron|jersey|polo|haori|hakama|obi|tailcoat|cape|cloak|bodysuit|leotard|swimsuit|shirt|blouse|sweater|cardigan|tee|t-shirt|camisole|belt|waistband|cap\b|hat\b|helmet|beret|habit|jumper|turtleneck|marking|stripe|barefoot|spiky|zipper|button|frill|ruffle|lace|inner|sleeve|knee-high|thigh-high)\b/i;
    if (OUTFIT_FALLBACK_RE.test(stripped)) return 'outfit';
    const BODY_FALLBACK_RE = /\b(hair|ears?|tails?|eyes?|smile|expression|gaze|look|face|body|build|silhouette|figure|stature|breasts|bust|teenager|adult|child|young|mature|elderly|girl|boy|androgynous|feminine|masculine|ponytail|twintails|twin-tails|braid|bob|bun|grin|fox|cat|wolf|complexion|skin|spherical|tall|short|slender|petite|fangs|horns|wings)\b/i;
    if (BODY_FALLBACK_RE.test(stripped)) return 'body';

    return 'misc';
}

/**
 * IdentityMotif の body 系 Motif_EN から base color 候補を合成する。
 * 「<adj>* <color>(<-color>)? <hair|fur|coat|body|complexion|skin>」型の
 * エントリを優先的に走査し、color 部分を抜き出して返す。
 * 既存の extractBaseColor は "X base coloring" / "X fox with ..." 型の長文を
 * 想定しているが、IdentityMotif のエントリは "red orange hair" のように短いため
 * 別途このヘルパーで補う。
 *
 * @param {string[]} bodyEntries
 * @returns {string|null}
 */
function synthesizeBaseColorFromMotif(bodyEntries) {
    if (!Array.isArray(bodyEntries) || bodyEntries.length === 0) return null;
    const COLOR_WORDS = [
        'white','black','gray','grey','red','blue','green','yellow','orange','pink',
        'purple','magenta','cyan','teal','navy','brown','tan','beige','peach','salmon',
        'gold','golden','silver','rose','lavender','violet','indigo','maroon','amber',
        'crimson','scarlet','olive','mint','aqua','turquoise','fuchsia','burgundy',
        'ivory','cream','chestnut','caramel','coral','mocha','platinum','pearl',
        'reddish','orangish','yellowish','pinkish','greenish','bluish','purplish',
        'grayish','brownish','whitish','pale','dark','light','deep','bright','vivid',
        'warm','cool','soft','muted','dull','neutral','blonde',
    ];
    const colorAlt = COLOR_WORDS.join('|');
    // 2 単語までの色（ハイフン / 空白）+ 髪/毛/体系の名詞
    const COLOR_HAIR_RE = new RegExp(
        `^([A-Za-z\\-]+(?:[\\-\\s]+[A-Za-z\\-]+)*?\\s+)?((?:${colorAlt})(?:[\\-\\s]+(?:${colorAlt}))?)\\s+(?:hair|fur|coat|body|complexion|skin|tones?)\\b`,
        'i',
    );
    // 単色のみ（adj 前置詞なし）
    const COLOR_ONLY_RE = new RegExp(
        `^((?:${colorAlt})(?:[\\-\\s]+(?:${colorAlt}))?)\\s+(?:hair|fur|coat|body|complexion|skin|tones?)\\b`,
        'i',
    );
    for (const raw of bodyEntries) {
        if (typeof raw !== 'string') continue;
        const s = raw.trim();
        if (!s || /^TODO:/i.test(s) || /^spherical core body /i.test(s)) continue;
        // hair / fur / coat / body / complexion / skin / tones を含むエントリのみを対象
        if (!/\b(hair|fur|coat|body|complexion|skin|tones?)\b/i.test(s)) continue;
        // 先に「色のみ」パターンを試す（"red orange hair" → "red orange"）
        let m = s.match(COLOR_ONLY_RE);
        if (m) return m[1].toLowerCase().replace(/\s+/g, ' ');
        // 次に「adj 色」パターン（"long blue hair" → "blue"）
        m = s.match(COLOR_HAIR_RE);
        if (m) return m[2].toLowerCase().replace(/\s+/g, ' ');
    }
    return null;
}

/**
 * IdentityMotif を AIHints へ反映する際の AIHints オブジェクト全体を組み立てる。
 * 既存 AIHints は **reference_images / age_appearance / work_common / alt_modes** のみ流用し、
 * その他は IdentityMotif と structural default から再構築する。
 *
 * @param {any} record  パース済みレコード（IdentityMotif と AIHints を含む）
 * @returns {{ aihints: any, hasSource: boolean, formationsTouched: string[] }}
 *   hasSource=false の場合は IdentityMotif が無いか全空。呼び出し側で fallback クリアを行う。
 */
function buildAihintsFromIdentityMotif(record) {
    const num = record.Num;
    const baseAihints = record.AIHints ?? {};
    const existingCommon = baseAihints.common ?? {};
    const existingForms = baseAihints.forms ?? {};

    // ── 構造的正源（IdentityMotif より優先される確定値）─────────────
    //   尻尾形状 = TailsUnit / 外見年齢 = ConceptAge / 体格 = Height_cm
    //   これらは IdentityMotif の文言で上書きされず、必ず構造ソースを正とする。
    const tailDesc = (() => {
        const parsed = parseTailsUnit(record.TailsUnit);
        if (!parsed) return null;
        const desc = buildTailDescription(parsed);
        if (typeof desc !== 'string' || desc.startsWith('TODO:')) return null;
        return desc;
    })();
    const statureDesc = heightBandOf(record.Height_cm);
    const ageBand = (typeof record.ConceptAge === 'number' && Number.isFinite(record.ConceptAge))
        ? ageBandOf(record.ConceptAge)
        : (('age_appearance' in existingCommon) ? existingCommon.age_appearance : null);

    // tail/stature の normalize 形（negative_visuals / ai_tags 重複判定用）
    const tailNorm = tailDesc ? normalizeMotifEntry(tailDesc) : null;
    const statureNorm = statureDesc ? normalizeMotifEntry(statureDesc) : null;

    /**
     * negative_visuals / ai_tags で「尻尾本数」「体格」「年齢」関連を識別する。
     * 正源（TailsUnit / Height_cm / ConceptAge）に統一するため、IdentityMotif 由来の
     * 同種エントリは NG リストから除外する必要がある。
     * @param {string} s
     */
    const isStructuralOverride = (s) => {
        if (typeof s !== 'string') return false;
        const n = normalizeMotifEntry(s);
        if (!n) return false;
        // 尻尾本数（"single tail" / "two tails" / "3 fox tails" / "tail feathers" 等）
        if (/\b(?:single|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+\S*\s*tails?\b/.test(n)) return true;
        if (/\btail\s+feathers?\b/.test(n)) return true;
        // 体格・身長
        if (/\b(?:petite|short|average|slightly tall|tall)\s+stature\b/.test(n)) return true;
        if (/\babout\s+\d+\s*cm\b/.test(n)) return true;
        // 年齢
        if (/\b(?:child|early teenager|teenager|young adult|adult|mature adult)\b/.test(n)) return true;
        return false;
    };

    // ── 既存 common.immutable_traits から「番号刻印行」のみ引き継ぐ ──
    //   昨日（2026-06-08）の対応で導入した単一スロット記述
    //   （`'#N' number marking` / `number 'N' marking` 等）を保持しないと
    //   corefolder NLD テンプレの marking placement 部が TODO に戻ってしまう。
    /** @type {string[]} */
    const preservedImmutableTraits = [];
    if (Array.isArray(existingCommon.immutable_traits)) {
        for (const t of existingCommon.immutable_traits) {
            if (typeof t !== 'string') continue;
            const lower = t.toLowerCase();
            const looksLikeNumberMarking =
                lower.includes('number marking') ||
                /number\s*['"]?\d+['"]?\s+marking/.test(lower) ||
                /['"]?#\d+['"]?\s+number\s+marking/.test(lower) ||
                lower.includes('no number identifier');
            if (looksLikeNumberMarking) preservedImmutableTraits.push(t);
        }
    }

    // ── IdentityMotif を Formation キーで集約 ───────────────────────
    /** @type {Map<string, string[]>} */
    const motifMap = new Map();
    const motifSource = Array.isArray(record.IdentityMotif) ? record.IdentityMotif : [];
    for (const im of motifSource) {
        const f = im?.Formation;
        const en = im?.Motif?.Motif_EN;
        if (typeof f !== 'string' || !Array.isArray(en)) continue;
        const entries = en.filter(s => typeof s === 'string' && s.trim().length > 0);
        if (entries.length === 0) {
            // 空配列でも formation 自体は登録（rebuild 対象として扱うため）
            if (!motifMap.has(f)) motifMap.set(f, []);
            continue;
        }
        if (motifMap.has(f)) {
            // 同一 Formation が複数回宣言されている場合は連結
            motifMap.set(f, [...motifMap.get(f), ...entries]);
        } else {
            motifMap.set(f, entries);
        }
    }

    const totalEntries = [...motifMap.values()].reduce((sum, arr) => sum + arr.length, 0);
    if (totalEntries === 0) {
        return { aihints: baseAihints, hasSource: false, formationsTouched: [] };
    }

    // ── 各 formation の Motif_EN を分類 ──────────────────────────────
    /** @type {Map<string, { form: string[], attached: string[], outfit: string[], body: string[], misc: string[], all: string[], normalized: Set<string> }>} */
    const classified = new Map();
    for (const [formKey, entries] of motifMap.entries()) {
        const c = { form: [], attached: [], outfit: [], body: [], misc: [], all: [...entries], normalized: new Set() };
        for (const e of entries) {
            c.normalized.add(normalizeMotifEntry(e));
            const cat = classifyMotifEntry(e);
            c[cat].push(e);
        }
        classified.set(formKey, c);
    }

    // ── 各 formation の form 出力を組み立て ──────────────────────────
    /** @type {Record<string, any>} */
    const newForms = {};
    const formationsTouched = [];

    for (const [formKey, c] of classified.entries()) {
        formationsTouched.push(formKey);
        const isCorefolder = formKey === 'corefolder';
        const existingForm = (existingForms && typeof existingForms === 'object') ? existingForms[formKey] : null;

        // form_tags: 抽出した form エントリ + 必ず "<formKey> form" を先頭に含める
        const formTagSet = new Set();
        const formTags = [];
        const ownFormTag = `${formKey} form`;
        formTags.push(ownFormTag);
        formTagSet.add(normalizeMotifEntry(ownFormTag));
        for (const e of c.form) {
            const nk = normalizeMotifEntry(e);
            if (!formTagSet.has(nk)) {
                formTagSet.add(nk);
                formTags.push(e);
            }
        }

        // outfit_features: outfit + misc（misc は取りこぼし防止の末尾フォールバック）
        const outfitFeatures = [...c.outfit, ...c.misc];

        // silhouette_notes (object 形式)
        /** @type {{ body_description: string[], attached_items: string[] }} */
        const silhouetteNotes = {
            body_description: [],
            attached_items: [...c.attached],
        };
        if (isCorefolder) {
            silhouetteNotes.body_description.push(
                'spherical core body with the head as the only protruding part on top',
            );
            // corefolder NLD テンプレが extractBaseColor で色を取り出せるよう、
            // IdentityMotif の body 系から合成した base color 行を 2 番目に差し込む。
            const synthColor = synthesizeBaseColorFromMotif(c.body);
            if (synthColor) {
                silhouetteNotes.body_description.push(`${synthColor} base coloring (synthesized from IdentityMotif)`);
            }
        }
        silhouetteNotes.body_description.push(...c.body);

        // ai_tags: 全 Motif_EN を元順で保持。先頭が "<formKey> form" でなければ補う。
        //   tail/stature の正源タグは form タグ直後に挿入する（IdentityMotif 由来の同種は除外）。
        const aiTags = [];
        const aiTagSet = new Set();
        const pushAiTag = (s) => {
            const nk = normalizeMotifEntry(s);
            if (!nk || aiTagSet.has(nk)) return;
            aiTagSet.add(nk);
            aiTags.push(s);
        };
        pushAiTag(ownFormTag);
        if (tailDesc) pushAiTag(tailDesc);
        if (statureDesc) pushAiTag(statureDesc);
        if (ageBand && typeof ageBand === 'string' && !ageBand.startsWith('TODO')) pushAiTag(ageBand);
        for (const e of c.all) {
            // 構造的正源で扱う種類は IdentityMotif 側の表記を捨てる
            if (isStructuralOverride(e)) continue;
            pushAiTag(e);
        }

        // negative_visuals: 対向 formation の Motif_EN - 自 formation Motif_EN
        //   差分から body 系 + 構造的正源（tail count / stature / age）を除外
        /** @type {string[]} */
        const negativeVisuals = [];
        const negSeen = new Set();
        for (const [otherKey, otherC] of classified.entries()) {
            if (otherKey === formKey) continue;
            for (const e of otherC.all) {
                const nk = normalizeMotifEntry(e);
                if (c.normalized.has(nk)) continue;
                if (negSeen.has(nk)) continue;
                if (isStructuralOverride(e)) continue; // 尻尾本数・体格・年齢は NG に出さない
                const cat = classifyMotifEntry(e);
                if (cat === 'body') continue; // 体の特徴は NG から除外
                negSeen.add(nk);
                negativeVisuals.push(e);
            }
        }

        // immutable_constraints / negative_keywords
        const immutableConstraints = isCorefolder
            ? [...COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS]
            : null;
        const negativeKeywords = isCorefolder
            ? [...COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS]
            : null;

        // natural_language_description: corefolder のみテンプレ生成、humanoid はクリア
        // テンプレ生成は新 silhouette_notes / 既存 immutable_traits（あれば）に依存する。
        // 現時点では下流で template 生成するため一旦 null を置き、common 構築後に再生成する。
        const naturalLanguageDescription = null;

        // prompt_export / negative_prompt_export
        const promptExport = aiTags.join(', ');
        const negativePromptExport = negativeVisuals.join(', ');

        // reference_images: 既存 form から流用（structural / 画像由来のため preserve）
        const referenceImages = (existingForm && typeof existingForm === 'object' && 'reference_images' in existingForm)
            ? existingForm.reference_images
            : null;

        const formObj = {
            form_tags: formTags,
            outfit_features: outfitFeatures,
            silhouette_notes: silhouetteNotes,
            immutable_constraints: immutableConstraints,
            negative_keywords: negativeKeywords,
            ai_tags: aiTags,
            negative_visuals: negativeVisuals,
            natural_language_description: naturalLanguageDescription,
            prompt_export: promptExport,
            negative_prompt_export: negativePromptExport,
            reference_images: referenceImages,
        };
        newForms[formKey] = reorderObjectKeys(formObj, [
            'form_tags', 'outfit_features',
            'silhouette_notes', 'immutable_constraints', 'negative_keywords',
            'ai_tags', 'negative_visuals',
            'natural_language_description', 'prompt_export', 'negative_prompt_export',
            'reference_images',
        ]);
    }

    // ── 既存 forms 側にあって IdentityMotif に無い formation の扱い ─
    // 「IdentityMotif で言及されていない formation」は AI タグ系をクリアする（Y rule）。
    // ただし reference_images / 全 form_tags の "<formKey> form" だけは structural として残す。
    if (existingForms && typeof existingForms === 'object') {
        for (const formKey of Object.keys(existingForms)) {
            if (newForms[formKey]) continue; // 既に再構築済み
            const existingForm = existingForms[formKey];
            if (!existingForm || typeof existingForm !== 'object') continue;
            const isCorefolder = formKey === 'corefolder';
            const ownFormTag = `${formKey} form`;
            const empty = {
                form_tags: [ownFormTag],
                outfit_features: [],
                silhouette_notes: { body_description: isCorefolder ? ['spherical core body with the head as the only protruding part on top'] : [], attached_items: [] },
                immutable_constraints: isCorefolder ? [...COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS] : null,
                negative_keywords: isCorefolder ? [...COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS] : null,
                ai_tags: [ownFormTag],
                negative_visuals: [],
                natural_language_description: null,
                prompt_export: ownFormTag,
                negative_prompt_export: '',
                reference_images: 'reference_images' in existingForm ? existingForm.reference_images : null,
            };
            formationsTouched.push(formKey);
            newForms[formKey] = reorderObjectKeys(empty, [
                'form_tags', 'outfit_features',
                'silhouette_notes', 'immutable_constraints', 'negative_keywords',
                'ai_tags', 'negative_visuals',
                'natural_language_description', 'prompt_export', 'negative_prompt_export',
                'reference_images',
            ]);
        }
    }

    // ── common の組み立て ──────────────────────────────────────────
    // identity_tags / silhouette_features: 全 formation の Motif_EN を normalize して
    //   集合積集合（>= 2 formation が共通して保持するエントリ）を採用。
    //   1 formation のみの場合はそのまま全 Motif_EN を identity_tags に使用。
    //   silhouette_features の先頭には tail（TailsUnit）/ stature（Height_cm）を必ず注入する。
    /** @type {string[]} */
    let identityTags = [];
    /** @type {string[]} */
    let silhouetteFeatures = [];

    if (classified.size === 1) {
        const only = [...classified.values()][0];
        identityTags = only.all.filter(e => !isStructuralOverride(e));
        silhouetteFeatures = only.body.filter(e => !isStructuralOverride(e));
    } else {
        // 共通 (intersection) 抽出: 最初の formation のエントリを順序キーとし、
        //   全 formation で normalize 一致するものだけを採用。元文字列は最初に出現したものを保持。
        const formations = [...classified.entries()];
        const [, firstC] = formations[0];
        const restSets = formations.slice(1).map(([, c]) => c.normalized);
        const seen = new Set();
        for (const e of firstC.all) {
            if (isStructuralOverride(e)) continue;
            const nk = normalizeMotifEntry(e);
            if (seen.has(nk)) continue;
            if (!restSets.every(s => s.has(nk))) continue;
            seen.add(nk);
            identityTags.push(e);
            if (classifyMotifEntry(e) === 'body') silhouetteFeatures.push(e);
        }
        // 共通が空の場合は最初の formation の Motif_EN を identity 代理として使う（情報損失を避ける）
        if (identityTags.length === 0) {
            identityTags = firstC.all.filter(e => !isStructuralOverride(e));
            silhouetteFeatures = firstC.body.filter(e => !isStructuralOverride(e));
        }
    }

    // tail / stature を silhouette_features 先頭に注入（重複排除）
    /** @type {string[]} */
    const sfWithStructural = [];
    const sfSeen = new Set();
    const pushSf = (s) => {
        if (typeof s !== 'string' || !s) return;
        const nk = normalizeMotifEntry(s);
        if (!nk || sfSeen.has(nk)) return;
        sfSeen.add(nk);
        sfWithStructural.push(s);
    };
    if (tailDesc) pushSf(tailDesc);
    if (statureDesc) pushSf(statureDesc);
    for (const e of silhouetteFeatures) pushSf(e);

    const newCommon = {
        identity_tags: identityTags,
        silhouette_features: sfWithStructural,
        immutable_traits: preservedImmutableTraits.length > 0 ? preservedImmutableTraits : null,
        expression_tendency: null,
        age_appearance: (typeof ageBand === 'string' && ageBand) ? ageBand : null,
        palette_priority: null,
        natural_language_description: null,
        reference_images: ('reference_images' in existingCommon) ? existingCommon.reference_images : null,
    };
    const orderedCommon = reorderObjectKeys(newCommon, [
        'identity_tags', 'silhouette_features', 'immutable_traits',
        'expression_tendency', 'age_appearance', 'palette_priority',
        'natural_language_description', 'reference_images',
    ]);

    // ── top-level ──────────────────────────────────────────────────
    const newAihints = {
        common: orderedCommon,
        work_common: ('work_common' in baseAihints) ? baseAihints.work_common : null,
        forms: newForms,
        alt_modes: ('alt_modes' in baseAihints) ? baseAihints.alt_modes : null,
    };

    // ── corefolder NLD のテンプレ生成（新 AIHints を疑似 record として渡す）──
    if (newForms.corefolder) {
        const pseudoRecord = { Num: num, AIHints: newAihints };
        const nld = buildCorefolderNldFromTemplate(pseudoRecord);
        if (nld) {
            newForms.corefolder.natural_language_description = nld;
            // prompt_export / negative_prompt_export は ai_tags / negative_visuals 由来なので影響なし
        }
    }

    return {
        aihints: reorderObjectKeys(newAihints, ['common', 'work_common', 'forms', 'alt_modes']),
        hasSource: true,
        formationsTouched,
    };
}

/**
 * IdentityMotif が無い／全空のレコードに対する fallback。既存 AIHints の
 * AI タグ系配列を空にクリアし、構造（reference_images / age_appearance）は保持する。
 *
 * @param {any} baseAihints
 * @returns {any}
 */
function clearAihintsTagsForNoIdentityMotif(baseAihints) {
    const out = JSON.parse(JSON.stringify(baseAihints ?? {}));
    if (out.common && typeof out.common === 'object') {
        out.common.identity_tags = [];
        out.common.silhouette_features = [];
        out.common.immutable_traits = null;
        out.common.expression_tendency = null;
        out.common.palette_priority = null;
        out.common.natural_language_description = null;
        // age_appearance / reference_images は据え置き
    }
    if (out.forms && typeof out.forms === 'object') {
        for (const [formKey, form] of Object.entries(out.forms)) {
            if (!form || typeof form !== 'object') continue;
            const isCorefolder = formKey === 'corefolder';
            const ownFormTag = `${formKey} form`;
            form.form_tags = [ownFormTag];
            form.outfit_features = [];
            form.silhouette_notes = {
                body_description: isCorefolder
                    ? ['spherical core body with the head as the only protruding part on top']
                    : [],
                attached_items: [],
            };
            form.immutable_constraints = isCorefolder
                ? [...COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS]
                : null;
            form.negative_keywords = isCorefolder
                ? [...COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS]
                : null;
            form.ai_tags = [ownFormTag];
            form.negative_visuals = [];
            form.natural_language_description = null;
            form.prompt_export = ownFormTag;
            form.negative_prompt_export = '';
            // reference_images は据え置き
            out.forms[formKey] = reorderObjectKeys(form, [
                'form_tags', 'outfit_features',
                'silhouette_notes', 'immutable_constraints', 'negative_keywords',
                'ai_tags', 'negative_visuals',
                'natural_language_description', 'prompt_export', 'negative_prompt_export',
                'reference_images',
            ]);
        }
    }
    return reorderObjectKeys(out, ['common', 'work_common', 'forms', 'alt_modes']);
}

/**
 * 1レコード分の AIHints を IdentityMotif 駆動で再構築する（--apply-identitymotif モード）。
 *
 * @param {string} text
 * @param {number} openIdx
 * @param {number} closeIdx
 * @param {any} record
 * @returns {{ text: string, changed: boolean, status: 'identitymotif-applied'|'identitymotif-unchanged'|'identitymotif-cleared'|'identitymotif-no-source'|'skipped-no-aihints' }}
 */
function applyIdentityMotifToAihintsInRecord(text, openIdx, closeIdx, record) {
    if (!record.AIHints) {
        return { text, changed: false, status: 'skipped-no-aihints' };
    }

    const { aihints: newAihints, hasSource } = buildAihintsFromIdentityMotif(record);

    /** @type {any} */
    let finalAihints;
    /** @type {'identitymotif-applied'|'identitymotif-unchanged'|'identitymotif-cleared'|'identitymotif-no-source'} */
    let status;

    if (!hasSource) {
        // IdentityMotif が無い／全空: AI タグ配列をクリアする fallback
        finalAihints = clearAihintsTagsForNoIdentityMotif(record.AIHints);
        status = 'identitymotif-cleared';
    } else {
        finalAihints = newAihints;
        status = 'identitymotif-applied';
    }

    // 既存と完全一致なら no-op
    const existingJson = JSON.stringify(record.AIHints);
    const newJson = JSON.stringify(finalAihints);
    if (existingJson === newJson) {
        return { text, changed: false, status: hasSource ? 'identitymotif-unchanged' : 'identitymotif-no-source' };
    }

    const block = stringifyAihintsBlock(finalAihints);
    return {
        text: replaceAihintsInRecord(text, openIdx, closeIdx, block),
        changed: true,
        status,
    };
}

// ─────────────────────────────────────────────────────────────────────────
// AppearanceDetail 駆動 AIHints 再構築 (--apply-appearancedetail モード)
//
// `AppearanceDetail`（`Formation` × `DesignElement` × `BodyPart[]` × `Laterality` ×
// `Attrs[]` の構造化フィールド）を **AI タグの正** として、AIHints の forms / common
// 配下の AI 関連配列を再生成する。`IdentityMotif`（自由文）の後継を見据えた並行モードで、
// このモードは IdentityMotif 側のデータ・モードには一切触れない。
//
// 設計方針:
//  - AppearanceDetail は Formation を明示的に持つため、IdentityMotif モードのような
//    「Motif_EN のキーワード分類」ではなく、Formation=null（共通）/ Formation=<form>
//    （形態固有）の**構造そのもの**で共通部・形態別部を振り分ける。
//  - DesignElement → カテゴリ対応（ELEMENT_CATEGORY 参照）:
//      Motif / BodyType / Ear → body（silhouette_features / silhouette_notes.body_description）
//      Expression             → expression（common.expression_tendency。IdentityMotif モードでは非対応だった項目）
//      CostumeItem            → outfit（outfit_features）
//      Halo / Emblem / Tag    → attached（silhouette_notes.attached_items）
//      NumberMark             → marking（immutable_traits。common へは Formation=null のみ反映）
//      TailsUnit              → skip（TailsUnit フィールドを正源として扱うため二重化を避ける）
//  - 尻尾本数・体格・年齢は IdentityMotif モードと同じく TailsUnit / Height_cm / ConceptAge を
//    構造的正源として優先する（helper 関数を共用）。
//  - Attrs（vdict_* / value_* / about_*）→ 英語フレーズの合成は
//    `lib/section-renders/appearanceDetail.js` の buildAttrRows と同じ解決規約に揃える。
//  - AppearanceDetail が無い／全空のレコードは AI タグ系を空配列にクリアする fallback
//    （`clearAihintsTagsForNoIdentityMotif` をそのまま流用。処理内容は形式的に同一）。
// ─────────────────────────────────────────────────────────────────────────

/** DesignElement → 分類カテゴリのマッピング。未知の DesignElement は 'misc'（取りこぼし防止で outfit 側へ）。 */
const ELEMENT_CATEGORY = new Map([
    ['#Element_Motif', 'body'],
    ['#Element_BodyType', 'body'],
    ['#Element_Ear', 'body'],
    ['#Element_Expression', 'expression'],
    ['#Element_CostumeItem', 'outfit'],
    ['#Element_Halo', 'attached'],
    ['#Element_Emblem', 'attached'],
    ['#Element_Tag', 'attached'],
    ['#Element_NumberMark', 'marking'],
    ['#Element_TailsUnit', 'skip'],
]);

/** work 単位でグローバル + 作品ローカルの $VarsDef をマージしてキャッシュする */
const varsDefCache = new Map();

/**
 * `data/db_meta.json`（グローバル）と `data/Works_<work>/DataBases/db_meta.json`（作品ローカル）
 * の `General.$VarsDef` をマージして返す。ローカル定義がグローバルの同名 `$EnumDef_*` を
 * エントリ単位で上書きする（`lib/section-renders/appearanceDetail.js` の getMergedEnumDef と同じ方針）。
 * @param {string} work
 * @returns {Record<string, any>}
 */
function loadMergedVarsDef(work) {
    if (varsDefCache.has(work)) return varsDefCache.get(work);
    const readVarsDef = (p) => {
        if (!fs.existsSync(p)) return {};
        try {
            const j = JSON.parse(fs.readFileSync(p, 'utf8'));
            return (j && j.General && j.General.$VarsDef) || {};
        } catch {
            return {};
        }
    };
    const globalVars = readVarsDef(path.join(REPO_ROOT, 'data', 'db_meta.json'));
    const localVars = readVarsDef(path.join(REPO_ROOT, 'data', `Works_${work}`, 'DataBases', 'db_meta.json'));
    const merged = { ...globalVars };
    for (const [k, v] of Object.entries(localVars)) {
        const g = merged[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && g && typeof g === 'object' && !Array.isArray(g)) {
            merged[k] = { ...g, ...v };
        } else {
            merged[k] = v;
        }
    }
    varsDefCache.set(work, merged);
    return merged;
}

/**
 * `$EnumDef_<enumDefKey>` からハッシュキーの英語ラベルを解決する。
 * 解決できない場合は raw 値をそのまま返す（`resolveFromEnumDef` の英語専用版）。
 * @param {Record<string, any>} varsDef  loadMergedVarsDef() の返り値
 * @param {string} rawValue   '#TailShapeType_Fox' 等のハッシュキー
 * @param {string} enumDefKey '$EnumDef_TailShapeType' 等
 * @param {string} fieldBase  'TailShapeType' 等（JP/EN サフィックスのベース名）
 * @returns {string}
 */
function resolveEnumLabelEN(varsDef, rawValue, enumDefKey, fieldBase) {
    if (!rawValue) return '';
    const enumDef = varsDef ? varsDef[enumDefKey] : null;
    if (enumDef && typeof enumDef === 'object' && !Array.isArray(enumDef)) {
        const entry = Object.prototype.hasOwnProperty.call(enumDef, rawValue)
            ? enumDef[rawValue]
            : Object.values(enumDef).find((e) => e && e[fieldBase] === rawValue);
        if (entry && typeof entry === 'object') {
            return entry[`${fieldBase}_EN`] || entry[fieldBase] || entry[`${fieldBase}_JP`] || String(rawValue).trim();
        }
    }
    return String(rawValue).trim();
}

/**
 * `AppearanceDetail` エントリ 1 件の `Attrs[]` から英語フレーズを合成する。
 * `lib/section-renders/appearanceDetail.js` の buildAttrRows と同じ規約駆動フィールド
 * （vdict_* / value_Num_1+2 / value_Num / value_JP・EN / about_JP・EN）を読む。
 * value_EN が無く value_JP のみで代用した場合は `[JA] ...` を付けて警告ログへ積む
 * （創作内容の自動翻訳はしない。手動翻訳が必要なことを可視化するだけ）。
 *
 * @param {Array<Record<string, any>>|undefined} attrs
 * @param {Record<string, any>} varsDef
 * @param {string[]} warnings  警告メッセージの蓄積先
 * @param {number|string} num  ログ用のレコード番号
 * @returns {string|null}
 */
function buildAttrPhraseEN(attrs, varsDef, warnings, num) {
    if (!Array.isArray(attrs) || attrs.length === 0) return null;
    const rowPhrases = [];
    for (const attr of attrs) {
        if (!attr || typeof attr !== 'object') continue;
        const parts = [];
        let hasVdict = false;
        const numPairs = [];
        let numVal = null;
        let textJP = '', textEN = '';
        let aboutJP = '', aboutEN = '';
        for (const [k, v] of Object.entries(attr)) {
            if (k === 'AttrLabel' || v === null || v === undefined) continue;
            const sv = String(v).trim();
            if (!sv) continue;
            if (k.startsWith('vdict_')) {
                hasVdict = true;
                const label = resolveEnumLabelEN(varsDef, sv, `$EnumDef_${k.slice(6)}`, k.slice(6));
                parts.push(label || sv);
            } else if (/^value_Num_\d+$/.test(k)) {
                numPairs.push([k, v]);
            } else if (k === 'value_Num') {
                numVal = v;
            } else if (k === 'value_JP' && !textJP) {
                textJP = sv;
            } else if (k === 'value_EN' && !textEN) {
                textEN = sv;
            } else if (k === 'about_JP' && !aboutJP) {
                aboutJP = sv;
            } else if (k === 'about_EN' && !aboutEN) {
                aboutEN = sv;
            }
        }
        if (numPairs.length >= 2) {
            numPairs.sort((a, b) => a[0].localeCompare(b[0]));
            parts.push(`${numPairs[0][1]} x ${numPairs[1][1]}`);
        } else if (numPairs.length === 1) {
            parts.push(String(numPairs[0][1]));
        }
        if (numVal !== null) parts.push(String(numVal));

        if (!hasVdict && (textEN || textJP)) {
            if (textEN) {
                parts.push(textEN);
            } else {
                parts.push(`[JA] ${textJP}`);
                warnings.push(`#${num}: value_EN が未入力のため value_JP をそのまま使用 ("${textJP}") — 手動翻訳推奨`);
            }
        }
        if (aboutEN || aboutJP) {
            if (aboutEN) {
                parts.push(`(${aboutEN})`);
            } else {
                parts.push(`([JA] ${aboutJP})`);
                warnings.push(`#${num}: about_EN が未入力のため about_JP をそのまま使用 ("${aboutJP}") — 手動翻訳推奨`);
            }
        }
        if (parts.length) rowPhrases.push(parts.join(' '));
    }
    if (rowPhrases.length === 0) return null;
    return rowPhrases.join(', ');
}

/**
 * corefolder.natural_language_description を AppearanceDetail 由来の情報から直接組み立てる。
 * IdentityMotif モードの `buildCorefolderNldFromTemplate`（自由文からの正規表現抽出）とは異なり、
 * body_description / marking フレーズを機械的に連結するだけの素直な合成。抽出できない部分は
 * TODO を残す（存在しないデータを創作で埋めない）。
 *
 * @param {number|string} num
 * @param {{ body_description: string[], attached_items: string[] }} silhouetteNotes
 * @param {string[]} markingPhrases  corefolder 形態の NumberMark フレーズ群
 * @returns {string}
 */
function buildCorefolderNldFromAppearanceDetail(num, silhouetteNotes, markingPhrases) {
    const numStr = String(num);
    const bodyLines = (silhouetteNotes.body_description || [])
        .filter((s) => typeof s === 'string' && !/^spherical core body /i.test(s));
    const bodyPart = bodyLines.length > 0
        ? bodyLines.join('; ')
        : `TODO: base color / body description for #${numStr}`;
    const markingClause = markingPhrases.length > 0
        ? `with the number '${numStr}' marking (${markingPhrases.join('; ')})`
        : `with the number '${numStr}' TODO: marking placement for #${numStr}`;
    const accessoryPhrases = silhouetteNotes.attached_items || [];
    const accessoryPart = accessoryPhrases.length > 0 ? `; ${accessoryPhrases[0]}` : '';
    // tests/aihints.schema.test.js の「a spherical cushion-like body in ...」テンプレ検証と揃える
    // （IdentityMotif モードの buildCorefolderNldFromTemplate と同じ house style）。
    return `Corefolder form: a spherical cushion-like body in ${bodyPart}, ${markingClause}${accessoryPart}.`;
}

/**
 * `AppearanceDetail` を AIHints へ反映する際の AIHints オブジェクト全体を組み立てる。
 * 既存 AIHints は **reference_images / age_appearance / work_common / alt_modes** のみ流用し、
 * その他は AppearanceDetail と構造的正源（TailsUnit / Height_cm / ConceptAge）から再構築する。
 *
 * @param {any} record  パース済みレコード（AppearanceDetail と AIHints を含む）
 * @param {Record<string, any>} varsDef  loadMergedVarsDef() の返り値
 * @returns {{ aihints: any, hasSource: boolean, formationsTouched: string[], warnings: string[] }}
 */
function buildAihintsFromAppearanceDetail(record, varsDef) {
    const num = record.Num;
    const baseAihints = record.AIHints ?? {};
    const existingCommon = baseAihints.common ?? {};
    const existingForms = baseAihints.forms ?? {};
    /** @type {string[]} */
    const warnings = [];

    const source = Array.isArray(record.AppearanceDetail) ? record.AppearanceDetail : [];

    // ── 構造的正源（AppearanceDetail の記述より優先）──────────────
    const tailDesc = (() => {
        const parsed = parseTailsUnit(record.TailsUnit);
        if (!parsed) return null;
        const desc = buildTailDescription(parsed);
        return (typeof desc === 'string' && !desc.startsWith('TODO:')) ? desc : null;
    })();
    const statureDesc = heightBandOf(record.Height_cm);
    const ageBand = (typeof record.ConceptAge === 'number' && Number.isFinite(record.ConceptAge))
        ? ageBandOf(record.ConceptAge)
        : (('age_appearance' in existingCommon) ? existingCommon.age_appearance : null);

    // ── 各エントリを分類してフレーズ化 ────────────────────────────
    /** @type {Array<{ formation: string|null, category: string, phrase: string }>} */
    const classifiedEntries = [];
    for (const entry of source) {
        if (!entry || typeof entry !== 'object') continue;
        const category = ELEMENT_CATEGORY.get(entry.DesignElement) ?? 'misc';
        if (category === 'skip') continue;
        if (category === 'misc' && entry.DesignElement) {
            warnings.push(`#${num}: 未知の DesignElement "${entry.DesignElement}" を outfit_features 側へフォールバック分類`);
        }
        const phrase = buildAttrPhraseEN(entry.Attrs, varsDef, warnings, num);
        if (!phrase) continue;
        classifiedEntries.push({ formation: (typeof entry.Formation === 'string' ? entry.Formation : null), category, phrase });
    }

    if (classifiedEntries.length === 0) {
        return { aihints: baseAihints, hasSource: false, formationsTouched: [], warnings };
    }

    const sharedEntries = classifiedEntries.filter((e) => e.formation === null);
    /** @type {Map<string, Array<{ formation: string, category: string, phrase: string }>>} */
    const formSpecific = new Map();
    for (const e of classifiedEntries) {
        if (e.formation === null) continue;
        if (!formSpecific.has(e.formation)) formSpecific.set(e.formation, []);
        formSpecific.get(e.formation).push(e);
    }

    // formSpecific に無い（＝形態固有の言及が一件も無い）既存 formation にも、
    // Formation=null の共通エントリは適用されるべきなので、既存 AIHints.forms のキーと
    // 和集合を取る。formSpecific のキーだけを対象にすると、「共通エントリ＋一部の形態にだけ
    // 固有言及がある」レコードで、固有言及の無い方の形態が共通エントリ未適用のまま
    // 「言及されていない formation」としてクリアされてしまう（実データ #16 等で確認済みの不具合）。
    const formationsTouchedSet = new Set(formSpecific.keys());
    for (const k of Object.keys(existingForms)) formationsTouchedSet.add(k);
    let formationsTouched = [...formationsTouchedSet];

    const pushUnique = (arr, seen, s) => {
        const nk = normalizeMotifEntry(s);
        if (!nk || seen.has(nk)) return;
        seen.add(nk);
        arr.push(s);
    };

    /** @type {Record<string, any>} */
    const newForms = {};
    /** @type {Map<string, string[]>} corefolder NLD 用に marking フレーズを別途保持 */
    const markingPhrasesByForm = new Map();

    for (const formKey of formationsTouched) {
        const isCorefolder = formKey === 'corefolder';
        const existingForm = existingForms ? existingForms[formKey] : null;
        const ownEntries = formSpecific.get(formKey) ?? [];
        const allForForm = [...sharedEntries, ...ownEntries];

        const formTags = [`${formKey} form`];

        const outfitFeatures = [];
        const outfitSeen = new Set();
        const attachedItems = [];
        const attachedSeen = new Set();
        const bodyDescription = [];
        const bodySeen = new Set();
        const markingPhrases = [];

        for (const e of allForForm) {
            if (e.category === 'outfit' || e.category === 'misc') pushUnique(outfitFeatures, outfitSeen, e.phrase);
            else if (e.category === 'attached') pushUnique(attachedItems, attachedSeen, e.phrase);
            else if (e.category === 'body') pushUnique(bodyDescription, bodySeen, e.phrase);
            else if (e.category === 'marking') markingPhrases.push(e.phrase);
            // 'expression' は common.expression_tendency 側で扱うため per-form には積まない
        }
        markingPhrasesByForm.set(formKey, markingPhrases);

        const silhouetteNotes = { body_description: [], attached_items: attachedItems };
        if (isCorefolder) {
            silhouetteNotes.body_description.push(
                'spherical core body with the head as the only protruding part on top',
            );
        }
        silhouetteNotes.body_description.push(...bodyDescription);

        const aiTags = [];
        const aiTagSeen = new Set();
        pushUnique(aiTags, aiTagSeen, formTags[0]);
        if (tailDesc) pushUnique(aiTags, aiTagSeen, tailDesc);
        if (statureDesc) pushUnique(aiTags, aiTagSeen, statureDesc);
        if (ageBand && typeof ageBand === 'string' && !ageBand.startsWith('TODO')) pushUnique(aiTags, aiTagSeen, ageBand);
        for (const e of allForForm) pushUnique(aiTags, aiTagSeen, e.phrase);

        // negative_visuals: 他 formation 固有の outfit/attached フレーズ（body・marking は除外）
        const negativeVisuals = [];
        const negSeen = new Set();
        for (const [otherKey, otherEntries] of formSpecific.entries()) {
            if (otherKey === formKey) continue;
            for (const e of otherEntries) {
                if (e.category !== 'outfit' && e.category !== 'attached') continue;
                pushUnique(negativeVisuals, negSeen, e.phrase);
            }
        }

        const immutableConstraints = isCorefolder ? [...COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS] : null;
        const negativeKeywords = isCorefolder ? [...COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS] : null;
        const promptExport = aiTags.join(', ');
        const negativePromptExport = negativeVisuals.join(', ');
        const referenceImages = (existingForm && typeof existingForm === 'object' && 'reference_images' in existingForm)
            ? existingForm.reference_images
            : null;

        // 既存 form のスキーマ外キーも保持したまま既知フィールドだけ上書きする。
        const formObj = {
            ...(existingForm && typeof existingForm === 'object' ? existingForm : {}),
            form_tags: formTags,
            outfit_features: outfitFeatures,
            silhouette_notes: silhouetteNotes,
            immutable_constraints: immutableConstraints,
            negative_keywords: negativeKeywords,
            ai_tags: aiTags,
            negative_visuals: negativeVisuals,
            natural_language_description: null, // corefolder は後段でテンプレ生成、他は null のまま
            prompt_export: promptExport,
            negative_prompt_export: negativePromptExport,
            reference_images: referenceImages,
        };
        newForms[formKey] = reorderObjectKeys(formObj, [
            'form_tags', 'outfit_features',
            'silhouette_notes', 'immutable_constraints', 'negative_keywords',
            'ai_tags', 'negative_visuals',
            'natural_language_description', 'prompt_export', 'negative_prompt_export',
            'reference_images',
        ]);
    }

    // 補足: formationsTouched は既存 AIHints.forms のキーを常に包含するよう組み立てて
    // あるため（上記）、「言及されていない既存 formation」は原理的に発生しない。

    // ── common の組み立て ──────────────────────────────────────────
    const identityTags = [];
    const idSeen = new Set();
    const silhouetteFeatures = [];
    const sfSeen = new Set();
    if (tailDesc) pushUnique(silhouetteFeatures, sfSeen, tailDesc);
    if (statureDesc) pushUnique(silhouetteFeatures, sfSeen, statureDesc);
    const expressionTendency = [];
    const exSeen = new Set();
    const markingLinesShared = [];

    for (const e of sharedEntries) {
        if (e.category === 'body') {
            pushUnique(identityTags, idSeen, e.phrase);
            pushUnique(silhouetteFeatures, sfSeen, e.phrase);
        } else if (e.category === 'expression') {
            pushUnique(expressionTendency, exSeen, e.phrase);
        } else if (e.category === 'outfit' || e.category === 'attached' || e.category === 'misc') {
            pushUnique(identityTags, idSeen, e.phrase);
        } else if (e.category === 'marking') {
            markingLinesShared.push(e.phrase);
        }
    }

    const newCommon = {
        identity_tags: identityTags,
        silhouette_features: silhouetteFeatures,
        immutable_traits: markingLinesShared.length > 0
            ? markingLinesShared.map((p) => `number '${num}' marking: ${p}`)
            : null,
        expression_tendency: expressionTendency.length > 0 ? expressionTendency : null,
        age_appearance: (typeof ageBand === 'string' && ageBand) ? ageBand : null,
        palette_priority: null,
        natural_language_description: null,
        reference_images: ('reference_images' in existingCommon) ? existingCommon.reference_images : null,
    };
    const orderedCommon = reorderObjectKeys(newCommon, [
        'identity_tags', 'silhouette_features', 'immutable_traits',
        'expression_tendency', 'age_appearance', 'palette_priority',
        'natural_language_description', 'reference_images',
    ]);

    // baseAihints を先にスプレッドし、`concept_contains_forms` 等スキーマ外の既存トップレベル
    // キーを保持したまま common/work_common/forms/alt_modes だけを上書きする。
    const newAihints = {
        ...baseAihints,
        common: orderedCommon,
        work_common: ('work_common' in baseAihints) ? baseAihints.work_common : null,
        forms: newForms,
        alt_modes: ('alt_modes' in baseAihints) ? baseAihints.alt_modes : null,
    };

    // ── corefolder NLD を AppearanceDetail 由来の情報から直接組み立て ──
    if (newForms.corefolder) {
        const nld = buildCorefolderNldFromAppearanceDetail(
            num, newForms.corefolder.silhouette_notes, markingPhrasesByForm.get('corefolder') ?? [],
        );
        newForms.corefolder.natural_language_description = nld;
    }

    return {
        aihints: reorderObjectKeys(newAihints, ['common', 'work_common', 'forms', 'alt_modes']),
        hasSource: true,
        formationsTouched,
        warnings,
    };
}

// AppearanceDetail が無い／全空のレコードに対する fallback は IdentityMotif モードと処理内容が
// 完全に同一（AIHints の構造をタグだけ空へクリアする）ため、既存関数をそのまま共用する。
const clearAihintsTagsForNoAppearanceDetail = clearAihintsTagsForNoIdentityMotif;

/**
 * 1レコード分の AIHints を AppearanceDetail 駆動で再構築する（--apply-appearancedetail モード）。
 *
 * @param {string} text
 * @param {number} openIdx
 * @param {number} closeIdx
 * @param {any} record
 * @param {Record<string, any>} varsDef
 * @returns {{ text: string, changed: boolean, status: 'appearancedetail-applied'|'appearancedetail-unchanged'|'appearancedetail-cleared'|'appearancedetail-no-source'|'skipped-no-aihints', warnings: string[] }}
 */
function applyAppearanceDetailToAihintsInRecord(text, openIdx, closeIdx, record, varsDef) {
    if (!record.AIHints) {
        return { text, changed: false, status: 'skipped-no-aihints', warnings: [] };
    }

    const { aihints: newAihints, hasSource, warnings } = buildAihintsFromAppearanceDetail(record, varsDef);

    /** @type {any} */
    let finalAihints;
    /** @type {'appearancedetail-applied'|'appearancedetail-unchanged'|'appearancedetail-cleared'|'appearancedetail-no-source'} */
    let status;

    if (!hasSource) {
        finalAihints = clearAihintsTagsForNoAppearanceDetail(record.AIHints);
        status = 'appearancedetail-cleared';
    } else {
        finalAihints = newAihints;
        status = 'appearancedetail-applied';
    }

    const existingJson = JSON.stringify(record.AIHints);
    const newJson = JSON.stringify(finalAihints);
    if (existingJson === newJson) {
        return { text, changed: false, status: hasSource ? 'appearancedetail-unchanged' : 'appearancedetail-no-source', warnings };
    }

    const block = stringifyAihintsBlock(finalAihints);
    return {
        text: replaceAihintsInRecord(text, openIdx, closeIdx, block),
        changed: true,
        status,
        warnings,
    };
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

        // _Secondaries カテゴリ別 AI_Optout チェック
        if (opts.secondaryOptoutMap?.size > 0 || opts.secondaryDefaultOptout) {
            const seriesTitle = record.sec_SeriesTitle ?? null;
            const isOptout = seriesTitle != null
                ? opts.secondaryOptoutMap.get(seriesTitle) === true
                : opts.secondaryDefaultOptout;
            if (isOptout && !opts.forceAiOptout) {
                results.push({ num, status: 'skipped-ai-optout', note: `sec_SeriesTitle="${seriesTitle}"` });
                continue;
            }
            if (isOptout && opts.forceAiOptout && opts.verbose) {
                console.warn(`[WARN] AI_Optout カテゴリを --force-ai-optout でバイパス: Num=${num}, sec_SeriesTitle="${seriesTitle}"`);
            }
        }

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

        // --migrate-silhouette-structure モード: 既存 flat array 形式 silhouette_notes を
        // { body_description, attached_items } object 形式へ機械分類で移行する。
        // 2026-06-09 レビュー対応専用。冪等（既に object なら no-op）。
        if (opts.migrateSilhouetteStructure) {
            if (!hasAihints) {
                results.push({ num, status: 'skipped-no-aihints' });
                continue;
            }
            const { text: newText, changed } = migrateSilhouetteStructureInRecord(
                text, openIdx, closeIdx, record,
            );
            text = newText;
            results.push({ num, status: changed ? 'silhouette-migrated' : 'silhouette-unchanged' });
            continue;
        }

        // --rewrite-corefolder-nld モード: forms.corefolder.natural_language_description を
        // 球体本体テンプレートで再生成する。--force-rewrite-nld 指定時は既存テンプレ形も上書き。
        if (opts.rewriteCorefolderNld) {
            if (!hasAihints) {
                results.push({ num, status: 'skipped-no-aihints' });
                continue;
            }
            const { text: newText, changed, warnings } = rewriteCorefolderNldInRecord(
                text, openIdx, closeIdx, record, opts.forceRewriteNld,
            );
            text = newText;
            for (const w of warnings) {
                console.warn(`[rewrite-corefolder-nld] ${w}`);
            }
            results.push({ num, status: changed ? 'nld-rewritten' : 'nld-unchanged' });
            continue;
        }

        // --apply-identitymotif モード: IdentityMotif を AI タグの正として AIHints を再構築。
        // 既存 reference_images / age_appearance / work_common / alt_modes は据え置き。
        if (opts.applyIdentityMotif) {
            if (!hasAihints) {
                results.push({ num, status: 'skipped-no-aihints' });
                continue;
            }
            const { text: newText, changed, status } = applyIdentityMotifToAihintsInRecord(
                text, openIdx, closeIdx, record,
            );
            text = newText;
            results.push({ num, status: changed ? status : (status === 'skipped-no-aihints' ? status : 'identitymotif-unchanged') });
            continue;
        }

        // --apply-appearancedetail モード: AppearanceDetail を AI タグの正として AIHints を再構築。
        // 既存 reference_images / age_appearance / work_common / alt_modes は据え置き。
        if (opts.applyAppearanceDetail) {
            if (!hasAihints) {
                results.push({ num, status: 'skipped-no-aihints' });
                continue;
            }
            const varsDef = loadMergedVarsDef(opts.work);
            const { text: newText, changed, status, warnings } = applyAppearanceDetailToAihintsInRecord(
                text, openIdx, closeIdx, record, varsDef,
            );
            text = newText;
            for (const w of warnings) console.warn(`[apply-appearancedetail] ${w}`);
            results.push({ num, status: changed ? status : (status === 'skipped-no-aihints' ? status : 'appearancedetail-unchanged') });
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

    // ---- _Secondaries カテゴリ別 AI_Optout マップ構築 ----
    // DB レベルの AI_Optout がない場合でも、_Secondaries の各カテゴリが
    // 個別に AI_Optout: true を持つ場合はレコード単位でスキップできるよう opts に注入する。
    opts.secondaryOptoutMap = new Map();
    opts.secondaryDefaultOptout = false;
    if (fs.existsSync(dbMetaPath)) {
        try {
            const dbMeta = JSON.parse(fs.readFileSync(dbMetaPath, 'utf8'));
            const dbEntry = dbMeta?.Databases?.[`#DB_${opts.db}`]
                ?? dbMeta?.Databases?.[`#Ref_${opts.db}`];
            for (const sec of (dbEntry?._Secondaries ?? [])) {
                if (sec.AI_Optout !== true) continue;
                if (sec.sec_SeriesTitle != null) {
                    opts.secondaryOptoutMap.set(sec.sec_SeriesTitle, true);
                } else {
                    opts.secondaryDefaultOptout = true;
                }
            }
            if (opts.secondaryOptoutMap.size > 0 || opts.secondaryDefaultOptout) {
                const titles = [...opts.secondaryOptoutMap.keys()].map(t => `"${t}"`).join(', ');
                const defaultNote = opts.secondaryDefaultOptout ? ' + デフォルト(null)' : '';
                console.log(`[INFO] _Secondaries AI_Optout: ${titles}${defaultNote}`);
            }
        } catch {
            // db_meta.json 読み込み失敗時は per-category チェックもスキップ
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
        'silhouette-migrated': 0, 'silhouette-unchanged': 0,
        'nld-rewritten': 0, 'nld-unchanged': 0,
        'identitymotif-applied': 0, 'identitymotif-unchanged': 0, 'identitymotif-cleared': 0, 'identitymotif-no-source': 0,
        'appearancedetail-applied': 0, 'appearancedetail-unchanged': 0, 'appearancedetail-cleared': 0, 'appearancedetail-no-source': 0,
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
    } else if (opts.migrateSilhouetteStructure) {
        console.log(`  silhouette-migrated=${counts['silhouette-migrated']}, silhouette-unchanged=${counts['silhouette-unchanged']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else if (opts.rewriteCorefolderNld) {
        console.log(`  nld-rewritten=${counts['nld-rewritten']}, nld-unchanged=${counts['nld-unchanged']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else if (opts.applyIdentityMotif) {
        console.log(`  identitymotif-applied=${counts['identitymotif-applied']}, identitymotif-cleared=${counts['identitymotif-cleared']}, identitymotif-unchanged=${counts['identitymotif-unchanged']}, identitymotif-no-source=${counts['identitymotif-no-source']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else if (opts.applyAppearanceDetail) {
        console.log(`  appearancedetail-applied=${counts['appearancedetail-applied']}, appearancedetail-cleared=${counts['appearancedetail-cleared']}, appearancedetail-unchanged=${counts['appearancedetail-unchanged']}, appearancedetail-no-source=${counts['appearancedetail-no-source']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else if (opts.applyVisionResults) {
        console.log(`  vision-applied=${counts['vision-applied']}, vision-unchanged=${counts['vision-unchanged']}, vision-no-result=${counts['vision-no-result']}, skipped-no-aihints=${counts['skipped-no-aihints']}`);
    } else {
        const aiOptoutNote = counts['skipped-ai-optout'] ? `, skipped-ai-optout=${counts['skipped-ai-optout']}` : '';
        console.log(`  patched=${counts.patched}, overwritten=${counts.overwritten}, skipped-existing=${counts['skipped-existing']}, skipped-no-image=${counts['skipped-no-image']}${aiOptoutNote}`);
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
