/**
 * calendar.gcal-sync.test.js - Google カレンダー直接同期スクリプトのテスト
 * @description tools/sync-calendar-gcal.mjs の純粋関数（日付・ID 導出・リソース組み立て）を検証する。
 *              API 呼び出し（認証・書き込み）はネットワーク前提のため対象外。
 * @author 100BeautiesLab.
 */

import { describe, it, expect } from "vitest";
import { buildEventResource, eventIdOf, isoDate } from "../tools/sync-calendar-gcal.mjs";
import { buildVevent, buildEventDescription, buildRrule } from "../tools/build-calendar-ics.mjs";

/** テスト用イベント（collectEvents() 出力と同形・2/29 のうるう日ケース） */
const sampleEv = {
  work: "NumberTales",
  db: "Primary",
  recordKey: "57",
  kind: "birth",
  disc: "birth",
  month: 2,
  day: 29,
  summary: "🎂 テスト（誕生日）",
  category: "誕生日",
  titleJP: "ナンバーテールズ",
  titleEN: "NumberTales",
  dbLabel: "一次創作",
  nameEN: "Test",
  aboutJP: "",
  aboutEN: "",
  colorId: "7",
  colorName: "deepskyblue",
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
    const uidLine = buildVevent(sampleEv)
      .join("\r\n")
      .replace(/\r\n[ \t]/g, "")
      .split("\r\n")
      .find((l) => l.startsWith("UID:"));
    expect(uidLine).toContain(`UID:${eventIdOf(sampleEv)}@`);
  });

  it("同一入力なら同一 ID（冪等）", () => {
    expect(eventIdOf(sampleEv)).toBe(eventIdOf({ ...sampleEv }));
  });
});

describe("buildRrule（2/29 の平年 2/28 扱い）", () => {
  it("2/29 は毎年2月末日ルール（平年 2/28・うるう年 2/29）", () => {
    expect(buildRrule({ month: 2, day: 29 })).toBe("RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
  });
  it("それ以外は通常の毎年繰り返し", () => {
    expect(buildRrule({ month: 2, day: 28 })).toBe("RRULE:FREQ=YEARLY");
    expect(buildRrule({ month: 7, day: 1 })).toBe("RRULE:FREQ=YEARLY");
  });
});

describe("buildEventResource（Google イベントリソース）", () => {
  it("終日・繰り返し・transparent・作品色で組み立てる", () => {
    const { resource } = buildEventResource(sampleEv);
    expect(resource.start).toEqual({ date: "2024-02-29" });
    expect(resource.end).toEqual({ date: "2024-03-01" });
    expect(resource.recurrence).toEqual(["RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1"]);
    expect(resource.transparency).toBe("transparent");
    expect(resource.status).toBe("confirmed");
    expect(resource.colorId).toBe("7");
  });

  it("変更検知ハッシュを extendedProperties.private.blHash に持ち、色変更にも反応する", () => {
    const { resource, hash } = buildEventResource(sampleEv);
    expect(resource.extendedProperties.private.blSync).toBe("1");
    expect(resource.extendedProperties.private.blHash).toBe(hash);
    // 同一入力ならハッシュも安定
    expect(buildEventResource({ ...sampleEv }).hash).toBe(hash);
    // 表示内容・色が変わればハッシュも変わる
    expect(buildEventResource({ ...sampleEv, summary: "別名" }).hash).not.toBe(hash);
    expect(buildEventResource({ ...sampleEv, colorId: "5" }).hash).not.toBe(hash);
  });

  it("description は和文構成（作品/DB/英名/出典）で ICS と共通", () => {
    const { resource } = buildEventResource(sampleEv);
    expect(resource.description).toBe(buildEventDescription(sampleEv));
    expect(resource.description).toContain("作品: ナンバーテールズ (NumberTales)");
    expect(resource.description).toContain("DB: 一次創作");
    expect(resource.description).toContain("英名: Test");
    expect(resource.description).toContain("出典: 100BeautiesLab. Creations DB（自動生成）");
    expect(resource.description).not.toMatch(/Source:|Name:/);
  });

  it("記念日の説明（DayAbout_JP）は「記念日:」行として和文で載る", () => {
    const aniv = { ...sampleEv, kind: "aniv", disc: "aniv:2-29:テスト記念", aboutJP: "テスト記念" };
    const { resource } = buildEventResource(aniv);
    expect(resource.description).toContain("記念日: テスト記念");
  });
});
