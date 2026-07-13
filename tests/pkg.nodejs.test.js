/**
 * pkg/nodejs クライアントの DB 機構追従テスト
 *
 * 目的:
 * - `pkg/` の FS クライアントは `lib/sw-common.js` / `lib/data-common.js` の移植版であり、
 *   本体側の DB 機構追加に自動追従しない（過去に 1 ヶ月以上追従漏れが放置された）。
 *   本ファイルは、その追従漏れを回帰として検出するための網。
 * - 検証対象は「実データに対する不変条件」であり、レコード件数のような
 *   変動値には依存させない（データ更新でテストが壊れないようにするため）。
 *
 * カバーする機構:
 * - `Works_Hidden` / `DB_Hidden` による非公開制御（一覧・直接アクセスの双方）
 * - `Works_Dir` オーバーライド（共通資料の疑似作品）とレイヤー畳み込み
 * - `$IndexDef` / `$IndexDef_<DbNorm>` によるインデックスキーのスキーマ駆動解決
 * - 旧作品名エイリアス（`Proxies` → `Works_DestinyFoxRecords`）
 * - JP/EN フィールド命名（`Title_JP` / `Works_Summary_JP`）
 *
 * NOTE:
 * - pkg/python・pkg/csharp は同一の API サーフェスを持つ独立移植のため、
 *   本ファイルの期待値を変更したら両者も追従させること（`docs/pkg-client-libraries.md`）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { CreationsDBClient, CreationsDBNotFoundError } from '../pkg/nodejs/index.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 既定オプション（非公開データを除外）のクライアント */
const db = new CreationsDBClient(REPO_ROOT);
/** 非公開データへ明示的にオプトインしたクライアント */
const dbHidden = new CreationsDBClient(REPO_ROOT, { includeHidden: true });

/** `data/db_meta.json` を直接読む（テストの期待値をデータから導くため） */
const globalMeta = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'data/db_meta.json'), 'utf-8')
);

describe('pkg/nodejs: JP/EN フィールド命名（Title_JP / Works_Summary_JP）', () => {
  it('listWorks() が Title_JP / Works_Summary_JP を空文字ではなく実値で返す', async () => {
    const works = await db.listWorks();
    const nt = works.find((w) => w.key === '#Works_NumberTales');

    expect(nt).toBeDefined();
    // 旧実装は存在しない `Title` / `Works_Summary` を読んでおり、常に '' を返していた
    expect(nt.Title_JP).toBeTruthy();
    expect(nt.Title_JP).toBe(globalMeta.CreationWorks['#Works_NumberTales'].Title_JP);
    expect(nt.Works_Summary_JP).toBeTruthy();
    expect(nt.Title_EN).toBeTruthy();
  });
});

