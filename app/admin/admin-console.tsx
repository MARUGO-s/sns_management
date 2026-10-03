"use client";

import { Button } from "@heroui/react";
import type { User } from "@supabase/supabase-js";
import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Network,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { appPath } from "../lib/public-path";
import { ChannelLabel } from "../channel-logo";

type AdminView =
  | "posts"
  | "schedule"
  | "files"
  | "activity"
  | "users"
  | "system";
type AccessState = "checking" | "granted" | "denied";
type PostStatus = "draft" | "scheduled" | "published" | "failed";
type SystemMapMode = "graph" | "environment";

type SystemMapStats = {
  nodes: number;
  edges: number;
  communities: number;
  generatedAt: string;
};

type UserProfileRow = {
  user_id: string;
  email: string;
  store_id: string | null;
  created_at: string;
  last_sign_in_at: string | null;
};

type StoreRow = {
  id: string;
  name: string;
  area: string;
  sort_order: number;
  is_active: boolean;
};

type AdminUserRow = {
  user_id: string;
  granted_at: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  store_id: string | null;
  created_by: string;
  created_at: string;
};

type PostRow = {
  id: string;
  workspace_id: string;
  title: string;
  body: string;
  scheduled_at: string | null;
  status: PostStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  social_post_channels: Array<{ channel: string }> | null;
};

type FileRow = {
  id: string;
  workspace_id: string;
  post_id: string;
  storage_path: string;
  file_name: string;
  content_type: string;
  file_size: number;
  created_by: string;
  created_at: string;
};

type AuditRow = {
  id: number;
  workspace_id: string | null;
  actor_user_id: string | null;
  action: "insert" | "update" | "delete";
  entity_type: string;
  entity_id: string | null;
  label: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type IntegrationRow = {
  id: string;
  workspace_id: string;
  channel: string;
  status: string;
};

const ADMIN_PAGE_SIZE = 50;
const ADMIN_FETCH_CHUNK = 1000;

const adminViews = [
  { id: "posts" as const, label: "投稿", icon: FileText },
  { id: "schedule" as const, label: "予約予定", icon: CalendarDays },
  { id: "files" as const, label: "ファイル", icon: FolderOpen },
  { id: "activity" as const, label: "操作履歴", icon: Activity },
  { id: "users" as const, label: "利用者", icon: Users },
  { id: "system" as const, label: "システムマップ", icon: Network },
];

const statusOptions: Array<{ value: PostStatus; label: string }> = [
  { value: "draft", label: "下書き" },
  { value: "scheduled", label: "予約済み" },
  { value: "published", label: "公開済み" },
  { value: "failed", label: "失敗" },
];

const actionLabels = {
  insert: "作成",
  update: "更新",
  delete: "削除",
};

const entityLabels: Record<string, string> = {
  social_workspaces: "ワークスペース",
  social_workspace_members: "メンバー",
  social_posts: "投稿",
  social_post_channels: "投稿先",
  social_post_files: "ファイル",
  social_integrations: "SNS連携",
  social_admin_users: "管理者権限",
};

function formatDateTime(value: string | null) {
  if (!value) return "未記録";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(value: number) {
  const size = Number(value);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchAllRows<T>(
  query: () => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
  },
) {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await query().range(
      from,
      from + ADMIN_FETCH_CHUNK - 1,
    );
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < ADMIN_FETCH_CHUNK) break;
    from += ADMIN_FETCH_CHUNK;
  }
  return rows;
}

function pageSlice<T>(rows: T[], page: number) {
  const safePage = Math.min(Math.max(page, 1), pageCountFor(rows.length));
  const start = (safePage - 1) * ADMIN_PAGE_SIZE;
  return rows.slice(start, start + ADMIN_PAGE_SIZE);
}

