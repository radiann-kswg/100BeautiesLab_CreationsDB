// 列挙型・値変換用のマッピングを構築
function buildEnumMaps(...metas) {
	const enumMaps = {};

	for (const meta of metas) {
		const varsDef = meta.General?.$VarsDef || {};
		for (const [key, val] of Object.entries(varsDef)) {
			// オブジェクト形式
			if (key.startsWith('$EnumDef_')) {
				const mapName = key.replace('$EnumDef_', '');
				enumMaps[mapName] = enumMaps[mapName] || {};
				for (const [enumKey, enumObj] of Object.entries(val)) {
					for (const [field, value] of Object.entries(enumObj)) {
						if (field.endsWith('_JP')) {
							const baseField = field.replace('_JP', '');
							enumMaps[mapName][enumObj[baseField]] = { JP: value, EN: enumObj[baseField] };
						}
					}
				}
			}
			// 配列形式
			if (key.startsWith('#Enum_')) {
				const mapName = key.replace('#Enum_', '');
				enumMaps[mapName] = enumMaps[mapName] || {};
				for (const enumObj of val) {
					for (const [field, value] of Object.entries(enumObj)) {
						if (field.endsWith('_JP')) {
							const baseField = field.replace('_JP', '');
							enumMaps[mapName][enumObj[baseField]] = { JP: value, EN: enumObj[baseField] };
						}
						if (field.endsWith('_EN')) {
							const baseField = field.replace('_EN', '');
							enumMaps[mapName][enumObj[baseField]] = { JP: enumObj[baseField], EN: value };
						}
					}
				}
			}
		}
		// #Enum_HideTextのようなトップレベル配列も対応
		for (const [key, val] of Object.entries(meta.General?.$VarsDef || {})) {
			if (key === "#Enum_HideText" && Array.isArray(val)) {
				enumMaps["HideText"] = enumMaps["HideText"] || {};
				for (const obj of val) {
					if (obj.HideText && obj.HideText_EN) {
						enumMaps["HideText"][obj.HideText] = { JP: obj.HideText, EN: obj.HideText_EN };
					}
				}
			}
		}
		if (meta["General"] && meta["General"]["#Enum_HideText"]) {
			enumMaps["HideText"] = enumMaps["HideText"] || {};
			for (const obj of meta["General"]["#Enum_HideText"]) {
				if (obj.HideText && obj.HideText_EN) {
					enumMaps["HideText"][obj.HideText] = { JP: obj.HideText, EN: obj.HideText_EN };
				}
			}
		}
		if (meta["#Enum_HideText"]) {
			enumMaps["HideText"] = enumMaps["HideText"] || {};
			for (const obj of meta["#Enum_HideText"]) {
				if (obj.HideText && obj.HideText_EN) {
					enumMaps["HideText"][obj.HideText] = { JP: obj.HideText, EN: obj.HideText_EN };
				}
			}
		}
	}
	return enumMaps;
}

