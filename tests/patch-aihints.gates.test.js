/**
 * AIHints 付与ゲートの前提条件テスト（実データ）
 *
 * @description
 *   AIHints の付与可否は 3 層で判定される。本テストは、この分離が依拠している
 *   「実データ上の前提」を CI に固定し、前提が崩れたら気づけるようにする。
 *
 *     1. `AI_Optout`（`Databases.#DB_*` / `_Secondaries[]`）… **権利上の可否**（付与不可 / exit 2）
 *     2. `skipped-no-image`                                … データ充填ガード（画像が 1 枚も無い）
 *     3. `AI_Unready`（`$EnumDef_Progress` の各エントリ）    … **進捗の未成熟**（付与不要 / soft skip）
 *
 *   1 と 3 は別軸。前者は対外的な権利表明、後者は内部の充填状況であり、
 *   後者は既存 AIHints の保守モードを止めない。詳細は `docs/api-sw-spec.md` §5.5。
 *
 *   ★ 固定している前提:
 *     (a) `AI_Unready` な Progress かつ画像ありの scaffold 候補が 1 件以上ある
 *         → ゲートが no-op ではない（実効している）ことの確認。
 *         ※ 対象レコードの Num は**列挙しない**。キャラ追加や画像追加のたびに期待値の
 *           書き換えが必要になり、CI を繰り返し落としていたため（2026-08-13 / 2026-08-14）。
 *           「どの Progress 語彙をブロックするか」の回帰は下段の
 *           `loadAiUnreadyProgressValues` の宣言テストが担保しており、実データの
 *           スナップショットを重ねて固定する必要はない。
 *     (b) Primary の AIHints の identity_tags に `TODO:` 接頭辞は無い
 *         → `classTagsOf`（Class 辞書 fallback を持つ）の唯一の呼び出し経路である
 *           `--fill-todos` は Primary に到達しない。クラス辞書の変更が Primary の
 *           既存 AIHints を書き換えないことの構造的な根拠。
 *
 *   ★ `AI_Optout` ブロックの方針（2026-08-19 整備）:
 *     宣言箇所の**列挙をやめ、データが増えても成立し続ける規則**だけを固定した。
 *       (1) 全作品横断の規則 … 綴りは `AI_Optout` のみ / 値は boolean /
 *           第三者がデザインに関与するカテゴリは必ず `true`。走査は再帰で、
 *           ネスト DB（`#DB_Secondary.#DB_UnprocessedSecondary`）の宣言も取りこぼさない。
 *       (2) NumberTales の意味論の骨格のみ実データで固定 … DB レベルの可否と、
 *           カテゴリ単位の混在を `findSecondaryDef` が撃ち分けられること。
 *     旧テストは「SelfSecondary の全カテゴリが `false`」という全称だったが、
 *     D-Vines カテゴリの opt-out 宣言（2026-08-19）で成立しなくなった。経緯は各テストの注釈。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecondaryDef, loadAiUnreadyProgressValues } from '../tools/patch-aihints.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const TARGET_DBS = ['db_Primary.json', 'db_SemiPrimary.json', 'db_SelfSecondary.json'];

/**
 * @param {string} dbFile
 * @returns {Array<any>}
 */
function loadDb(dbFile) {
    return JSON.parse(readFileSync(join(repoRoot, 'data/Works_NumberTales/DataBases', dbFile), 'utf-8'));
}

/**
 * レコードが画像を 1 つでも持つか（patch-aihints.mjs の画像ゲート相当の粗い判定）
 * @param {any} rec
 * @returns {boolean}
 */
function hasAnyImage(rec) {
    const images = rec?.Images;
    if (!images || typeof images !== 'object') return false;
    return Object.values(images).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
}

