/**
 * migrate-appearance-detail.mjs
 * AppearanceDetail 仮実装用マイグレーションスクリプト
 *
 * 対象DB:
 *   - data/Works_NumberTales/DataBases/db_Primary.json
 *     (TailsUnit + IdentityMotif + NumberMarkLocation → AppearanceDetail)
 *   - data/Works_UnibyteLive/DataBases/db_Primary.json
 *     (AccessoryUnit + IdentityMotif → AppearanceDetail)
 *
 * 既存フィールドは削除せず AppearanceDetail を並走追加する（試験運用方針）。
 *
 * スキーマ:
 *   - BodyPart: "#DictIndex[]|#Null"（配列型）
 *   - Attrs:    "$Def_AppearanceAttr[]|#Null"（属性ラベル + 値のネスト配列）
 *               1つの特徴（マーク・モチーフ）を 1 AppearanceDetail エントリにまとめる。
 *
 * BodyPart / Laterality の推論:
 *   - TailsUnit: BodyPart = ["#BodyPart_Tail"]（固定）
 *   - IdentityMotif: キーワードマッピングで推論（要目視確認）
 *   - NumberMarkLocation: BodyPart = null, Laterality = 左右キーワードから推論
 *   - AccessoryUnit: BodyPart = null（複合部位のため）
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// ---------- BodyPart / Laterality 推論 ----------

/**
 * IdentityMotif の日本語モチーフテキストから BodyPart を推論する。
 * キーワードは優先度順（上位ほど特定性が高い）。
 * 複数マッチする場合はすべてを返す（配列）。
 * @param {string|null} jp
 * @returns {string[]|null}
 */
function inferBodyParts(jp) {
  if (!jp) return null;
  const t = jp;

  const MAP = [
    [['髪', 'ヘア', 'ポニーテール', 'ツインテール', 'サイドテール', '前髪', 'アホ毛',
      'ヘアピン', 'ヘアクリップ', 'ヘアバンド', 'ヘアオーナメント', 'かんざし'], '#BodyPart_Hair'],
    [['の目', 'の瞳', 'まつげ', '瞳孔', '眼鏡', 'ゴーグル', '糸目'], '#BodyPart_Eye'],
    [['の耳', '耳マーキング', '耳型', 'イヤリング'], '#BodyPart_Ear'],
    [['の尾', '尻尾'], '#BodyPart_Tail'],
    [['翼', '羽'], '#BodyPart_Wing'],
    [['帽子', 'ベレー帽', 'キャップ', 'ヘッドフォン', 'ハチマキ', '鉢巻', 'ウィンプル'], '#BodyPart_Head'],
    [['の顔', '表情', '頬', '顔つき'], '#BodyPart_Head'],
    [['チョーカー', 'ネックレス', 'スカーフ', 'マフラー', '首元', '首の', 'ネクタイ', '蝶ネクタイ'], '#BodyPart_Neck'],
    [['の肩', '肩の', '右肩', '左肩'], '#BodyPart_Shoulder'],
    [['腕章'], '#BodyPart_Arm'],
    [['手袋', 'グローブ', '手首', 'リストバンド', 'リストカフス', 'ミサンガ', '数珠', '念珠', 'フィンガーレス'], '#BodyPart_Hand'],
    [['の胸', '胸元', '胸ジッパー', '大きな胸', 'やや大きめの胸'], '#BodyPart_Chest'],
    [['背中'], '#BodyPart_Back'],
    [['の腰', '腰の', '腰に', '腰ベルト', '腰のリボン'], '#BodyPart_Waist'],
    [['パンツ', 'スカート', 'ストッキング', 'レギンス', 'サイハイ', 'ズボン', '袴', 'タイツ',
      'ショートパンツ', 'ロングスカート', 'プリーツスカート', 'フルスカート', 'マキシスカート'], '#BodyPart_Leg'],
    [['ブーツ', 'の靴', 'サンダル', 'ソックス', '下駄', 'ハイヒール', 'スニーカー',
      'レッグウォーマー', '裸足', 'シューズ', 'アンクルブーツ'], '#BodyPart_Foot'],
  ];

  const found = [];
  for (const [keywords, bodyPart] of MAP) {
    if (keywords.some(kw => t.includes(kw)) && !found.includes(bodyPart)) {
      found.push(bodyPart);
    }
  }
  return found.length > 0 ? found : null;
}

/**
 * 日本語テキストから Laterality を推論する（左/右/両の単純キーワード検出）。
 * @param {string|null} jp
 * @returns {string|null}
 */