// Stats系列挙体・意訳文マッピング
function buildStatsEnumMaps(metaGlobal, metaWork) {
	const enumMaps = {};

	// グローバル側（AbilityStatsのみ）
	const statsDef = metaGlobal.General?.$VarsDef?.$Def_Stats || {};
	if (statsDef.$EnumDef_Rank) {
		enumMaps["Rank"] = {};
		for (const [k, v] of Object.entries(statsDef.$EnumDef_Rank)) {
			enumMaps["Rank"][v] = { jp: null, en: v, key: k };
		}
	}
	if (
		statsDef.$Def_AbilityStats &&
		statsDef.$Def_AbilityStats["#Link(Rank)_AbilityText"]
	) {
		enumMaps["AbilityText"] = {};
		for (const [k, v] of Object.entries(statsDef.$Def_AbilityStats["#Link(Rank)_AbilityText"])) {
			const rankKey = statsDef.$EnumDef_Rank?.[k] || null;
			if (rankKey && v) {
				enumMaps["AbilityText"][rankKey] = { jp: v, en: rankKey, key: k };
			}
		}
	}

	// ローカル側（AbilityStats以外も正規表現で対応）
	const varsDef = metaWork.General?.$VarsDef || {};
	const statsKeys = Object.keys(varsDef).filter(key => /^[A-Z][A-Za-z]+Stats$/.test(key));
	for (const statsKey of statsKeys) {
		const statsDefWork = varsDef[statsKey] || {};
		if (statsDefWork.$EnumDef_Rank) {
			enumMaps["Rank"] = enumMaps["Rank"] || {};
			for (const [k, v] of Object.entries(statsDefWork.$EnumDef_Rank)) {
				enumMaps["Rank"][v] = { jp: null, en: v, key: k };
			}
		}
		for (const [defKey, defVal] of Object.entries(statsDefWork)) {
			if (
				/^\$Def_/.test(defKey) &&
				typeof defVal === "object" &&
				defVal !== null
			) {
				for (const linkKey of Object.keys(defVal)) {
					// #Link(Rank)_で始まりTextで終わる
					if (/^#Link\(Rank\)_[A-Za-z]+(Level)?Text$/.test(linkKey)) {
						const statName = defKey.replace(/^\$Def_/, '').replace(/Stats$/, '');
						const mapKey = statName + "Text";
						enumMaps[mapKey] = enumMaps[mapKey] || {};
						for (const [k, v] of Object.entries(defVal[linkKey])) {
							const rankKey = statsDefWork.$EnumDef_Rank?.[k] || null;
							if (rankKey && v) {
								enumMaps[mapKey][rankKey] = { jp: Array.isArray(v) ? v[0] : v, en: rankKey, key: k };
							}
						}
					}
					// #LinkList(Rank)_で始まりTextで終わる（配列型）
					if (/^#LinkList\(Rank\)_[A-Za-z]+Text$/.test(linkKey)) {
						const statName = defKey.replace(/^\$Def_/, '').replace(/Stats$/, '');
						const mapKey = statName + "TextList";
						enumMaps[mapKey] = enumMaps[mapKey] || {};
						for (const [k, arr] of Object.entries(defVal[linkKey])) {
							const rankKey = statsDefWork.$EnumDef_Rank?.[k] || null;
							if (rankKey && Array.isArray(arr)) {
								enumMaps[mapKey][rankKey] = arr;
							}
						}
					}
				}
			}
		}
		if (
			statsDefWork.$Def_AbilityStats &&
			statsDefWork.$Def_AbilityStats["#Link(Rank)_AbilityText"]
		) {
			enumMaps["AbilityText"] = enumMaps["AbilityText"] || {};
			for (const [k, v] of Object.entries(statsDefWork.$Def_AbilityStats["#Link(Rank)_AbilityText"])) {
				const rankKey = statsDefWork.$EnumDef_Rank?.[k] || null;
				if (rankKey && v) {
					enumMaps["AbilityText"][rankKey] = { jp: v, en: rankKey, key: k };
				}
			}
		}
	}

	return enumMaps;
}

function isStatsKey(key) {
	return typeof key === "string" && /^[A-Z][A-Za-z]*Stats$/.test(key);
}

// Rankの意訳文取得
function getRankSpecialText(rank, statsObj, statsEnumMaps) {
	if (!statsObj || typeof statsObj !== "object") return null;
	for (const key of Object.keys(statsObj)) {
		if (
			/[A-Za-z]+Text$/.test(key) &&
			typeof statsObj[key] === "string" &&
			statsObj[key].trim() !== ""
		) {
			return { key, value: statsObj[key] };
		}
	}
	if (statsEnumMaps?.AbilityText?.[rank]?.jp) {
		return { key: "AbilityText", value: statsEnumMaps.AbilityText[rank].jp };
	}
	if (statsEnumMaps?.Rank?.[rank]?.jp) {
		return { key: "RankText", value: statsEnumMaps.Rank[rank].jp };
	}
	return null;
}

