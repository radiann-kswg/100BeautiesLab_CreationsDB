/**
 * データ処理共通ライブラリ
 *
 * データベースの参照解決、画像パス生成、エンリッチメント処理など
 * データ操作に関する共通機能を提供します。
 * Service WorkerとフロントエンドJavaScriptの両方で利用可能です。
 *
 * @fileoverview データ処理共通機能ライブラリ
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

/**
 * 参照解決エンジンクラス
 * データベース間の参照を解決し、関連データを統合
 */
class ReferenceResolver {
  /**
   * @param {Object} dataFetcher - データ取得インスタンス (fetchJSON メソッドを持つ)
   * @param {Object} config - 設定オブジェクト (withRepoBase メソッドを持つ)
   */
  constructor(dataFetcher, config) {
    this.dataFetcher = dataFetcher;
    this.config = config;
  }

  /**
   * 任意のオブジェクト内の全ての参照を解決
   * @param {any} obj - 処理対象オブジェクト
   * @param {Map} resolveCache - 解決キャッシュ
   * @returns {Promise<any>} 参照解決後のオブジェクト
   */
  async resolveAllInAny(obj, resolveCache = new Map()) {
    if (!obj) return obj;

    if (Array.isArray(obj)) {
      const promises = obj.map(item => this.resolveAllInAny(item, resolveCache));
      return Promise.all(promises);
    }

    if (typeof obj === 'object') {
      const result = {};
      const entries = Object.entries(obj);

      for (const [key, value] of entries) {
        if (key.startsWith('#') && typeof value === 'string') {
          // 参照フィールドの解決
          try {
            const resolved = await this.resolveReference(key, value, resolveCache);
            result[key] = resolved;
          } catch (error) {
            console.warn(`参照解決失敗 ${key}=${value}:`, error.message);
            result[key] = value; // 失敗時は元の値を保持
          }
        } else {
          // 通常フィールドの再帰処理
          result[key] = await this.resolveAllInAny(value, resolveCache);
        }
      }
      return result;
    }

    return obj; // プリミティブ値はそのまま返す
  }

