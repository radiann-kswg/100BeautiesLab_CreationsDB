/**
 * [markers.mjs] - ロールプレイプロンプトの「管理ブロックマーカー」ユーティリティ
 * @description
 *   生成 Markdown の DB 由来セクションを HTML コメントの管理ブロック
 *   `<!-- 100bl:auto section="X" key="..." hash="sha1:..." v="1" --> … <!-- /100bl:auto -->` で囲む。
 *   フェーズ1 では生成時のスタンプ（key/hash 付与）を担う。パース＆セクション単位マージ更新は
 *   フェーズ2 で parseMarkers / mergeMarkers を追加する。
 * @author 100BeautiesLab.
 * @version 1.0.0
 * @dependencies Node.js >= 18（node:crypto）
 */
import crypto from 'node:crypto';

/** マーカー仕様バージョン（将来の移行判定用） */
export const MARKER_VERSION = '1';

/**
 * セクション本文の短縮 sha1（先頭 12 桁）を返す。
 * @param {string} text
 * @returns {string}
 */
export function sha1Short(text) {
	return crypto.createHash('sha1').update(String(text == null ? '' : text), 'utf8').digest('hex').slice(0, 12);
}

/**
 * HTML 属性用の最小エスケープ（`"` のみ）。
 * @param {string} s
 * @returns {string}
 */
function escapeAttr(s) {
	return String(s == null ? '' : s).replace(/"/g, '&quot;');
}

/**
 * テキスト中の `100bl:auto` 管理ブロックに key / hash / v を付与（再スタンプ）する。
 * hash は「マーカー内本文（前後空白を除去したもの）」の sha1。本文が変われば hash が変わるため、
 * フェーズ2 のマージ更新で「セクションが更新されたか」を判定できる。
 * @param {string} text
 * @param {{key?: string}} [opts] - key はレコード識別子（例: "NumberTales/Primary/Num:4"）
 * @returns {string}
 */
export function stampMarkers(text, opts = {}) {
	const key = opts.key || '';
	const re = /<!--\s*100bl:auto\s+section="([^"]*)"[^>]*?-->([\s\S]*?)<!--\s*\/100bl:auto\s*-->/g;
	return String(text == null ? '' : text).replace(re, (_m, section, body) => {
		const h = sha1Short(body.trim());
		const keyAttr = key ? ` key="${escapeAttr(key)}"` : '';
		return `<!-- 100bl:auto section="${section}"${keyAttr} hash="sha1:${h}" v="${MARKER_VERSION}" -->${body}<!-- /100bl:auto -->`;
	});
}