// 列挙体・Stats意訳文を日本語・英語併記で解決
function resolveEnums(obj, enumMaps, statsEnumMaps, parentKey = "", parentObj = null) {
	if (Array.isArray(obj)) {
		return obj.map(item => resolveEnums(item, enumMaps, statsEnumMaps, parentKey, parentObj));
	}
	if (typeof obj !== 'object' || obj === null) return obj;

	const result = {};
	for (const [k, v] of Object.entries(obj)) {
		if (k.startsWith('_')) {
			result[k] = `[仕様] ${v}`;
		} else if (enumMaps[k] && enumMaps[k][v]) {
			result[k] = {
				value: v,
				jp: enumMaps[k][v].JP || enumMaps[k][v].jp,
				en: enumMaps[k][v].EN || enumMaps[k][v].en
			};
		} else if (k === "HideText" && enumMaps["HideText"] && enumMaps["HideText"][v]) {
			result[k] = {
				value: v,
				jp: enumMaps["HideText"][v].JP || enumMaps["HideText"][v].jp,
				en: enumMaps["HideText"][v].EN || enumMaps["HideText"][v].en
			};
		} else if (k === "Rank" && typeof v === "string" && statsEnumMaps?.Rank?.[v]) {
			let jpText = null;
			let foundText = null;

			// 兄弟フィールドからText系を優先
			if (parentObj) {
				for (const textField of Object.keys(parentObj)) {
					if (
						/[A-Za-z]+Text$/.test(textField) &&
						typeof parentObj[textField] === "string" &&
						parentObj[textField].trim() !== ""
					) {
						foundText = parentObj[textField];
						break;
					}
				}
			}

			// parentKeyからTextマップ名を生成
			let parentTextKey = null;
			let parentTextListKey = null;
			if (isStatsKey(parentKey)) {
				parentTextKey = parentKey.replace(/Stats$/, '') + "Text";
				parentTextListKey = parentKey.replace(/Stats$/, '') + "TextList";
			}

			// #Link(Rank)_*Text
			if (
				parentTextKey &&
				statsEnumMaps[parentTextKey] &&
				statsEnumMaps[parentTextKey][v] &&
				statsEnumMaps[parentTextKey][v].jp
			) {
				jpText = statsEnumMaps[parentTextKey][v].jp;
			}
			// #LinkList(Rank)_*Text（配列型）
			else if (
				parentTextListKey &&
				statsEnumMaps[parentTextListKey] &&
				statsEnumMaps[parentTextListKey][v] &&
				Array.isArray(statsEnumMaps[parentTextListKey][v])
			) {
				if (foundText && statsEnumMaps[parentTextListKey][v].includes(foundText)) {
					jpText = foundText;
				} else if (statsEnumMaps[parentTextListKey][v].length > 0) {
					jpText = statsEnumMaps[parentTextListKey][v][0];
				}
			}
			// 兄弟フィールドのText
			else if (foundText) {
				jpText = foundText;
			}
			// AbilityTextやRankText
			else if (statsEnumMaps.AbilityText?.[v]?.jp) {
				jpText = statsEnumMaps.AbilityText[v].jp;
			} else if (statsEnumMaps.Rank?.[v]?.jp) {
				jpText = statsEnumMaps.Rank[v].jp;
			}

			result[k] = {
				value: v,
				jp: jpText,
				en: v
			};
		} else if (
			isStatsKey(k) &&
			typeof v === "object" && v !== null
		) {
			// Stats系（EffectStatsなど）は「親（obj）」をparentObjとして渡す
			result[k] = resolveEnums(v, enumMaps, statsEnumMaps, k, obj);
		} else if (typeof v === 'object' && v !== null) {
			result[k] = resolveEnums(v, enumMaps, statsEnumMaps, k, obj);
		} else {
			result[k] = v;
		}
	}
	return result;
}