function inferLaterality(jp) {
  if (!jp) return null;
  if (/両(?:耳|目|手|足|肩|腕|翼)|左右(?:両方|に|の)/.test(jp)) return '#Lat_Both';
  if (/右/.test(jp)) return '#Lat_Right';
  if (/左/.test(jp)) return '#Lat_Left';
  return null;
}

// ---------- builders ----------

/** TailsUnit_JP/EN → AppearanceDetail エントリ */
function fromTailsUnit(char) {
  const jp = char.TailsUnit_JP ?? null;
  const en = char.TailsUnit_EN ?? null;
  if (jp === null && en === null) return [];
  return [{
    Formation:     null,
    BodyPart:      ['#BodyPart_Tail'],
    Laterality:    null,
    DesignElement: null,
    Attrs:         [{ AttrLabel: '#DesignAttr_Shape', Value_JP: jp, Value_EN: en }],
    img_PNGName:   null,
    Note_JP:       null,
    Note_EN:       null
  }];
}

/**
 * NumberMarkLocation[] → AppearanceDetail エントリ群
 * 1マーク（MarkPosition + MarkColor + MarkNotation）を 1エントリの Attrs[] にまとめる。
 * BodyPart は null（位置テキストからの自動推論は困難）。
 * Laterality は MarkPosition_JP の 左/右 キーワードから推論。
 */
function fromNumberMarkLocation(char) {
  const entries = [];
  const locs = char.NumberMarkLocation;
  if (!Array.isArray(locs)) return entries;
  for (const loc of locs) {
    const formation = loc.Formation ?? null;
    for (const mark of (loc.Marks ?? [])) {
      const attrs = [];
      if (mark.MarkPosition_JP || mark.MarkPosition_EN) {
        attrs.push({
          AttrLabel: '#DesignAttr_Position',
          Value_JP:  mark.MarkPosition_JP ?? null,
          Value_EN:  mark.MarkPosition_EN ?? null
        });
      }
      if (mark.MarkColor_JP || mark.MarkColor_EN) {
        attrs.push({
          AttrLabel: '#DesignAttr_Color',
          Value_JP:  mark.MarkColor_JP ?? null,
          Value_EN:  mark.MarkColor_EN ?? null
        });
      }
      if (mark.MarkNotation_JP || mark.MarkNotation_EN) {
        attrs.push({
          AttrLabel: '#DesignAttr_Notation',
          Value_JP:  mark.MarkNotation_JP ?? null,
          Value_EN:  mark.MarkNotation_EN ?? null
        });
      }
      if (attrs.length > 0) {
        entries.push({
          Formation:     formation,
          BodyPart:      null,
          Laterality:    inferLaterality(mark.MarkPosition_JP),
          DesignElement: '#Element_NumberMark',
          Attrs:         attrs,
          img_PNGName:   null,
          Note_JP:       null,
          Note_EN:       null
        });
      }
    }
  }
  return entries;
}

/**
 * IdentityMotif[] → AppearanceDetail エントリ群
 *
 * グルーピング戦略: 同じ (Formation, BodyPart[], Laterality) を持つ Motif エントリを
 * 1エントリにまとめ、各テキストを Attrs[] に収める。
 * - BodyPart=null のエントリ（服装・全体描写など）は個別エントリのまま保つ
 * - Laterality が異なれば別エントリとして維持（例: 右サイドポニーテール vs 全体的な髪色）
 */
function fromIdentityMotif(char) {
  const motifs = char.IdentityMotif;
  if (!Array.isArray(motifs)) return [];

  // Pass 1: モチーフテキストを展開し各行の BodyPart / Laterality を推論
  const items = [];
  for (const m of motifs) {
    const formation = m.Formation ?? null;
    const motifObj  = m.Motif ?? {};
    const jpArr = Array.isArray(motifObj.Motif_JP) ? motifObj.Motif_JP
                : motifObj.Motif_JP != null         ? [motifObj.Motif_JP] : [];
    const enArr = Array.isArray(motifObj.Motif_EN) ? motifObj.Motif_EN
                : motifObj.Motif_EN != null         ? [motifObj.Motif_EN] : [];
    const len = Math.max(jpArr.length, enArr.length);
    for (let i = 0; i < len; i++) {
      const jp = jpArr[i] ?? null;
      items.push({ formation, bodyParts: inferBodyParts(jp), laterality: inferLaterality(jp), jp, en: enArr[i] ?? null });
    }
  }

  // Pass 2: BodyPart が null でないエントリを (Formation, BodyPart[], Laterality) でグループ化
  const groupOrder = [];
  const groups     = new Map();

  for (const item of items) {
    if (!item.bodyParts) {
      // BodyPart なし（服装・全体描写）: グループ化せず個別エントリ
      const uid = Symbol();
      groups.set(uid, { formation: item.formation, bodyParts: null, laterality: item.laterality,
        attrs: [{ AttrLabel: '#DesignAttr_Overview', Value_JP: item.jp, Value_EN: item.en }] });
      groupOrder.push(uid);
      continue;
    }
    // グループキー: formation | BodyPart[]ソート結合 | Laterality
    const key = [item.formation ?? '', ...item.bodyParts.slice().sort(), item.laterality ?? ''].join('|');
    if (!groups.has(key)) {
      groups.set(key, { formation: item.formation, bodyParts: item.bodyParts, laterality: item.laterality, attrs: [] });
      groupOrder.push(key);
    }
    groups.get(key).attrs.push({ AttrLabel: '#DesignAttr_Overview', Value_JP: item.jp, Value_EN: item.en });
  }

  // Pass 3: 挿入順を保ってエントリ生成
  return groupOrder.map(key => {
    const g = groups.get(key);
    return {
      Formation:     g.formation,
      BodyPart:      g.bodyParts,
      Laterality:    g.laterality,
      DesignElement: '#Element_Motif',
      Attrs:         g.attrs,
      img_PNGName:   null,
      Note_JP:       null,
      Note_EN:       null,
    };
  });
}

