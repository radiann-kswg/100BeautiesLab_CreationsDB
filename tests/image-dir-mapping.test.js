/**
 * 画像ディレクトリ解決（`ImageProcessor.mapDbNameToImageDir()`）の実データ整合テスト
 *
 * @description
 *   画像ディレクトリ名は DB カタログキーの接頭辞（`#DB_` / `#Ref_` / `#Loc_`）に対応する。
 *   しかし `lib/data-common.js` の解決経路
 *   （`enrichRecords` → `imageFromRecord` → `processImageValue` → `resolveImagePath`）へ渡るのは
 *   SW ルート（`/pages/v1/<work>/<db>`）由来の**接頭辞なしの素名**であり、レイヤー情報を持たない。
 *
 *   `#DB_*` は既定の `DB_` 補完で足りるが、`#Ref_*` / `#Loc_*` は素名から判別できない。
 *   しかも実データに `#Ref_Society` と `#Loc_Society` が併存するため、
 *   **素名だけの汎用解決は原理的に不可能**（正しく解くには `DB_Layer` が要る。
 *   UI 側 `pages/characters.js` は引数で受け取れるため汎用分岐で解けている）。
 *
 *   そこで実装は「画像を実際に持つ資料系 DB だけ」を例外表として持つ。本テストは
 *   **その表が実データとズレていないこと**を CI で固定する。
 *
 * ## なぜこのテストが要るのか
 *
 *   語彙 DB は `#Ref_Glossary` → `#Ref_Vocabulary` へ改名されたが、この例外表が追従しておらず、
 *   `Vocabulary` が存在しない `DB_Vocabulary` へ解決されていた（2026-09-07 に発覚・修正）。
 *   画像ファイル側の実在チェック（`tests/data.image-links.test.js`）は**参照値**を見るため、
 *   解決関数がディレクトリを間違えるこの欠陥はすり抜けていた。
 *
 *   本テストは 3 つの前提を固定する。
 *
 *   1. 画像を持つ資料系 DB は `Vocabulary` / `Reference` の 2 つだけ
 *      → 新しく画像を持つ `#Ref_*` / `#Loc_*` が増えたら赤くなり、例外表の更新漏れに気づける
 *   2. その 2 つが正しい `Ref_*` へ解決される
 *   3. 全 `#DB_*` が `DB_<素名>` へ解決される
 *      → 旧実装が持っていた `dbMapping`（9 エントリ）は**全て既定補完と同値**の死にコードだった。
 *        削除しても挙動が変わらないことを実データで担保する
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../lib/data-common.js';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dataRoot = join(repoRoot, 'data');

/** `data/**` を再帰走査してファイルパスを列挙する */
function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

const allFiles = walk(dataRoot);

/** 全 `db_meta.json` から DB カタログキーを集める（ネスト DB も拾うため再帰） */
function collectCatalogKeys() {
    /** @type {Map<string, Set<string>>} 素名 → 接頭辞（DB/Ref/Loc）の集合 */
    const byName = new Map();
    for (const file of allFiles) {
        if (!file.endsWith(`${sep}db_meta.json`)) continue;
        let json;
        try {
            json = JSON.parse(readFileSync(file, 'utf-8'));
        } catch {
            continue;
        }
        const scan = (node) => {
            if (!node || typeof node !== 'object') return;
            for (const [key, value] of Object.entries(node)) {
                const m = key.match(/^#(DB|Ref|Loc)_(.+)$/);
                if (m) {
                    if (!byName.has(m[2])) byName.set(m[2], new Set());
                    byName.get(m[2]).add(m[1]);
                }
                scan(value);
            }
        };
        scan(json);
    }
    return byName;
}

/** 資料系 / ローカライズ系 DB（`ref_*.json` / `trans_*.json`）のうち画像を持つものの素名を返す */
function collectRefDbsWithImages() {
    const names = new Set();
    for (const file of allFiles) {
        const base = file.split(sep).pop();
        const m = base.match(/^(?:ref|trans)_(.+)\.json$/);
        if (!m) continue;
        let records;
        try {
            records = JSON.parse(readFileSync(file, 'utf-8'));
        } catch {
            continue;
        }
        if (!Array.isArray(records)) continue;
        const hasImage = records.some(
            (r) => r && typeof r === 'object' && r.Images && Object.keys(r.Images).length > 0,
        );
        if (hasImage) names.add(m[1]);
    }
    return names;
}

const catalogKeys = collectCatalogKeys();
const refDbsWithImages = collectRefDbsWithImages();

/** @returns {InstanceType<any>} 最小構成の ImageProcessor */
function makeProcessor() {
    const Ctor = globalThis.ImageProcessor ?? globalThis.self?.ImageProcessor;
    expect(Ctor, 'ImageProcessor がグローバルへ公開されている').toBeTypeOf('function');
    return new Ctor({ withRepoBase: (p) => p });
}

describe('mapDbNameToImageDir — DB カタログキーとの整合（実データ）', () => {
    it('画像を持つ資料系 DB は例外表と一致する（増えたら実装の表も更新すること）', () => {
        // 実装（lib/data-common.js / pages/characters.js）の refMapping と同じ集合であるべき。
        // ここが増えるということは「素名から接頭辞を判別できない DB に画像が付いた」ということで、
        // 例外表の追加か、呼び出し側で DB_Layer を渡す対応が要る。
        expect([...refDbsWithImages].sort()).toEqual(['Reference', 'Vocabulary']);
    });

    it('画像を持つ資料系 DB は `Ref_<素名>` へ解決される', () => {
        const ip = makeProcessor();
        for (const name of refDbsWithImages) {
            expect(ip.mapDbNameToImageDir(name), `${name} は Ref_ 配下へ解決される`).toBe(`Ref_${name}`);
        }
    });

    it('全 `#DB_*` は `DB_<素名>` へ解決される（旧 dbMapping が死にコードだった根拠）', () => {
        const ip = makeProcessor();
        const dbOnly = [...catalogKeys]
            .filter(([, prefixes]) => prefixes.has('DB') && prefixes.size === 1)
            .map(([name]) => name);
        expect(dbOnly.length, '#DB_* が 1 件以上ある').toBeGreaterThan(0);
        for (const name of dbOnly) {
            expect(ip.mapDbNameToImageDir(name), `${name} は DB_ 配下へ解決される`).toBe(`DB_${name}`);
        }
    });

    it('接頭辞付きで渡されたらそのまま返す（UI / SW が解決済みの値を渡す経路）', () => {
        const ip = makeProcessor();
        for (const dir of ['DB_Primary', 'Ref_Vocabulary', 'Loc_PlaceName']) {
            expect(ip.mapDbNameToImageDir(dir)).toBe(dir);
        }
        expect(ip.mapDbNameToImageDir('General')).toBe('General');
        expect(ip.mapDbNameToImageDir('')).toBe('General');
    });

    it('素名が複数の接頭辞に跨る DB は素名だけでは解決できない（表を増やす前に DB_Layer を渡すこと）', () => {
        // 実データに `#Ref_Society` と `#Loc_Society` が併存する。
        // 現状どちらも画像を持たないため実害は無いが、片方に画像が付いた時点で
        // 「素名 → 接頭辞」の表では正しく解けなくなる。その日に上の 1 本目が赤くなる。
        const ambiguous = [...catalogKeys]
            .filter(([, prefixes]) => prefixes.size > 1)
            .map(([name]) => name)
            .sort();
        expect(ambiguous).toEqual(['Society']);
        for (const name of ambiguous) {
            expect(refDbsWithImages.has(name), `${name} は画像を持たない（持ったら解決が破綻する）`).toBe(false);
        }
    });
});