  /**
   * 単一の参照を解決
   * @param {string} key - 参照キー
   * @param {string} value - 参照値
   * @param {Map} resolveCache - 解決キャッシュ
   * @returns {Promise<any>} 解決された値
   */
  async resolveReference(key, value, resolveCache = new Map()) {
    const cacheKey = `${key}:${value}`;
    if (resolveCache.has(cacheKey)) {
      return resolveCache.get(cacheKey);
    }

    let resolved = value;

    try {
      if (key === '#Works') {
        resolved = await this.resolveWorksReference(value);
      } else if (key === '#DB') {
        resolved = await this.resolveDBReference(value);
      } else if (key.startsWith('#$image')) {
        resolved = await this.resolveImageReference(key, value);
      } else if (key.startsWith('#')) {
        // その他の参照タイプ（将来の拡張用）
        resolved = await this.resolveGenericReference(key, value);
      }
    } catch (error) {
      console.warn(`参照解決エラー ${cacheKey}:`, error);
      resolved = value; // エラー時は元の値を返す
    }

    resolveCache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Works参照の解決
   * @param {string} workId - 作品ID
   * @returns {Promise<Object>} 作品メタデータ
   */
  async resolveWorksReference(workId) {
    const normalizedId = this.normalizeWorkId(workId);
    const metaPath = `/data/${normalizedId.replace('#Works_', 'Works_')}/DataBases/db_meta.json`;
    return this.dataFetcher.fetchJSON(metaPath);
  }

  /**
   * DB参照の解決
   * @param {string} dbRef - データベース参照 (format: "WorkId.DBName" or "WorkId.DBName.FieldName=Value")
   * @returns {Promise<Array|Object>} データベース結果
   */
  async resolveDBReference(dbRef) {
    const parts = dbRef.split('.');
    if (parts.length < 2) throw new Error(`Invalid DB reference format: ${dbRef}`);

    const workId = this.normalizeWorkId(parts[0]);
    const dbName = parts[1];

    // データベースファイルを読み込み
    const dbPath = `/data/${workId.replace('#Works_', 'Works_')}/DataBases/db_${dbName}.json`;
    const records = await this.dataFetcher.fetchJSON(dbPath);

    if (parts.length === 2) {
      // 全レコードを返す
      return records;
    }

    // フィールド条件がある場合はフィルタリング
    const filterPart = parts.slice(2).join('.');
    const [fieldName, fieldValue] = filterPart.split('=');

    if (fieldValue) {
      return records.filter(record => {
        const value = this.getNestedValue(record, fieldName);
        return String(value) === fieldValue;
      });
    }

    return records;
  }

  /**
   * 画像参照の解決
   * @param {string} key - 画像参照キー
   * @param {string} value - 画像パス
   * @returns {Promise<string>} 解決された画像URL
   */
  async resolveImageReference(key, value) {
    // 既に完全なURLの場合はそのまま返す
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    // 相対パスを絶対パスに変換
    const fullPath = this.config.withRepoBase(value);
    return new URL(fullPath, this.config.ORIGIN || location.origin).toString();
  }

  /**
   * 汎用参照の解決（将来の拡張用）
   * @param {string} key - 参照キー
   * @param {string} value - 参照値
   * @returns {Promise<any>} 解決された値
   */
  async resolveGenericReference(key, value) {
    // 現在は未実装、将来的に特殊な参照タイプを追加予定
    return value;
  }

  /**
   * 作品IDを正規化
   * @param {string} workId - 作品ID
   * @returns {string} 正規化された作品ID
   */
  normalizeWorkId(workId) {
    if (!workId) return '';
    if (workId.startsWith('#Works_')) return workId;
    if (workId.startsWith('Works_')) return '#' + workId;
    return `#Works_${workId}`;
  }

  /**
   * ネストされたオブジェクトから値を取得
   * @param {Object} obj - 取得元オブジェクト
   * @param {string} path - パス（ドット区切り）
   * @returns {any} 取得された値
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}

/**
 * エンリッチメント処理クラス
 * データベースの構造化とインデックス生成を担当
 */
class EnrichmentProcessor {
  /**
   * @param {Object} dataFetcher - データ取得インスタンス
   * @param {Object} config - 設定オブジェクト
   */
  constructor(dataFetcher, config) {
    this.dataFetcher = dataFetcher;
    this.config = config;
    this.resolver = new ReferenceResolver(dataFetcher, config);
  }

  /**
   * エンリッチメントインデックスを構築
   * @param {Object} mergedVars - マージされた変数定義
   * @param {Object} defTypeMerged - マージされた型定義
   * @returns {Object} インデックスオブジェクト
   */
  buildEnrichmentIndices(mergedVars, defTypeMerged) {
    const indices = {
      imageFields: new Set(),
      enumFields: new Map(),
      refFields: new Set(),
      searchableFields: new Set(),
      displayFields: new Map()
    };

    // 型定義から情報を抽出
    if (defTypeMerged) {
      this.extractFromTypeDefinition(defTypeMerged, indices);
    }

    // 変数定義から情報を抽出
    if (mergedVars) {
      this.extractFromVarDefinition(mergedVars, indices);
    }

    return indices;
  }

  /**
   * 型定義から情報を抽出
   * @param {Object} typeDef - 型定義
   * @param {Object} indices - インデックスオブジェクト
   */
  extractFromTypeDefinition(typeDef, indices) {
    Object.entries(typeDef).forEach(([key, fieldDef]) => {
      if (!fieldDef || typeof fieldDef !== 'object') return;

      // 画像フィールドの検出
      if (key.includes('image') || key.includes('Image') || key.includes('$image')) {
        indices.imageFields.add(key);
      }

      // 列挙型フィールドの検出
      if (fieldDef.enum || fieldDef.values) {
        const values = fieldDef.enum || fieldDef.values;
        if (Array.isArray(values)) {
          indices.enumFields.set(key, values);
        }
      }

      // 参照フィールドの検出
      if (key.startsWith('#') || fieldDef.ref || fieldDef.reference) {
        indices.refFields.add(key);
      }

      // 検索可能フィールドの検出
      if (fieldDef.searchable !== false) {
        indices.searchableFields.add(key);
      }

      // 表示用フィールドの検出
      if (fieldDef.displayName || fieldDef.label) {
        indices.displayFields.set(key, fieldDef.displayName || fieldDef.label);
      }
    });
  }

  /**
   * 変数定義から情報を抽出
   * @param {Object} varDef - 変数定義
   * @param {Object} indices - インデックスオブジェクト
   */
  extractFromVarDefinition(varDef, indices) {
    // 変数定義固有の処理（必要に応じて実装）
    Object.entries(varDef).forEach(([key, value]) => {
      if (key.includes('image') || key.includes('Image')) {
        indices.imageFields.add(key);
      }
    });
  }
}

/**
 * 画像処理ユーティリティクラス
 * 画像パスの解決と画像ギャラリーの生成を担当
 */
class ImageProcessor {
  /**
   * @param {Object} config - 設定オブジェクト
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * レコードから画像情報を抽出して処理
   * @param {Object} record - レコードオブジェクト
   * @param {string} workId - 作品ID
   * @param {string} dbName - データベース名
   * @returns {Object} 画像処理結果
   */
  imageFromRecord(record, workId, dbName) {
    if (!record || typeof record !== 'object') {
      return { images: [], primaryImage: null };
    }

    const images = [];
    const imageFields = this.findImageFields(record);

    // 各画像フィールドを処理
    imageFields.forEach(field => {
      const value = this.getNestedValue(record, field.path);
      if (value) {
        const processedImages = this.processImageValue(value, field, workId, dbName);
        images.push(...processedImages);
      }
    });

    // 重複を除去
    const uniqueImages = this.deduplicateImages(images);

    // プライマリ画像を決定
    const primaryImage = this.selectPrimaryImage(uniqueImages, record);

    return {
      images: uniqueImages,
      primaryImage: primaryImage,
      count: uniqueImages.length
    };
  }

  /**
   * レコード内の画像フィールドを発見
   * @param {Object} record - レコードオブジェクト
   * @returns {Array} 画像フィールド情報の配列
   */
  findImageFields(record) {
    const imageFields = [];

    const findInObject = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;

      Object.entries(obj).forEach(([key, value]) => {
        const currentPath = path ? `${path}.${key}` : key;

        // 画像フィールドの判定
        if (this.isImageField(key, value)) {
          imageFields.push({
            path: currentPath,
            key: key,
            type: this.getImageFieldType(key)
          });
        }

        // 再帰的に探索
        if (typeof value === 'object' && !Array.isArray(value)) {
          findInObject(value, currentPath);
        }
      });
    };

    findInObject(record);
    return imageFields;
  }

  /**
   * 画像フィールドかどうかを判定
   * @param {string} key - フィールドキー
   * @param {any} value - フィールド値
   * @returns {boolean} 画像フィールドの場合はtrue
   */
  isImageField(key, value) {
    const imageKeywords = [
      'image', 'Image', 'img', 'Img',
      'picture', 'Picture', 'pic', 'Pic',
      'photo', 'Photo', 'avatar', 'Avatar',
      'icon', 'Icon', 'thumbnail', 'Thumbnail'
    ];

    const hasImageKeyword = imageKeywords.some(keyword => key.includes(keyword));
    const hasImageValue = typeof value === 'string' && this.looksLikeImagePath(value);

    return hasImageKeyword || hasImageValue;
  }

  /**
   * 文字列が画像パスに見えるかチェック
   * @param {string} value - チェック対象の値
   * @returns {boolean} 画像パスらしい場合はtrue
   */
  looksLikeImagePath(value) {
    if (typeof value !== 'string') return false;

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    const lowerValue = value.toLowerCase();

    return imageExtensions.some(ext => lowerValue.endsWith(ext)) ||
           lowerValue.includes('/images/') ||
           lowerValue.includes('\\images\\');
  }

  /**
   * 画像フィールドのタイプを取得
   * @param {string} key - フィールドキー
   * @returns {string} 画像タイプ
   */
  getImageFieldType(key) {
    const lowerKey = key.toLowerCase();

    if (lowerKey.includes('avatar') || lowerKey.includes('profile')) return 'avatar';
    if (lowerKey.includes('icon')) return 'icon';
    if (lowerKey.includes('thumbnail') || lowerKey.includes('thumb')) return 'thumbnail';
    if (lowerKey.includes('concept')) return 'concept';
    if (lowerKey.includes('design')) return 'design';
    if (lowerKey.includes('art')) return 'artwork';

    return 'general';
  }

  /**
   * 画像値を処理してURL配列に変換
   * @param {any} value - 画像値
   * @param {Object} field - フィールド情報
   * @param {string} workId - 作品ID
   * @param {string} dbName - データベース名
   * @returns {Array} 処理された画像情報の配列
   */
  processImageValue(value, field, workId, dbName) {
    const images = [];

    if (typeof value === 'string') {
      const url = this.resolveImagePath(value, workId, dbName);
      if (url) {
        images.push({
          url: url,
          type: field.type,
          field: field.key,
          path: field.path,
          original: value
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'string') {
          const url = this.resolveImagePath(item, workId, dbName);
          if (url) {
            images.push({
              url: url,
              type: field.type,
              field: field.key,
              path: `${field.path}[${index}]`,
              original: item
            });
          }
        }
      });
    }

    return images;
  }

  /**
   * 画像パスを絶対URLに解決
   * @param {string} imagePath - 画像パス
   * @param {string} workId - 作品ID
   * @param {string} dbName - データベース名
   * @returns {string|null} 解決されたURL
   */
  resolveImagePath(imagePath, workId, dbName) {
    if (!imagePath || typeof imagePath !== 'string') return null;

    // 既に完全なURLの場合
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }

    // 絶対パスの場合
    if (imagePath.startsWith('/')) {
      return this.config.withRepoBase(imagePath);
    }

    // 相対パスの場合、作品とDBに基づいて解決
    const workPath = workId.replace('#Works_', 'Works_');
    const dbPath = this.mapDbNameToImageDir(dbName);
    const basePath = `/data/${workPath}/Images/${dbPath}/${imagePath}`;

    return this.config.withRepoBase(basePath);
  }

