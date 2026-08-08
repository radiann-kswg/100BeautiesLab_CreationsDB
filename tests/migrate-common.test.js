/**
 * migrate-common.test.js — D1 マイグレーション共通ユーティリティの回帰テスト
 *
 * @description
 *   `migrate.mjs` と `migrate-aihints.mjs` が共有する純粋関数と、
 *   `createD1Runner()` の分割・ラベル付けを検査する。
 *   wrangler は起動しない（`dryRun: true` で SQL 実行経路には入らない）。
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseCommonArgs,
  esc,
  resolveIdxKey,
  getByPath,
  stripDbPrefix,
  capitalize,
  CONVENTIONAL_FILES,
  createD1Runner,
} from '../pkg/cloudflare/scripts/migrate-common.mjs';

describe('parseCommonArgs', () => {
  it('フラグと値引数を読み分ける', () => {
    const r = parseCommonArgs(['--dry-run', '--db-id', 'test-db', '--repo-root', '.']);
    expect(r.dryRun).toBe(true);
    expect(r.clean).toBe(false);
    expect(r.dbId).toBe('test-db');
  });

  it('--db-id 未指定時は既定の D1 名を返す', () => {
    expect(parseCommonArgs([]).dbId).toBe('creationsdb-d1');
  });

  it('getArg で固有オプションも読める（--bucket 等）', () => {
    const { getArg } = parseCommonArgs(['--bucket', 'my-bucket']);
    expect(getArg('--bucket')).toBe('my-bucket');
    expect(getArg('--nothing')).toBeUndefined();
  });
});

describe('esc', () => {
  it('null / undefined は NULL リテラルにする', () => {
    expect(esc(null)).toBe('NULL');
    expect(esc(undefined)).toBe('NULL');
  });

  it('シングルクォートを重ねてエスケープする', () => {
    expect(esc("O'Brien")).toBe("'O''Brien'");
  });

  it('空文字は NULL ではなく空のリテラルにする', () => {
    expect(esc('')).toBe("''");
  });
});

describe('resolveIdxKey', () => {
  it('$IndexDef が無ければ既定の "Num"', () => {
    expect(resolveIdxKey(undefined)).toBe('Num');
  });

  it('フラット型は hashTag をそのまま返す', () => {
    expect(resolveIdxKey({ hashTag: 'Num', $type: '#Number' })).toBe('Num');
  });

  it('ネスト型は #IndexListKey の子を優先する', () => {
    const def = {
      hashTag: 'Card',
      $type: [
        { hashTag: 'Num', $type: '#Number' },
        { hashTag: 'Suit', $type: '#IndexListKey' },
      ],
    };
    expect(resolveIdxKey(def)).toBe('Card.Suit');
  });

  it('#IndexListKey が無ければ #Number の子を選ぶ', () => {
    const def = {
      hashTag: 'Card',
      $type: [
        { hashTag: 'Label', $type: '#String' },
        { hashTag: 'Num', $type: '#Number' },
      ],
    };
    expect(resolveIdxKey(def)).toBe('Card.Num');
  });

  it('どちらも無ければ先頭要素へフォールバックする', () => {
    const def = {
      hashTag: 'Card',
      $type: [{ hashTag: 'Label', $type: '#String' }],
    };
    expect(resolveIdxKey(def)).toBe('Card.Label');
  });
});

describe('getByPath', () => {
  it('ドット記法でネストした値を取り出す', () => {
    expect(getByPath({ Card: { Num: 7 } }, 'Card.Num')).toBe(7);
  });

  it('途中が欠けても例外にせず undefined を返す', () => {
    expect(getByPath({}, 'Card.Num')).toBeUndefined();
  });
});

describe('DB 名の解決', () => {
  it('#DB_ / #Ref_ 接頭辞を落とす', () => {
    expect(stripDbPrefix('#DB_Primary')).toBe('Primary');
    expect(stripDbPrefix('#Ref_Society')).toBe('Society');
    expect(stripDbPrefix(null)).toBe('');
  });

  it('capitalize は先頭 1 文字だけ大文字化する', () => {
    expect(capitalize('primary')).toBe('Primary');
    expect(capitalize('')).toBe('');
  });

  it('CONVENTIONAL_FILES は正規化後の DB 名で引ける（先頭小文字も吸収）', () => {
    expect(CONVENTIONAL_FILES[capitalize(stripDbPrefix('#DB_SemiPrimary'))]).toBe('db_SemiPrimary.json');
    expect(CONVENTIONAL_FILES[capitalize(stripDbPrefix('#DB_semiPrimary'))]).toBe('db_SemiPrimary.json');
    expect(CONVENTIONAL_FILES[capitalize(stripDbPrefix('#Ref_Society'))]).toBeUndefined();
  });
});

describe('createD1Runner (dryRun)', () => {
  /** dry-run 時のログを集めて、実行経路に入らないことを確認する */
  function runWithCapturedLog(fn) {
    const logs = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
    return logs;
  }

  const makeRunner = (batchSize) =>
    createD1Runner({ repoRoot: '.', dbId: 'test-db', dryRun: true, tmpDirName: 'test', batchSize });

  it('空 SQL は何も出力しない', () => {
    const { d1Execute } = makeRunner(10);
    expect(runWithCapturedLog(() => d1Execute('noop', '   '))).toEqual([]);
  });

  it('dry-run は SQL を実行せずラベル付きで出力する', () => {
    const { d1Execute } = makeRunner(10);
    const logs = runWithCapturedLog(() => d1Execute('works', 'DELETE FROM works;'));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('[D1 dry-run] works');
    expect(logs[0]).toContain('DELETE FROM works;');
  });

  it('batchSize ごとに分割し、ラベルへ 1 始まりの範囲を付ける', () => {
    const { d1BatchInsert } = makeRunner(2);
    const values = ['(1)', '(2)', '(3)', '(4)', '(5)'];
    const logs = runWithCapturedLog(() => d1BatchInsert('records', 'a', values, 'records/NT'));
    expect(logs).toHaveLength(3); // 2 + 2 + 1
    expect(logs[0]).toContain('records/NT [1-2]');
    expect(logs[1]).toContain('records/NT [3-4]');
    expect(logs[2]).toContain('records/NT [5-5]');
  });

  it('1 行 1 INSERT 文にして SQLITE_TOOBIG を避ける', () => {
    const { d1BatchInsert } = makeRunner(10);
    const logs = runWithCapturedLog(() => d1BatchInsert('records', 'a, b', ['(1, 2)', '(3, 4)'], 'r'));
    const sql = logs[0];
    expect(sql.match(/INSERT OR REPLACE INTO records \(a, b\) VALUES/g)).toHaveLength(2);
  });
});
