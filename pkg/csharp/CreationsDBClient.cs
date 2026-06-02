using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

// JSON ライブラリの選択:
//   Unity    → Newtonsoft.Json (com.unity.nuget.newtonsoft-json) を推奨
//   .NET 5+  → System.Text.Json (標準添付) で代替可能
// ここでは Newtonsoft.Json を標準として実装します。
// System.Text.Json を使う場合は #define USE_SYSTEM_TEXT_JSON を有効化してください。
#if USE_SYSTEM_TEXT_JSON
using System.Text.Json;
using System.Text.Json.Nodes;
using JsonObject = System.Text.Json.Nodes.JsonObject;
#else
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
#endif

namespace CreationsDB
{
    // ─────────────────────────────────────────────────────────────────────────
    // 型エイリアス（JSON オブジェクト / 配列の抽象化）
    // ─────────────────────────────────────────────────────────────────────────

#if USE_SYSTEM_TEXT_JSON
    using JObj  = System.Text.Json.Nodes.JsonObject;
    using JArr  = System.Text.Json.Nodes.JsonArray;
    using JNode = System.Text.Json.Nodes.JsonNode;
#else
    using JObj  = Newtonsoft.Json.Linq.JObject;
    using JArr  = Newtonsoft.Json.Linq.JArray;
    using JNode = Newtonsoft.Json.Linq.JToken;
#endif

    // ─────────────────────────────────────────────────────────────────────────
    // 公開データ型
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>作品の概要情報</summary>
    public sealed class WorkInfo
    {
        public string Key        { get; set; } = "";
        public string Title      { get; set; } = "";
        public string TitleEN    { get; set; } = "";
        public string Summary    { get; set; } = "";
        public IReadOnlyList<string> OldTitles { get; set; } = Array.Empty<string>();
    }

    /// <summary>DB の概要情報</summary>
    public sealed class DbInfo
    {
        public string Key      { get; set; } = "";
        public string File     { get; set; } = "";
        public string Layer    { get; set; } = "DataBases";
        public string Label    { get; set; } = "";
        public string LabelEN  { get; set; } = "";
    }

    /// <summary>横断検索の結果 1 件</summary>
    public sealed class SearchResult
    {
        public string DbName   { get; set; } = "";
        public JObj   Record   { get; set; } = new JObj();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 内部ユーティリティ
    // ─────────────────────────────────────────────────────────────────────────

    internal static class Utils
    {
        private static readonly Regex SafeToken     = new Regex(@"^[A-Za-z0-9_]+$", RegexOptions.Compiled);
        private static readonly Regex ValidJsonFile = new Regex(@"^[A-Za-z0-9_.\-]+\.json$", RegexOptions.Compiled);

        /// <summary>英数字とアンダースコアのみ許可するトークン検証</summary>
        public static bool IsSafeToken(string? s)
            => !string.IsNullOrEmpty(s) && SafeToken.IsMatch(s);

        /// <summary>DB ファイル名として安全か検証</summary>
        public static bool IsValidJsonFile(string? s)
            => !string.IsNullOrEmpty(s) && ValidJsonFile.IsMatch(s);

        /// <summary>先頭文字を大文字化</summary>
        public static string Capitalize(string? s)
            => string.IsNullOrEmpty(s) ? s ?? "" : char.ToUpperInvariant(s[0]) + s.Substring(1);

        /// <summary>
        /// 作品 ID を '#Works_&lt;Name&gt;' 形式に正規化。
        /// 'NumberTales' / 'Works_NumberTales' / '#Works_NumberTales' いずれも受け付ける。
        /// </summary>
        public static string? ToWorkKey(string? workId)
        {
            if (string.IsNullOrWhiteSpace(workId)) return null;
            var raw = workId.Trim();
            string normalized;
            if (raw.StartsWith("#Works_"))       normalized = raw;
            else if (raw.StartsWith("Works_"))   normalized = $"#{raw}";
            else                                 normalized = $"#Works_{raw}";
            var m = Regex.Match(normalized, @"^#Works_([A-Za-z0-9_]+)$");
            return m.Success ? $"#Works_{m.Groups[1].Value}" : null;
        }

        /// <summary>'#Works_XXX' → 'Works_XXX'</summary>
        public static string ResolveWorkDir(string workId)
            => (workId ?? "").Replace("#Works_", "Works_");

