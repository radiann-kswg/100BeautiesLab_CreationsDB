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
 *     (a) `AI_Unready` な Progress かつ画像ありの scaffold 候補は、既知の 3 件だけである
 *         → この集合が Progress ゲートの実効範囲そのもの。増減したら「まだ AI へ流す段階でない
 *           のに画像がある新規レコード」が現れた（あるいは解禁された）ということなので、
 *           意図した状態かを確認したうえで期待値を更新すること。
 *         （当初は SemiPrimary Num 100 のみで、Primary / SelfSecondary ではゲートが no-op
 *           だった。2026-08-13 に 216 系 2 件へ画像が入り、SelfSecondary でも実効化した）
 *     (b) Primary の AIHints の identity_tags に `TODO:` 接頭辞は無い
 *         → `classTagsOf`（Class 辞書 fallback を持つ）の唯一の呼び出し経路である
 *           `--fill-todos` は Primary に到達しない。クラス辞書の変更が Primary の
 *           既存 AIHints を書き換えないことの構造的な根拠。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAiUnreadyProgressValues } from '../tools/patch-aihints.mjs';

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
    it('Progress ゲートの実効範囲は既知の 3 件（scaffold 候補のうち `AI_Unready` なレコードの固定）', () => {
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
        // ここが増えたら「まだ AI へ流す段階でないのに画像がある新規レコード」が現れたということ。
        // 減ったら解禁されたということ。いずれも意図した状態か確認してから期待値を更新すること。
        // Primary が 1 件も並ばないこと自体が「Primary ではゲートが no-op」の根拠になっている。
        expect(gated).toEqual([
            'db_SemiPrimary.json Num=100',
            'db_SemiPrimary.json Num="216-cub"',
            'db_SelfSecondary.json Num=216',
        ]);
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

describe('AI_Optout の宣言（db_meta.json）', () => {
    const dbMeta = JSON.parse(readFileSync(join(repoRoot, 'data/Works_NumberTales/DataBases/db_meta.json'), 'utf-8'));

    it('SemiPrimary / SelfSecondary は DB レベルで AI_Optout: false を明示している', () => {
        // どちらも User 自身の創作物であり、権利上の opt-out は不要。
        // 暗黙の既定に依存させず、意思表示として明示する。
        expect(dbMeta.Databases['#DB_SemiPrimary'].AI_Optout).toBe(false);
        expect(dbMeta.Databases['#DB_SelfSecondary'].AI_Optout).toBe(false);
    });

    it('SelfSecondary の全 _Secondaries カテゴリが AI_Optout: false（権利軸としては全面許可）', () => {
        // 旧: catch-all のみ true。これは「キャラデザ未着手を AI 学習へ流さない」ための
        // 代理であり、権利上の opt-out ではなかった。その意味論は Progress / 画像ゲートへ移譲済み。
        const secs = dbMeta.Databases['#DB_SelfSecondary']._Secondaries;
        expect(secs.length).toBeGreaterThan(0);
        for (const sec of secs) {
            expect(sec.AI_Optout).toBe(false);
        }
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