describe('ゲートの前提条件（実データ）', () => {
    it('Progress ゲートが実効している（scaffold 候補のうち `AI_Unready` なレコードが存在する）', () => {
        // ★ 判定対象は「scaffold 候補」= 画像があり、かつ AIHints を**まだ持たない**レコードだけ。
        //   既存 AIHints 保持レコードは前段の skipped-existing で落ちるためゲートに到達しない。
        //   実際 Primary の Num "10-alt" は stillTentative かつ画像ありだが AIHints 保持済みで、
        //   ゲートの影響を受けない（＝この条件を外すと対象を過大に見積もることになる）。
        const unready = loadAiUnreadyProgressValues('NumberTales');
        const gated = [];
        for (const dbFile of TARGET_DBS) {
            for (const rec of loadDb(dbFile)) {
                if (rec?.AIHints) continue;
                if (unready.has(rec?.Progress) && hasAnyImage(rec)) {
                    gated.push(`${dbFile} Num=${JSON.stringify(rec.Num)}`);
                }
            }
        }
        // 0 件になったら「未成熟なのに画像があるレコード」が 1 件も無い＝ゲートが素通り状態。
        // `AI_Unready` の宣言漏れや画像ゲートとの二重掛けで実効しなくなった場合に気づくための下限。
        // 上限は設けない（キャラ・画像の追加は日常運用であり、そのたびに落とす価値が無い）。
        expect(gated.length).toBeGreaterThan(0);
    });

    it('既存 AIHints を持つ `AI_Unready` なレコードはゲートに到達しない（skipped-existing が前段のため無傷）', () => {
        // Primary の Num "10-alt"（stillTentative・画像あり・AIHints 保持）が該当。
        // ゲート追加後も skipped-existing で落ち、既存 AIHints は書き換わらない。
        const unready = loadAiUnreadyProgressValues('NumberTales');
        const protectedRecs = loadDb('db_Primary.json')
            .filter((r) => r?.AIHints && unready.has(r?.Progress))
            .map((r) => r.Num);
        expect(protectedRecs).toEqual(['10-alt']);
    });

    it('Primary の AIHints の identity_tags に TODO: 接頭辞は無い（クラス辞書変更が Primary に到達しない根拠）', () => {
        const withTodo = [];
        for (const rec of loadDb('db_Primary.json')) {
            const tags = rec?.AIHints?.common?.identity_tags;
            if (!Array.isArray(tags)) continue;
            if (tags.some((t) => typeof t === 'string' && t.startsWith('TODO:'))) {
                withTodo.push(rec.Num);
            }
        }
        expect(withTodo).toEqual([]);
    });

    it('Primary の AIHints 件数が 92 のまま（本ラウンドは seed しないため不変であるべき）', () => {
        const count = loadDb('db_Primary.json').filter((r) => r?.AIHints).length;
        expect(count).toBe(92);
    });

    it('SemiPrimary / SelfSecondary には AIHints がまだ無い（本ラウンドは基盤整備のみ）', () => {
        // seed した将来ラウンドではこの期待値を更新し、あわせて
        // tests/aihints.schema.test.js を DB パラメータ化すること。
        expect(loadDb('db_SemiPrimary.json').filter((r) => r?.AIHints).length).toBe(0);
        expect(loadDb('db_SelfSecondary.json').filter((r) => r?.AIHints).length).toBe(0);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// AI_Optout（権利軸）の宣言テスト
//
// ★ 方針（2026-08-19 整備）: 宣言箇所を**列挙しない**。
//   キャラ・DB・作品の追加は日常運用であり、スナップショットを重ねると
//   2026-08-13 / 08-14 の Progress ゲートと同じく CI が繰り返し落ちる
//   （`_work_in_progress/2026-08-14_progress_aihints-resync-gate-test.md`）。
//   代わりに「データが増えても成立し続ける規則」だけを固定する。
// ────────────────────────────────────────────────────────────────────────────

/**
 * リポジトリ内の全 `db_meta.json` を 1 回だけ走査し、
 * `AI_Optout` の宣言箇所と `_Secondaries[]` の定義を集める。
 *
 * @description
 *   ★ ノード走査を**再帰**にしているのは、DB エントリがネストしうるため。
 *     実データに `Databases.#DB_Secondary.#DB_UnprocessedSecondary` が存在し、
 *     `Databases.#DB_*` の 1 階層だけを見る実装ではその宣言を取りこぼす。
 *   ★ 対象はグローバル / 作品別 / `References/` を問わず全ファイル。
 *     opt-out は権利軸の対外表明なので、AIHints の対象 DB だけを見ても足りない。
 *
 * @returns {{ files: string[], decls: Array<{ file: string, at: string, key: string, value: unknown }>,
 *             secs: Array<{ file: string, at: string, def: any }> }}
 */
function scanAllDbMeta() {
    const files = [];
    const decls = [];
    const secs = [];

    const walkDir = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, e.name);
            if (e.isDirectory()) walkDir(p);
            else if (e.name === 'db_meta.json') files.push(p);
        }
    };
    walkDir(join(repoRoot, 'data'));

    const walkNode = (node, file, trail) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach((v, i) => walkNode(v, file, [...trail, i]));
            return;
        }
        for (const [k, v] of Object.entries(node)) {
            // 綴り違いも拾いたいので、正確なキー名ではなく緩いパターンで検出する
            if (/opt.?out/i.test(k)) decls.push({ file, at: [...trail, k].join('.'), key: k, value: v });
            if (k === '_Secondaries' && Array.isArray(v)) {
                v.forEach((def, i) => secs.push({ file, at: [...trail, k, i].join('.'), def }));
            }
            walkNode(v, file, [...trail, k]);
        }
    };
    for (const f of files) {
        walkNode(JSON.parse(readFileSync(f, 'utf-8')), f.slice(repoRoot.length + 1), []);
    }
    return { files, decls, secs };
}

