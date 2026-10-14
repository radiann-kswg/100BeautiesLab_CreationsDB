/**
 * 物語年代（`StoryEra`）と年齢（`Age`）の実データ不変条件
 *
 * 1. **創世紀元年との一貫性**: `FromEra` / `ToEra` / `InEra` の各点（`$Def_StoryEra`）で、
 *    `EraGen` の元年（`data/db_meta.json` の `General.StoryEraEpochs` に `YearInEra: 1` の点として宣言）と
 *    `YearInEra` の相対年数が、同じ配列に置かれた `byRealYear` と合うこと。
 *    - `YearInEra >= 1` … byRealYear = 元年 + YearInEra - 1
 *    - `YearInEra <= -1` … 元前（0 年は無い。-1 = 元年の前年）… byRealYear = 元年 + YearInEra
 *    - 第8創世紀以降へ遷移しない作品があるため「どの創世紀で数えるか」は問わず、記載された EraGen ごとに相対年数だけを見る。
 * 2. **`Age` と `InEra.byRealYear` の対応**: `Age`（`ConceptAge` ではなく、`hideText` でもない数値）は
 *    その DB の `StoryEra.InEra[].byRealYear` 時点の年齢とみなす。`BirthDay` には年が無く絶対値は照合できないので、
 *    同一人物を別作品 / 別 DB へ結ぶ `AnotherRegions_DBLink` の両端で「年齢差 = byRealYear 差」を確認する。
 *    `ConceptAge` はデザイン上の設定年齢で年代に連動しないため対象外。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const readJson = (p) => JSON.parse(readFileSync(path.resolve(repoRoot, p), 'utf-8'));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** `$Def_StoryEra[]`（ShauErRiders の `{ value: [...], about }` ラッパー形式も許容）を配列へ */
const toPoints = (v) => (Array.isArray(v) ? v : Array.isArray(v?.value) ? v.value : []);

/** 元年と YearInEra から byRealYear を求める（0 年は無い: 1 = 元年, -1 = 元前1年） */
const realYearOf = (epoch, yearInEra) => epoch + (yearInEra > 0 ? yearInEra - 1 : yearInEra);

/** `General.StoryEraEpochs` → { [EraGen]: 元年の byRealYear } */
function loadEpochs() {
	const epochs = {};
	for (const p of toPoints(readJson('data/db_meta.json')?.General?.StoryEraEpochs)) {
		if (isNum(p?.EraGen) && p?.YearInEra === 1 && isNum(p?.byRealYear)) epochs[p.EraGen] = p.byRealYear;
	}
	return epochs;
}

/** オブジェクト内の `StoryEra` を全部拾う（DB 直下と `_Secondaries[]` の両方） */
function collectStoryEras(obj, trail, out) {
	if (!obj || typeof obj !== 'object') return out;
	for (const [k, v] of Object.entries(obj)) {
		if (k === 'StoryEra' && v && typeof v === 'object') out.push([`${trail}.${k}`, v]);
		else collectStoryEras(v, `${trail}.${k}`, out);
	}
	return out;
}

const workDirs = readdirSync(path.resolve(repoRoot, 'data')).filter((d) => d.startsWith('Works_'));
const metaPath = (wk) => `data/${wk}/DataBases/db_meta.json`;

describe('StoryEra: 創世紀元年（General.StoryEraEpochs）との整合', () => {
	const epochs = loadEpochs();

	it('元年が宣言されている', () => {
		expect(Object.keys(epochs).length).toBeGreaterThan(0);
	});

	it('全 StoryEra 点で YearInEra と byRealYear の相対年数が元年に合う', () => {
		const problems = [];
		for (const wk of workDirs) {
			if (!existsSync(path.resolve(repoRoot, metaPath(wk)))) continue;
			for (const [trail, storyEra] of collectStoryEras(readJson(metaPath(wk)), wk, [])) {
				for (const role of ['FromEra', 'ToEra', 'InEra']) {
					const pts = toPoints(storyEra[role]);
					if (!pts.length) continue;
					const realYears = pts.map((p) => p?.byRealYear).filter(isNum);
					if (realYears.length !== 1) {
						problems.push(`${trail}.${role}: byRealYear が ${realYears.length} 個`);
						continue;
					}
					for (const p of pts) {
						if (!isNum(p?.EraGen) || !isNum(p?.YearInEra)) continue;
						const epoch = epochs[p.EraGen];
						if (!isNum(epoch)) {
							problems.push(`${trail}.${role}: 第${p.EraGen}創世紀の元年が General.StoryEraEpochs に無い`);
						} else if (p.YearInEra === 0 || realYearOf(epoch, p.YearInEra) !== realYears[0]) {
							problems.push(`${trail}.${role}: 第${p.EraGen}創世紀${p.YearInEra}年 ≠ 西暦${realYears[0]}（元年 ${epoch}）`);
						}
					}
				}
			}
		}
		expect(problems).toEqual([]);
	});
});

