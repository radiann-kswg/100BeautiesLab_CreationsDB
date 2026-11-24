import { expect, it } from 'vitest';
import { artAppearance, nextAppearance, reviewedEntries, updateArtRecord } from '../tools/sync-numbertales-art.mjs';

const forms = new Set(['corefolder', 'humanoid']);
it('合同絵は番号を完全一致させ、共通の末尾指定と個別の形態を読む', () => {
  const pair = 'chattingArt/chart_imgNTS-47,NTS-74-humanoid';
  expect(artAppearance(pair, '47', forms)).toEqual({ value: pair, Formation: 'humanoid' });
  expect(artAppearance(pair, '74', forms)).toEqual({ value: pair, Formation: 'humanoid' });
  expect(artAppearance(pair, '7', forms)).toBeNull();
  const mixed = 'gift/gift_imgNTS-148-corefolder,NTS-148ZE-humanoid';
  expect(artAppearance(mixed, '148', forms).Formation).toBe('corefolder');
  expect(artAppearance(mixed, '148ZE', forms).Formation).toBe('humanoid');
  const cross = { _DBCrossLinkPath: { _DB: 'Primary', _IsoPath: pair } };
  expect(artAppearance(cross, '74', forms)).toEqual({ value: cross, Formation: 'humanoid' });
  expect(artAppearance('corefolders/art_event', '47', forms)).toBeNull();
  expect(artAppearance('corefolders/art_imgNTS-47', '47', forms)).toEqual({value: 'corefolders/art_imgNTS-47'});
  expect(artAppearance('art_imgNTS-00-drawing', '0', forms)).toBeNull();
  expect(artAppearance('art_imgNTS-00-drawing', '00', forms)).toEqual({ value: 'art_imgNTS-00-drawing' });
});

it('原画と本人が一致したときだけ、その子に確認できたすべての形態を返す', () => {
  const review = { sha256: 'v1', formations: { humanoid: ['7', '8'], corefolder: ['8'] } };
  const cross = { _DBCrossLinkPath: { _DB: 'SemiPrimary', _IsoPath: 'event' } };
  expect(reviewedEntries(review, 8, cross, 'v1', forms)).toEqual([
    { value: cross, Formation: 'humanoid' }, { value: cross, Formation: 'corefolder' },
  ]);
  expect(reviewedEntries(review, 7, cross, 'v1', forms)).toHaveLength(1);
  expect(reviewedEntries(review, 9, cross, 'v1', forms)).toBeNull();
  expect(reviewedEntries(review, 8, cross, 'v2', forms)).toBeNull();
});

it('同一入力は書き換えず、参照や許可が消えた場合は生成項目だけを除く', () => {
  const original = '{\r\n    "Num":26,\r\n    "Images":{"arts_PNGPath":["art"]},\r\n    "Name_JP":"test"\r\n  }';
  const entries = [{ value: 'art', Formation: 'humanoid' }];
  const updated = updateArtRecord(original, JSON.parse(original), entries);
  expect(JSON.parse(updated).Images_Appearance.arts_PNGPath).toEqual(entries);
  expect(updateArtRecord(updated, JSON.parse(updated), entries)).toBe(updated);
  expect(updateArtRecord(updated, JSON.parse(updated), [])).toBe(original);
});

it('作者が手入力した他フィールドの行と、arts 行の衣装・参考用区分を再生成で消さない', () => {
  const designAlt = [{ value: 'alt', ReferenceOnly: true }];
  const current = { arts_PNGPath: [{ value: 'art', Formation: 'humanoid', Costume: null }, { value: 'old' }], designAlt_PNGPath: designAlt };
  expect(nextAppearance(current, [{ value: 'art', Formation: 'humanoid' }])).toEqual({
    arts_PNGPath: [{ value: 'art', Formation: 'humanoid', Costume: null }], designAlt_PNGPath: designAlt,
  });
  // 生成された形態が変わっても、作者の手入力行は別行として残す
  expect(nextAppearance(current, [{ value: 'art', Formation: 'corefolder' }]).arts_PNGPath).toEqual([
    { value: 'art', Formation: 'corefolder' }, { value: 'art', Formation: 'humanoid', Costume: null },
  ]);
  expect(nextAppearance(current, [])).toEqual({ designAlt_PNGPath: designAlt });
  expect(nextAppearance({ arts_PNGPath: [{ value: 'art' }] }, [])).toBeUndefined();
});

it('共通指定(Formation: null)と、形態行とは別の参考用行を再同期で消さない', () => {
  const common = { value: 'art', Formation: null };
  const reference = { value: 'art', Costume: null, ReferenceOnly: true };
  const generated = [{ value: 'art', Formation: 'humanoid' }];
  expect(nextAppearance({ arts_PNGPath: [common, reference] }, generated).arts_PNGPath).toEqual([...generated, common, reference]);
  // 生成器が形態を読めない画像でも、許可済みなら手入力行は残す。許可が消えたら一緒に消える。
  expect(nextAppearance({ arts_PNGPath: [common] }, [], ['art']).arts_PNGPath).toEqual([common]);
  expect(nextAppearance({ arts_PNGPath: [common] }, [], [])).toBeUndefined();
});

it('同じ value・Formation の複数の衣装行をすべて引き継ぐ', () => {
  const rows = [
    { value: 'art', Formation: 'humanoid', Costume: 'usual' },
    { value: 'art', Formation: 'humanoid', Costume: 'otaku', ReferenceOnly: true },
  ];
  expect(nextAppearance({ arts_PNGPath: rows }, [{ value: 'art', Formation: 'humanoid' }]).arts_PNGPath).toEqual(rows);
});
