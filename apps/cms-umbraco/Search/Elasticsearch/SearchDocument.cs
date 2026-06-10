using System.Text.Json.Serialization;

namespace KiNorge.Cms.Search.Elasticsearch;

/// <summary>
/// One indexed page. Fields map 1:1 to the ki-content template mapping
/// (title, url, body, type, language). The dense field body_semantic is generated
/// server-side from title+body via copy_to, so it is never set here. The Elasticsearch
/// _id is the Umbraco content GUID (set by ElasticsearchIndexService), so re-publishing
/// upserts the same document and unpublish/trash can delete it by the same id.
/// </summary>
public class SearchDocument
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("url")]
    public string Url { get; set; } = "";

    [JsonPropertyName("body")]
    public string Body { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "";

    [JsonPropertyName("language")]
    public string Language { get; set; } = "nb";
}