/** 走査は重くないが全テストで共有する（37 ファイル前後） */
const META_SCAN = scanAllDbMeta();

/** 作者名のうち User 本人を指すもの。これ以外が `sec_DesignedBy` に入る＝第三者の関与 */
const USER_DESIGNER = 'RadianN';

describe('AI_Optout の宣言（全作品横断の規則）', () => {
    it('宣言キーの綴りは `AI_Optout` ちょうど 1 種類', () => {
        // ★ 綴り違い（`AI_OptOut` 等）は例外にならず、既定の `false`＝**許可**へ黙って落ちる。
        //   opt-out の取りこぼしは権利上の事故になるため、値の検査より先にキーを固定する。
        expect(META_SCAN.decls.length).toBeGreaterThan(0); // 走査の空振りで no-op 化するのを防ぐ下限
        expect(META_SCAN.decls.filter((d) => d.key !== 'AI_Optout')).toEqual([]);
    });

    it('`AI_Optout` の値は必ず boolean', () => {
        // 型が崩れると両方向に事故る: 文字列 `"false"` は truthy 判定の実装で opt-out 扱いになり、
        // 文字列 `"true"` は厳密比較（`AI_Optout === true`）の実装で opt-out が黙って消える。
        const bad = META_SCAN.decls
            .filter((d) => typeof d.value !== 'boolean')
            .map((d) => `${d.file} ${d.at}=${JSON.stringify(d.value)}`);
        expect(bad).toEqual([]);
    });

    it('第三者がデザインに関与する `_Secondaries` カテゴリは必ず `AI_Optout: true`', () => {
        // ★ 規則テスト（列挙しない）: `sec_DesignedBy` に User 以外が入る＝第三者の権利が絡む。
        //   新しい共同 / 協賛シリーズを足したときの宣言忘れをここで検知する。
        //   ※ **片方向の含意**であり、逆（User 単独なら false）は成り立たない。
        //     `#DB_SelfSecondary` の D-Vines は `sec_DesignedBy: ["RadianN"]` だが、
        //     シリーズ自体が散狐アタストさんの提案による協賛企画なので `true`。
        const thirdParty = META_SCAN.secs.filter(
            ({ def }) => Array.isArray(def.sec_DesignedBy) && def.sec_DesignedBy.some((by) => by !== USER_DESIGNER)
        );
        expect(thirdParty.length).toBeGreaterThan(0); // 該当 0 件なら規則が実効していない
        const missing = thirdParty
            .filter(({ def }) => def.AI_Optout !== true)
            .map(({ file, at, def }) => `${file} ${at} by=${JSON.stringify(def.sec_DesignedBy)}`);
        expect(missing).toEqual([]);
    });
});

