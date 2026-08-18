/**
 * tools/patch-aihints.mjs の Class 辞書合流（loadMergedClassDictEN）のテスト
 *
 * @description
 *   `CLASS_NAMES_EN`（AI タグ用に調律済みのハードコード Map）は Primary スコープで作られており、
 *   SemiPrimary / SelfSecondary のクラス名を多く取りこぼしていた（旧実装は未マップの
 *   クラス名を raw の日本語のまま identity_tags へ素通ししていた）。
 *   これを Class 辞書（`#Dict_*` の `keyField: "Class"`）への fallback で補う。
 *
 *   ★ 優先順が肝:
 *     ① CLASS_NAMES_EN → ② Class 辞書の Class_EN → ③ TODO
 *     ハードコードと辞書はレジスタが異なる（前者は AI プロンプト用タグ `'uni-digits class'`、
 *     後者は固有名詞の表示名 `"Uni-Digits"`）ため、辞書優先にすると既存 AIHints の
 *     identity_tags が総書き換えになる。また `営業補助用個体` のようにハードコードにしか
 *     無いクラスもあり、辞書はハードコードの superset ではない。
 *
 *   本テストは実データの辞書を読むため、辞書が増減したら追従する。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMergedClassDictEN } from '../tools/patch-aihints.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * グローバル辞書（`data/Dictionaries/dict_SymphonyXVI.json`）の全エントリを返す
 *
 * @description
 *   「グローバル側も合流できているか」を検証するための fixture。この辞書は
 *   `scopeField.Belonging` が `シンフォニー.XVI(ゼクズィン)` のため作品ローカル
 *   （`data/Works_NumberTales/Dictionaries/`）には存在せず、ここのエントリが
 *   引ければグローバルディレクトリを読めている証拠になる。
 *
 *   ★ キーと英訳をテストへハードコードしない理由:
 *     2026-07 の辞書構造整備で `Class` が短縮キー化（表示名は `Class_JP` へ分離）され、
 *     英訳の綴りも変わった（`Bewusstsein` → `Bewußtsein`）。期待値を固定していたため
 *     AIHints 構造的再同期ワークフローの `npm test` が落ち、PR 作成が止まった。
 *     創作側の改名だけで CI を止めないよう、期待値は実データから解決する。
 * @returns {Array<{ Class: string, Class_EN: string }>}
 */
function globalClassEntries() {
    const arr = JSON.parse(readFileSync(join(repoRoot, 'data/Dictionaries/dict_SymphonyXVI.json'), 'utf-8'));
    return arr.filter((e) => e?.Class && e?.Class_EN);
}

/**
 * DB ファイルから distinct な Class 名を集める
 * @param {string} dbFile
 * @returns {Set<string>}
 */
function distinctClasses(dbFile) {
    const records = JSON.parse(readFileSync(join(repoRoot, 'data/Works_NumberTales/DataBases', dbFile), 'utf-8'));
    const out = new Set();
    for (const rec of records) {
        const c = rec?.Class;
        if (Array.isArray(c)) c.forEach((x) => typeof x === 'string' && out.add(x));
        else if (typeof c === 'string') out.add(c);
    }
    return out;
}

describe('loadMergedClassDictEN', () => {
    it('グローバル + 作品ローカルの Class 辞書を合流する', () => {
        const dict = loadMergedClassDictEN('NumberTales');
        // 作品ローカル（data/Works_NumberTales/Dictionaries/dict_Class.json）
        expect(dict.get('試験用個体')).toBe('for Testing');
        // 作品ローカル（dict_Triples.json）
        expect(dict.get('百倍番(ハンドレッズデジッツ)')).toBe('Hundrets-Digits');
        // ★ グローバル（data/Dictionaries/dict_SymphonyXVI.json）— ローカルには無い
        const globals = globalClassEntries();
        expect(globals.length).toBeGreaterThan(0);
        for (const e of globals) expect(dict.get(e.Class)).toBe(e.Class_EN);
    });

    it('存在しない作品でも例外を投げずグローバル分だけ返す（欠損耐性）', () => {
        const dict = loadMergedClassDictEN('NoSuchWorkXYZ');
        expect(dict).toBeInstanceOf(Map);
        // グローバル辞書は読めている。
        // 作品ローカルを一切読んでいないこの状態で引けることが、上の合流テストの
        // グローバル分が「ローカル由来ではない」ことの証明にもなっている。
        for (const e of globalClassEntries()) expect(dict.get(e.Class)).toBe(e.Class_EN);
    });

    it('同一 work の再呼び出しでキャッシュが効く（同一インスタンスを返す）', () => {
        expect(loadMergedClassDictEN('NumberTales')).toBe(loadMergedClassDictEN('NumberTales'));
    });
});

describe('Class 辞書のカバレッジ（実データ）', () => {
    // 現状 3 DB とも未解決 0 件。新クラス追加で穴が空いたらここで検知する。
    for (const dbFile of ['db_Primary.json', 'db_SemiPrimary.json', 'db_SelfSecondary.json']) {
        it(`${dbFile} の全 Class が辞書で解決できる`, () => {
            const dict = loadMergedClassDictEN('NumberTales');
            const classes = distinctClasses(dbFile);
            expect(classes.size).toBeGreaterThan(0);
            const unresolved = [...classes].filter((c) => !dict.has(c));
            expect(unresolved).toEqual([]);
        });
    }

    it('辞書はハードコード Map の superset ではない（ハードコードを消してはいけない根拠）', () => {
        const dict = loadMergedClassDictEN('NumberTales');
        // `営業補助用個体` は CLASS_NAMES_EN にのみ存在し、Class 辞書には無い。
        // 辞書だけに寄せると Primary のこのクラスが TODO へ退化する。
        expect(dict.has('営業補助用個体')).toBe(false);
    });

    it('辞書とハードコードはレジスタが異なる（辞書優先にしてはいけない根拠）', () => {
        const dict = loadMergedClassDictEN('NumberTales');
        // ハードコードは AI プロンプト用タグ 'uni-digits class'、辞書は表示名 'Uni-Digits'。
        // 値が異なることを固定しておく（将来どちらかを変えたらここで気づける）。
        // ★ キーがルビ無しの '1桁番' なのは、loadMergedClassDictEN() が dict_Class.json の
        //   `Class`（= レコードの Class 配列に入る生値）をキーにするため。develop の `8829fae`
        //   「DB構造整備 bugfix」で `Class` が '1桁番(ユニデジッツ)' → '1桁番' へ直され、ルビ付きの
        //   表示形は `Class_JP` へ移った。旧キーのままだと dict.get() が undefined を返して落ちる
        //   ので、テスト側をデータ仕様へ追従させている（AGENTS.md「データ更新時のテスト追従」）。
        expect(dict.get('1桁番')).toBe('Uni-Digits');
        expect(dict.get('試験用個体')).toBe('for Testing');
    });
});