/** `Age` を数値として読む（`#Number` / `#Number_withAbout`。`hideText` は注釈化なので対象外） */
function plainAge(record) {
	const v = record?.Age;
	if (isNum(v)) return v;
	if (v && typeof v === 'object' && !Array.isArray(v) && !('hideText' in v) && isNum(v.value)) return v.value;
	return null;
}

/** 同一人物を別作品 / 別 DB へ結ぶ `*_DBLink`。演者⇄アバター等（別人）のリンクは含めない */
// ponytail: 固定リスト。「同一人物」を示す宣言が typedef に入ったらそちらへ寄せる
const SAME_PERSON_LINKS = ['AnotherRegions_DBLink'];
/** `$Def_DBLinkRef` のうちインデックスではないキー（lib/data-common.js `resolveDbLinkSuffixRef` と同じ） */
const SENTINEL = new Set(['_DB', '_Work', 'label_JP', 'label_EN']);

/** ネストインデックスの subset match（lib/data-common.js `dbLinkSubsetMatch` と同じ規則） */
function subsetMatch(recordVal, query) {
	if (query === null) return recordVal === null || recordVal === undefined;
	if (typeof query === 'object') {
		if (!recordVal || typeof recordVal !== 'object') return false;
		return Object.keys(query).every((k) => subsetMatch(recordVal[k], query[k]));
	}
	return recordVal !== null && recordVal !== undefined && String(recordVal) === String(query);
}

/** 作品ごとに { inEraYear: { db: byRealYear }, records: { db: [...] } } を読む */
function loadWorks() {
	const works = {};
	for (const wk of workDirs) {
		const dir = `data/${wk}/DataBases`;
		if (!existsSync(path.resolve(repoRoot, dir))) continue;
		const work = (works[wk.replace(/^Works_/, '')] = { inEraYear: {}, records: {} });
		const meta = existsSync(path.resolve(repoRoot, metaPath(wk))) ? readJson(metaPath(wk)) : {};
		for (const [key, db] of Object.entries(meta?.Databases ?? {})) {
			// ponytail: DB 直下の InEra だけ見る。`_Secondaries[].StoryEra`（sec_SeriesTitle 分岐）は Secondary 系に素の Age が入ったら対応
			const year = toPoints(db?.StoryEra?.InEra).map((p) => p?.byRealYear).find(isNum);
			if (isNum(year)) work.inEraYear[key.replace(/^#DB_/, '')] = year;
		}
		for (const file of readdirSync(path.resolve(repoRoot, dir))) {
			const m = /^db_(?!meta\.json$|type\.json$)(.+)\.json$/.exec(file);
			if (!m) continue;
			const records = readJson(`${dir}/${file}`);
			if (Array.isArray(records)) work.records[m[1]] = records;
		}
	}
	return works;
}

const labelOf = (record) => String(record?.Name_JP ?? record?.Num ?? '').split('\n')[0];

describe('Age: StoryEra.InEra.byRealYear との対応（AnotherRegions_DBLink 両端の年齢差 = 年代差）', () => {
	const works = loadWorks();
	const problems = [];
	let compared = 0;

	for (const [workId, work] of Object.entries(works)) {
		for (const [db, records] of Object.entries(work.records)) {
			const year = work.inEraYear[db];
			if (!isNum(year)) continue;
			for (const record of records) {
				const age = plainAge(record);
				if (age === null) continue;
				for (const field of SAME_PERSON_LINKS) {
					const entries = Array.isArray(record[field]) ? record[field] : record[field] ? [record[field]] : [];
					for (const entry of entries) {
						if (!entry || typeof entry !== 'object') continue;
						const targetWorkId = entry._Work ?? workId;
						const targetDb = entry._DB ?? db;
						const targetWork = works[targetWorkId];
						const targetYear = targetWork?.inEraYear[targetDb];
						const idxKey = Object.keys(entry).find((k) => !SENTINEL.has(k));
						if (!targetWork || !isNum(targetYear) || !idxKey) continue;
						const targets = (targetWork.records[targetDb] ?? []).filter((t) => subsetMatch(t?.[idxKey], entry[idxKey]));
						for (const target of targets) {
							const targetAge = plainAge(target);
							if (targetAge === null) continue;
							compared++;
							if (age - targetAge !== year - targetYear) {
								problems.push(
									`${workId}/${db} ${labelOf(record)} Age ${age}@${year} ↔ ${targetWorkId}/${targetDb} ${labelOf(target)} Age ${targetAge}@${targetYear}`
								);
							}
						}
					}
				}
			}
		}
	}

	it('照合できる組が少なくとも 1 つある（0 件ならこのテストの前提が崩れている）', () => {
		expect(compared).toBeGreaterThan(0);
	});

	it('年齢差が InEra.byRealYear の差と一致する', () => {
		expect(problems).toEqual([]);
	});
});