describe('pkg/nodejs: Works_Hidden / DB_Hidden による非公開制御', () => {
  /** 実データ上で DB_Hidden: true が宣言されている (work, db) を列挙する */
  const findHiddenDbs = () => {
    const found = [];
    for (const workKey of Object.keys(globalMeta.CreationWorks ?? {})) {
      const dirName = workKey.replace('#Works_', 'Works_');
      let workMeta;
      try {
        workMeta = JSON.parse(
          readFileSync(resolve(REPO_ROOT, `data/${dirName}/DataBases/db_meta.json`), 'utf-8')
        );
      } catch {
        continue; // メタを持たない作品はスキップ
      }
      for (const [dbKey, entry] of Object.entries(workMeta?.Databases ?? {})) {
        if (entry?.DB_Hidden === true) {
          found.push({ work: workKey.replace('#Works_', ''), db: dbKey.replace(/^#(DB|Ref)_/, '') });
        }
      }
    }
    return found;
  };

  let hiddenDbs;
  beforeAll(() => { hiddenDbs = findHiddenDbs(); });

  it('実データに DB_Hidden: true の DB が存在する（テストの前提）', () => {
    expect(hiddenDbs.length).toBeGreaterThan(0);
  });

  it('DB_Hidden の DB は listDBs() の一覧に現れない', async () => {
    for (const { work, db: hiddenDb } of hiddenDbs) {
      const dbs = await db.listDBs(work);
      expect(dbs.map((d) => d.key)).not.toContain(hiddenDb);
    }
  });

  it('DB_Hidden の DB は直接アクセス（getRecords）でも遮断される', async () => {
    // 一覧から消えていても直接指定で読めてしまうと非公開の意味がない（SW 仕様 §5.3 は
    // 「リストと直接アクセスの両方から 404」）。旧実装はここが素通りだった。
    for (const { work, db: hiddenDb } of hiddenDbs) {
      await expect(db.getRecords(work, hiddenDb)).rejects.toThrow(CreationsDBNotFoundError);
    }
  });

  it('includeHidden: true では非公開 DB へ明示的にオプトインできる', async () => {
    const { work, db: hiddenDb } = hiddenDbs[0];
    const records = await dbHidden.getRecords(work, hiddenDb);
    expect(Array.isArray(records)).toBe(true);
  });

  it('Works_Hidden の作品は listWorks() から除外される', async () => {
    const works = await db.listWorks();
    for (const [key, info] of Object.entries(globalMeta.CreationWorks ?? {})) {
      if (info?.Works_Hidden === true) {
        expect(works.map((w) => w.key)).not.toContain(key);
      }
    }
  });
});

describe('pkg/nodejs: Works_Dir オーバーライド（共通資料の疑似作品）', () => {
  it('Works_Dir を持つ作品はレコードを取得できる（物理ディレクトリへ解決される）', async () => {
    // #Works_CommonReferences は Works_Dir: "References" を持ち、
    // 物理配置は data/References/（Works_CommonReferences/ は存在しない）。
    // 旧実装は Works_<id> を素朴に組み立てて必ず失敗していた。
    const records = await db.getRecords('CommonReferences', 'Vocabulary');
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThan(0);
  });

  it('DB_Layer が workDir と同名の場合にレイヤーセグメントを畳み込む', async () => {
    // Works_Dir: "References" かつ DB_Layer: "References" のため、
    // data/References/References/... と二重にせず data/References/... へ解決する必要がある。
    const dbs = await db.listDBs('CommonReferences');
    expect(dbs.length).toBeGreaterThan(0);
    for (const info of dbs) {
      expect(info.layer).toBe('References');
    }
  });

  it('listWorks() が Works_Shared を pass-through する', async () => {
    const works = await db.listWorks();
    const shared = works.find((w) => w.key === '#Works_CommonReferences');
    expect(shared).toBeDefined();
    expect(shared.Works_Shared).toBe(true);

    // 個別の創作タイトルは Works_Shared を持たない
    const nt = works.find((w) => w.key === '#Works_NumberTales');
    expect(nt.Works_Shared).toBe(false);
  });
});

describe('pkg/nodejs: $IndexDef によるインデックスキーのスキーマ駆動解決', () => {
  it('作品ごとのネスト型インデックスキーをスキーマから解決する', async () => {
    // 旧実装は 'Num' 決め打ちのため、Num を持たない作品では常に null を返していた。
    expect(await db.getIndexKey('NumberTales', 'Primary')).toBe('Num');
    expect(await db.getIndexKey('FLInvestigator78', 'Primary')).toBe('Card.Suit');
    expect(await db.getIndexKey('ShouArRiders', 'Primary')).toBe('BeastType.Beast');
  });

  it('$IndexDef_<DbNorm> サイドカーが work 既定より優先される（DB 単位の上書き）', async () => {
    // DestinyFoxRecords の work 既定は Unit だが、Proxy DB だけ Generation で上書きされる
    expect(await db.getIndexKey('DestinyFoxRecords')).toBe('Unit');
    expect(await db.getIndexKey('DestinyFoxRecords', 'Primary')).toBe('Unit');
    expect(await db.getIndexKey('DestinyFoxRecords', 'Proxy')).toBe('Generation');
  });

  it('getRecord() は idxKey 省略時にスキーマ解決したキーで照合する', async () => {
    // FLInvestigator78 の索引は Card.Suit。idxKey を明示せずに引けること。
    const idxKey = await db.getIndexKey('FLInvestigator78', 'Primary');
    const all = await db.getRecords('FLInvestigator78', 'Primary');
    expect(all.length).toBeGreaterThan(0);

    // 実データの先頭レコードから期待値を導く（値のハードコードを避ける）
    const [rootKey, childKey] = idxKey.split('.');
    const expectedValue = String(all[0][rootKey][childKey]);

    const hit = await db.getRecord('FLInvestigator78', 'Primary', expectedValue);
    expect(hit).not.toBeNull();
    expect(String(hit[rootKey][childKey])).toBe(expectedValue);
  });

  it('idxKey を明示指定した場合はそちらが優先される', async () => {
    const all = await db.getRecords('FLInvestigator78', 'Primary');
    const expectedNum = String(all[0].Card.Num);

    const hit = await db.getRecord('FLInvestigator78', 'Primary', expectedNum, 'Card.Num');
    expect(hit).not.toBeNull();
    expect(String(hit.Card.Num)).toBe(expectedNum);
  });
});

describe('pkg/nodejs: 旧作品名エイリアス（Proxies → Works_DestinyFoxRecords）', () => {
  it('旧作品名 Proxies でも統合先のレコードを取得できる', async () => {
    const viaAlias = await db.getRecords('Proxies', 'Proxy');
    const viaCurrent = await db.getRecords('DestinyFoxRecords', 'Proxy');

    expect(viaAlias.length).toBeGreaterThan(0);
    expect(viaAlias).toEqual(viaCurrent);
  });

  it('他作品はエイリアスの影響を受けない', async () => {
    const records = await db.getRecords('NumberTales', 'Primary');
    expect(records.length).toBeGreaterThan(0);
  });
});

describe('pkg/nodejs: isPrivate レコードの除外', () => {
  it('既定では isPrivate: true のレコードを返さない', async () => {
    for (const work of ['NumberTales', 'FLInvestigator78']) {
      for (const info of await db.listDBs(work)) {
        const records = await db.getRecords(work, info.key);
        expect(records.every((r) => r?.isPrivate !== true)).toBe(true);
      }
    }
  });

  it('_Secondaries._Commons が注入する isPrivate も除外される（フィルタは _Commons 適用後）', async () => {
    // レコード自身は isPrivate を宣言せず、所属シリーズの
    // `_Secondaries[]._Commons.isPrivate: true` によってのみ非公開指定されるケースがある。
    // isPrivate フィルタを _Commons 適用より前に行うと注入値が読まれず、公開されてしまう。
    const workMeta = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'data/Works_NumberTales/DataBases/db_meta.json'), 'utf-8')
    );
    const secDefs = workMeta?.Databases?.['#DB_Secondary']?._Secondaries ?? [];
    const privateSeries = secDefs
      .filter((d) => d?._Commons?.isPrivate === true)
      .map((d) => d.sec_SeriesTitle);

    // 前提: _Commons 経由で非公開指定されたシリーズが実データに存在する
    expect(privateSeries.length).toBeGreaterThan(0);

    const records = await db.getRecords('NumberTales', 'Secondary');
    for (const rec of records) {
      expect(privateSeries).not.toContain(rec.sec_SeriesTitle);
    }
  });

  it('includePrivate: true では _Commons 由来の非公開レコードも取得できる', async () => {
    const withPrivate = new CreationsDBClient(REPO_ROOT, { includePrivate: true });
    const publicOnly = await db.getRecords('NumberTales', 'Secondary');
    const all = await withPrivate.getRecords('NumberTales', 'Secondary');
    expect(all.length).toBeGreaterThan(publicOnly.length);
  });
});