/** AccessoryUnit_JP/EN → AppearanceDetail エントリ（複合部位のため BodyPart は null） */
function fromAccessoryUnit(char) {
  const jp = char.AccessoryUnit_JP ?? null;
  const en = char.AccessoryUnit_EN ?? null;
  if (jp === null && en === null) return [];
  return [{
    Formation:     null,
    BodyPart:      null,
    Laterality:    null,
    DesignElement: '#Element_Accessory',
    Attrs:         [{ AttrLabel: '#DesignAttr_Overview', Value_JP: jp, Value_EN: en }],
    img_PNGName:   null,
    Note_JP:       null,
    Note_EN:       null
  }];
}

// ---------- runner ----------

/**
 * AppearanceDetail を指定アンカーフィールドの直後に挿入してオブジェクトを再構築する。
 * アンカーが見つからない場合は末尾に追加する。
 * @param {object} char
 * @param {string[]} anchorCandidates 優先順で試みるフィールド名リスト
 * @param {object[]} entries
 * @returns {object}
 */
function insertAppearanceDetail(char, anchorCandidates, entries) {
  const anchor = anchorCandidates.find(f => f in char);
  const reordered = {};
  let inserted = false;
  for (const [k, v] of Object.entries(char)) {
    if (k === 'AppearanceDetail') continue; // 旧位置を除去
    reordered[k] = v;
    if (!inserted && anchor && k === anchor) {
      reordered['AppearanceDetail'] = entries;
      inserted = true;
    }
  }
  if (!inserted) reordered['AppearanceDetail'] = entries;
  return reordered;
}

/**
 * @param {string} dbPath
 * @param {Array<(char: object) => object[]>} builders
 * @param {string[]} anchorCandidates AppearanceDetail を挿入するアンカーフィールドの優先リスト
 */
function migrateDB(dbPath, builders, anchorCandidates = []) {
  const db = JSON.parse(readFileSync(dbPath, 'utf-8'));
  let migrated = 0;
  const result = db.map(char => {
    const entries = builders.flatMap(b => b(char));
    if (entries.length === 0) {
      // エントリなし: 既存の AppearanceDetail を除去して返す（再実行クリーンアップ）
      if ('AppearanceDetail' in char) {
        const { AppearanceDetail: _, ...rest } = char;
        return rest;
      }
      return char;
    }
    migrated++;
    return insertAppearanceDetail(char, anchorCandidates, entries);
  });
  writeFileSync(dbPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  return { total: db.length, migrated };
}

// ---------- main ----------

const targets = [
  {
    label:   'NT db_Primary',
    path:    'data/Works_NumberTales/DataBases/db_Primary.json',
    builders: [fromTailsUnit, fromNumberMarkLocation, fromIdentityMotif],
    // IdentityMotif が最後の参照元フィールドなので直後に挿入
    anchors: ['IdentityMotif', 'TailsUnit_EN', 'NumberMarkLocation'],
  },
  {
    label:   'UnibyteLive db_Primary',
    path:    'data/Works_UnibyteLive/DataBases/db_Primary.json',
    builders: [fromIdentityMotif, fromAccessoryUnit],
    // AccessoryUnit_EN が主参照元
    anchors: ['AccessoryUnit_EN', 'IdentityMotif'],
  },
];

for (const t of targets) {
  const { total, migrated } = migrateDB(resolve(repoRoot, t.path), t.builders, t.anchors);
  console.log(`[${t.label}] ${migrated}/${total} records → AppearanceDetail added`);
}

console.log('Done.');
