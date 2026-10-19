using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Search;

/// <summary>
/// Flat list of all published content, depth first from the root nodes. Unpublished
/// content is skipped, but its children are still visited, since an unpublished
/// intermediate node can have published children.
/// </summary>
public static class PublishedContentWalker
{
    public static List<IContent> CollectAllPublished(IContentService contentService)
    {
        var result = new List<IContent>();

        foreach (var root in contentService.GetRootContent())
        {
            CollectRecursive(contentService, root, result);
        }

        return result;
    }

    private static void CollectRecursive(
        IContentService contentService, IContent content, List<IContent> result)
    {
        if (content.Published)
            result.Add(content);

        var children = contentService.GetPagedChildren(content.Id, 0, int.MaxValue, out _);
        foreach (var child in children)
        {
            CollectRecursive(contentService, child, result);
        }
    }
}