        /// <summary>'#DB_Primary' / 'Primary' → 'Primary'</summary>
        public static string StripMetaDbPrefix(string? dbName)
        {
            var s = (dbName ?? "").Trim();
            s = Regex.Replace(s, @"^#?(DB|Ref)_", "", RegexOptions.IgnoreCase);
            return s.TrimStart('#');
        }

        /// <summary>'Primary' → '#DB_Primary'</summary>
        public static string NormalizeDbKeyForMeta(string dbName)
            => $"#DB_{Capitalize(StripMetaDbPrefix(dbName))}";

        /// <summary>
        /// databases オブジェクトから DB エントリを検索。
        /// 戻り値: (metaKey, entry)
        /// </summary>
        public static (string? MetaKey, JObj? Entry) FindMetaDbEntry(JObj? databases, string dbName)
        {
            if (databases == null) return (null, null);
            var norm = Capitalize(StripMetaDbPrefix(dbName));
            foreach (var prefix in new[] { $"#DB_{norm}", $"#Ref_{norm}" })
            {
                var entry = TryGetObject(databases, prefix);
                if (entry != null) return (prefix, entry);
            }
            return ($"#DB_{norm}", null);
        }

        /// <summary>isPrivate フラグによる非公開判定</summary>
        public static bool IsPublicRecord(JObj? record)
        {
            if (record == null) return true;
            var v = record["isPrivate"];
            if (v == null) return true;
#if USE_SYSTEM_TEXT_JSON
            if (v is System.Text.Json.Nodes.JsonValue jv)
            {
                if (jv.TryGetValue<bool>(out var b)) return !b;
                if (jv.TryGetValue<string>(out var s)) return s.Trim().ToLowerInvariant() != "true";
            }
#else
            if (v.Type == JTokenType.Boolean) return !(bool)v;
            if (v.Type == JTokenType.String) return ((string)v!).Trim().ToLowerInvariant() != "true";
#endif
            return true;
        }

        /// <summary>_Commons 適用時の空値判定（hideText は空扱いしない）</summary>
        public static bool IsEmptyForCommons(JNode? v)
        {
            if (v == null) return true;
#if USE_SYSTEM_TEXT_JSON
            if (v is System.Text.Json.Nodes.JsonValue jval)
            {
                if (jval.TryGetValue<string>(out var s)) return s == "";
                return false;
            }
            if (v is JArr arr) return arr.Count == 0;
            if (v is JObj obj)
            {
                if (obj["hideText"] != null) return false;
                return obj.Count == 0;
            }
#else
            if (v.Type == JTokenType.Null) return true;
            if (v.Type == JTokenType.String) return ((string)v!) == "";
            if (v.Type == JTokenType.Array) return !((JArr)v).HasValues;
            if (v.Type == JTokenType.Object)
            {
                var obj = (JObj)v;
                if (obj["hideText"] != null) return false;
                return !obj.HasValues;
            }
#endif
            return false;
        }

        /// <summary>ドット区切りパスでネストされた値を取得</summary>
        public static JNode? GetByPath(JObj? obj, string path)
        {
            JNode? cur = obj;
            foreach (var part in path.Split('.'))
            {
                if (cur is not JObj o) return null;
#if USE_SYSTEM_TEXT_JSON
                cur = o[part];
#else
                cur = o[part];
#endif
            }
            return cur;
        }

        /// <summary>JSON オブジェクトから文字列値を安全に取得（null 許容）</summary>
        public static string? GetString(JObj? obj, string key)
        {
            if (obj == null) return null;
            var v = obj[key];
            if (v == null) return null;
#if USE_SYSTEM_TEXT_JSON
            return v is System.Text.Json.Nodes.JsonValue jv && jv.TryGetValue<string>(out var s) ? s : v.ToString();
#else
            return v.Type == JTokenType.String ? (string?)v : v.ToString();
#endif
        }

        /// <summary>JSON オブジェクト型ノードを安全に取得</summary>
        public static JObj? TryGetObject(JObj? obj, string key)
        {
            if (obj == null) return null;
            var v = obj[key];
#if USE_SYSTEM_TEXT_JSON
            return v as JObj;
#else
            return v as JObj;
#endif
        }

        /// <summary>JSON 配列型ノードを安全に取得</summary>
        public static JArr? TryGetArray(JObj? obj, string key)
        {
            if (obj == null) return null;
            var v = obj[key];
#if USE_SYSTEM_TEXT_JSON
            return v as JArr;
#else
            return v as JArr;
#endif
        }

