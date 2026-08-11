/**
 * tools/patch-appearance-bodypart.mjs / AppearanceDetail.BodyPart 補完のテスト
 *
 * @description
 *   配色ツールは `AppearanceDetail` の色語から `ColorPalette.AppliesTo` へ部位を転記する。
 *   `BodyPart` が `null` だと色を部位へ紐づけられないため、記述から読み取れる部位を
 *   後から書き込むのがこのツール。**`data/` をテキスト置換で直接書き換える**経路なので、
 *   位置計算を 1 つ間違えれば無関係なレコードを壊す。
 *
 *   ここで守るのは 3 点:
 *   - `scanArrayElements()` が文字列リテラル中の括弧に惑わされないこと
 *   - `setBodyPartInRecord()` が**狙った添字だけ**を書き換えること
 *   - 既に値があるエントリを `--force` 無しで上書きしないこと
 *
 * @see _work_in_progress/2026-08-11_progress_colorpalette-slots.md
 * @see https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/20
 */

import { describe, it, expect } from 'vitest';

import { scanArrayElements, scanTopLevelRecords } from '../tools/extract-palette.mjs';
import { setBodyPartInRecord, readBodyPartEnum } from '../tools/patch-appearance-bodypart.mjs';

/** 1 レコード 3 エントリの最小 DB。`BodyPart` の状態を entry ごとに変えてある。 */
const DB_TEXT = `[
  {
    "Num": 1,
    "AppearanceDetail": [
      {
        "BodyPart": ["#BodyPart_Hair"],
        "Attrs": [{ "value_EN": "red hair" }]
      },
      {
        "BodyPart": null,
        "Attrs": [{ "value_EN": "blue eyes [and a {brace}]" }]
      },
      {
        "BodyPart": null,
        "Attrs": [{ "value_EN": "teal blazer" }]
      }
    ]
  }
]
`;

const spanOf = (text) => scanTopLevelRecords(text)[0];
const entryAt = (text, i) => JSON.parse(text).AppearanceDetail?.[i] ?? JSON.parse(text)[0].AppearanceDetail[i];

describe('scanArrayElements — 配列要素の範囲走査', () => {
    it('文字列中の括弧に惑わされずに要素を切り出す', () => {
        const text = '[ { "a": "x[1]{2}" }, { "b": 2 } ]';
        const spans = scanArrayElements(text, 0);
        expect(spans).toHaveLength(2);
        expect(JSON.parse(text.slice(...spans[0])).a).toBe('x[1]{2}');
        expect(JSON.parse(text.slice(...spans[1])).b).toBe(2);
    });

    it('入れ子の配列・オブジェクトを 1 要素として扱う', () => {
        const text = '[ { "a": [1, [2, 3]], "b": { "c": {} } } ]';
        expect(scanArrayElements(text, 0)).toHaveLength(1);
    });

    it('開始位置が [ でない / 閉じていない場合は例外にする', () => {
        expect(() => scanArrayElements('{ "a": 1 }', 0)).toThrow(/配列の開始/);
        expect(() => scanArrayElements('[ { "a": 1 }', 0)).toThrow(/閉じていません/);
    });

    it('scanTopLevelRecords はトップレベル配列への薄いラッパである', () => {
        expect(scanTopLevelRecords(DB_TEXT)).toEqual(scanArrayElements(DB_TEXT, DB_TEXT.indexOf('[')));
    });
});

describe('setBodyPartInRecord — 狙った添字だけを書き換える', () => {
    it('null の BodyPart を配列で埋め、他のエントリに触れない', () => {
        const { text } = setBodyPartInRecord(DB_TEXT, spanOf(DB_TEXT), 1, ['#BodyPart_Eye']);
        const after = JSON.parse(text)[0].AppearanceDetail;

        expect(after[1].BodyPart).toEqual(['#BodyPart_Eye']);
        expect(after[0].BodyPart).toEqual(['#BodyPart_Hair']); // 既存値は不変
        expect(after[2].BodyPart).toBeNull();                  // 別の null も不変
        expect(after[1].Attrs[0].value_EN).toBe('blue eyes [and a {brace}]');
    });

    it('prettier が畳む 1 行配列の書式で書き込む', () => {
        const { text } = setBodyPartInRecord(DB_TEXT, spanOf(DB_TEXT), 2, ['#BodyPart_Chest', '#BodyPart_Arm']);
        expect(text).toContain('"BodyPart": ["#BodyPart_Chest", "#BodyPart_Arm"]');
    });

    it('連続で書き込んでも位置がずれない（末尾の添字から処理する前提）', () => {
        let text = DB_TEXT;
        text = setBodyPartInRecord(text, spanOf(text), 2, ['#BodyPart_Chest']).text;
        text = setBodyPartInRecord(text, spanOf(text), 1, ['#BodyPart_Eye']).text;
        const after = JSON.parse(text)[0].AppearanceDetail;
        expect(after.map(e => e.BodyPart)).toEqual([
            ['#BodyPart_Hair'], ['#BodyPart_Eye'], ['#BodyPart_Chest'],
        ]);
    });

    it('既に値があるエントリは force 無しで上書きしない', () => {
        expect(() => setBodyPartInRecord(DB_TEXT, spanOf(DB_TEXT), 0, ['#BodyPart_Chest']))
            .toThrow(/既に/);
        const { text } = setBodyPartInRecord(DB_TEXT, spanOf(DB_TEXT), 0, ['#BodyPart_Chest'], { force: true });
        expect(JSON.parse(text)[0].AppearanceDetail[0].BodyPart).toEqual(['#BodyPart_Chest']);
    });

    it('存在しない添字は例外にする（黙って別のエントリを書かない）', () => {
        expect(() => setBodyPartInRecord(DB_TEXT, spanOf(DB_TEXT), 9, ['#BodyPart_Chest']))
            .toThrow(/AppearanceDetail\[9\] がありません/);
    });
});

describe('readBodyPartEnum — 部位の入力検証は db_meta.json を正とする', () => {
    it('実データの $EnumDef_DesignBodyPart を読める', () => {
        const keys = readBodyPartEnum();
        expect(keys.has('#BodyPart_Eye')).toBe(true);
        expect(keys.has('#BodyPart_Tail')).toBe(true);
        expect(keys.has('#BodyPart_Nonexistent')).toBe(false);
    });
});