describe('AI_Optout の意味論（NumberTales 実データ）', () => {
    const dbMeta = JSON.parse(readFileSync(join(repoRoot, 'data/Works_NumberTales/DataBases/db_meta.json'), 'utf-8'));
    const DBS = dbMeta.Databases;

    it('User 単独作の DB は DB レベルで `AI_Optout: false` を明示している', () => {
        // いずれも User 自身の創作物であり、権利上の opt-out は不要。
        // 暗黙の既定（未宣言→false）に依存させず、意思表示として明示する。
        for (const key of ['#DB_Primary', '#DB_SemiPrimary', '#DB_SelfSecondary']) {
            expect(DBS[key].AI_Optout).toBe(false);
        }
    });

    it('Secondary は全 `_Secondaries` カテゴリとネスト DB が `AI_Optout: true`', () => {
        // ★ 2026-08-19: 固定対象を SelfSecondary → Secondary へ移した。
        //   旧テストは「SelfSecondary の全カテゴリが false」を固定していた（2026-07-17 の
        //   「AI_Optout を権利軸へ純化」= catch-all の true を落とした修正の回帰テスト）。
        //   同日 SelfSecondary の「散狐アタストさん協賛」(D-Vines) へ true が入り、全称が崩れた。
        //   Secondary 側は全カテゴリが第三者デザインを含むため全称が構造的に成立し、
        //   カテゴリ追加時も true であるべき側なので、スナップショットとして安定する。
        const secs = DBS['#DB_Secondary']._Secondaries;
        expect(secs.length).toBeGreaterThan(0);
        expect(secs.filter((s) => s.AI_Optout !== true)).toEqual([]);
        // ネストした DB エントリ（未整理の二次創作枠）。DB_Hidden とは別軸なので個別に宣言が要る。
        expect(DBS['#DB_Secondary']['#DB_UnprocessedSecondary'].AI_Optout).toBe(true);
    });

    it('SelfSecondary はカテゴリ単位で opt-in / opt-out が混在し、`findSecondaryDef` が撃ち分ける', () => {
        // ★ 混在は 2026-07-17 の「権利軸へ純化」の巻き戻しではない。
        //   あのとき落とした catch-all の true は「キャラデザ未着手なので渡したくない」という
        //   充填ガードの代理（その意味論は AI_Unready / 画像ゲートへ移譲済み）。
        //   今回の D-Vines の true は第三者の関与に基づく本来の権利軸宣言で、向きが逆。
        const defs = DBS['#DB_SelfSecondary']._Secondaries;
        expect(defs.some((d) => d.AI_Optout === true)).toBe(true);
        expect(defs.some((d) => d.AI_Optout === false)).toBe(true);

        // 実データのレコードを通した結線確認（Num は列挙しない＝キャラ追加で落ちない）
        const records = loadDb('db_SelfSecondary.json');
        const optout = records.filter((r) => findSecondaryDef(r, defs)?.AI_Optout === true);
        expect(optout.length).toBeGreaterThan(0);
        expect(optout.every((r) => r.sec_SeriesTitle === 'D-Vines')).toBe(true);

        // 逆側: 「リクエストナンバー」が catch-all に巻き込まれず opt-in のままであること
        // （sec_SeriesTitle: null の定義が複数ある DB での誤スキップ = 2026-07-17 の本命バグ）。
        const optin = records.filter((r) => r.sec_Category === 'リクエストナンバー');
        expect(optin.length).toBeGreaterThan(0);
        expect(optin.every((r) => findSecondaryDef(r, defs)?.AI_Optout === false)).toBe(true);
    });
});

describe('loadAiUnreadyProgressValues: $EnumDef_Progress からの解決', () => {
    const unready = loadAiUnreadyProgressValues('NumberTales');

    it('AI_Unready: true を明示した進捗段階を拾う', () => {
        // User が明示的にガード対象として挙げた 4 語
        expect(unready.has('notProceeded')).toBe(true);
        expect(unready.has('stillTentative')).toBe(true);
        expect(unready.has('nowCreating')).toBe(true);
        expect(unready.has('archived')).toBe(true);
    });

    it('AI_Unready 未宣言でも isForSecondary: true なら拾う（フォールバック）', () => {
        // 二次創作向けの 4 語は AI_Unready を宣言していないが、フォールバックで拾われる
        expect(unready.has('founded')).toBe(true);
        expect(unready.has('accepted')).toBe(true);
        expect(unready.has('accepted\nnowRemaking')).toBe(true);
        expect(unready.has('accepted\nremadeReleased')).toBe(true);
    });

    it('AI_Unready: false の進捗段階は通す', () => {
        expect(unready.has('released')).toBe(false);
        expect(unready.has('released(beta)')).toBe(false);
        expect(unready.has('unreleased')).toBe(false);
        expect(unready.has('unprofiled')).toBe(false);
        // nowCreating（制作中）はガードするが nowRecreating（再制作中）は許可（User 判断）
        expect(unready.has('nowRecreating')).toBe(false);
    });

    it('ブロック対象はちょうど 8 語', () => {
        expect(unready.size).toBe(8);
    });

    it('`archived` は isForSecondary: null なのでフォールバックでは拾えず、AI_Unready の明示が効いている', () => {
        // ★ この 1 件が「どちらの網にもかからず黙って許可側へ落ちる」失敗モードの実例だった。
        //   AI_Unready の明示を外すとフォールバック（=== true）に引っかからず素通りする。
        //   網羅性そのものは tests/data.shape.test.js のガードが担保する。
        const entry = JSON.parse(readFileSync(join(repoRoot, 'data/db_meta.json'), 'utf-8'))
            .General.$VarsDef.$EnumDef_Progress['#Progress_Archived'];
        expect(entry.isForSecondary).toBeNull();
        expect(entry.AI_Unready).toBe(true);
    });

    it('存在しない作品でもグローバル分を返す（欠損耐性）', () => {
        expect(loadAiUnreadyProgressValues('NoSuchWorkXYZ').has('notProceeded')).toBe(true);
    });

    it('同一 work の再呼び出しでキャッシュが効く', () => {
        expect(loadAiUnreadyProgressValues('NumberTales')).toBe(loadAiUnreadyProgressValues('NumberTales'));
    });
});
