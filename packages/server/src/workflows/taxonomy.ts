import { normalizedIdentity } from "./types.js";

export interface HealthFinding {
  trackId?: number;
  tagId?: number;
  categoryId?: number;
  issue: string;
  fields?: string[];
}

export function inspectTaxonomy(
  data: Record<string, unknown>,
  add: (finding: HealthFinding) => void,
): Set<number> {
  const tags = data.tags ?? data.customTags;
  if (!Array.isArray(tags))
    throw new Error("Lexicon response has no tags array");
  const validTags = new Set<number>(tags.map((tag) => Number(tag.id)));
  const labels = new Set<string>();
  const positions = new Set<string>();
  const categories = Array.isArray(data.categories)
    ? data.categories
    : undefined;
  const categoryIds = new Set<number>(
    categories?.map((category) => Number(category.id)) ?? [],
  );
  for (const tag of tags) {
    const identity = normalizedIdentity(tag.label);
    if (identity && labels.has(identity))
      add({ tagId: tag.id, issue: "duplicate_tag_label" });
    labels.add(identity);
    if (categories && !categoryIds.has(tag.categoryId))
      add({
        tagId: tag.id,
        categoryId: tag.categoryId,
        issue: "unknown_tag_category",
      });
    const position = JSON.stringify([tag.categoryId, tag.position]);
    if (typeof tag.position === "number" && positions.has(position))
      add({ tagId: tag.id, issue: "duplicate_tag_position" });
    positions.add(position);
  }
  const categoryLabels = new Set<string>();
  for (const category of categories ?? []) {
    const identity = normalizedIdentity(category.label);
    if (identity && categoryLabels.has(identity))
      add({ categoryId: category.id, issue: "duplicate_category_label" });
    categoryLabels.add(identity);
    if (
      Array.isArray(category.tags) &&
      category.tags.some((id: number) => !validTags.has(id))
    )
      add({ categoryId: category.id, issue: "unknown_category_tag" });
  }
  return validTags;
}
