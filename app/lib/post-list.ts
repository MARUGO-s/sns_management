export type PostStatus = "下書き" | "予約済み" | "公開済み" | "失敗";
export type PostFilter = "all" | PostStatus;

type SearchablePost = {
  title: string;
  body: string;
  owner: string;
  channels: string[];
  status: PostStatus;
};

export function filterPosts<T extends SearchablePost>(
  posts: T[],
  query: string,
  status: PostFilter = "all",
): T[] {
  const normalized = query.trim().toLocaleLowerCase("ja");
  return posts.filter((post) =>
    (status === "all" || post.status === status) &&
    (!normalized || [post.title, post.body, post.owner, ...post.channels]
      .join(" ").toLocaleLowerCase("ja").includes(normalized)),
  );
}

export function scheduledPosts<T extends SearchablePost & { scheduledAt: string | null }>(posts: T[]): T[] {
  return posts.filter((post) => post.status === "予約済み").sort((a, b) =>
    (a.scheduledAt ? Date.parse(a.scheduledAt) : Infinity) -
    (b.scheduledAt ? Date.parse(b.scheduledAt) : Infinity),
  );
}