// 作品ごとのhashTag（インデックスフィールド名）と型情報を取得
function getIndexFields(metaGlobal, metaWork, work) {
	const worksMeta = metaWork.CreationWorks || metaGlobal.CreationWorks;
	if (!worksMeta) return [];
	const workKey = Object.keys(worksMeta).find(
		k => k.replace(/^#/, '') === work || k === work || k.replace(/^#Works_/, 'Works_') === work
	);
	if (!workKey) return [];
	const defIndex = worksMeta[workKey]?.$Def_Index;
	if (!defIndex) return [];

	if (Array.isArray(defIndex)) {
		return defIndex.map(d => ({
			hashTag: d.hashTag,
			valType: d.$valType || d.valType
		}));
	} else {
		return [{
			hashTag: defIndex.hashTag,
			valType: defIndex.$valType || defIndex.valType
		}];
	}
}

// ListIndex型の列挙体名を取得
function getListIndexEnums(valType, metaWork) {
	const enums = [];
	if (!valType) return enums;
	if (typeof valType === "string" && valType === "#ListIndex") {
		const varsDef = metaWork.General?.$VarsDef || {};
		for (const key of Object.keys(varsDef)) {
			if (key.startsWith("#Enum_")) enums.push(key.replace("#Enum_", ""));
		}
	}
	if (Array.isArray(valType)) {
		for (const v of valType) {
			enums.push(...getListIndexEnums(v, metaWork));
		}
	}
	return enums;
}

// indexパラメータをオブジェクト型または複数要素入力に対応
function parseIndexParam(indexParam) {
	try {
		if (indexParam.trim().startsWith('{')) {
			return JSON.parse(indexParam);
		}
		const obj = {};
		indexParam.split(',').forEach(pair => {
			const [k, v] = pair.split(':');
			if (k && v !== undefined) obj[k.trim()] = isNaN(Number(v)) ? v.trim() : Number(v);
		});
		if (Object.keys(obj).length > 0) return obj;
		return indexParam;
	} catch {
		return indexParam;
	}
}

async function main() {
	const params = new URLSearchParams(location.search);
	const work = params.get('work');
	const type = params.get('type') || 'Primary';
	const indexRaw = params.get('index');

	if (!work || !indexRaw) {
		document.getElementById('result').textContent = 'パラメータ work, index を指定してください';
		return;
	}

	const index = parseIndexParam(indexRaw);

	const dbFile = `/data/${work}/DataBases/db_${type}.json`;
	const metaFileWork = `/data/${work}/DataBases/db_meta.json`;
	const metaFileGlobal = `/data/db_meta.json`;

	const [db, metaWork, metaGlobal] = await Promise.all([
		fetch(dbFile).then(r => r.json()),
		fetch(metaFileWork).then(r => r.json()),
		fetch(metaFileGlobal).then(r => r.json())
	]);

	const indexFields = getIndexFields(metaGlobal, metaWork, work);
	if (!indexFields.length) {
		document.getElementById('result').textContent = 'インデックスフィールドが特定できません';
		return;
	}

	let found = null;
	for (const fieldInfo of indexFields) {
		if (fieldInfo.valType && (fieldInfo.valType === "#ListIndex" || (Array.isArray(fieldInfo.valType) && fieldInfo.valType.includes("#ListIndex")))) {
			const enums = getListIndexEnums(fieldInfo.valType, metaWork);
			for (const enumName of enums) {
				found = db.find(item => {
					if (Array.isArray(item[enumName])) {
						return item[enumName].includes(index);
					}
					return item[enumName] == index;
				});
				if (found) break;
			}
			if (found) break;
		} else {
			if (typeof index === 'object' && index !== null) {
				found = db.find(item => {
					const target = item[fieldInfo.hashTag];
					if (typeof target !== 'object' || target === null) return false;
					return Object.entries(index).every(([k, v]) => target[k] == v);
				});
			} else {
				found = db.find(item => item[fieldInfo.hashTag] == index);
			}
			if (found) break;
		}
	}

	if (!found) {
		document.getElementById('result').textContent = '該当データが見つかりません';
		return;
	}

	const enumMaps = buildEnumMaps(metaGlobal, metaWork);
	const statsEnumMaps = buildStatsEnumMaps(metaGlobal, metaWork);
	const resolved = resolveEnums(found, enumMaps, statsEnumMaps);

	document.getElementById('result').textContent = JSON.stringify(resolved, null, 2);
}

main();