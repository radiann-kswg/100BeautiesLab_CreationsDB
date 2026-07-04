/**
 * calendar.gcal-sync.test.js - Google カレンダー直接同期スクリプトのテスト
 * @description tools/sync-calendar-gcal.mjs の純粋関数（日付・ID 導出・リソース組み立て）を検証する。
 *              API 呼び出し（認証・書き込み）はネットワーク前提のため対象外。
 * @author 100BeautiesLab.
 */

import { describe, it, expect } from "vitest";
import {
  buildEventResource,
  eventIdOf,
  descriptionOf,
  isoDate,
} from "../tools/sync-calendar-gcal.mjs";
import { buildVevent } from "../tools/build-calendar-ics.mjs";

/** テスト用イベント（collectEvents() 出力と同形） */
const sampleEv = {
  work: "NumberTales",
  db: "Primary",
  recordKey: "57",
  kind: "birth",
  disc: "birth",
  month: 2,
  day: 29,
  summary: "🎂 テスト（誕生日）",
  category: "Birthday",
  titleJP: "ナンバーテールズ",
  titleEN: "NumberTales",
  dbLabel: "一次創作",
  nameEN: "Test",
  aboutEN: "",
};

describe("isoDate（基準年 2024 の終日日付）", () => {
  it("うるう日 2/29 を保持する", () => {
    expect(isoDate(2, 29)).toBe("2024-02-29");
    expect(isoDate(2, 29, 1)).toBe("2024-03-01");
  });

  it("年末は翌年 1/1 へ繰り上がる", () => {
    expect(isoDate(12, 31)).toBe("2024-12-31");
    expect(isoDate(12, 31, 1)).toBe("2025-01-01");
  });
});

describe("eventIdOf（決定的イベント ID）", () => {
  it("Google のイベント ID 規約（base32hex 部分集合の hex 40 文字）に適合する", () => {
    expect(eventIdOf(sampleEv)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("ICS の UID（@ より前）と同一ハッシュになる", () => {
    const uidLine = buildVevent(sampleEv).find((l) => l.startsWith("UID:"));
    expect(uidLine).toContain(`UID:${eventIdOf(sampleEv)}@`);
  });

  it("同一入力なら同一 ID（冪等）", () => {
    expect(eventIdOf(sampleEv)).toBe(eventIdOf({ ...sampleEv }));
  });
});

describe("buildEventResource（Google イベントリソース）", () => {
  it("終日・毎年繰り返し・transparent で組み立てる", () => {
    const { resource } = buildEventResource(sampleEv);
    expect(resource.start).toEqual({ date: "2024-02-29" });
    expect(resource.end).toEqual({ date: "2024-03-01" });
    expect(resource.recurrence).toEqual(["RRULE:FREQ=YEARLY"]);
    expect(resource.transparency).toBe("transparent");
    expect(resource.status).toBe("confirmed");
  });

  it("変更検知ハッシュを extendedProperties.private.blHash に持つ", () => {
    const { resource, hash } = buildEventResource(sampleEv);
    expect(resource.extendedProperties.private.blSync).toBe("1");
    expect(resource.extendedProperties.private.blHash).toBe(hash);
    // 表示内容が同じならハッシュも安定
    expect(buildEventResource({ ...sampleEv }).hash).toBe(hash);
    // 表示内容が変わればハッシュも変わる
    expect(buildEventResource({ ...sampleEv, summary: "別名" }).hash).not.toBe(hash);
  });

  it("description は ICS と同じ構成（作品/DB/Name/Source）", () => {
    const desc = descriptionOf(sampleEv);
    expect(desc).toContain("作品: ナンバーテールズ (NumberTales)");
    expect(desc).toContain("DB: 一次創作");
    expect(desc).toContain("Name: Test");
    expect(desc).toContain("Source: 100BeautiesLab. Creations DB (auto-generated)");
  });
});
