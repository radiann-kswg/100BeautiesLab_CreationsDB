# CreationsDB Python モジュール
#
# 100BeautiesLab_CreationsDB をサブモジュールとして導入した
# Python 環境から DB レコードを取得・検索するためのクライアントライブラリ。
# 外部ライブラリに依存せず、標準ライブラリ (json, pathlib, os) のみで動作します。
#
# 動作要件: Python 3.9+

"""
CreationsDB Python クライアントライブラリ

Usage:
    from creationsdb import CreationsDBClient
    db = CreationsDBClient('/path/to/100BeautiesLab_CreationsDB')
    works = db.list_works()
    records = db.get_records('NumberTales', 'Primary')
"""

from .client import CreationsDBClient

__all__ = ['CreationsDBClient']
__version__ = '1.0.0'