function pageCountFor(total: number) {
  return Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function AdminPager({
  label,
  page,
  total,
  onPageChange,
}: {
  label: string;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total <= ADMIN_PAGE_SIZE) return null;
  const pageCount = pageCountFor(total);
  const current = Math.min(Math.max(page, 1), pageCount);
  return (
    <nav className="admin-pager" aria-label={`${label}のページ送り`}>
      <button
        type="button"
        disabled={current <= 1}
        onClick={() => onPageChange(current - 1)}
      >
        <ChevronLeft aria-hidden="true" size={16} />
        <span>前へ</span>
      </button>
      <span>
        {current} / {pageCount} ページ（全{total}件）
      </span>
      <button
        type="button"
        disabled={current >= pageCount}
        onClick={() => onPageChange(current + 1)}
      >
        <span>次へ</span>
        <ChevronRight aria-hidden="true" size={16} />
      </button>
    </nav>
  );
}

export default function AdminConsole() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(supabase));
  const [access, setAccess] = useState<AccessState>(
    supabase ? "checking" : "denied",
  );
  const [activeView, setActiveView] = useState<AdminView>("posts");
  const [dataLoading, setDataLoading] = useState(false);
  const [updatingPostId, setUpdatingPostId] = useState<string | null>(null);
  const [updatingAdminId, setUpdatingAdminId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PostStatus>("all");
  const [storeFilter, setStoreFilter] = useState<"all" | string>("all");
  const [listPage, setListPage] = useState(1);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [profiles, setProfiles] = useState<UserProfileRow[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [systemMapMode, setSystemMapMode] =
    useState<SystemMapMode>("graph");
  const [systemMapStats, setSystemMapStats] =
    useState<SystemMapStats | null | false>(null);

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      if (!sessionUser) setAccess("denied");
      setSessionLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (!sessionUser) setAccess("denied");
      setSessionLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (activeView !== "system" || systemMapStats !== null) return;

    void fetch(appPath("/system-map/graph-stats.json"))
      .then(async (response) => {
        if (!response.ok) throw new Error("Graph stats could not be loaded");
        return response.json() as Promise<SystemMapStats>;
      })
      .then(setSystemMapStats)
      .catch(() => setSystemMapStats(false));
  }, [activeView, systemMapStats]);

  const profileById = useMemo(
    () => new Map(profiles.map((profile) => [profile.user_id, profile])),
    [profiles],
  );
  const storeById = useMemo(
    () => new Map(stores.map((store) => [store.id, store])),
    [stores],
  );
  const workspaceRecordById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const postById = useMemo(
    () => new Map(posts.map((post) => [post.id, post])),
    [posts],
  );

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ja");
  const storeScopedPosts = useMemo(
    () =>
      posts.filter((post) => {
        const workspace = workspaceRecordById.get(post.workspace_id);
        if (
          storeFilter !== "all" &&
          workspace?.store_id !== storeFilter
        ) {
          return false;
        }
        if (!normalizedQuery) return true;
        const owner = profileById.get(post.created_by)?.email ?? "";
        const store = workspace?.store_id
          ? storeById.get(workspace.store_id)?.name ?? ""
          : "";
        const channels = (post.social_post_channels ?? [])
          .map((item) => item.channel)
          .join(" ");
        return [post.title, post.body, owner, workspace?.name, store, channels]
          .join(" ")
          .toLocaleLowerCase("ja")
          .includes(normalizedQuery);
      }),
    [
      normalizedQuery,
      posts,
      profileById,
      storeById,
      storeFilter,
      workspaceRecordById,
    ],
  );
  const filteredPosts = useMemo(
    () =>
      storeScopedPosts.filter(
        (post) => statusFilter === "all" || post.status === statusFilter,
      ),
    [statusFilter, storeScopedPosts],
  );
  const filteredScheduledPosts = useMemo(
    () =>
      storeScopedPosts
        .filter(
          (post) => post.status === "scheduled" && Boolean(post.scheduled_at),
        )
        .sort(
          (a, b) =>
            new Date(a.scheduled_at ?? 0).getTime() -
            new Date(b.scheduled_at ?? 0).getTime(),
        ),
    [storeScopedPosts],
  );
  const filteredFiles = useMemo(
    () =>
      files.filter((file) => {
        const workspaceRecord = workspaceRecordById.get(file.workspace_id);
        if (
          storeFilter !== "all" &&
          workspaceRecord?.store_id !== storeFilter
        ) {
          return false;
        }
        if (!normalizedQuery) return true;
        const owner = profileById.get(file.created_by)?.email ?? "";
        const workspace = workspaceRecord?.name ?? "";
        const store = workspaceRecord?.store_id
          ? storeById.get(workspaceRecord.store_id)?.name ?? ""
          : "";
        const post = postById.get(file.post_id)?.title ?? "";
        return [
          file.file_name,
          file.content_type,
          owner,
          workspace,
          store,
          post,
        ]
          .join(" ")
          .toLocaleLowerCase("ja")
          .includes(normalizedQuery);
      }),
    [
      files,
      normalizedQuery,
      postById,
      profileById,
      storeById,
      storeFilter,
      workspaceRecordById,
    ],
  );
  const filteredAuditLogs = useMemo(
    () =>
      auditLogs.filter((log) => {
        const workspaceRecord = log.workspace_id
          ? workspaceRecordById.get(log.workspace_id)
          : null;
        if (
          storeFilter !== "all" &&
          workspaceRecord?.store_id !== storeFilter
        ) {
          return false;
        }
        if (!normalizedQuery) return true;
        const actor = log.actor_user_id
          ? profileById.get(log.actor_user_id)?.email ?? ""
          : "";
        const workspace = workspaceRecord?.name ?? "";
        const store = workspaceRecord?.store_id
          ? storeById.get(workspaceRecord.store_id)?.name ?? ""
          : "";
        return [
          log.label,
          actionLabels[log.action],
          entityLabels[log.entity_type] ?? log.entity_type,
          actor,
          workspace,
          store,
        ]
          .join(" ")
          .toLocaleLowerCase("ja")
          .includes(normalizedQuery);
      }),
    [
      auditLogs,
      normalizedQuery,
      profileById,
      storeById,
      storeFilter,
      workspaceRecordById,
    ],
  );
  const filteredProfiles = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          (storeFilter === "all" || profile.store_id === storeFilter) &&
          (!normalizedQuery ||
            [
              profile.email,
              profile.store_id
                ? storeById.get(profile.store_id)?.name ?? ""
                : "",
            ]
              .join(" ")
              .toLocaleLowerCase("ja")
              .includes(normalizedQuery)),
      ),
    [normalizedQuery, profiles, storeById, storeFilter],
  );
  const pagedPosts = useMemo(
    () => pageSlice(filteredPosts, listPage),
    [filteredPosts, listPage],
  );
  const pagedScheduledPosts = useMemo(
    () => pageSlice(filteredScheduledPosts, listPage),
    [filteredScheduledPosts, listPage],
  );
  const pagedFiles = useMemo(
    () => pageSlice(filteredFiles, listPage),
    [filteredFiles, listPage],
  );
  const pagedAuditLogs = useMemo(
    () => pageSlice(filteredAuditLogs, listPage),
    [filteredAuditLogs, listPage],
  );
  const pagedProfiles = useMemo(
    () => pageSlice(filteredProfiles, listPage),
    [filteredProfiles, listPage],
  );

  function resetListPage() {
    setListPage(1);
  }
  const storeSummaries = useMemo(
    () =>
      stores.map((store) => {
        const workspaceIds = new Set(
          workspaces
            .filter((workspace) => workspace.store_id === store.id)
            .map((workspace) => workspace.id),
        );
        const storePosts = posts.filter((post) =>
          workspaceIds.has(post.workspace_id),
        );
        const scheduledPosts = storePosts
          .filter(
            (post) => post.status === "scheduled" && Boolean(post.scheduled_at),
          )
          .sort(
            (a, b) =>
              new Date(a.scheduled_at ?? 0).getTime() -
              new Date(b.scheduled_at ?? 0).getTime(),
          );

        return {
          store,
          users: profiles.filter((profile) => profile.store_id === store.id)
            .length,
          posts: storePosts.length,
          scheduled: scheduledPosts.length,
          nextScheduledAt: scheduledPosts[0]?.scheduled_at ?? null,
        };
      }),
    [posts, profiles, stores, workspaces],
  );
  const selectedStoreName =
    storeFilter === "all"
      ? "全店舗"
      : storeById.get(storeFilter)?.name ?? "店舗未設定";

  function getWorkspaceStoreLabel(workspaceId: string) {
    const workspace = workspaceRecordById.get(workspaceId);
    if (!workspace) return "不明";
    if (!workspace.store_id) return "店舗未設定";
    return storeById.get(workspace.store_id)?.name ?? "店舗未設定";
  }

  const loadAdminData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    setDataLoading(true);
    setNotice(null);

    try {
      const [
        profiles,
        adminUsers,
        stores,
        workspaces,
        posts,
        files,
        auditLogs,
        integrations,
      ] = await Promise.all([
        fetchAllRows<UserProfileRow>(() =>
          client
            .from("social_user_profiles")
            .select("user_id, email, store_id, created_at, last_sign_in_at")
            .order("created_at", { ascending: false }),
        ),
        fetchAllRows<AdminUserRow>(() =>
          client
            .from("social_admin_users")
            .select("user_id, granted_at")
            .order("granted_at", { ascending: true }),
        ),
        fetchAllRows<StoreRow>(() =>
          client
            .from("social_stores")
            .select("id, name, area, sort_order, is_active")
            .order("sort_order", { ascending: true }),
        ),
        fetchAllRows<WorkspaceRow>(() =>
          client
            .from("social_workspaces")
            .select("id, name, store_id, created_by, created_at")
            .order("created_at", { ascending: false }),
        ),
        fetchAllRows<PostRow>(() =>
          client
            .from("social_posts")
            .select(
              "id, workspace_id, title, body, scheduled_at, status, created_by, created_at, updated_at, social_post_channels(channel)",
            )
            .order("created_at", { ascending: false }),
        ),
        fetchAllRows<FileRow>(() =>
          client
            .from("social_post_files")
            .select(
              "id, workspace_id, post_id, storage_path, file_name, content_type, file_size, created_by, created_at",
            )
            .order("created_at", { ascending: false }),
        ),
        fetchAllRows<AuditRow>(() =>
          client
            .from("social_audit_logs")
            .select(
              "id, workspace_id, actor_user_id, action, entity_type, entity_id, label, metadata, created_at",
            )
            .order("created_at", { ascending: false }),
        ),
        fetchAllRows<IntegrationRow>(() =>
          client
            .from("social_integrations")
            .select("id, workspace_id, channel, status"),
        ),
      ]);

      setProfiles(profiles);
      setAdminUsers(adminUsers);
      setStores(stores);
      setWorkspaces(workspaces);
      setPosts(posts as unknown as PostRow[]);
      setFiles(files);
      setAuditLogs(auditLogs);
      setIntegrations(integrations);
      setListPage(1);
    } catch (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "管理データの読み込みに失敗しました。"),
      });
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;

    void supabase
      .from("social_admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setAccess("denied");
          return;
        }

        setAccess("granted");
        await loadAdminData();
      });

    return () => {
      active = false;
    };
  }, [loadAdminData, user]);

  async function updatePostStatus(postId: string, status: PostStatus) {
    if (!supabase) return;
    const currentPost = posts.find((post) => post.id === postId);
    if (status === "scheduled" && !currentPost?.scheduled_at) {
      setNotice({
        tone: "error",
        text: "公開予定日時がない投稿は予約済みにできません。",
      });
      return;
    }

    setUpdatingPostId(postId);
    setNotice(null);

    const nextScheduledAt =
      status === "draft" || status === "failed"
        ? null
        : (currentPost?.scheduled_at ?? null);

    const { error } = await supabase
      .from("social_posts")
      .update({
        status,
        scheduled_at: nextScheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    if (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(
          error,
          "投稿ステータスを更新できませんでした。",
        ),
      });
    } else {
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                status,
                scheduled_at: nextScheduledAt,
                updated_at: new Date().toISOString(),
              }
            : post,
        ),
      );
    }
    setUpdatingPostId(null);
  }

  async function downloadFile(file: FileRow) {
    if (!supabase) return;
    setNotice(null);

    const { data, error } = await supabase.storage
      .from("social-post-files")
      .createSignedUrl(file.storage_path, 60, {
        download: file.file_name,
      });

    if (error || !data?.signedUrl) {
      setNotice({
        tone: "error",
        text: getErrorMessage(
          error,
          "ファイルのダウンロードURLを作成できませんでした。",
        ),
      });
      return;
    }

    try {
      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error("ファイルを取得できませんでした。");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = file.file_name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setNotice({
        tone: "error",
        text: getErrorMessage(
          downloadError,
          "ファイルをダウンロードできませんでした。",
        ),
      });
    }
  }

  async function grantAdministratorAccess(profile: UserProfileRow) {
    if (!supabase || !user) return;
    setUpdatingAdminId(profile.user_id);
    setNotice(null);

    const { data, error } = await supabase
      .from("social_admin_users")
      .insert({
        user_id: profile.user_id,
        granted_by: user.id,
      })
      .select("user_id, granted_at")
      .single();

    if (error || !data) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "管理者権限を付与できませんでした。"),
      });
    } else {
      setAdminUsers((current) => [
        ...current,
        data as AdminUserRow,
      ]);
      setNotice({
        tone: "success",
        text: `${profile.email}へ管理者権限を付与しました。`,
      });
    }

    setUpdatingAdminId(null);
  }

  async function revokeAdministratorAccess(profile: UserProfileRow) {
    if (!supabase || !user || profile.user_id === user.id) return;
    if (
      !window.confirm(
        `${profile.email}の管理者権限を解除します。よろしいですか？`,
      )
    ) {
      return;
    }

    setUpdatingAdminId(profile.user_id);
    setNotice(null);

    const { data, error } = await supabase
      .from("social_admin_users")
      .delete()
      .eq("user_id", profile.user_id)
      .select("user_id");

    if (error || !data?.length) {
      setNotice({
        tone: "error",
        text: getErrorMessage(
          error,
          "管理者権限を解除できませんでした。最後の管理者は解除できません。",
        ),
      });
    } else {
      setAdminUsers((current) =>
        current.filter(
          (administrator) => administrator.user_id !== profile.user_id,
        ),
      );
      setNotice({
        tone: "success",
        text: `${profile.email}の管理者権限を解除しました。`,
      });
    }

    setUpdatingAdminId(null);
  }

  if (sessionLoading || access === "checking") {
    return (
      <main className="admin-access-shell">
        <section className="admin-access-panel">
          <ShieldCheck aria-hidden="true" size={28} />
          <p className="eyebrow">Administrator</p>
          <h1>管理コンソール</h1>
          <div className="admin-access-loading">
            <Loader2 className="spin" aria-hidden="true" size={18} />
            <span>管理者権限を確認しています</span>
          </div>
        </section>
      </main>
    );
  }

  if (!supabase || !user || access === "denied") {
    return (
      <main className="admin-access-shell">
        <section className="admin-access-panel">
          <ShieldAlert aria-hidden="true" size={28} />
          <p className="eyebrow">Restricted</p>
          <h1>管理者専用ページ</h1>
          <p>
            {user
              ? "このアカウントには管理者権限がありません。"
              : "管理者アカウントでログインしてください。"}
          </p>
          <a className="admin-back-link" href={appPath("/")}>
            <ArrowLeft aria-hidden="true" size={17} />
            <span>通常画面へ戻る</span>
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-rail" aria-label="管理メニュー">
        <div className="brand-lockup">
          <div className="brand-mark">IX</div>
          <div>
            <p className="eyebrow">Admin Console</p>
            <h1>Instatic TalksX</h1>
          </div>
        </div>

        <div className="admin-role">
          <ShieldCheck aria-hidden="true" size={17} />
          <span>管理者権限</span>
        </div>

        <nav className="admin-nav" aria-label="管理ビュー">
          {adminViews.map((view) => {
            const Icon = view.icon;
            return (
              <button
                key={view.id}
                className={
                  activeView === view.id
                    ? "admin-nav-button active"
                    : "admin-nav-button"
                }
                type="button"
                onClick={() => {
                  setActiveView(view.id);
                  resetListPage();
                }}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{view.label}</span>
              </button>
            );
          })}
        </nav>

        <a className="admin-rail-back" href={appPath("/")}>
          <ArrowLeft aria-hidden="true" size={17} />
          <span>通常画面</span>
        </a>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <p className="eyebrow">全体管理</p>
            <h2>管理コンソール</h2>
          </div>
          <div className="admin-header-actions">
            <span className="admin-session">
              <CheckCircle2 aria-hidden="true" size={15} />
              {user.email}
            </span>
            <button
              className="icon-button"
              type="button"
              aria-label="管理データを更新"
              title="管理データを更新"
              disabled={dataLoading}
              onClick={() => void loadAdminData()}
            >
              <RefreshCcw
                className={dataLoading ? "spin" : undefined}
                aria-hidden="true"
                size={18}
              />
            </button>
          </div>
        </header>

        <section className="admin-metrics" aria-label="全体件数">
          <div>
            <span>利用者</span>
            <strong>{profiles.length}</strong>
          </div>
          <div>
            <span>店舗</span>
            <strong>{stores.length}</strong>
          </div>
          <div>
            <span>投稿</span>
            <strong>{posts.length}</strong>
          </div>
          <div>
            <span>予約中</span>
            <strong>
              {posts.filter((post) => post.status === "scheduled").length}
            </strong>
          </div>
          <div>
            <span>ファイル</span>
            <strong>{files.length}</strong>
          </div>
          <div>
            <span>有効なSNS連携</span>
            <strong>
              {
                integrations.filter(
                  (integration) => integration.status === "configured",
                ).length
              }
            </strong>
          </div>
        </section>

        {notice && (
          <div className={`app-notice ${notice.tone}`} role="status">
            {notice.tone === "success" ? (
              <CheckCircle2 aria-hidden="true" size={17} />
            ) : notice.tone === "info" ? (
              <Activity aria-hidden="true" size={17} />
            ) : (
              <ShieldAlert aria-hidden="true" size={17} />
            )}
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)}>
              閉じる
            </button>
          </div>
        )}

        {activeView !== "system" && (
          <div className="admin-toolbar">
            <label className="admin-search">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">管理データを検索</span>
              <input
                placeholder="利用者、投稿、ファイルを検索"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  resetListPage();
                }}
              />
            </label>
            <div className="admin-toolbar-filters">
              <label className="admin-filter">
                <span>店舗</span>
                <select
                  value={storeFilter}
                  onChange={(event) => {
                    setStoreFilter(event.target.value);
                    resetListPage();
                  }}
                >
                  <option value="all">全店舗</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              {activeView === "posts" && (
                <label className="admin-filter">
                  <span>ステータス</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(
                        event.target.value as "all" | PostStatus,
                      );
                      resetListPage();
                    }}
                  >
                    <option value="all">すべて</option>
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}

        {(activeView === "posts" || activeView === "schedule") && (
          <section
            className="admin-table-panel admin-store-overview"
            aria-label="店舗別運用状況"
          >
            <div className="admin-section-heading">
              <div>
                <h3>店舗別運用状況</h3>
                <p>店舗を選択すると投稿と予約予定を絞り込めます。</p>
              </div>
              <button
                className={
                  storeFilter === "all"
                    ? "admin-store-all active"
                    : "admin-store-all"
                }
                type="button"
                onClick={() => {
                  setStoreFilter("all");
                  resetListPage();
                }}
              >
                全店舗
              </button>
            </div>
            <div className="admin-table-scroll admin-store-summary-scroll">
              <table className="admin-table admin-store-table">
                <thead>
                  <tr>
                    <th>店舗</th>
                    <th>利用者</th>
                    <th>投稿</th>
                    <th>予約中</th>
                    <th>次回予定</th>
                  </tr>
                </thead>
                <tbody>
                  {storeSummaries.map((summary) => (
                    <tr
                      className={
                        storeFilter === summary.store.id
                          ? "admin-store-row active"
                          : "admin-store-row"
                      }
                      key={summary.store.id}
                    >
                      <td>
                        <button
                          className="admin-store-link"
                          type="button"
                          onClick={() => {
                            setStoreFilter(summary.store.id);
                            resetListPage();
                          }}
                        >
                          <Building2 aria-hidden="true" size={15} />
                          <span>
                            <strong>{summary.store.name}</strong>
                            <small>{summary.store.area}</small>
                          </span>
                        </button>
                      </td>
                      <td>{summary.users}</td>
                      <td>{summary.posts}</td>
                      <td>{summary.scheduled}</td>
                      <td>{formatDateTime(summary.nextScheduledAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeView === "posts" && (
          <section className="admin-table-panel" aria-label="全投稿">
            <div className="admin-section-heading">
              <div>
                <h3>{selectedStoreName}の投稿</h3>
                <p>
                  {filteredPosts.length}件中
                  {pagedPosts.length}件を表示
                </p>
              </div>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>投稿内容</th>
                    <th>利用者</th>
                    <th>店舗</th>
                    <th>投稿先</th>
                    <th>公開予定</th>
                    <th>ステータス</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPosts.map((post) => (
                    <tr key={post.id}>
                      <td className="admin-primary-cell">
                        <strong>{post.title || "無題の投稿"}</strong>
                        <span>{post.body || "本文なし"}</span>
                      </td>
                      <td>{profileById.get(post.created_by)?.email ?? "不明"}</td>
                      <td>{getWorkspaceStoreLabel(post.workspace_id)}</td>
                      <td>
                        <div className="admin-channel-list">
                          {(post.social_post_channels ?? []).map((item) => (
                            <span key={item.channel}>
                              <ChannelLabel channel={item.channel} />
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatDateTime(post.scheduled_at)}</td>
                      <td>
                        <select
                          className={`admin-status ${post.status}`}
                          aria-label={`${post.title}のステータス`}
                          value={post.status}
                          disabled={updatingPostId === post.id}
                          onChange={(event) =>
                            void updatePostStatus(
                              post.id,
                              event.target.value as PostStatus,
                            )
                          }
                        >
                          {statusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredPosts.length === 0 && (
              <div className="admin-empty">
                <FileText aria-hidden="true" size={22} />
                <span>条件に一致する投稿はありません。</span>
              </div>
            )}
            <AdminPager
              label="投稿"
              page={listPage}
              total={filteredPosts.length}
              onPageChange={setListPage}
            />
          </section>
        )}

        {activeView === "schedule" && (
          <section className="admin-table-panel" aria-label="予約投稿予定">
            <div className="admin-section-heading">
              <div>
                <h3>{selectedStoreName}の予約予定</h3>
                <p>
                  {filteredScheduledPosts.length}件中
                  {pagedScheduledPosts.length}件を日時順に表示
                </p>
              </div>
              <span className="admin-count-label">
                予約中 {filteredScheduledPosts.length}件
              </span>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>公開予定</th>
                    <th>店舗</th>
                    <th>投稿内容</th>
                    <th>投稿先</th>
                    <th>利用者</th>
                    <th>ステータス</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedScheduledPosts.map((post) => (
                    <tr key={post.id}>
                      <td className="admin-schedule-time">
                        <CalendarDays aria-hidden="true" size={15} />
                        <strong>{formatDateTime(post.scheduled_at)}</strong>
                      </td>
                      <td>{getWorkspaceStoreLabel(post.workspace_id)}</td>
                      <td className="admin-primary-cell">
                        <strong>{post.title || "無題の投稿"}</strong>
                        <span>{post.body || "本文なし"}</span>
                      </td>
                      <td>
                        <div className="admin-channel-list">
                          {(post.social_post_channels ?? []).map((item) => (
                            <span key={item.channel}>
                              <ChannelLabel channel={item.channel} />
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{profileById.get(post.created_by)?.email ?? "不明"}</td>
                      <td>
                        <span className="admin-status scheduled">予約済み</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredScheduledPosts.length === 0 && (
              <div className="admin-empty">
                <CalendarDays aria-hidden="true" size={22} />
                <span>条件に一致する予約投稿はありません。</span>
              </div>
            )}
            <AdminPager
              label="予約予定"
              page={listPage}
              total={filteredScheduledPosts.length}
              onPageChange={setListPage}
            />
          </section>
        )}

        {activeView === "files" && (
          <section className="admin-table-panel" aria-label="全ファイル">
            <div className="admin-section-heading">
              <div>
                <h3>{selectedStoreName}のファイル</h3>
                <p>
                  {filteredFiles.length}件中
                  {pagedFiles.length}件を表示
                </p>
              </div>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ファイル</th>
                    <th>投稿</th>
                    <th>利用者</th>
                    <th>店舗</th>
                    <th>保存日時</th>
                    <th>
                      <span className="sr-only">操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedFiles.map((file) => (
                    <tr key={file.id}>
                      <td className="admin-primary-cell">
                        <strong>{file.file_name}</strong>
                        <span>
                          {file.content_type} ・ {formatFileSize(file.file_size)}
                        </span>
                      </td>
                      <td>{postById.get(file.post_id)?.title ?? "投稿なし"}</td>
                      <td>{profileById.get(file.created_by)?.email ?? "不明"}</td>
                      <td>{getWorkspaceStoreLabel(file.workspace_id)}</td>
                      <td>{formatDateTime(file.created_at)}</td>
                      <td className="admin-action-cell">
                        <Button
                          className="admin-download-button"
                          size="sm"
                          variant="secondary"
                          aria-label={`${file.file_name}をダウンロード`}
                          onPress={() => void downloadFile(file)}
                        >
                          <Download aria-hidden="true" size={16} />
                          <span>取得</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredFiles.length === 0 && (
              <div className="admin-empty">
                <FolderOpen aria-hidden="true" size={22} />
                <span>条件に一致するファイルはありません。</span>
              </div>
            )}
            <AdminPager
              label="ファイル"
              page={listPage}
              total={filteredFiles.length}
              onPageChange={setListPage}
            />
          </section>
        )}

        {activeView === "activity" && (
          <section className="admin-table-panel" aria-label="全操作履歴">
            <div className="admin-section-heading">
              <div>
                <h3>{selectedStoreName}の操作履歴</h3>
                <p>
                  {filteredAuditLogs.length}件中
                  {pagedAuditLogs.length}件を表示
                </p>
              </div>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>操作</th>
                    <th>対象</th>
                    <th>利用者</th>
                    <th>店舗</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAuditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.created_at)}</td>
                      <td>
                        <span className={`admin-action ${log.action}`}>
                          {actionLabels[log.action]}
                        </span>
                      </td>
                      <td className="admin-primary-cell">
                        <strong>
                          {entityLabels[log.entity_type] ?? log.entity_type}
                        </strong>
                        <span>{log.label || "詳細なし"}</span>
                      </td>
                      <td>
                        {log.actor_user_id
                          ? profileById.get(log.actor_user_id)?.email ?? "不明"
                          : "システム"}
                      </td>
                      <td>
                        {log.workspace_id
                          ? getWorkspaceStoreLabel(log.workspace_id)
                          : "対象外"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredAuditLogs.length === 0 && (
              <div className="admin-empty">
                <Activity aria-hidden="true" size={22} />
                <span>条件に一致する操作履歴はありません。</span>
              </div>
            )}
            <AdminPager
              label="操作履歴"
              page={listPage}
              total={filteredAuditLogs.length}
              onPageChange={setListPage}
            />
          </section>
        )}

        {activeView === "system" && (
          <section className="admin-system-map" aria-label="システムマップ">
            <div className="admin-system-map-heading">
              <div>
                <p className="eyebrow">Graphify × Obsidian × AI</p>
                <h3>システムマップ</h3>
              </div>
              <a
                className="admin-system-map-link"
                href={appPath(
                  systemMapMode === "graph"
                    ? "/system-map/graph.html"
                    : "/system-map/environment.html",
                )}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden="true" size={16} />
                <span>別画面で開く</span>
              </a>
            </div>
            <div className="admin-system-map-switcher" role="tablist">
              <button
                aria-selected={systemMapMode === "graph"}
                className={systemMapMode === "graph" ? "active" : ""}
                onClick={() => setSystemMapMode("graph")}
                role="tab"
                type="button"
              >
                コード構成
              </button>
              <button
                aria-selected={systemMapMode === "environment"}
                className={systemMapMode === "environment" ? "active" : ""}
                onClick={() => setSystemMapMode("environment")}
                role="tab"
                type="button"
              >
                実行環境・AI知識循環
              </button>
            </div>
            <div className="admin-system-map-stats" aria-label="グラフ情報">
              {systemMapStats ? (
                <>
                  <span>{systemMapStats.nodes} ノード</span>
                  <span>{systemMapStats.edges} 関係</span>
                  <span>{systemMapStats.communities} コミュニティ</span>
                </>
              ) : systemMapStats === false ? (
                <span>グラフ情報を取得できませんでした</span>
              ) : (
                <span>グラフ情報を読み込み中</span>
              )}
              <span>
                {systemMapMode === "graph"
                  ? "Graphify・コードのみ"
                  : "Graphify × Obsidian × AI"}
              </span>
            </div>
            <iframe
              className="admin-system-map-frame"
              src={appPath(
                systemMapMode === "graph"
                  ? "/system-map/graph.html"
                  : "/system-map/environment.html",
              )}
              title={
                systemMapMode === "graph"
                  ? "Instatic TalksX コード構成マップ"
                  : "Instatic TalksX 実行環境とAI知識循環"
              }
            />
          </section>
        )}

        {activeView === "users" && (
          <section className="admin-table-panel" aria-label="全利用者">
            <div className="admin-section-heading">
              <div>
                <h3>{selectedStoreName}の利用者</h3>
                <p>
                  {filteredProfiles.length}名中
                  {pagedProfiles.length}名を表示
                </p>
              </div>
              <span className="admin-count-label">
                管理者 {adminUsers.length}名
              </span>
            </div>
            <div className="admin-table-scroll">
              <table className="admin-table admin-users-table">
                <thead>
                  <tr>
                    <th>利用者</th>
                    <th>権限</th>
                    <th>登録日時</th>
                    <th>最終ログイン</th>
                    <th>所属店舗</th>
                    <th>投稿</th>
                    <th>ファイル</th>
                    <th>
                      <span className="sr-only">権限操作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProfiles.map((profile) => {
                    const isAdministrator = adminUsers.some(
                      (administrator) =>
                        administrator.user_id === profile.user_id,
                    );
                    const isCurrentUser = profile.user_id === user.id;

                    return (
                      <tr key={profile.user_id}>
                        <td className="admin-primary-cell">
                          <strong>{profile.email || "メール未登録"}</strong>
                          <span>{profile.user_id.slice(0, 8)}</span>
                        </td>
                        <td>
                          <span
                            className={
                              isAdministrator
                                ? "admin-permission administrator"
                                : "admin-permission member"
                            }
                          >
                            {isAdministrator ? "管理者" : "一般"}
                          </span>
                        </td>
                        <td>{formatDateTime(profile.created_at)}</td>
                        <td>{formatDateTime(profile.last_sign_in_at)}</td>
                        <td>
                          {profile.store_id
                            ? storeById.get(profile.store_id)?.name ??
                              "店舗未設定"
                            : "店舗未設定"}
                        </td>
                        <td>
                          {
                            posts.filter(
                              (post) => post.created_by === profile.user_id,
                            ).length
                          }
                        </td>
                        <td>
                          {
                            files.filter(
                              (file) => file.created_by === profile.user_id,
                            ).length
                          }
                        </td>
                        <td className="admin-action-cell">
                          {isCurrentUser ? (
                            <span className="admin-current-user">
                              <ShieldCheck aria-hidden="true" size={15} />
                              現在の管理者
                            </span>
                          ) : (
                            <Button
                              className={
                                isAdministrator
                                  ? "admin-permission-button revoke"
                                  : "admin-permission-button"
                              }
                              size="sm"
                              variant="secondary"
                              isDisabled={updatingAdminId === profile.user_id}
                              onPress={() =>
                                isAdministrator
                                  ? void revokeAdministratorAccess(profile)
                                  : void grantAdministratorAccess(profile)
                              }
                            >
                              {updatingAdminId === profile.user_id ? (
                                <Loader2
                                  className="spin"
                                  aria-hidden="true"
                                  size={15}
                                />
                              ) : isAdministrator ? (
                                <UserMinus aria-hidden="true" size={15} />
                              ) : (
                                <UserPlus aria-hidden="true" size={15} />
                              )}
                              <span>
                                {isAdministrator ? "権限を解除" : "管理者にする"}
                              </span>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredProfiles.length === 0 && (
              <div className="admin-empty">
                <Users aria-hidden="true" size={22} />
                <span>条件に一致する利用者はいません。</span>
              </div>
            )}
            <AdminPager
              label="利用者"
              page={listPage}
              total={filteredProfiles.length}
              onPageChange={setListPage}
            />
          </section>
        )}
      </section>
    </main>
  );
}
