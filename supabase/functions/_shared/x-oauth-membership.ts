// SELECT visibility (including cross-workspace administrator visibility) is not mutation authorization.
type MembershipQuery = {
  eq(column: string, value: string): MembershipQuery;
  maybeSingle(): PromiseLike<{
    data: { created_by?: string; user_id?: string } | null;
    error: unknown;
  }>;
};
type MembershipTable = { select(columns: string): MembershipQuery };
export async function isActualWorkspaceMember(
  client: {
    from: (name: string) => unknown;
  },
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const { data: workspace, error } =
    await (client.from("social_workspaces") as MembershipTable)
      .select("created_by").eq("id", workspaceId).maybeSingle();
  if (error || !workspace) return false;
  if (workspace.created_by === userId) return true;
  const { data: member, error: memberError } = await (client.from(
    "social_workspace_members",
  ) as MembershipTable).select("user_id").eq("workspace_id", workspaceId).eq(
    "user_id",
    userId,
  )
    .maybeSingle();
  return !memberError && Boolean(member);
}
