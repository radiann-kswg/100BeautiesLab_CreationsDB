/**
 * カレンダー(.ics)生成のテスト
 * @description tools/build-calendar-ics.mjs の生成ロジックの不変条件を検証する。
 *   - 公開ルール(isPrivate / 非公開DB)の除外
 *   - VEVENT 必須プロパティ・終日繰り返し(RRULE:FREQ=YEARLY)
 *   - UID の一意性・出力の決定性
 *   - RFC5545 のテキストエスケープ・行折返し(<=75 オクテット)
 */
import { describe, it, expect } from "vitest";
import {
  collectEvents,
  buildCalendar,
  buildVevent,
  parseDay,
  escapeText,
  foldLine,
  resolveRecordKey,
} from "../tools/build-calendar-ics.mjs";

const { events, stats } = collectEvents();

describe("collectEvents: 収集とフィルタ", () => {
  it("イベントが1件以上生成される", () => {
    expect(events.length).toBeGreaterThan(0);
  });

  it("各イベントは必須フィールドと妥当な月日を持つ", () => {
    for (const e of events) {
      expect(typeof e.summary).toBe("string");
      expect(e.summary.length).toBeGreaterThan(0);
      expect(e.month).toBeGreaterThanOrEqual(1);
      expect(e.month).toBeLessThanOrEqual(12);
      expect(e.day).toBeGreaterThanOrEqual(1);
      expect(e.day).toBeLessThanOrEqual(31);
      expect(["birth", "aniv"]).toContain(e.kind);
    }
  });

  it("非公開DB(UnprocessedDealer/UnprocessedSecondary/PrimaryPerformer)は除外される", () => {
    const hidden = new Set(["UnprocessedDealer", "UnprocessedSecondary", "PrimaryPerformer"]);
    expect(events.some((e) => hidden.has(e.db))).toBe(false);
  });

  it("isPrivate レコードは除外カウントされ、イベント化されない", () => {
    expect(typeof stats.skippedPrivate).toBe("number");
    expect(stats.skippedHidden).toBeGreaterThanOrEqual(0);
  });
});

describe("parseDay: 日付パース", () => {
  it("正常な Day を解釈する", () => {
    expect(parseDay({ Month: 2, DayOfMonth: 22 })).toEqual({ month: 2, day: 22 });
  });
  it("hideText / 欠損 / 範囲外 / 非数値は null", () => {
    expect(parseDay({ hideText: "x" })).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(parseDay({ Month: 13, DayOfMonth: 1 })).toBeNull();
    expect(parseDay({ Month: 1, DayOfMonth: 0 })).toBeNull();
    expect(parseDay({ Month: "1", DayOfMonth: 1 })).toBeNull();
  });
});

describe("escapeText: RFC5545 エスケープ", () => {
  it("バックスラッシュ・セミコロン・カンマ・改行をエスケープする", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });
});

describe("foldLine: 行折返し", () => {
  it("折返し後の各行は 75 オクテット以下", () => {
    const long = "SUMMARY:" + "あ".repeat(120);
    const folded = foldLine(long);
    for (const line of folded.split("\r\n")) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
  });
  it("継続行は先頭が空白で始まる", () => {
    const folded = foldLine("X:" + "z".repeat(200));
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].startsWith(" ")).toBe(true);
    }
  });
});

describe("buildCalendar / buildVevent: ICS 構造", () => {
  const ics = buildCalendar(events);

  it("VCALENDAR で開始・終了する", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("VEVENT の BEGIN/END 数が一致する", () => {
    const nb = (ics.match(/BEGIN:VEVENT/g) || []).length;
    const ne = (ics.match(/END:VEVENT/g) || []).length;
    expect(nb).toBe(events.length);
    expect(nb).toBe(ne);
  });

  it("全イベントが終日・毎年繰り返し", () => {
    const ev = buildVevent(events[0]).join("\r\n");
    expect(ev).toMatch(/DTSTART;VALUE=DATE:\d{8}/);
    expect(ev).toContain("RRULE:FREQ=YEARLY");
  });

  it("2/29 のイベントは毎年2月末日ルール(平年は 2/28 扱い)", () => {
    const leap = events.filter((e) => e.month === 2 && e.day === 29);
    for (const e of leap) {
      const ev = buildVevent(e).join("\r\n").replace(/\r\n[ \t]/g, "");
      expect(ev).toContain("RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1");
    }
  });

  it("全イベントに作品色(COLOR / colorId)が付与される", () => {
    for (const e of events) {
      expect(e.colorId).toMatch(/^([1-9]|1[01])$/);
      expect(typeof e.colorName).toBe("string");
      expect(e.colorName.length).toBeGreaterThan(0);
    }
    const ev = buildVevent(events[0]).join("\r\n").replace(/\r\n[ \t]/g, "");
    expect(ev).toMatch(/^COLOR:[a-z]+$/m);
  });

  it("同一作品のイベントは同色、色分けは複数作品に及ぶ", () => {
    const byWork = new Map();
    for (const e of events) {
      if (byWork.has(e.work)) expect(byWork.get(e.work)).toBe(e.colorId);
      else byWork.set(e.work, e.colorId);
    }
    expect(new Set(byWork.values()).size).toBeGreaterThan(1);
  });

  it("DESCRIPTION は和文構成で英文定型を含まない", () => {
    const ev = buildVevent(events[0]).join("\r\n").replace(/\r\n[ \t]/g, "");
    expect(ev).toContain("DESCRIPTION:作品: ");
    expect(ev).toContain("出典: 100BeautiesLab. Creations DB（自動生成）");
    expect(ev).not.toMatch(/Source:|\bName: /);
  });

  it("UID は一意", () => {
    const uids = [...ics.replace(/\r\n[ \t]/g, "").matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
    expect(uids.length).toBe(events.length);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it("出力は決定的(2回生成で一致)", () => {
    expect(buildCalendar(collectEvents().events)).toBe(ics);
  });
});

describe("resolveRecordKey: UID 安定キー", () => {
  it("索引フィールドを優先する", () => {
    expect(resolveRecordKey({ Num: 7 }, 3)).toBe("7");
  });
  it("索引が無ければ英名、無ければ位置にフォールバック", () => {
    expect(resolveRecordKey({ Name_EN: "Foo" }, 3)).toBe("en:Foo");
    expect(resolveRecordKey({}, 3)).toBe("pos:3");
  });
});