        /// <summary>JSON をパース（失敗時は null）</summary>
        public static JObj? ParseObjectOrNull(string json)
        {
            try
            {
#if USE_SYSTEM_TEXT_JSON
                return JsonNode.Parse(json) as JObj;
#else
                return JObject.Parse(json);
#endif
            }
            catch { return null; }
        }

        /// <summary>JSON 配列をパース（失敗時は null）</summary>
        public static JArr? ParseArrayOrNull(string json)
        {
            try
            {
#if USE_SYSTEM_TEXT_JSON
                return JsonNode.Parse(json) as JArr;
#else
                return JArray.Parse(json);
#endif
            }
            catch { return null; }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ファイルシステム I/O
    // ─────────────────────────────────────────────────────────────────────────

    internal sealed class FsFetcher
    {
        private readonly string _repoRoot;

        /// <param name="repoRoot">サブモジュールのルートディレクトリ絶対パス</param>
        public FsFetcher(string repoRoot)
        {
            _repoRoot = Path.GetFullPath(repoRoot);
        }

        private string Resolve(string path)
            => Path.Combine(_repoRoot, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));

        /// <summary>ファイル存在確認</summary>
        public bool Exists(string path) => File.Exists(Resolve(path));

        /// <summary>JSON ファイルを読み込んでオブジェクトとして返す（失敗時は null）</summary>
        public async Task<JObj?> ReadObjectAsync(string path)
        {
            try
            {
                var text = await File.ReadAllTextAsync(Resolve(path));
                return Utils.ParseObjectOrNull(text);
            }
            catch { return null; }
        }

        /// <summary>JSON ファイルを読み込んで配列として返す（失敗時は null）</summary>
        public async Task<JArr?> ReadArrayAsync(string path)
        {
            try
            {
                var text = await File.ReadAllTextAsync(Resolve(path));
                return Utils.ParseArrayOrNull(text);
            }
            catch { return null; }
        }

        /// <summary>JSON ファイルを読み込んでオブジェクトとして返す（失敗時は例外）</summary>
        public async Task<JObj> RequireObjectAsync(string path)
        {
            var text = await File.ReadAllTextAsync(Resolve(path));
            return Utils.ParseObjectOrNull(text)
                   ?? throw new InvalidDataException($"JSON parse failed: {path}");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // メタ読み込みヘルパー
    // ─────────────────────────────────────────────────────────────────────────

    internal static class MetaReader
    {
        /// <summary>辞書バンドルを読み込み、VarsDef へ展開して返す</summary>
        internal static async Task<(JObj Meta, Dictionary<string, JNode> Vars)> ReadDictionaryBundleAsync(
            FsFetcher fetcher, string basePath)
        {
            var meta = await fetcher.ReadObjectAsync($"{basePath}/db_meta.json") ?? new JObj();
            var typeData = await fetcher.ReadObjectAsync($"{basePath}/db_type.json");
            var vars = new Dictionary<string, JNode>();

            // db_type.json の $VarsDef を先に追加
            var typeVarsDef = Utils.TryGetObject(typeData, "$VarsDef");
            if (typeVarsDef != null)
            {
                foreach (var p in typeVarsDef)
                    vars[p.Key] = p.Value ?? new JObj();
            }

            var catalogs = Utils.TryGetObject(meta, "Dictionaries");
            if (catalogs == null) return (meta, vars);

            foreach (var kv in catalogs)
            {
                var rawKey = kv.Key;
                if (kv.Value is not JObj info) continue;
                var dictName = rawKey.Replace("#Dict_", "").Trim();
                if (string.IsNullOrEmpty(dictName)) continue;

                var dictKey = rawKey.StartsWith("#Dict_") ? rawKey : $"#Dict_{dictName}";
                var compatKeyRaw = Utils.GetString(info, "compatListKey");
                var compatKey = !string.IsNullOrWhiteSpace(compatKeyRaw)
                    ? compatKeyRaw! : $"#List_{dictName}";

                var rows = await fetcher.ReadArrayAsync($"{basePath}/dict_{dictName}.json");
                if (rows == null) continue;

                vars[dictKey] = rows;
                if (!vars.ContainsKey(compatKey)) vars[compatKey] = rows;
            }

            return (meta, vars);
        }

        /// <summary>vars を meta.General.$VarsDef へ合流したオブジェクトを返す</summary>
        internal static JObj MergeMetaWithVars(JObj meta, Dictionary<string, JNode> vars, JObj dictMeta)
        {
#if USE_SYSTEM_TEXT_JSON
            var result = (JObj)meta.DeepClone();
#else
            var result = (JObj)meta.DeepClone();
#endif
            var general = Utils.TryGetObject(result, "General") ?? new JObj();
            var metaVars = Utils.TryGetObject(general, "$VarsDef") ?? new JObj();

            foreach (var kv in vars)
            {
#if USE_SYSTEM_TEXT_JSON
                metaVars[kv.Key] = kv.Value?.DeepClone();
#else
                metaVars[kv.Key] = kv.Value?.DeepClone();
#endif
            }

            general["$VarsDef"] = metaVars;
            result["General"] = general;

            // Dictionaries も合流
            var extraDicts = Utils.TryGetObject(dictMeta, "Dictionaries");
            if (extraDicts != null)
            {
                var baseDicts = Utils.TryGetObject(result, "Dictionaries") ?? new JObj();
                foreach (var kv in extraDicts) baseDicts[kv.Key] = kv.Value?.DeepClone();
                result["Dictionaries"] = baseDicts;
            }

            return result;
        }

        /// <summary>グローバルメタ (data/db_meta.json + Dictionaries) を読み込む</summary>
        public static async Task<JObj> ReadGlobalMetaAsync(FsFetcher fetcher)
        {
            var meta = await fetcher.RequireObjectAsync("/data/db_meta.json");
            var (dictMeta, vars) = await ReadDictionaryBundleAsync(fetcher, "/data/Dictionaries");
            return MergeMetaWithVars(meta, vars, dictMeta);
        }

        /// <summary>作品別メタ (data/Works_X/DataBases/db_meta.json + Dictionaries) を読み込む</summary>
        public static async Task<JObj?> ReadWorkMetaAsync(FsFetcher fetcher, string workId)
        {
            var workDir = Utils.ResolveWorkDir(workId);
            var meta = await fetcher.ReadObjectAsync($"/data/{workDir}/DataBases/db_meta.json");
            if (meta == null) return null;
            var (dictMeta, vars) = await ReadDictionaryBundleAsync(fetcher, $"/data/{workDir}/Dictionaries");
            return MergeMetaWithVars(meta, vars, dictMeta);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // _Commons 適用
    // ─────────────────────────────────────────────────────────────────────────

    internal static class CommonsApplier
    {
        /// <summary>
        /// _Commons をレコード配列に非破壊適用（シャローコピー後に設定値を穴埋め）。
        /// sw-common.js CommonsProcessor.applyCommonsToRecords の C# 移植版（基本部分）。
        /// </summary>
        public static IEnumerable<JObj> Apply(IEnumerable<JObj> records, JObj? workMeta, string dbName)
        {
            var dbKey = Utils.NormalizeDbKeyForMeta(dbName);
            var databases = Utils.TryGetObject(workMeta, "Databases");
            var dbInfo = Utils.TryGetObject(databases, dbKey);
            var commons = Utils.TryGetObject(dbInfo, "_Commons");
            var secDefs = Utils.TryGetArray(dbInfo, "_Secondaries")
                          ?? Utils.TryGetArray(dbInfo, "Secondaries");

            if (commons == null && secDefs == null) return records;

            static Dictionary<string, JNode?> BuildDefaults(JObj? cmn)
            {
                var d = new Dictionary<string, JNode?>();
                if (cmn == null) return d;
                foreach (var kv in cmn)
                    if (!kv.Key.StartsWith("_") && !kv.Key.StartsWith("#"))
                        d[kv.Key] = kv.Value;
                return d;
            }

            Dictionary<string, JNode?> FindSecDefaults(JObj rec)
            {
                if (secDefs == null) return new Dictionary<string, JNode?>();
                Dictionary<string, JNode?>? fallback = null;
                foreach (var item in secDefs)
                {
                    if (item is not JObj def) continue;
                    var defCmn = Utils.TryGetObject(def, "_Commons");
                    if (defCmn == null) continue;
                    var defTitle = Utils.GetString(def, "sec_SeriesTitle")
                                   ?? Utils.GetString(def, "SecondarySeriesTitle");
                    if (string.IsNullOrEmpty(defTitle)) { fallback ??= BuildDefaults(defCmn); continue; }
                    var recTitle = Utils.GetString(rec, "sec_SeriesTitle")
                                   ?? Utils.GetString(rec, "SecondarySeriesTitle");
                    if (recTitle == defTitle) return BuildDefaults(defCmn);
                }
                return fallback ?? new Dictionary<string, JNode?>();
            }

            var result = new List<JObj>();
            foreach (var rec in records)
            {
#if USE_SYSTEM_TEXT_JSON
                var copy = (JObj)rec.DeepClone();
#else
                var copy = (JObj)rec.DeepClone();
#endif
                var defaults = new Dictionary<string, JNode?>(BuildDefaults(commons));
                foreach (var kv in FindSecDefaults(rec)) defaults[kv.Key] = kv.Value;

                foreach (var kv in defaults)
                {
                    if (kv.Key.StartsWith("#")) continue;
                    var existing = copy[kv.Key];
                    if (existing == null || Utils.IsEmptyForCommons(existing))
                        copy[kv.Key] = kv.Value?.DeepClone();
                }
                result.Add(copy);
            }
            return result;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DB ファイル解決
    // ─────────────────────────────────────────────────────────────────────────

    internal static class DbResolver
    {
        private static readonly Dictionary<string, string> Conventional = new()
        {
            { "Primary",         "db_Primary.json" },
            { "Secondary",       "db_Secondary.json" },
            { "SemiPrimary",     "db_SemiPrimary.json" },
            { "SelfSecondary",   "db_SelfSecondary.json" },
            { "Proxy",           "db_Proxy.json" },
            { "Mobs",            "db_Mobs.json" },
        };

        /// <summary>DB レコード配列を読み込む</summary>
        public static async Task<(JArr Records, JObj? WorkMeta)> ReadAsync(
            FsFetcher fetcher, string workId, string dbName)
        {
            var norm = Utils.StripMetaDbPrefix(dbName);
            if (!Utils.IsSafeToken(norm))
                throw new ArgumentException($"Invalid dbName: {dbName}");
            var key = Utils.Capitalize(norm);

            var workMeta = await MetaReader.ReadWorkMetaAsync(fetcher, workId);
            var databases = Utils.TryGetObject(workMeta, "Databases");
            var (metaKey, dbEntry) = Utils.FindMetaDbEntry(databases, key);
            dbEntry ??= new JObj();

            var layerRaw = (Utils.GetString(dbEntry, "DB_Layer") ?? "").Trim();
            var layer = Utils.IsSafeToken(layerRaw) ? layerRaw : "DataBases";
            var fileRaw = (Utils.GetString(dbEntry, "DB_File") ?? "").Trim();
            var configuredFile = Utils.IsValidJsonFile(fileRaw) ? fileRaw : "";
            var defaultPrefix = (metaKey ?? "").StartsWith("#Ref_") ? "ref_" : "db_";
            var workDir = Utils.ResolveWorkDir(workId);
            var basePath = $"/data/{workDir}/{layer}";

            var candidates = new List<string>();
            if (!string.IsNullOrEmpty(configuredFile)) candidates.Add(configuredFile);
            if (Conventional.TryGetValue(key, out var conv)) candidates.Add(conv);
            candidates.Add($"{defaultPrefix}{key}.json");
            if (!string.Equals(key, norm, StringComparison.OrdinalIgnoreCase))
                candidates.Add($"{defaultPrefix}{norm}.json");
            if (defaultPrefix != "db_") candidates.Add($"db_{key}.json");

            foreach (var fname in candidates)
            {
                if (fetcher.Exists($"{basePath}/{fname}"))
                {
                    var arr = await fetcher.ReadArrayAsync($"{basePath}/{fname}") ?? new JArr();
                    return (arr, workMeta);
                }
            }
            throw new FileNotFoundException($"DB file not found: workId={workId}, dbName={dbName}");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 公開 API クラス
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// CreationsDB C# クライアント。
    ///
    /// サブモジュールとして導入した 100BeautiesLab_CreationsDB リポジトリの
    /// データを C# (Unity / .NET) 環境から直接取得します。
    /// </summary>
    /// <example>
    /// <code>
    /// var db = new CreationsDBClient("/path/to/100BeautiesLab_CreationsDB");
    /// var works = await db.ListWorksAsync();
    /// var records = await db.GetRecordsAsync("NumberTales", "Primary");
    /// </code>
    /// </example>
    public sealed class CreationsDBClient
    {
        private readonly FsFetcher _fetcher;

        /// <summary>isPrivate: true のレコードを含めるか（既定: false）</summary>
        public bool IncludePrivate { get; set; } = false;

        /// <summary>
        /// コンストラクター。
        /// </summary>
        /// <param name="repoRoot">サブモジュールのルートディレクトリ絶対パス</param>
        public CreationsDBClient(string repoRoot)
        {
            _fetcher = new FsFetcher(repoRoot);
        }

        // ── メタデータ系 ─────────────────────────────────────────────────────

        /// <summary>グローバルメタデータを取得（data/db_meta.json + Dictionaries 合流済み）</summary>
        public Task<JObj> GetMetaAsync()
            => MetaReader.ReadGlobalMetaAsync(_fetcher);

        /// <summary>
        /// 作品一覧を取得。Works_Hidden: true の作品は除外される。
        /// </summary>
        public async Task<IReadOnlyList<WorkInfo>> ListWorksAsync()
        {
            var globalMeta = await MetaReader.ReadGlobalMetaAsync(_fetcher);
            var creationWorks = Utils.TryGetObject(globalMeta, "CreationWorks");
            if (creationWorks == null) return Array.Empty<WorkInfo>();

            var result = new List<WorkInfo>();
            foreach (var kv in creationWorks)
            {
                if (kv.Value is not JObj info) continue;
                if (Utils.GetString(info, "Works_Hidden") == "true" ||
                    info["Works_Hidden"]?.ToString() == "True") continue;
                var oldTitles = Utils.TryGetArray(info, "OldTitles");
                result.Add(new WorkInfo
                {
                    Key        = kv.Key,
                    Title      = Utils.GetString(info, "Title")         ?? "",
                    TitleEN    = Utils.GetString(info, "Title_EN")      ?? "",
                    Summary    = Utils.GetString(info, "Works_Summary") ?? "",
                    OldTitles  = oldTitles?.Select(t => t?.ToString() ?? "").ToArray()
                                 ?? Array.Empty<string>()
                });
            }
            return result;
        }

        /// <summary>作品別メタデータを取得</summary>
        /// <param name="workId">作品ID（'NumberTales' / 'Works_NumberTales' / '#Works_NumberTales' 可）</param>
        public async Task<JObj?> GetWorkMetaAsync(string workId)
        {
            var key = Utils.ToWorkKey(workId)
                      ?? throw new ArgumentException($"Invalid workId: {workId}");
            return await MetaReader.ReadWorkMetaAsync(_fetcher, key);
        }

        /// <summary>
        /// 指定作品で利用可能な DB 一覧を取得。DB_Hidden: true は除外される。
        /// </summary>
        public async Task<IReadOnlyList<DbInfo>> ListDbsAsync(string workId)
        {
            var key = Utils.ToWorkKey(workId)
                      ?? throw new ArgumentException($"Invalid workId: {workId}");

            var result = new List<DbInfo>();
            var workMeta = await MetaReader.ReadWorkMetaAsync(_fetcher, key);
            var databases = Utils.TryGetObject(workMeta, "Databases");

            if (databases != null)
            {
                foreach (var kv in databases)
                {
                    if (kv.Value is not JObj dbEntry) continue;
                    if (dbEntry["DB_Hidden"]?.ToString() is "true" or "True") continue;
                    var norm = Utils.StripMetaDbPrefix(kv.Key);
                    var name = Utils.Capitalize(norm);
                    var layerRaw = (Utils.GetString(dbEntry, "DB_Layer") ?? "").Trim();
                    var layer = Utils.IsSafeToken(layerRaw) ? layerRaw : "DataBases";
                    var prefix = kv.Key.StartsWith("#Ref_") ? "ref_" : "db_";
                    var basePath = $"/data/{Utils.ResolveWorkDir(key)}/{layer}";
                    var fileRaw = (Utils.GetString(dbEntry, "DB_File") ?? "").Trim();
                    var cfgFile = Utils.IsValidJsonFile(fileRaw) ? fileRaw : "";
                    var candidates = new[] { cfgFile, $"{prefix}{name}.json", $"db_{name}.json" }
                                     .Where(f => !string.IsNullOrEmpty(f));
                    foreach (var fname in candidates)
                    {
                        if (_fetcher.Exists($"{basePath}/{fname}"))
                        {
                            result.Add(new DbInfo
                            {
                                Key     = name,
                                File    = fname,
                                Layer   = layer,
                                Label   = Utils.GetString(dbEntry, "DB_Label")    ?? name,
                                LabelEN = Utils.GetString(dbEntry, "DB_Label_EN") ?? name,
                            });
                            break;
                        }
                    }
                }
                if (result.Count > 0) return result;
            }

            // メタ未整備の作品はデフォルトファイル名を探索
            var fallbackBase = $"/data/{Utils.ResolveWorkDir(key)}/DataBases";
            foreach (var name in new[] { "Primary", "Secondary", "SemiPrimary", "SelfSecondary",
                                          "Proxy", "Mobs", "PrimaryDealer", "PrimaryMobs" })
            {
                if (_fetcher.Exists($"{fallbackBase}/db_{name}.json"))
                    result.Add(new DbInfo { Key = name, File = $"db_{name}.json",
                                            Layer = "DataBases", Label = name, LabelEN = name });
            }
            return result;
        }

        // ── レコード取得系 ──────────────────────────────────────────────────

        /// <summary>
        /// DB のレコード一覧を取得（_Commons 補完・非公開除外）。
        /// </summary>
        /// <param name="workId">作品ID</param>
        /// <param name="dbName">DB 名（例: "Primary" / "Secondary"）</param>
        /// <param name="applyCommons">_Commons 補完を適用するか（既定: true）</param>
        public async Task<IReadOnlyList<JObj>> GetRecordsAsync(
            string workId, string dbName, bool applyCommons = true)
        {
            var key = Utils.ToWorkKey(workId)
                      ?? throw new ArgumentException($"Invalid workId: {workId}");

            var (arr, workMeta) = await DbResolver.ReadAsync(_fetcher, key, dbName);
            var records = arr.OfType<JObj>();

            if (!IncludePrivate) records = records.Where(Utils.IsPublicRecord);

            IEnumerable<JObj> result = records;
            if (applyCommons) result = CommonsApplier.Apply(result, workMeta, dbName);
            return result.ToList().AsReadOnly();
        }

        /// <summary>
        /// インデックス値でレコードを 1 件取得。見つからない場合は null。
        /// </summary>
        /// <param name="idxValue">インデックス値（例: "1", "I", "Wrath"）</param>
        /// <param name="idxKey">インデックスフィールド名（ドット記法可: "Num", "Card.Num"）</param>
        public async Task<JObj?> GetRecordAsync(
            string workId, string dbName, string idxValue, string idxKey = "Num")
        {
            var records = await GetRecordsAsync(workId, dbName);
            var target = idxValue;
            return records.FirstOrDefault(rec =>
            {
                var v = Utils.GetByPath(rec, idxKey);
                return v?.ToString() == target;
            });
        }

        /// <summary>
        /// DB 内でキーワード全文検索（大小文字無視、部分一致）。
        /// searchableText フィールドまたは JSON 全体を対象にする。
        /// </summary>
        public async Task<IReadOnlyList<JObj>> SearchAsync(
            string workId, string dbName, string query)
        {
            var records = await GetRecordsAsync(workId, dbName);
            if (string.IsNullOrEmpty(query)) return records;

            var q = query.ToLowerInvariant();
            return records.Where(rec =>
            {
                var enrichment = rec["_enrichment"] as JObj;
                var searchableText = Utils.GetString(enrichment, "searchableText");
                var text = searchableText
                           ?? rec.ToString(
#if !USE_SYSTEM_TEXT_JSON
                               Formatting.None
#endif
                           );
                return text.ToLowerInvariant().Contains(q);
            }).ToList().AsReadOnly();
        }

        /// <summary>
        /// 作品内の全 DB を横断検索。
        /// </summary>
        /// <returns>各要素: <see cref="SearchResult"/></returns>
        public async Task<IReadOnlyList<SearchResult>> SearchAllAsync(string workId, string query)
        {
            var dbs = await ListDbsAsync(workId);
            var results = new List<SearchResult>();
            foreach (var db in dbs)
            {
                try
                {
                    var hits = await SearchAsync(workId, db.Key, query);
                    results.AddRange(hits.Select(r => new SearchResult { DbName = db.Key, Record = r }));
                }
                catch { /* DB ファイル欠損でも続行 */ }
            }
            return results.AsReadOnly();
        }
    }
}
