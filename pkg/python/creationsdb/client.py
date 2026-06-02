"""
CreationsDB クライアント実装

100BeautiesLab_CreationsDB リポジトリをファイルシステム経由で操作する。
外部ライブラリ依存なし（標準ライブラリのみ）。

動作要件: Python 3.9+
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Optional


# ─────────────────────────────────────────────────────────────────────────────
# 内部ユーティリティ
# ─────────────────────────────────────────────────────────────────────────────

_SAFE_TOKEN_RE = re.compile(r'^[A-Za-z0-9_]+$')
_VALID_JSON_FILE_RE = re.compile(r'^[A-Za-z0-9_.\-]+\.json$')


def _is_safe_token(s: Any) -> bool:
    """英数字とアンダースコアのみからなる安全なトークン判定"""
    return isinstance(s, str) and bool(s) and bool(_SAFE_TOKEN_RE.match(s))


def _capitalize(s: str) -> str:
    """先頭文字を大文字化"""
    return s[:1].upper() + s[1:] if s else s


def _to_work_key(work_id: str) -> Optional[str]:
    """
    作品 ID を '#Works_<Name>' 形式に正規化。
    'NumberTales' / 'Works_NumberTales' / '#Works_NumberTales' いずれも受け付ける。
    無効な場合は None を返す。
    """
    if not work_id:
        return None
    raw = str(work_id).strip()
    if raw.startswith('#Works_'):
        normalized = raw
    elif raw.startswith('Works_'):
        normalized = f'#{raw}'
    else:
        normalized = f'#Works_{raw}'
    m = re.match(r'^#Works_([A-Za-z0-9_]+)$', normalized)
    return f'#Works_{m.group(1)}' if m else None


def _resolve_work_dir(work_id: str) -> str:
    """'#Works_XXX' → 'Works_XXX'"""
    return str(work_id or '').replace('#Works_', 'Works_')


def _strip_meta_db_prefix(db_name: str) -> str:
    """'#DB_Primary' / '#Ref_Primary' → 'Primary'"""
    s = str(db_name or '').strip()
    s = re.sub(r'^#?(DB|Ref)_', '', s, flags=re.IGNORECASE)
    return s.lstrip('#')


def _normalize_db_key_for_meta(db_name: str) -> str:
    """DB 名を '#DB_Primary' 形式のメタキーへ変換"""
    return f'#DB_{_capitalize(_strip_meta_db_prefix(db_name))}'


def _find_meta_db_entry(
    databases: dict, db_name: str
) -> tuple[Optional[str], Optional[dict]]:
    """
    databases オブジェクトから DB エントリを検索。
    戻り値: (metaKey, entry)
    """
    if not isinstance(databases, dict):
        return None, None
    norm = _capitalize(_strip_meta_db_prefix(db_name))
    candidates = [f'#DB_{norm}', f'#Ref_{norm}']
    for meta_key in candidates:
        entry = databases.get(meta_key)
        if isinstance(entry, dict):
            return meta_key, entry
    return candidates[0], None


def _is_public_record(record: Any) -> bool:
    """isPrivate フラグを持つレコードを非公開と判定"""
    if not isinstance(record, dict):
        return True
    v = record.get('isPrivate')
    if v is True:
        return False
    if isinstance(v, str) and v.strip().lower() == 'true':
        return False
    return True


def _is_empty_for_commons(v: Any) -> bool:
    """_Commons 適用時の空値判定（None / '' / [] / {} は空、hideText は空扱いしない）"""
    if v is None:
        return True
    if v == '':
        return True
    if isinstance(v, list):
        return len(v) == 0
    if isinstance(v, dict):
        if v.get('hideText'):
            return False  # 意図的マスクは空扱いしない
        return len(v) == 0
    return False


def _apply_commons_to_records(
    records: list[dict], work_meta: dict, db_name: str
) -> list[dict]:
    """
    db_meta.json の _Commons をレコード配列に非破壊適用する。
    sw-common.js CommonsProcessor.applyCommonsToRecords の Python 移植版（基本部分）。
    """
    try:
        db_key = _normalize_db_key_for_meta(db_name)
        db_info = (work_meta.get('Databases') or {}).get(db_key, {})
        commons = db_info.get('_Commons') if isinstance(db_info, dict) else None
        sec_defs = db_info.get('_Secondaries') or db_info.get('Secondaries') \
            if isinstance(db_info, dict) else None

        if not commons and not isinstance(sec_defs, list):
            return records

        def build_defaults(cmn: Optional[dict]) -> dict:
            if not isinstance(cmn, dict):
                return {}
            return {
                k: v for k, v in cmn.items()
                if not k.startswith('_') and not k.startswith('#')
            }

        def find_sec_defaults(rec: dict) -> dict:
            if not isinstance(sec_defs, list):
                return {}
            fallback: Optional[dict] = None
            for defn in sec_defs:
                if not isinstance(defn, dict) or not defn.get('_Commons'):
                    continue
                def_title = defn.get('sec_SeriesTitle') or defn.get('SecondarySeriesTitle')
                if def_title is None or str(def_title).strip() == '':
                    if fallback is None:
                        fallback = build_defaults(defn.get('_Commons'))
                    continue
                rec_title = rec.get('sec_SeriesTitle') or rec.get('SecondarySeriesTitle')
                if str(rec_title or '') == str(def_title):
                    return build_defaults(defn.get('_Commons'))
            return fallback or {}

        result = []
        for rec in records:
            if not isinstance(rec, dict):
                result.append(rec)
                continue
            rec = dict(rec)  # シャローコピー（元データを変更しない）
            defaults = {**build_defaults(commons), **find_sec_defaults(rec)}
            for k, v in defaults.items():
                if k.startswith('#'):
                    continue
                if k not in rec or _is_empty_for_commons(rec.get(k)):
                    rec[k] = v
            result.append(rec)
        return result
    except Exception:
        return records


def _get_by_path(obj: Any, path: str) -> Any:
    """ドット区切りパスでネストされた値を取得"""
    for part in str(path).split('.'):
        if not isinstance(obj, dict) or part not in obj:
            return None
        obj = obj[part]
    return obj


def _search_text(records: list[dict], query: str) -> list[dict]:
    """searchableText または JSON 全体を対象に部分一致全文検索"""
    if not query or not records:
        return records
    q = query.lower()
    result = []
    for rec in records:
        enrichment = rec.get('_enrichment', {}) if isinstance(rec, dict) else {}
        text = enrichment.get('searchableText') if isinstance(enrichment, dict) else None
        if text is None:
            text = json.dumps(rec, ensure_ascii=False)
        if q in text.lower():
            result.append(rec)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# ファイルシステム I/O
# ─────────────────────────────────────────────────────────────────────────────

class _FsFetcher:
    """
    リポジトリルートを基点とした JSON ファイル読み込みクラス。
    パスは '/' 始まりのルート相対パスで指定（例: '/data/db_meta.json'）。
    """

    def __init__(self, repo_root: str) -> None:
        self.repo_root = Path(repo_root).resolve()

    def _resolve(self, path: str) -> Path:
        return self.repo_root / path.lstrip('/')

    def exists(self, path: str) -> bool:
        """ファイル存在確認"""
        return self._resolve(path).is_file()

    def read_json(self, path: str) -> Any:
        """
        JSON ファイルを読み込んでパース。
        ファイルが存在しない・JSON 不正の場合は例外を送出。
        """
        fp = self._resolve(path)
        with fp.open('r', encoding='utf-8') as f:
            return json.load(f)

    def try_read_json(self, path: str, default: Any = None) -> Any:
        """JSON ファイルを読み込み、失敗時は default を返す"""
        try:
            return self.read_json(path)
        except Exception:
            return default


# ─────────────────────────────────────────────────────────────────────────────
# メタ / 型定義 読み込みヘルパー
# ─────────────────────────────────────────────────────────────────────────────

def _read_dictionary_bundle(fetcher: _FsFetcher, base_path: str) -> tuple[dict, dict]:
    """
    辞書バンドル（data/Dictionaries/ または作品別 Dictionaries/）を読み込み。
    戻り値: (dict_meta, vars_dict)
    """
    meta = fetcher.try_read_json(f'{base_path}/db_meta.json', {})
    type_data = fetcher.try_read_json(f'{base_path}/db_type.json', {})

    type_vars = {}
    if isinstance(type_data, dict) and isinstance(type_data.get('$VarsDef'), dict):
        type_vars = type_data['$VarsDef']

    catalogs = meta.get('Dictionaries', {}) if isinstance(meta, dict) else {}
    vars_out: dict = dict(type_vars)

    for raw_key, info in (catalogs.items() if isinstance(catalogs, dict) else []):
        if not isinstance(info, dict):
            continue
        dict_name = str(raw_key).replace('#Dict_', '').strip()
        if not dict_name:
            continue
        dict_key = raw_key if str(raw_key).startswith('#Dict_') else f'#Dict_{dict_name}'
        compat_key_raw = info.get('compatListKey')
        compat_key = str(compat_key_raw).strip() if compat_key_raw else f'#List_{dict_name}'
        rows = fetcher.try_read_json(f'{base_path}/dict_{dict_name}.json')
        if not isinstance(rows, list):
            continue
        vars_out[dict_key] = [dict(r) if isinstance(r, dict) else r for r in rows]
        if compat_key and compat_key not in vars_out:
            vars_out[compat_key] = [dict(r) if isinstance(r, dict) else r for r in rows]

    return meta, vars_out


def _merge_meta_with_vars(meta: Any, vars_dict: dict, dict_meta: dict) -> dict:
    """vars / dict_meta をメタオブジェクトへ合流"""
    m = meta if isinstance(meta, dict) else {}
    meta_general = m.get('General', {}) if isinstance(m.get('General'), dict) else {}
    meta_vars = meta_general.get('$VarsDef', {}) if isinstance(meta_general.get('$VarsDef'), dict) else {}
    merged_vars = {**meta_vars, **(vars_dict or {})}

    base_dicts = m.get('Dictionaries', {}) if isinstance(m.get('Dictionaries'), dict) else {}
    extra_dicts = dict_meta.get('Dictionaries', {}) if isinstance(dict_meta, dict) and isinstance(dict_meta.get('Dictionaries'), dict) else {}

    result = dict(m)
    if extra_dicts:
        result['Dictionaries'] = {**base_dicts, **extra_dicts}
    result['General'] = {**meta_general, '$VarsDef': merged_vars}
    return result


def _read_global_meta(fetcher: _FsFetcher) -> dict:
    """グローバルメタ (data/db_meta.json + Dictionaries 合流) を読み込み"""
    meta = fetcher.read_json('/data/db_meta.json')
    dict_meta, vars_dict = _read_dictionary_bundle(fetcher, '/data/Dictionaries')
    return _merge_meta_with_vars(meta, vars_dict, dict_meta)


def _read_work_meta(fetcher: _FsFetcher, work_id: str) -> dict:
    """作品別メタ (data/Works_X/DataBases/db_meta.json + Dictionaries) を読み込み"""
    work_dir = _resolve_work_dir(work_id)
    meta = fetcher.read_json(f'/data/{work_dir}/DataBases/db_meta.json')
    dict_meta, vars_dict = _read_dictionary_bundle(fetcher, f'/data/{work_dir}/Dictionaries')
    return _merge_meta_with_vars(meta, vars_dict, dict_meta)


def _read_db_records(
    fetcher: _FsFetcher, work_id: str, db_name: str
) -> tuple[list, Optional[dict]]:
    """
    DB ファイルを解決して読み込む。
    戻り値: (records, work_meta)
    """
    norm = _strip_meta_db_prefix(db_name)
    if not _is_safe_token(norm):
        raise ValueError(f'Invalid dbName: {db_name}')
    key = _capitalize(norm)

    # 作品メタから DB_Layer / DB_File を解決
    work_meta = None
    try:
        work_meta = _read_work_meta(fetcher, work_id)
    except Exception:
        pass

    db_meta_key, db_entry = _find_meta_db_entry(
        work_meta.get('Databases') if isinstance(work_meta, dict) else {}, key
    )
    db_entry = db_entry or {}

    layer_raw = str(db_entry.get('DB_Layer') or '').strip()
    layer = layer_raw if _is_safe_token(layer_raw) else 'DataBases'

    configured_file = ''
    file_raw = str(db_entry.get('DB_File') or '').strip()
    if _VALID_JSON_FILE_RE.match(file_raw):
        configured_file = file_raw

    default_prefix = 'ref_' if str(db_meta_key or '').startswith('#Ref_') else 'db_'
    base = f'/data/{_resolve_work_dir(work_id)}/{layer}'

    conventional = {
        'Primary': 'db_Primary.json', 'Secondary': 'db_Secondary.json',
        'SemiPrimary': 'db_SemiPrimary.json', 'SelfSecondary': 'db_SelfSecondary.json',
        'Proxy': 'db_Proxy.json', 'Mobs': 'db_Mobs.json',
    }

    candidates = []
    if configured_file:
        candidates.append(configured_file)
    if key in conventional:
        candidates.append(conventional[key])
    candidates.append(f'{default_prefix}{key}.json')
    if key.lower() != norm.lower():
        candidates.append(f'{default_prefix}{norm}.json')
    if default_prefix != 'db_':
        candidates.append(f'db_{key}.json')

    for fname in candidates:
        if fetcher.exists(f'{base}/{fname}'):
            records = fetcher.read_json(f'{base}/{fname}')
            if not isinstance(records, list):
                records = []
            return records, work_meta

    raise FileNotFoundError(
        f'DB file not found: workId={work_id}, dbName={db_name}'
    )


# ─────────────────────────────────────────────────────────────────────────────
# 公開 API クラス
# ─────────────────────────────────────────────────────────────────────────────

class CreationsDBClient:
    """
    CreationsDB Python クライアント。

    サブモジュールとして導入した 100BeautiesLab_CreationsDB リポジトリの
    データを Python 環境から直接取得します。

    使用例::

        from creationsdb import CreationsDBClient

        db = CreationsDBClient('/path/to/100BeautiesLab_CreationsDB')
        works = db.list_works()
        records = db.get_records('NumberTales', 'Primary')
        record = db.get_record('NumberTales', 'Primary', '1', idx_key='Num')
        hits = db.search('NumberTales', 'Primary', 'たぬき')
    """

    def __init__(self, repo_root: str, *, include_private: bool = False) -> None:
        """
        Parameters
        ----------
        repo_root : str
            サブモジュールのルートディレクトリパス（絶対・相対どちらも可）。
        include_private : bool
            ``isPrivate: true`` のレコードを含めるか（既定: False）。
        """
        self._fetcher = _FsFetcher(repo_root)
        self.include_private = include_private

    # ── メタデータ系 ─────────────────────────────────────────────────────────

    def get_meta(self) -> dict:
        """グローバルメタデータを取得（data/db_meta.json + Dictionaries 合流済み）"""
        return _read_global_meta(self._fetcher)

    def list_works(self) -> list[dict]:
        """
        作品一覧を返す。``Works_Hidden: true`` の作品は除外される。

        Returns
        -------
        list[dict]
            各要素: ``{key, Title, Title_EN, Works_Summary, OldTitles}``
        """
        global_meta = _read_global_meta(self._fetcher)
        creation_works = global_meta.get('CreationWorks') or {}
        result = []
        for key, info in (creation_works.items() if isinstance(creation_works, dict) else []):
            if not isinstance(info, dict):
                continue
            if info.get('Works_Hidden') is True:
                continue
            result.append({
                'key': key,
                'Title': str(info.get('Title') or ''),
                'Title_EN': str(info.get('Title_EN') or ''),
                'Works_Summary': str(info.get('Works_Summary') or ''),
                'OldTitles': list(info.get('OldTitles') or []),
            })
        return result

    def get_work_meta(self, work_id: str) -> dict:
        """
        作品別メタデータを取得。

        Parameters
        ----------
        work_id : str
            作品ID（'NumberTales' / 'Works_NumberTales' / '#Works_NumberTales' いずれも可）
        """
        key = _to_work_key(work_id)
        if not key:
            raise ValueError(f'Invalid work_id: {work_id}')
        return _read_work_meta(self._fetcher, key)

    def list_dbs(self, work_id: str) -> list[dict]:
        """
        指定作品で利用可能な DB 一覧を返す。``DB_Hidden: true`` は除外される。

        Returns
        -------
        list[dict]
            各要素: ``{key, file, layer, DB_Label, DB_Label_EN}``
        """
        key = _to_work_key(work_id)
        if not key:
            raise ValueError(f'Invalid work_id: {work_id}')

        exist = []
        work_meta = None
        try:
            work_meta = _read_work_meta(self._fetcher, key)
        except Exception:
            pass

        databases = (work_meta or {}).get('Databases') or {}
        if isinstance(databases, dict) and databases:
            for db_key, db_entry in databases.items():
                if not isinstance(db_entry, dict):
                    continue
                if db_entry.get('DB_Hidden') is True:
                    continue
                norm = _strip_meta_db_prefix(db_key)
                name = _capitalize(norm)
                layer_raw = str(db_entry.get('DB_Layer') or '').strip()
                layer = layer_raw if _is_safe_token(layer_raw) else 'DataBases'
                prefix = 'ref_' if str(db_key).startswith('#Ref_') else 'db_'
                base = f'/data/{_resolve_work_dir(key)}/{layer}'
                file_raw = str(db_entry.get('DB_File') or '').strip()
                configured = file_raw if _VALID_JSON_FILE_RE.match(file_raw) else ''
                candidates = [c for c in [configured, f'{prefix}{name}.json', f'db_{name}.json'] if c]
                for fname in candidates:
                    if self._fetcher.exists(f'{base}/{fname}'):
                        exist.append({
                            'key': name, 'file': fname, 'layer': layer,
                            'DB_Label': str(db_entry.get('DB_Label') or name),
                            'DB_Label_EN': str(db_entry.get('DB_Label_EN') or name),
                        })
                        break
            if exist:
                return exist

        # メタ未整備の作品はデフォルトファイルを探索
        base = f'/data/{_resolve_work_dir(key)}/DataBases'
        defaults = [
            'Primary', 'Secondary', 'SemiPrimary', 'SelfSecondary',
            'Proxy', 'Mobs', 'PrimaryDealer', 'PrimaryMobs', 'UnprocessedSecondary'
        ]
        for name in defaults:
            if self._fetcher.exists(f'{base}/db_{name}.json'):
                exist.append({'key': name, 'file': f'db_{name}.json', 'layer': 'DataBases',
                               'DB_Label': name, 'DB_Label_EN': name})
        return exist

    # ── レコード取得系 ──────────────────────────────────────────────────────

    def get_records(
        self,
        work_id: str,
        db_name: str,
        *,
        apply_commons: bool = True,
    ) -> list[dict]:
        """
        DB のレコード一覧を取得。

        Parameters
        ----------
        work_id : str
        db_name : str
            DB 名（例: 'Primary' / 'Secondary'）
        apply_commons : bool
            ``_Commons`` 補完を適用するか（既定: True）
        """
        key = _to_work_key(work_id)
        if not key:
            raise ValueError(f'Invalid work_id: {work_id}')

        records, work_meta = _read_db_records(self._fetcher, key, db_name)
        if not self.include_private:
            records = [r for r in records if _is_public_record(r)]
        if apply_commons and work_meta:
            records = _apply_commons_to_records(records, work_meta, db_name)
        return records

    def get_record(
        self,
        work_id: str,
        db_name: str,
        idx_value: Any,
        idx_key: str = 'Num',
    ) -> Optional[dict]:
        """
        インデックス値でレコードを 1 件取得。見つからない場合は None。

        Parameters
        ----------
        idx_value : str | int
            インデックス値（例: '1', 'I', 'Wrath'）
        idx_key : str
            インデックスフィールド名（ドット記法可: 'Num', 'Card.Num'）
        """
        records = self.get_records(work_id, db_name)
        target = str(idx_value)
        for rec in records:
            v = _get_by_path(rec, idx_key)
            if v is not None and str(v) == target:
                return rec
        return None

    def search(self, work_id: str, db_name: str, query: str) -> list[dict]:
        """
        DB 内でキーワード全文検索（大小文字無視、部分一致）。

        Returns
        -------
        list[dict]
            ヒットしたレコードのリスト
        """
        records = self.get_records(work_id, db_name)
        return _search_text(records, query)

    def search_all(self, work_id: str, query: str) -> list[dict]:
        """
        作品内の全 DB を横断検索。

        Returns
        -------
        list[dict]
            各要素: ``{db: str, record: dict}``
        """
        dbs = self.list_dbs(work_id)
        results = []
        for db_info in dbs:
            try:
                hits = self.search(work_id, db_info['key'], query)
                for record in hits:
                    results.append({'db': db_info['key'], 'record': record})
            except Exception:
                pass
        return results
