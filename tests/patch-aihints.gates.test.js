/**
 * AIHints 付与ゲートの前提条件テスト（実データ）
 *
 * @description
 *   AIHints の付与可否は 3 層で判定される。本テストは、この分離が依拠している
 *   「実データ上の前提」を CI に固定し、前提が崩れたら気づけるようにする。
 *
 *     1. `AI_Optout`               … 権利上の可否（付与不可 / exit 2）
 *     2. `skipped-no-image`        … データ充填ガード（画像が 1 枚も無い）
 *     3. `Progress: notProceeded`  … 未着手ガード（付与不要 / soft skip）
 *
 *   ★ 固定している前提:
 *     (a) `notProceeded` かつ画像ありのレコードは存在しない
 *         → 3 の Progress ゲートは今日 no-op であり、`AI_Optout` を権利専用へ純化しても
 *           未着手レコードの保護は失われない。これが崩れた日から 3 が初めて仕事をする。
 *     (b) Primary の AIHints の identity_tags に `TODO:` 接頭辞は無い
 *         → `classTagsOf`（Class 辞書 fallback を持つ）の唯一の呼び出し経路である
 *           `--fill-todos` は Primary に到達しない。クラス辞書の変更が Primary の
 *           既存 AIHints を書き換えないことの構造的な根拠。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    it('`Progress: notProceeded` かつ画像ありのレコードは存在しない（Progress ゲートが今日 no-op である根拠）', () => {
        const offenders = [];
        for (const dbFile of TARGET_DBS) {
            for (const rec of loadDb(dbFile)) {
                if (rec?.Progress === 'notProceeded' && hasAnyImage(rec)) {
                    offenders.push(`${dbFile} Num=${JSON.stringify(rec.Num)}`);
                }
            }
        }
        // ここが落ちたら「未着手なのに画像がある」レコードが現れたということ。
        // Progress ゲートが初めて実効を持つので、意図した状態か確認すること。
        expect(offenders).toEqual([]);
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