  /**
   * データベース名を画像ディレクトリにマップ
   * @param {string} dbName - データベース名
   * @returns {string} 画像ディレクトリ名
   */
  mapDbNameToImageDir(dbName) {
    const mapping = {
      'Primary': 'Primary',
      'Secondary': 'Secondary',
      'SemiPrimary': 'SemiPrimary',
      'SelfSecondary': 'SelfSecondary',
      'Proxy': 'Proxy',
      'Mobs': 'General'
    };

    return mapping[dbName] || 'General';
  }

  /**
   * 重複する画像を除去
   * @param {Array} images - 画像配列
   * @returns {Array} 重複除去後の画像配列
   */
  deduplicateImages(images) {
    const seen = new Set();
    return images.filter(image => {
      if (seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    });
  }

  /**
   * プライマリ画像を選択
   * @param {Array} images - 画像配列
   * @param {Object} record - レコードオブジェクト
   * @returns {Object|null} プライマリ画像
   */
  selectPrimaryImage(images, record) {
    if (images.length === 0) return null;

    // 優先順位: avatar > icon > concept > design > artwork > thumbnail > general
    const typePriority = ['avatar', 'icon', 'concept', 'design', 'artwork', 'thumbnail', 'general'];

    for (const type of typePriority) {
      const found = images.find(img => img.type === type);
      if (found) return found;
    }

    return images[0]; // フォールバック
  }

  /**
   * ネストされたオブジェクトから値を取得
   * @param {Object} obj - 取得元オブジェクト
   * @param {string} path - パス（ドット区切り）
   * @returns {any} 取得された値
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}

/**
 * データ正規化ユーティリティクラス
 * データの型変換、検証、正規化を担当
 */
class DataNormalizer {
  /**
   * レコードデータを正規化
   * @param {Array} records - 正規化対象レコード配列
   * @param {Object} typeDefinition - 型定義
   * @returns {Array} 正規化後のレコード配列
   */
  static normalizeRecords(records, typeDefinition) {
    if (!Array.isArray(records)) return [];

    return records.map(record => this.normalizeRecord(record, typeDefinition));
  }

  /**
   * 単一レコードを正規化
   * @param {Object} record - 正規化対象レコード
   * @param {Object} typeDefinition - 型定義
   * @returns {Object} 正規化後のレコード
   */
  static normalizeRecord(record, typeDefinition) {
    if (!record || typeof record !== 'object') return record;

    const normalized = { ...record };

    if (typeDefinition) {
      Object.entries(typeDefinition).forEach(([field, fieldDef]) => {
        if (normalized[field] !== undefined) {
          normalized[field] = this.normalizeField(normalized[field], fieldDef);
        }
      });
    }

    return normalized;
  }

  /**
   * フィールド値を正規化
   * @param {any} value - 正規化対象値
   * @param {Object} fieldDef - フィールド定義
   * @returns {any} 正規化後の値
   */
  static normalizeField(value, fieldDef) {
    if (value == null) return value;

    const type = fieldDef?.type || 'string';

    switch (type) {
      case 'number':
        return this.toNumber(value);
      case 'boolean':
        return this.toBoolean(value);
      case 'array':
        return this.toArray(value);
      case 'string':
        return this.toString(value);
      case 'date':
        return this.toDate(value);
      default:
        return value;
    }
  }

  /**
   * 数値に変換
   * @param {any} value - 変換対象値
   * @returns {number|null} 数値またはnull
   */
  static toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  /**
   * 真偽値に変換
   * @param {any} value - 変換対象値
   * @returns {boolean} 真偽値
   */
  static toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
    }
    if (typeof value === 'number') return value !== 0;
    return Boolean(value);
  }

  /**
   * 配列に変換
   * @param {any} value - 変換対象値
   * @returns {Array} 配列
   */
  static toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  /**
   * 文字列に変換
   * @param {any} value - 変換対象値
   * @returns {string} 文字列
   */
  static toString(value) {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    return String(value);
  }

  /**
   * 日付に変換
   * @param {any} value - 変換対象値
   * @returns {Date|null} 日付オブジェクトまたはnull
   */
  static toDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }
}

// 環境に応じたエクスポート
if (typeof self !== 'undefined') {
  // Service Worker環境
  self.ReferenceResolver = ReferenceResolver;
  self.EnrichmentProcessor = EnrichmentProcessor;
  self.ImageProcessor = ImageProcessor;
  self.DataNormalizer = DataNormalizer;
} else if (typeof window !== 'undefined') {
  // ブラウザ環境
  window.ReferenceResolver = ReferenceResolver;
  window.EnrichmentProcessor = EnrichmentProcessor;
  window.ImageProcessor = ImageProcessor;
  window.DataNormalizer = DataNormalizer;
}

console.log('💾 データ処理共通ライブラリがロードされました');