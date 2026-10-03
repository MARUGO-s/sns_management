"use client";

import { Button } from "@heroui/react";
import type { User } from "@supabase/supabase-js";
import {
  AlertCircle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cloud,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  History,
  Inbox,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  LogOut,
  Paperclip,
  Play,
  PlugZap,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Scissors,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  Video,
  Wand2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { googleAuthEnabled, supabase } from "./lib/supabase";
import { appPath } from "./lib/public-path";
import MediaEditor, {
  defaultMediaCrop,
  type MediaCropConfig,
} from "./media-editor";
import VideoViewer from "./video-viewer";

type ChannelId = "instagram" | "tiktok" | "x" | "threads";
type ViewId =
  | "compose"
  | "calendar"
  | "history"
  | "inbox"
  | "analytics"
  | "settings";
type ApiStatus = "未設定" | "登録済み" | "入力確認済み" | "要確認";
type RecordStatus = "下書き" | "予約済み" | "公開済み" | "失敗";

type StoreRow = {
  id: string;
  name: string;
  area: string;
  sort_order: number;
};

type WorkspaceRow = {
  id: string;
  name: string;
  store_id: string | null;
  created_by: string;
};

type LocalAttachment = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl: string;
  crop: MediaCropConfig | null;
};

type SavedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  storagePath: string;
  variant: "original" | "processed";
  mediaJob: {
    id: string;
    status: MediaJobStatus;
    aspect: string;
    errorMessage: string;
    stale: boolean;
  } | null;
};

type MediaJobStatus =
  | "queued"
  | "dispatching"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

type MediaJobRow = {
  id: string;
  source_file_id: string;
  output_file_id: string | null;
  status: MediaJobStatus;
  crop_config: MediaCropConfig;
  error_message: string;
  updated_at: string;
};

const mediaJobStaleAfterMs = 20 * 60 * 1000;

function isMediaJobStale(updatedAt: string) {
  const timestamp = Date.parse(updatedAt);
  return (
    !Number.isFinite(timestamp) ||
    Date.now() - timestamp >= mediaJobStaleAfterMs
  );
}

const pendingStoreKey = "instatic-talksx:pending-store";
const pendingStoreMaxAgeMs = 15 * 60 * 1000;

function getAuthRedirectUrl() {
  const basePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";
  const normalizedPath = basePath
    ? `/${basePath.replace(/^\/+|\/+$/g, "")}/`
    : "/";
  return new URL(normalizedPath, window.location.origin).toString();
}

function readOAuthCallbackError() {
  if (typeof window === "undefined") return "";
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return (
    search.get("error_description") ||
    search.get("error") ||
    hash.get("error_description") ||
    hash.get("error") ||
    ""
  );
}

function clearAuthCallbackParams() {
  if (typeof window === "undefined" || !window.history.replaceState) return;
  const url = new URL(window.location.href);
  for (const key of ["error", "error_description", "error_code"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isFutureScheduleTime(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now() + 60 * 1000;
}

function isFreshAuthUser(user: User) {
  const createdAt = Date.parse(user.created_at);
  return (
    Number.isFinite(createdAt) &&
    Date.now() - createdAt < pendingStoreMaxAgeMs
  );
}

function readPendingStoreId(user: User) {
  if (typeof window === "undefined" || !isFreshAuthUser(user)) return null;
  try {
    return (
      window.sessionStorage.getItem(pendingStoreKey) ||
      window.localStorage.getItem(pendingStoreKey)
    );
  } catch {
    return null;
  }
}

function writePendingStoreId(storeId: string) {
  window.sessionStorage.setItem(pendingStoreKey, storeId);
  window.localStorage.removeItem(pendingStoreKey);
}

function clearPendingStoreId() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(pendingStoreKey);
  window.localStorage.removeItem(pendingStoreKey);
}

type HistoryRecord = {
  id: string;
  title: string;
  body: string;
  time: string;
  scheduledAt: string | null;
  channels: ChannelId[];
  status: RecordStatus;
  owner: string;
  format: string;
  savedAt: string;
  files: SavedFile[];
};

type SecretFlags = {
  clientSecret: boolean;
  accessToken: boolean;
  refreshToken: boolean;
  webhookSecret: boolean;
};

type IntegrationConfig = {
  appId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  callbackUrl: string;
  webhookSecret: string;
  scopes: string;
  status: ApiStatus;
  updatedAt: string;
  stored: SecretFlags;
};

type DbPostRow = {
  id: string;
  title: string;
  body: string;
  scheduled_at: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
  owner_name: string;
  format: string;
  created_at: string;
  social_post_channels: Array<{ channel: ChannelId }> | null;
  social_post_files: Array<{
    id: string;
    file_name: string;
    file_size: number;
    content_type: string;
    storage_path: string;
    media_variant: "original" | "processed";
  }> | null;
};

const emptySecretFlags: SecretFlags = {
  clientSecret: false,
  accessToken: false,
  refreshToken: false,
  webhookSecret: false,
};

const channels: Array<{
  id: ChannelId;
  label: string;
  tone: string;
}> = [
  { id: "instagram", label: "Instagram", tone: "pink" },
  { id: "tiktok", label: "TikTok", tone: "cyan" },
  { id: "x", label: "X", tone: "ink" },
  { id: "threads", label: "Threads", tone: "violet" },
];

const defaultScopes: Record<ChannelId, string> = {
  instagram: "content_publish, instagram_manage_comments, instagram_basic",
  tiktok: "video.publish, user.info.basic, comment.list",
  x: "tweet.read, tweet.write, users.read, offline.access",
  threads: "threads_basic, threads_content_publish, threads_manage_replies",
};

const views: Array<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: "compose", label: "投稿", icon: Send },
  { id: "calendar", label: "予約", icon: CalendarDays },
  { id: "history", label: "履歴", icon: History },
  { id: "inbox", label: "受信箱", icon: Inbox },
  { id: "analytics", label: "分析", icon: BarChart3 },
  { id: "settings", label: "連携", icon: PlugZap },
];

const channelById = Object.fromEntries(
  channels.map((channel) => [channel.id, channel]),
) as Record<ChannelId, (typeof channels)[number]>;

function createIntegration(id: ChannelId): IntegrationConfig {
  return {
    appId: "",
    clientSecret: "",
    accessToken: "",
    refreshToken: "",
    callbackUrl: "",
    webhookSecret: "",
    scopes: defaultScopes[id],
    status: "未設定",
    updatedAt: "未保存",
    stored: { ...emptySecretFlags },
  };
}

function createDefaultIntegrations(): Record<ChannelId, IntegrationConfig> {
  return {
    instagram: createIntegration("instagram"),
    tiktok: createIntegration("tiktok"),
    x: createIntegration("x"),
    threads: createIntegration("threads"),
  };
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

function formatDateTime(value: string | null) {
  if (!value) return "日時未設定";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTimeDuration(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? Math.round(value) : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getStatusLabel(status: DbPostRow["status"]): RecordStatus {
  if (status === "scheduled") return "予約済み";
  if (status === "published") return "公開済み";
  if (status === "failed") return "失敗";
  return "下書き";
}

function safeFileName(name: string) {
  const cleaned = name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return cleaned.slice(-120) || "file";
}

export default function SocialConsole() {
  const [activeView, setActiveView] = useState<ViewId>("compose");
  const [selectedChannels, setSelectedChannels] = useState<ChannelId[]>([]);
  const [postText, setPostText] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<LocalAttachment[]>([]);
  const [editingAttachmentId, setEditingAttachmentId] = useState<string | null>(
    null,
  );
  const [dispatchingMediaJobId, setDispatchingMediaJobId] = useState<
    string | null
  >(null);
  const [openingVideoId, setOpeningVideoId] = useState<string | null>(null);
  const [videoViewer, setVideoViewer] = useState<{
    file: SavedFile;
    url: string;
  } | null>(null);
  const videoRequestId = useRef(0);
  const [activeIntegrationId, setActiveIntegrationId] =
    useState<ChannelId>("instagram");
  const [integrations, setIntegrations] = useState<
    Record<ChannelId, IntegrationConfig>
  >(createDefaultIntegrations);
  const [showSecrets, setShowSecrets] = useState<Record<ChannelId, boolean>>({
    instagram: false,
    tiktok: false,
    x: false,
    threads: false,
  });
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [currentStore, setCurrentStore] = useState<StoreRow | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [storeSelectionRequired, setStoreSelectionRequired] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [updatingHistoryId, setUpdatingHistoryId] = useState<string | null>(
    null,
  );
  const [dataLoading, setDataLoading] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [savingIntegration, setSavingIntegration] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState(() => {
    const oauthError = readOAuthCallbackError();
    if (oauthError) clearAuthCallbackParams();
    return oauthError;
  });
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      if (!sessionUser) {
        videoRequestId.current += 1;
        setIsAdmin(false);
        setWorkspaceId(null);
        setCurrentStore(null);
        setStoreSelectionRequired(false);
        setHistory([]);
        setIntegrations(createDefaultIntegrations());
        setVideoViewer(null);
      }
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (!sessionUser) {
        videoRequestId.current += 1;
        setIsAdmin(false);
        setWorkspaceId(null);
        setCurrentStore(null);
        setStoreSelectionRequired(false);
        setHistory([]);
        setIntegrations(createDefaultIntegrations());
        setVideoViewer(null);
      }
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase
      .from("social_stores")
      .select("id, name, area, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setAuthMessage("店舗一覧を読み込めませんでした。再読み込みしてください。");
          return;
        }
        setStores((data ?? []) as StoreRow[]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user) void loadWorkspaceData(user);
  }, [user]);

  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;

    void supabase
      .from("social_admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsAdmin(Boolean(data));
      });

    return () => {
      active = false;
    };
  }, [user]);

  const selectedLabels = useMemo(
    () => selectedChannels.map((id) => channelById[id].label),
    [selectedChannels],
  );
  const storeGroups = useMemo(() => {
    const grouped = new Map<string, StoreRow[]>();
    for (const store of stores) {
      grouped.set(store.area, [...(grouped.get(store.area) ?? []), store]);
    }
    return Array.from(grouped.entries());
  }, [stores]);
  const selectedHistory = history.find(
    (record) => record.id === selectedHistoryId,
  );
  const editingAttachment = attachedFiles.find(
    (file) => file.id === editingAttachmentId,
  );
  const activeIntegration = integrations[activeIntegrationId];
  const activeChannel = channelById[activeIntegrationId];
  const secretInputType = showSecrets[activeIntegrationId]
    ? "text"
    : "password";
  const registeredCount = useMemo(
    () =>
      channels.filter((channel) =>
        ["登録済み", "入力確認済み"].includes(
          integrations[channel.id].status,
        ),
      ).length,
    [integrations],
  );
  const filteredHistory = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("ja");
    if (!query) return history;
    return history.filter((record) =>
      [record.title, record.body, record.owner, ...record.channels]
        .join(" ")
        .toLocaleLowerCase("ja")
        .includes(query),
    );
  }, [history, searchQuery]);
  const queue = filteredHistory.filter(
    (record) => record.status === "予約済み",
  );
  const analytics = useMemo(() => {
    const total = history.length;
    const scheduled = history.filter(
      (record) => record.status === "予約済み",
    ).length;
    const published = history.filter(
      (record) => record.status === "公開済み",
    ).length;
    const failed = history.filter((record) => record.status === "失敗").length;
    return [
      { label: "保存済み投稿", value: total, size: total ? "100%" : "0%" },
      {
        label: "予約中",
        value: scheduled,
        size: total ? `${Math.round((scheduled / total) * 100)}%` : "0%",
      },
      {
        label: "公開済み",
        value: published,
        size: total ? `${Math.round((published / total) * 100)}%` : "0%",
      },
      {
        label: "失敗",
        value: failed,
        size: total ? `${Math.round((failed / total) * 100)}%` : "0%",
      },
    ];
  }, [history]);

  async function loadWorkspaceData(currentUser: User) {
    if (!supabase) return;
    setDataLoading(true);
    setNotice(null);

    try {
      // Explicit SNS enrollment: never auto-import users of the shared gourmet app.
      const { error: enrollmentError } = await supabase.rpc("social_ensure_profile");
      if (enrollmentError) throw enrollmentError;

      const [profileResult, ownedWorkspaceResult] = await Promise.all([
        supabase
          .from("social_user_profiles")
          .select("store_id")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
        supabase
          .from("social_workspaces")
          .select("id, name, store_id, created_by")
          .eq("created_by", currentUser.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (ownedWorkspaceResult.error) throw ownedWorkspaceResult.error;

      let activeWorkspace =
        (ownedWorkspaceResult.data as WorkspaceRow | null) ?? null;
      if (!activeWorkspace) {
        const { data: membership, error: membershipError } = await supabase
          .from("social_workspace_members")
          .select("workspace_id")
          .eq("user_id", currentUser.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (membershipError) throw membershipError;

        if (membership) {
          const { data: memberWorkspace, error: memberWorkspaceError } =
            await supabase
              .from("social_workspaces")
              .select("id, name, store_id, created_by")
              .eq("id", membership.workspace_id)
              .single();

          if (memberWorkspaceError) throw memberWorkspaceError;
          activeWorkspace = memberWorkspace as WorkspaceRow;
        }
      }

      const metadataStoreId =
        typeof currentUser.user_metadata?.social_store_id === "string"
          ? currentUser.user_metadata.social_store_id
          : null;
      const pendingStoreId = readPendingStoreId(currentUser);
      const candidateStoreId =
        activeWorkspace?.store_id ??
        profileResult.data?.store_id ??
        pendingStoreId ??
        metadataStoreId;

      if (!candidateStoreId) {
        setWorkspaceId(null);
        setCurrentStore(null);
        setStoreSelectionRequired(true);
        setHistory([]);
        setIntegrations(createDefaultIntegrations());
        return;
      }

      const { data: selectedStore, error: selectedStoreError } = await supabase
        .from("social_stores")
        .select("id, name, area, sort_order")
        .eq("id", candidateStoreId)
        .eq("is_active", true)
        .maybeSingle();

      if (selectedStoreError) throw selectedStoreError;
      if (!selectedStore) {
        clearPendingStoreId();
        setSelectedStoreId("");
        setStoreSelectionRequired(true);
        return;
      }

      if (!profileResult.data?.store_id) {
        const { error: profileUpdateError } = await supabase
          .from("social_user_profiles")
          .update({ store_id: selectedStore.id })
          .eq("user_id", currentUser.id)
          .is("store_id", null);
        if (profileUpdateError) throw profileUpdateError;
      }

      if (!activeWorkspace || !activeWorkspace.store_id) {
        if (activeWorkspace?.created_by === currentUser.id) {
          const { data: updatedWorkspace, error: updateWorkspaceError } =
            await supabase
              .from("social_workspaces")
              .update({
                name: selectedStore.name,
                store_id: selectedStore.id,
              })
              .eq("id", activeWorkspace.id)
              .select("id, name, store_id, created_by")
              .single();
          if (updateWorkspaceError) throw updateWorkspaceError;
          activeWorkspace = updatedWorkspace as WorkspaceRow;
        } else {
          const { data: createdWorkspace, error: createError } = await supabase
            .from("social_workspaces")
            .insert({
              name: selectedStore.name,
              store_id: selectedStore.id,
              created_by: currentUser.id,
            })
            .select("id, name, store_id, created_by")
            .single();
          if (createError) throw createError;
          activeWorkspace = createdWorkspace as WorkspaceRow;
        }
      }

      if (!activeWorkspace) {
        const { data: createdWorkspace, error: createError } = await supabase
          .from("social_workspaces")
          .insert({
            name: selectedStore.name,
            store_id: selectedStore.id,
            created_by: currentUser.id,
          })
          .select("id, name, store_id, created_by")
          .single();
        if (createError) throw createError;
        activeWorkspace = createdWorkspace as WorkspaceRow;
      }

      setWorkspaceId(activeWorkspace.id);
      setCurrentStore(selectedStore as StoreRow);
      setSelectedStoreId(selectedStore.id);
      setStoreSelectionRequired(false);
      clearPendingStoreId();

      const [postsResult, integrationsResult, mediaJobsResult] =
        await Promise.all([
          supabase
            .from("social_posts")
            .select(
              "id, title, body, scheduled_at, status, owner_name, format, created_at, social_post_channels(channel), social_post_files(id, file_name, file_size, content_type, storage_path, media_variant)",
            )
            .eq("workspace_id", activeWorkspace.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("social_integrations")
            .select(
              "channel, app_id, callback_url, scopes, status, updated_at",
            )
            .eq("workspace_id", activeWorkspace.id),
          supabase
            .from("social_media_jobs")
            .select(
              "id, source_file_id, output_file_id, status, crop_config, error_message, updated_at",
            )
            .eq("workspace_id", activeWorkspace.id)
            .order("created_at", { ascending: false }),
        ]);

      if (postsResult.error) throw postsResult.error;
      if (integrationsResult.error) throw integrationsResult.error;
      if (mediaJobsResult.error) throw mediaJobsResult.error;

      const mediaJobByFileId = new Map<string, MediaJobRow>();
      for (const job of (mediaJobsResult.data ?? []) as MediaJobRow[]) {
        mediaJobByFileId.set(job.source_file_id, job);
        if (job.output_file_id) mediaJobByFileId.set(job.output_file_id, job);
      }

      const records = ((postsResult.data ?? []) as unknown as DbPostRow[]).map(
        (post) => ({
          id: post.id,
          title: post.title,
          body: post.body,
          time: formatDateTime(post.scheduled_at),
          scheduledAt: post.scheduled_at,
          channels: (post.social_post_channels ?? []).map(
            (item) => item.channel,
          ),
          status: getStatusLabel(post.status),
          owner: post.owner_name || currentUser.email || "担当者",
          format: post.format,
          savedAt: formatDateTime(post.created_at),
          files: (post.social_post_files ?? []).map((file) => ({
            id: file.id,
            name: file.file_name,
            size: Number(file.file_size),
            type: file.content_type,
            storagePath: file.storage_path,
            variant: file.media_variant,
            mediaJob: mediaJobByFileId.has(file.id)
              ? {
                  id: mediaJobByFileId.get(file.id)!.id,
                  status: mediaJobByFileId.get(file.id)!.status,
                  aspect:
                    mediaJobByFileId.get(file.id)!.crop_config.aspect,
                  errorMessage:
                    mediaJobByFileId.get(file.id)!.error_message,
                  stale: isMediaJobStale(
                    mediaJobByFileId.get(file.id)!.updated_at,
                  ),
                }
              : null,
          })),
        }),
      );

      setHistory(records);
      setSelectedHistoryId((current) =>
        current && records.some((record) => record.id === current)
          ? current
          : records[0]?.id ?? null,
      );

      const nextIntegrations = createDefaultIntegrations();
      for (const row of integrationsResult.data ?? []) {
        const channel = row.channel as ChannelId;
        if (!channelById[channel]) continue;
        nextIntegrations[channel] = {
          ...nextIntegrations[channel],
          appId: row.app_id,
          callbackUrl: row.callback_url,
          scopes: row.scopes,
          status: row.status === "configured" ? "登録済み" : "要確認",
          updatedAt: formatDateTime(row.updated_at),
        };
      }

      const { data: secretData, error: secretError } =
        await supabase.functions.invoke("social-integration-secrets", {
          body: { action: "list", workspaceId: activeWorkspace.id },
        });

      if (!secretError && secretData?.status) {
        for (const channel of channels) {
          const stored = secretData.status[channel.id] as
            | SecretFlags
            | undefined;
          if (!stored) continue;
          nextIntegrations[channel.id].stored = stored;
          if (
            nextIntegrations[channel.id].appId &&
            stored.accessToken
          ) {
            nextIntegrations[channel.id].status = "登録済み";
          }
        }
      }

      setIntegrations(nextIntegrations);
    } catch (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "データの読み込みに失敗しました。"),
      });
    } finally {
      setDataLoading(false);
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (authMode === "signup" && !selectedStoreId) {
      setAuthMessage("所属する店舗を選択してください。");
      return;
    }
    setAuthLoading(true);
    setAuthMessage("");

    if (authMode === "signup") {
      writePendingStoreId(selectedStoreId);
    } else {
      clearPendingStoreId();
    }

    const result =
      authMode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: getAuthRedirectUrl(),
              data: { social_store_id: selectedStoreId },
            },
          });

    if (result.error) {
      if (authMode === "signup") {
        clearPendingStoreId();
      }
      setAuthMessage(result.error.message);
    } else if (authMode === "signup" && !result.data.session) {
      setAuthMessage(
        "確認メールを送信しました。メール内のリンクから登録を完了してください。",
      );
    }
    setAuthLoading(false);
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    if (authMode === "signup" && !selectedStoreId) {
      setAuthMessage("所属する店舗を選択してください。");
      return;
    }
    setAuthLoading(true);
    setAuthMessage("");

    if (authMode === "signup") {
      writePendingStoreId(selectedStoreId);
    } else {
      clearPendingStoreId();
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(),
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      if (authMode === "signup") {
        clearPendingStoreId();
      }
      setAuthMessage(error.message);
      setAuthLoading(false);
      return;
    }

    if (data.url) {
      window.location.assign(data.url);
      return;
    }

    setAuthMessage("Google認証を開始できませんでした。");
    setAuthLoading(false);
  }

  async function completeStoreAssignment() {
    if (!supabase || !user || !selectedStoreId) {
      setAuthMessage("所属する店舗を選択してください。");
      return;
    }

    const selectedStore = stores.find(
      (store) => store.id === selectedStoreId,
    );
    if (!selectedStore) {
      setAuthMessage("店舗一覧を再読み込みして選択してください。");
      return;
    }

    setSavingStore(true);
    setAuthMessage("");

    try {
      const { error: profileError } = await supabase
        .from("social_user_profiles")
        .update({ store_id: selectedStore.id })
        .eq("user_id", user.id)
        .is("store_id", null);
      if (profileError) throw profileError;

      writePendingStoreId(selectedStore.id);
      await loadWorkspaceData(user);
    } catch (error) {
      setAuthMessage(
        getErrorMessage(error, "所属店舗を保存できませんでした。"),
      );
    } finally {
      setSavingStore(false);
    }
  }

  async function sendPasswordReset() {
    if (!supabase || !email.trim()) {
      setAuthMessage("メールアドレスを入力してください。");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getAuthRedirectUrl(),
    });
    setAuthMessage(
      error
        ? error.message
        : "パスワード再設定メールを送信しました。",
    );
  }

  function toggleChannel(id: ChannelId) {
    setSelectedChannels((current) =>
      current.includes(id)
        ? current.filter((channelId) => channelId !== id)
        : [...current, id],
    );
  }

  function optimizeCopy() {
    const base =
      postText.trim() ||
      "投稿本文を入力すると、運用向けの文面に整えられます。";
    setPostText(
      `${base}\n\n詳細はプロフィールのリンクからご確認ください。\n#SNS運用 #マーケティング`,
    );
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!picked.length) return;

    const available = Math.max(0, 4 - attachedFiles.length);
    const accepted = picked
      .filter((file) => file.size <= 50 * 1024 * 1024)
      .slice(0, available)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        previewUrl: file.type.startsWith("video/")
          ? URL.createObjectURL(file)
          : "",
        crop: null,
      }));

    setAttachedFiles((current) => [...current, ...accepted]);
    if (accepted.length !== picked.length) {
      setNotice({
        tone: "info",
        text: "添付は最大4件、1ファイル50MBまでです。",
      });
    }
  }

  function removeAttachment(id: string) {
    setAttachedFiles((current) => {
      const target = current.find((file) => file.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((file) => file.id !== id);
    });
    if (editingAttachmentId === id) setEditingAttachmentId(null);
  }

  function saveAttachmentCrop(id: string, crop: MediaCropConfig) {
    setAttachedFiles((current) =>
      current.map((file) => (file.id === id ? { ...file, crop } : file)),
    );
    setEditingAttachmentId(null);
  }

  async function schedulePost() {
    if (
      !supabase ||
      !user ||
      !workspaceId ||
      !postText.trim() ||
      !selectedChannels.length ||
      !scheduledAt
    ) {
      setNotice({
        tone: "error",
        text: "本文、投稿先、公開予定日時を入力してください。",
      });
      return;
    }
    if (!isFutureScheduleTime(scheduledAt)) {
      setNotice({
        tone: "error",
        text: "公開予定は現在より後の日時を指定してください。",
      });
      return;
    }

    setSavingPost(true);
    setNotice(null);
    let postId: string | null = null;
    const uploadedStoragePaths: string[] = [];
    let mediaJobCount = 0;
    let cloudRunConnected = true;

    try {
      const title =
        postText.trim().replace(/\s+/g, " ").slice(0, 48) ||
        "予約投稿";
      const format = selectedChannels.includes("tiktok")
        ? "Short / Reel"
        : "Post";

      const { data: post, error: postError } = await supabase
        .from("social_posts")
        .insert({
          workspace_id: workspaceId,
          title,
          body: postText.trim(),
          scheduled_at: new Date(scheduledAt).toISOString(),
          status: "scheduled",
          owner_name: user.email ?? "担当者",
          format,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (postError) throw postError;
      postId = post.id;

      const { error: channelError } = await supabase
        .from("social_post_channels")
        .insert(
          selectedChannels.map((channel) => ({
            post_id: post.id,
            channel,
          })),
        );
      if (channelError) throw channelError;

      for (const attachment of attachedFiles) {
        const storagePath = `${workspaceId}/${post.id}/${crypto.randomUUID()}-${safeFileName(attachment.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("social-post-files")
          .upload(storagePath, attachment.file, {
            contentType: attachment.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedStoragePaths.push(storagePath);

        const { data: savedFile, error: fileError } = await supabase
          .from("social_post_files")
          .insert({
            workspace_id: workspaceId,
            post_id: post.id,
            storage_path: storagePath,
            file_name: attachment.name,
            content_type: attachment.type,
            file_size: attachment.size,
            created_by: user.id,
            media_variant: "original",
          })
          .select("id")
          .single();
        if (fileError) throw fileError;

        if (attachment.type.startsWith("video/") && attachment.crop) {
          const { data: mediaJob, error: mediaJobError } = await supabase
            .from("social_media_jobs")
            .insert({
              workspace_id: workspaceId,
              post_id: post.id,
              source_file_id: savedFile.id,
              requested_by: user.id,
              operation: "crop",
              crop_config: attachment.crop,
              status: "queued",
            })
            .select("id")
            .single();
          if (mediaJobError) throw mediaJobError;
          mediaJobCount += 1;

          const { data: dispatchData, error: dispatchError } =
            await supabase.functions.invoke("social-media-jobs", {
              body: { action: "dispatch", jobId: mediaJob.id },
            });
          if (dispatchError || dispatchData?.configured === false) {
            cloudRunConnected = false;
          }
        }
      }

      for (const attachment of attachedFiles) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      setPostText("");
      setScheduledAt("");
      setAttachedFiles([]);
      setNotice({
        tone: cloudRunConnected ? "success" : "info",
        text:
          mediaJobCount === 0
            ? "予約投稿と添付ファイルをSupabaseへ保存しました。"
            : cloudRunConnected
              ? `予約投稿を保存し、動画処理${mediaJobCount}件を開始しました。`
              : `予約投稿を保存し、動画処理${mediaJobCount}件をキューへ登録しました。Cloud Run接続後に処理されます。`,
      });
      await loadWorkspaceData(user);
      setActiveView("calendar");
    } catch (error) {
      if (postId) {
        await rollbackFailedSchedule(postId, uploadedStoragePaths);
      }
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "予約投稿の保存に失敗しました。"),
      });
    } finally {
      setSavingPost(false);
    }
  }

  async function rollbackFailedSchedule(
    postId: string,
    storagePaths: string[],
  ) {
    if (!supabase) return;
    if (storagePaths.length) {
      await supabase.storage.from("social-post-files").remove(storagePaths);
    }
    const { error } = await supabase
      .from("social_posts")
      .delete()
      .eq("id", postId);
    if (error) {
      await supabase
        .from("social_posts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", postId);
    }
  }

  async function cancelScheduledPost(postId: string) {
    if (!supabase || !user) return;
    const target = history.find((record) => record.id === postId);
    if (!target || target.status !== "予約済み") return;
    if (!window.confirm("この予約投稿をキャンセルして下書きに戻しますか？")) {
      return;
    }

    setNotice(null);
    const { data: updatedPost, error } = await supabase
      .from("social_posts")
      .update({
        status: "draft",
        scheduled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();

    if (error || !updatedPost) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "予約投稿のキャンセルに失敗しました。"),
      });
      return;
    }

    setNotice({
      tone: "success",
      text: "予約投稿をキャンセルし、下書きに戻しました。",
    });
    await loadWorkspaceData(user);
  }

  async function rescheduleDraftPost(postId: string) {
    if (!supabase || !user) return;
    const target = history.find((record) => record.id === postId);
    if (
      !target ||
      (target.status !== "下書き" && target.status !== "失敗")
    ) {
      return;
    }
    if (!isFutureScheduleTime(rescheduleAt)) {
      setNotice({
        tone: "error",
        text: "公開予定は現在より後の日時を指定してください。",
      });
      return;
    }

    setUpdatingHistoryId(postId);
    setNotice(null);
    const { data: updatedPost, error } = await supabase
      .from("social_posts")
      .update({
        status: "scheduled",
        scheduled_at: new Date(rescheduleAt).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .in("status", ["draft", "failed"])
      .select("id")
      .maybeSingle();

    if (error || !updatedPost) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "再予約できませんでした。"),
      });
      setUpdatingHistoryId(null);
      return;
    }

    setNotice({
      tone: "success",
      text: "下書きを予約投稿として保存しました。",
    });
    setUpdatingHistoryId(null);
    await loadWorkspaceData(user);
    setActiveView("calendar");
  }

  async function deleteSavedPost(postId: string) {
    if (!supabase || !user) return;
    const target = history.find((record) => record.id === postId);
    if (
      !target ||
      (target.status !== "下書き" && target.status !== "失敗")
    ) {
      return;
    }
    if (
      !window.confirm(
        "この投稿と添付ファイルを削除します。この操作は取り消せません。",
      )
    ) {
      return;
    }

    setUpdatingHistoryId(postId);
    setNotice(null);
    const storagePaths = target.files.map((file) => file.storagePath);
    if (storagePaths.length) {
      const { error: storageError } = await supabase.storage
        .from("social-post-files")
        .remove(storagePaths);
      if (storageError) {
        setNotice({
          tone: "error",
          text: getErrorMessage(
            storageError,
            "添付ファイルを削除できませんでした。",
          ),
        });
        setUpdatingHistoryId(null);
        return;
      }
    }

    const { error } = await supabase
      .from("social_posts")
      .delete()
      .eq("id", postId)
      .in("status", ["draft", "failed"]);

    if (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "投稿を削除できませんでした。"),
      });
      setUpdatingHistoryId(null);
      return;
    }

    if (selectedHistoryId === postId) {
      setSelectedHistoryId(null);
      setRescheduleAt("");
    }
    setNotice({
      tone: "success",
      text: "投稿を削除しました。",
    });
    setUpdatingHistoryId(null);
    await loadWorkspaceData(user);
  }

  async function downloadFile(file: SavedFile) {
    if (!supabase) return;
    const { data, error } = await supabase.storage
      .from("social-post-files")
      .createSignedUrl(file.storagePath, 60, { download: file.name });
    if (error || !data?.signedUrl) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "ダウンロードURLを作成できませんでした。"),
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
      link.download = file.name;
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

  async function openVideoViewer(file: SavedFile) {
    if (!supabase || !file.type.startsWith("video/")) return;
    const requestId = videoRequestId.current + 1;
    videoRequestId.current = requestId;
    setOpeningVideoId(file.id);
    setNotice(null);
    try {
      const { data, error } = await supabase.storage
        .from("social-post-files")
        .createSignedUrl(file.storagePath, 60 * 60);
      if (error) throw error;
      if (requestId !== videoRequestId.current) return;
      setVideoViewer({ file, url: data.signedUrl });
    } catch (error) {
      if (requestId !== videoRequestId.current) return;
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "動画をアプリ内で開けませんでした。"),
      });
    } finally {
      if (requestId === videoRequestId.current) setOpeningVideoId(null);
    }
  }

  function closeVideoViewer() {
    videoRequestId.current += 1;
    setOpeningVideoId(null);
    setVideoViewer(null);
  }

  async function dispatchMediaJob(jobId: string) {
    if (!supabase || !user) return;
    setDispatchingMediaJobId(jobId);
    setNotice(null);
    try {
      const { data, error } = await supabase.functions.invoke("social-media-jobs", {
        body: { action: "dispatch", jobId },
      });
      if (error) throw error;
      setNotice({
        tone: data?.configured === false ? "info" : "success",
        text:
          data?.configured === false
            ? "処理待ちとして保存されています。Cloud Run接続後に再実行してください。"
            : "メディア処理を開始しました。",
      });
      await loadWorkspaceData(user);
    } catch (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "メディア処理を開始できませんでした。"),
      });
    } finally {
      setDispatchingMediaJobId(null);
    }
  }

  function updateIntegration(
    id: ChannelId,
    key: keyof IntegrationConfig,
    value: string,
  ) {
    setIntegrations((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [key]: value,
        status:
          current[id].status === "未設定" ? "未設定" : "要確認",
      },
    }));
  }

  async function saveIntegration(id: ChannelId) {
    if (!supabase || !user || !workspaceId) return;
    const target = integrations[id];
    const hasAccessToken =
      Boolean(target.accessToken.trim()) || target.stored.accessToken;
    if (!target.appId.trim() || !hasAccessToken) {
      setNotice({
        tone: "error",
        text: "Client ID / App ID と Access Token は必須です。",
      });
      return;
    }

    setSavingIntegration(true);
    setNotice(null);

    try {
      const { error: metadataError } = await supabase
        .from("social_integrations")
        .upsert(
          {
            workspace_id: workspaceId,
            channel: id,
            app_id: target.appId.trim(),
            callback_url: target.callbackUrl.trim(),
            scopes: target.scopes.trim(),
            status: "configured",
            created_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,channel" },
        );
      if (metadataError) throw metadataError;

      const { data, error: secretError } = await supabase.functions.invoke(
        "social-integration-secrets",
        {
          body: {
            action: "save",
            workspaceId,
            channel: id,
            secrets: {
              clientSecret: target.clientSecret,
              accessToken: target.accessToken,
              refreshToken: target.refreshToken,
              webhookSecret: target.webhookSecret,
            },
          },
        },
      );
      if (secretError) {
        await supabase
          .from("social_integrations")
          .update({
            status: "incomplete",
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId)
          .eq("channel", id);
        throw secretError;
      }

      setIntegrations((current) => ({
        ...current,
        [id]: {
          ...current[id],
          clientSecret: "",
          accessToken: "",
          refreshToken: "",
          webhookSecret: "",
          stored: data.status as SecretFlags,
          status: "登録済み",
          updatedAt: formatDateTime(new Date().toISOString()),
        },
      }));
      setNotice({
        tone: "success",
        text: `${channelById[id].label}の認証情報を安全に保存しました。`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "連携情報の保存に失敗しました。"),
      });
    } finally {
      setSavingIntegration(false);
    }
  }

  function checkIntegrationInput(id: ChannelId) {
    const target = integrations[id];
    const ready =
      Boolean(target.appId.trim()) &&
      (Boolean(target.accessToken.trim()) || target.stored.accessToken);
    setIntegrations((current) => ({
      ...current,
      [id]: {
        ...current[id],
        status: ready ? "入力確認済み" : "要確認",
      },
    }));
    setNotice({
      tone: ready ? "success" : "error",
      text: ready
        ? "必須項目を確認しました。登録ボタンで保存してください。"
        : "Client ID / App ID と Access Token を確認してください。",
    });
  }

  async function clearIntegration(id: ChannelId) {
    if (!supabase || !workspaceId) return;
    setSavingIntegration(true);
    setNotice(null);

    try {
      const { error: secretError } = await supabase.functions.invoke(
        "social-integration-secrets",
        { body: { action: "delete", workspaceId, channel: id } },
      );
      if (secretError) throw secretError;

      const { error: metadataError } = await supabase
        .from("social_integrations")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("channel", id);
      if (metadataError) throw metadataError;

      setIntegrations((current) => ({
        ...current,
        [id]: createIntegration(id),
      }));
      setNotice({
        tone: "success",
        text: `${channelById[id].label}の連携情報を削除しました。`,
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: getErrorMessage(error, "連携情報の削除に失敗しました。"),
      });
    } finally {
      setSavingIntegration(false);
    }
  }

  function getStatusTone(status: ApiStatus) {
    if (status === "登録済み" || status === "入力確認済み") return "ready";
    if (status === "要確認") return "warning";
    return "idle";
  }

  if (authLoading) {
    return (
      <main className="auth-shell">
        <Loader2 className="spin" aria-hidden="true" size={28} />
        <p>安全な接続を確認しています</p>
      </main>
    );
  }

  if (!supabase) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-mark">IX</div>
          <h1>設定が必要です</h1>
          <p>Supabaseの公開URLとPublishable Keyを設定してください。</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="auth-brand">
            <div className="brand-mark">IX</div>
            <div>
              <p className="eyebrow">SNS Ops Console</p>
              <h1>Instatic TalksX</h1>
            </div>
          </div>
          <div className="auth-heading">
            <LockKeyhole aria-hidden="true" size={20} />
            <div>
              <h2>{authMode === "signin" ? "ログイン" : "利用者登録"}</h2>
              <p>業務データはアカウントごとに保護されます。</p>
            </div>
          </div>
          {authMode === "signup" && (
            <label className="auth-store-field">
              <span>所属店舗</span>
              <select
                value={selectedStoreId}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                required
              >
                <option value="">店舗を選択してください</option>
                {storeGroups.map(([area, areaStores]) => (
                  <optgroup key={area} label={area}>
                    {areaStores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          {googleAuthEnabled && (
            <>
              <Button
                className="auth-provider-button"
                type="button"
                variant="secondary"
                isDisabled={authLoading}
                onPress={() => void signInWithGoogle()}
              >
                <KeyRound aria-hidden="true" size={18} />
                <span>Googleで続ける</span>
              </Button>
              <div className="auth-divider" aria-hidden="true">
                <span>または</span>
              </div>
            </>
          )}
          <form className="auth-form" onSubmit={handleAuth}>
            <label>
              <span>メールアドレス</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              <span>パスワード</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  authMode === "signin" ? "current-password" : "new-password"
                }
                minLength={authMode === "signup" ? 12 : undefined}
                required
              />
            </label>
            {authMessage && <p className="auth-message">{authMessage}</p>}
            <Button
              className="primary-button"
              type="submit"
              variant="primary"
              isDisabled={authLoading}
            >
              {authLoading ? (
                <Loader2 className="spin" aria-hidden="true" size={18} />
              ) : (
                <ShieldCheck aria-hidden="true" size={18} />
              )}
              <span>{authMode === "signin" ? "ログイン" : "登録する"}</span>
            </Button>
          </form>
          <div className="auth-actions">
            <button
              type="button"
              onClick={() => {
                setAuthMode((current) =>
                  current === "signin" ? "signup" : "signin",
                );
                setAuthMessage("");
              }}
            >
              {authMode === "signin"
                ? "初めて利用する方"
                : "登録済みの方"}
            </button>
            <button type="button" onClick={sendPasswordReset}>
              パスワードを再設定
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (storeSelectionRequired) {
    return (
      <main className="auth-shell">
        <section className="auth-panel store-onboarding-panel">
          <div className="auth-brand">
            <div className="brand-mark">IX</div>
            <div>
              <p className="eyebrow">Store Assignment</p>
              <h1>所属店舗を設定</h1>
            </div>
          </div>
          <div className="auth-heading">
            <Building2 aria-hidden="true" size={20} />
            <div>
              <h2>運用する店舗を選択</h2>
              <p>投稿・予約・履歴は選択した店舗単位で管理されます。</p>
            </div>
          </div>
          <label className="auth-store-field">
            <span>所属店舗</span>
            <select
              value={selectedStoreId}
              onChange={(event) => setSelectedStoreId(event.target.value)}
            >
              <option value="">店舗を選択してください</option>
              {storeGroups.map(([area, areaStores]) => (
                <optgroup key={area} label={area}>
                  {areaStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {authMessage && <p className="auth-message">{authMessage}</p>}
          <Button
            className="primary-button"
            type="button"
            variant="primary"
            isDisabled={savingStore || !selectedStoreId}
            onPress={() => void completeStoreAssignment()}
          >
            {savingStore ? (
              <Loader2 className="spin" aria-hidden="true" size={18} />
            ) : (
              <Building2 aria-hidden="true" size={18} />
            )}
            <span>この店舗で開始</span>
          </Button>
          <button
            className="store-onboarding-signout"
            type="button"
            onClick={() => void supabase?.auth.signOut({ scope: "local" })}
          >
            別のアカウントでログイン
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      <main className="app-shell">
      <aside className="sidebar" aria-label="SNS管理メニュー">
        <div className="brand-lockup">
          <div className="brand-mark">IX</div>
          <div>
            <p className="eyebrow">SNS Ops Console</p>
            <h1>Instatic TalksX</h1>
          </div>
        </div>

        <div className="store-context" aria-label="現在の店舗">
          <Building2 aria-hidden="true" size={17} />
          <div>
            <small>所属店舗</small>
            <strong>{currentStore?.name ?? "店舗未設定"}</strong>
          </div>
        </div>

        <nav className="view-tabs" aria-label="表示切り替え">
          {views.map((view) => {
            const Icon = view.icon;
            return (
              <button
                key={view.id}
                className={
                  activeView === view.id ? "view-tab active" : "view-tab"
                }
                type="button"
                onClick={() => setActiveView(view.id)}
                aria-pressed={activeView === view.id}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{view.label}</span>
              </button>
            );
          })}
          {isAdmin && (
            <a className="view-tab admin-nav-link" href={appPath("/admin/")}>
              <ShieldCheck aria-hidden="true" size={18} />
              <span>管理者</span>
            </a>
          )}
        </nav>

        <section className="account-stack" aria-label="接続アカウント">
          <div className="section-title">
            <ShieldCheck aria-hidden="true" size={17} />
            <span>接続アカウント</span>
          </div>
          {channels.map((channel) => (
            <button
              className="account-row"
              key={channel.id}
              type="button"
              onClick={() => {
                setActiveIntegrationId(channel.id);
                setActiveView("settings");
              }}
            >
              <span className={`network-badge ${channel.tone}`}>
                {channel.label.slice(0, 2)}
              </span>
              <span>
                <strong>{channel.label}</strong>
                <small>API設定</small>
              </span>
              <span className="account-health">
                {integrations[channel.id].status}
              </span>
            </button>
          ))}
        </section>

        <div className="user-panel">
          <div>
            <strong>{user.email}</strong>
            <small>{currentStore?.name ?? "店舗未設定"} / Supabaseで保護</small>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="ログアウト"
            onClick={() => void supabase?.auth.signOut({ scope: "local" })}
          >
            <LogOut aria-hidden="true" size={17} />
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {currentStore?.name ?? "店舗未設定"} / 本日の運用
            </p>
            <h2>
              {activeView === "compose" && "投稿を作成"}
              {activeView === "calendar" && "予約一覧"}
              {activeView === "history" && "投稿履歴"}
              {activeView === "inbox" && "コメントとDM"}
              {activeView === "analytics" && "運用集計"}
              {activeView === "settings" && "連携設定"}
            </h2>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">検索</span>
              <input
                placeholder="投稿本文を検索"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <button
              className="icon-button"
              type="button"
              aria-label="同期"
              onClick={() => void loadWorkspaceData(user)}
              disabled={dataLoading}
            >
              <RefreshCcw
                className={dataLoading ? "spin" : undefined}
                aria-hidden="true"
                size={18}
              />
            </button>
            <button
              className={
                activeView === "settings"
                  ? "icon-button active-icon"
                  : "icon-button"
              }
              type="button"
              aria-label="連携設定"
              onClick={() => setActiveView("settings")}
            >
              <Settings2 aria-hidden="true" size={18} />
            </button>
          </div>
        </header>

        {notice && (
          <div className={`app-notice ${notice.tone}`} role="status">
            {notice.tone === "success" ? (
              <CheckCircle2 aria-hidden="true" size={17} />
            ) : notice.tone === "error" ? (
              <AlertCircle aria-hidden="true" size={17} />
            ) : (
              <Cloud aria-hidden="true" size={17} />
            )}
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="通知を閉じる"
            >
              閉じる
            </button>
          </div>
        )}

        <section className="status-strip" aria-label="運用状況">
          <div>
            <span>保存済み</span>
            <strong>{history.length}件</strong>
          </div>
          <div>
            <span>予約中</span>
            <strong>{queue.length}件</strong>
          </div>
          <div>
            <span>保存先</span>
            <strong>Supabase</strong>
          </div>
          <div>
            <span>API設定</span>
            <strong>
              {registeredCount === channels.length
                ? "完了"
                : `${registeredCount}/${channels.length}`}
            </strong>
          </div>
        </section>

        {activeView === "compose" && (
          <section className="compose-layout" aria-label="投稿作成">
            <div className="composer-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Composer</p>
                  <h3>予約投稿を保存</h3>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={optimizeCopy}
                >
                  <Wand2 aria-hidden="true" size={17} />
                  <span>文面を整える</span>
                </button>
              </div>

              <label className="field-label" htmlFor="post-copy">
                投稿本文
              </label>
              <textarea
                id="post-copy"
                value={postText}
                onChange={(event) => setPostText(event.target.value)}
                maxLength={2200}
                placeholder="投稿する内容を入力"
              />
              <div className="field-meta">
                <span>{postText.length}/2200</span>
                <span>
                  {selectedLabels.join(" / ") || "投稿先未選択"}
                </span>
              </div>

              <div className="file-upload-row">
                <label className="file-upload-button">
                  <Paperclip aria-hidden="true" size={17} />
                  <span>ファイルを添付</span>
                  <input
                    type="file"
                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                    multiple
                    onChange={handleFileSelection}
                  />
                </label>
                <span className="file-upload-note">
                  最大4ファイル / 1ファイル50MBまで
                </span>
              </div>

              {attachedFiles.length > 0 && (
                <>
                  <div className="attachment-list" aria-label="添付ファイル">
                    {attachedFiles.map((file) => (
                      <div className="attachment-chip" key={file.id}>
                        {file.type.startsWith("video/") ? (
                          <Video aria-hidden="true" size={15} />
                        ) : (
                          <FileText aria-hidden="true" size={15} />
                        )}
                        <span>
                          {file.name}
                          {file.crop && (
                            <em>
                              {file.crop.aspect} / 拡大{file.crop.zoom}%
                              {file.crop.endTime != null &&
                                ` / ${formatDateTimeDuration(
                                  Math.max(
                                    0,
                                    file.crop.endTime -
                                      (file.crop.startTime ?? 0) -
                                      (file.crop.cuts ?? []).reduce(
                                        (total, cut) =>
                                          total + Math.max(0, cut.end - cut.start),
                                        0,
                                      ),
                                  ),
                                )}`}
                            </em>
                          )}
                        </span>
                        <small>{formatFileSize(file.size)}</small>
                        {file.type.startsWith("video/") && (
                          <button
                            aria-label={`${file.name}の動画編集`}
                            className="attachment-edit-button"
                            onClick={() => setEditingAttachmentId(file.id)}
                            title="動画編集"
                            type="button"
                          >
                            <Scissors aria-hidden="true" size={14} />
                            <span>動画編集</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(file.id)}
                          aria-label={`${file.name}を削除`}
                        >
                          <Trash2 aria-hidden="true" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {attachedFiles.some(
                    (file) => file.type.startsWith("video/") && file.crop,
                  ) && (
                    <p className="media-processing-note">
                      <Cloud aria-hidden="true" size={15} />
                      元動画を保持し、カット・時間調整・クロップを反映したMP4をバックグラウンドで生成します。
                    </p>
                  )}
                </>
              )}

              <div className="channel-toggle-grid" aria-label="投稿先">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    className={
                      selectedChannels.includes(channel.id)
                        ? `channel-toggle ${channel.tone} active`
                        : `channel-toggle ${channel.tone}`
                    }
                    onClick={() => toggleChannel(channel.id)}
                    aria-pressed={selectedChannels.includes(channel.id)}
                  >
                    <span className={`network-badge ${channel.tone}`}>
                      {channel.label.slice(0, 2)}
                    </span>
                    <span>
                      <strong>{channel.label}</strong>
                      <small>{integrations[channel.id].status}</small>
                    </span>
                    {selectedChannels.includes(channel.id) && (
                      <CheckCircle2 aria-hidden="true" size={18} />
                    )}
                  </button>
                ))}
              </div>

              <div className="schedule-row">
                <label>
                  <span>公開予定</span>
                  <input
                    type="datetime-local"
                    min={toDateTimeLocalValue(new Date())}
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                  />
                </label>
                <Button
                  className="primary-button"
                  type="button"
                  variant="primary"
                  onPress={schedulePost}
                  isDisabled={savingPost}
                >
                  {savingPost ? (
                    <Loader2 className="spin" aria-hidden="true" size={18} />
                  ) : (
                    <Plus aria-hidden="true" size={18} />
                  )}
                  <span>予約として保存</span>
                </Button>
              </div>
            </div>

            <aside className="preview-panel" aria-label="保存内容">
              <div className="storage-summary">
                <Database aria-hidden="true" size={24} />
                <div>
                  <p className="eyebrow">Protected storage</p>
                  <h3>Supabaseへ保存</h3>
                </div>
                <dl>
                  <div>
                    <dt>本文・履歴</dt>
                    <dd>Database</dd>
                  </div>
                  <div>
                    <dt>画像・動画</dt>
                    <dd>Private Storage</dd>
                  </div>
                  <div>
                    <dt>アクセス</dt>
                    <dd
                      className={
                        user
                          ? "storage-access authenticated"
                          : "storage-access"
                      }
                      aria-live="polite"
                    >
                      {user && (
                        <CheckCircle2 aria-hidden="true" size={15} />
                      )}
                      <span>{user ? "認証済み" : "ログイン必須"}</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </aside>
          </section>
        )}

        {activeView === "calendar" && (
          <section className="calendar-layout" aria-label="予約投稿一覧">
            <div className="calendar-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Schedule</p>
                  <h3>予約投稿</h3>
                </div>
                <span className="count-pill">{queue.length}件</span>
              </div>
              <div className="queue-list">
                {queue.length ? (
                  queue.map((post) => (
                    <article className="queue-card" key={post.id}>
                      <div className="queue-time">
                        <Clock3 aria-hidden="true" size={16} />
                        <span>{post.time}</span>
                      </div>
                      <div>
                        <h4>{post.title}</h4>
                        <p>
                          {post.format} / 担当 {post.owner}
                        </p>
                        <div className="mini-badge-row">
                          {post.channels.map((channelId) => (
                            <span
                              className={`mini-badge ${channelById[channelId].tone}`}
                              key={`${post.id}-${channelId}`}
                            >
                              {channelById[channelId].label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="queue-actions">
                        <span className="status-pill ready">{post.status}</span>
                        <button
                          className="queue-cancel-button"
                          type="button"
                          onClick={() => void cancelScheduledPost(post.id)}
                          aria-label={`${post.title}の予約をキャンセル`}
                        >
                          <XCircle aria-hidden="true" size={15} />
                          <span>キャンセル</span>
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <CalendarDays aria-hidden="true" size={24} />
                    <h3>予約投稿はありません</h3>
                    <p>投稿画面から予約内容を保存すると、ここに表示されます。</p>
                  </div>
                )}
              </div>
            </div>
            <aside className="approval-panel">
              <div className="section-title">
                <ShieldCheck aria-hidden="true" size={17} />
                <span>運用状態</span>
              </div>
              <div className="approval-step done">
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>ログイン認証</span>
              </div>
              <div className="approval-step done">
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>履歴の永続保存</span>
              </div>
              <div className="approval-step done">
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>非公開ファイル保存</span>
              </div>
              <div className="approval-step current">
                <AlertCircle aria-hidden="true" size={17} />
                <span>SNS公開処理はAPI審査後</span>
              </div>
            </aside>
          </section>
        )}

        {activeView === "history" && (
          <section className="history-layout" aria-label="投稿履歴">
            <div className="history-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Archive</p>
                  <h3>過去の投稿</h3>
                </div>
                <span className="count-pill">
                  {filteredHistory.length}件
                </span>
              </div>
              <div className="history-list">
                {filteredHistory.length ? (
                  filteredHistory.map((record) => (
                    <button
                      className={
                        selectedHistoryId === record.id
                          ? "history-card active"
                          : "history-card"
                      }
                      key={record.id}
                      type="button"
                      onClick={() => {
                        setSelectedHistoryId(record.id);
                        setRescheduleAt(
                          toDateTimeLocalValue(
                            new Date(Date.now() + 60 * 60 * 1000),
                          ),
                        );
                      }}
                    >
                      <div className="history-card-main">
                        <strong>{record.title}</strong>
                        <small>
                          {record.time} / {record.owner} / {record.format}
                        </small>
                        <div className="mini-badge-row">
                          {record.channels.map((channelId) => (
                            <span
                              className={`mini-badge ${channelById[channelId].tone}`}
                              key={`${record.id}-${channelId}`}
                            >
                              {channelById[channelId].label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span
                        className={`status-pill ${
                          record.status === "失敗" ? "warning" : "ready"
                        }`}
                      >
                        {record.status}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="empty-state compact">
                    <History aria-hidden="true" size={22} />
                    <p>保存済みの投稿はありません。</p>
                  </div>
                )}
              </div>
            </div>

            <aside className="history-detail-panel">
              {selectedHistory ? (
                <>
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Post Detail</p>
                      <h3>{selectedHistory.title}</h3>
                    </div>
                    <History aria-hidden="true" size={20} />
                  </div>
                  <div className="history-detail-meta">
                    <span>{selectedHistory.status}</span>
                    <span>{selectedHistory.time}</span>
                    <span>保存日時 {selectedHistory.savedAt}</span>
                  </div>
                  <p className="history-body">{selectedHistory.body}</p>
                  <div className="mini-badge-row">
                    {selectedHistory.channels.map((channelId) => (
                      <span
                        className={`mini-badge ${channelById[channelId].tone}`}
                        key={`detail-${selectedHistory.id}-${channelId}`}
                      >
                        {channelById[channelId].label}
                      </span>
                    ))}
                  </div>
                  {(selectedHistory.status === "下書き" ||
                    selectedHistory.status === "失敗") && (
                    <div className="history-recovery">
                      <label>
                        <span>公開予定</span>
                        <input
                          type="datetime-local"
                          min={toDateTimeLocalValue(new Date())}
                          value={rescheduleAt}
                          onChange={(event) =>
                            setRescheduleAt(event.target.value)
                          }
                        />
                      </label>
                      <div className="history-recovery-actions">
                        <button
                          className="history-reschedule-button"
                          disabled={updatingHistoryId === selectedHistory.id}
                          type="button"
                          onClick={() =>
                            void rescheduleDraftPost(selectedHistory.id)
                          }
                        >
                          {updatingHistoryId === selectedHistory.id ? (
                            <Loader2
                              aria-hidden="true"
                              className="spin"
                              size={14}
                            />
                          ) : (
                            <CalendarDays aria-hidden="true" size={14} />
                          )}
                          <span>再予約</span>
                        </button>
                        <button
                          className="history-delete-button"
                          disabled={updatingHistoryId === selectedHistory.id}
                          type="button"
                          onClick={() =>
                            void deleteSavedPost(selectedHistory.id)
                          }
                        >
                          <Trash2 aria-hidden="true" size={14} />
                          <span>削除</span>
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="history-files">
                    <div className="section-title">
                      <Paperclip aria-hidden="true" size={16} />
                      <span>保存ファイル</span>
                    </div>
                    {selectedHistory.files.length ? (
                      selectedHistory.files.map((file) => (
                        <div className="saved-file-item" key={file.id}>
                          <button
                            aria-label={
                              file.type.startsWith("video/")
                                ? `${file.name}をアプリ内で再生`
                                : `${file.name}をダウンロード`
                            }
                            className="saved-file-row"
                            disabled={openingVideoId === file.id}
                            title={
                              file.type.startsWith("video/")
                                ? "アプリ内で動画を再生"
                                : "ファイルをダウンロード"
                            }
                            type="button"
                            onClick={() =>
                              file.type.startsWith("video/")
                                ? void openVideoViewer(file)
                                : void downloadFile(file)
                            }
                          >
                            {file.type.startsWith("video/") ? (
                              <Video aria-hidden="true" size={17} />
                            ) : (
                              <FileText aria-hidden="true" size={17} />
                            )}
                            <span>
                              <strong>{file.name}</strong>
                              <small>
                                {formatFileSize(file.size)}
                                {file.type.startsWith("video/") &&
                                  " / アプリ内再生"}
                                {file.variant === "processed" && " / 編集済み"}
                                {file.mediaJob?.status === "queued" &&
                                  ` / ${file.mediaJob.aspect} 処理待ち`}
                                {file.mediaJob?.status === "dispatching" &&
                                  ` / ${file.mediaJob.aspect} 起動待ち`}
                                {file.mediaJob?.status === "processing" &&
                                  ` / ${file.mediaJob.aspect} 処理中`}
                                {file.mediaJob?.status === "failed" &&
                                  " / 動画処理失敗"}
                              </small>
                            </span>
                            {openingVideoId === file.id ? (
                              <Loader2
                                aria-hidden="true"
                                className="spin"
                                size={16}
                              />
                            ) : file.type.startsWith("video/") ? (
                              <Play aria-hidden="true" size={16} />
                            ) : (
                              <Download aria-hidden="true" size={16} />
                            )}
                          </button>
                          <div className="saved-file-actions">
                            {file.type.startsWith("video/") && (
                              <button
                                aria-label={`${file.name}をダウンロード`}
                                className="saved-file-action"
                                onClick={() => void downloadFile(file)}
                                type="button"
                              >
                                <Download aria-hidden="true" size={14} />
                                <span>保存</span>
                              </button>
                            )}
                            {file.variant === "original" &&
                              file.mediaJob &&
                              (["queued", "failed"].includes(
                                file.mediaJob.status,
                              ) ||
                                (["dispatching", "processing"].includes(
                                  file.mediaJob.status,
                                ) &&
                                  file.mediaJob.stale)) && (
                                <button
                                  className="media-job-retry"
                                  disabled={
                                    dispatchingMediaJobId === file.mediaJob.id
                                  }
                                  onClick={() =>
                                    void dispatchMediaJob(file.mediaJob!.id)
                                  }
                                  type="button"
                                >
                                  {dispatchingMediaJobId ===
                                  file.mediaJob.id ? (
                                    <Loader2
                                      aria-hidden="true"
                                      className="spin"
                                      size={14}
                                    />
                                  ) : (
                                    <RefreshCcw
                                      aria-hidden="true"
                                      size={14}
                                    />
                                  )}
                                  <span>
                                    {file.mediaJob.stale
                                      ? "停止した処理を再実行"
                                      : "処理を再実行"}
                                  </span>
                                </button>
                              )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="empty-note">
                        この投稿に保存ファイルはありません。
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="empty-note">履歴を選択してください。</p>
              )}
            </aside>
          </section>
        )}

        {activeView === "inbox" && (
          <section className="single-panel" aria-label="コメントとDM">
            <div className="empty-state">
              <Inbox aria-hidden="true" size={28} />
              <h3>受信データはまだありません</h3>
              <p>
                各SNSのWebhookとAPI審査が完了すると、コメントとDMをここへ取り込みます。
              </p>
              <Button
                className="ghost-button"
                type="button"
                variant="secondary"
                onPress={() => setActiveView("settings")}
              >
                <PlugZap aria-hidden="true" size={17} />
                <span>連携設定を開く</span>
              </Button>
            </div>
          </section>
        )}

        {activeView === "analytics" && (
          <section className="analytics-layout" aria-label="分析">
            <div className="analytics-grid">
              {analytics.map((item) => (
                <article className="metric-card" key={item.label}>
                  <div className="metric-head">
                    <Database aria-hidden="true" size={18} />
                    <span>Supabase</span>
                  </div>
                  <strong>{item.value}</strong>
                  <p>{item.label}</p>
                  <div className="meter">
                    <span style={{ width: item.size }} />
                  </div>
                </article>
              ))}
            </div>
            <div className="insight-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Data scope</p>
                  <h3>現在の集計範囲</h3>
                </div>
                <BarChart3 aria-hidden="true" size={20} />
              </div>
              <p className="history-body">
                現在は、この管理画面に保存した投稿・予約・失敗件数を集計しています。
                SNS側のリーチ、保存、返信数は各APIの接続と審査完了後に取得します。
              </p>
            </div>
          </section>
        )}

        {activeView === "settings" && (
          <section className="settings-layout" aria-label="SNS API連携設定">
            <aside className="integration-list-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Connections</p>
                  <h3>SNS API</h3>
                </div>
                <span className="count-pill">
                  {registeredCount}/{channels.length}
                </span>
              </div>
              <div className="integration-list">
                {channels.map((channel) => (
                  <button
                    className={
                      activeIntegrationId === channel.id
                        ? "integration-item active"
                        : "integration-item"
                    }
                    key={channel.id}
                    type="button"
                    onClick={() => setActiveIntegrationId(channel.id)}
                    aria-pressed={activeIntegrationId === channel.id}
                  >
                    <span className={`network-badge ${channel.tone}`}>
                      {channel.label.slice(0, 2)}
                    </span>
                    <span>
                      <strong>{channel.label}</strong>
                      <small>{integrations[channel.id].updatedAt}</small>
                    </span>
                    <span
                      className={`connection-dot ${getStatusTone(
                        integrations[channel.id].status,
                      )}`}
                      aria-label={integrations[channel.id].status}
                    />
                  </button>
                ))}
              </div>
            </aside>

            <section className="integration-editor-panel">
              <div className="panel-heading">
                <div className="integration-title">
                  <span className={`network-badge ${activeChannel.tone}`}>
                    {activeChannel.label.slice(0, 2)}
                  </span>
                  <div>
                    <p className="eyebrow">{activeChannel.label}</p>
                    <h3>API情報を登録</h3>
                  </div>
                </div>
                <span
                  className={`status-pill ${getStatusTone(
                    activeIntegration.status,
                  )}`}
                >
                  {activeIntegration.status}
                </span>
              </div>

              <div className="secure-note">
                <LockKeyhole aria-hidden="true" size={17} />
                <p>
                  秘密値は保存後に再表示されません。変更する項目だけ入力してください。
                </p>
              </div>

              <div className="form-grid">
                <label className="integration-field">
                  <span>
                    <KeyRound aria-hidden="true" size={15} />
                    Client ID / App ID
                  </span>
                  <input
                    value={activeIntegration.appId}
                    onChange={(event) =>
                      updateIntegration(
                        activeIntegrationId,
                        "appId",
                        event.target.value,
                      )
                    }
                    placeholder={`${activeChannel.label} App ID`}
                    autoComplete="off"
                  />
                </label>

                <label className="integration-field">
                  <span>
                    <KeyRound aria-hidden="true" size={15} />
                    Client Secret
                  </span>
                  <div className="secret-input">
                    <input
                      type={secretInputType}
                      value={activeIntegration.clientSecret}
                      onChange={(event) =>
                        updateIntegration(
                          activeIntegrationId,
                          "clientSecret",
                          event.target.value,
                        )
                      }
                      placeholder={
                        activeIntegration.stored.clientSecret
                          ? "保存済み（変更時のみ入力）"
                          : "未登録"
                      }
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      aria-label="シークレット表示切り替え"
                      onClick={() =>
                        setShowSecrets((current) => ({
                          ...current,
                          [activeIntegrationId]:
                            !current[activeIntegrationId],
                        }))
                      }
                    >
                      {showSecrets[activeIntegrationId] ? (
                        <EyeOff aria-hidden="true" size={17} />
                      ) : (
                        <Eye aria-hidden="true" size={17} />
                      )}
                    </button>
                  </div>
                </label>

                <label className="integration-field">
                  <span>
                    <ShieldCheck aria-hidden="true" size={15} />
                    Access Token
                  </span>
                  <input
                    type={secretInputType}
                    value={activeIntegration.accessToken}
                    onChange={(event) =>
                      updateIntegration(
                        activeIntegrationId,
                        "accessToken",
                        event.target.value,
                      )
                    }
                    placeholder={
                      activeIntegration.stored.accessToken
                        ? "保存済み（変更時のみ入力）"
                        : "必須"
                    }
                    autoComplete="new-password"
                  />
                </label>

                <label className="integration-field">
                  <span>
                    <RefreshCcw aria-hidden="true" size={15} />
                    Refresh Token
                  </span>
                  <input
                    type={secretInputType}
                    value={activeIntegration.refreshToken}
                    onChange={(event) =>
                      updateIntegration(
                        activeIntegrationId,
                        "refreshToken",
                        event.target.value,
                      )
                    }
                    placeholder={
                      activeIntegration.stored.refreshToken
                        ? "保存済み（変更時のみ入力）"
                        : "任意"
                    }
                    autoComplete="new-password"
                  />
                </label>

                <label className="integration-field wide">
                  <span>
                    <Link2 aria-hidden="true" size={15} />
                    Callback URL
                  </span>
                  <input
                    value={activeIntegration.callbackUrl}
                    onChange={(event) =>
                      updateIntegration(
                        activeIntegrationId,
                        "callbackUrl",
                        event.target.value,
                      )
                    }
                    placeholder={`https://your-domain.example/oauth/${activeIntegrationId}/callback`}
                    autoComplete="url"
                  />
                </label>

                <label className="integration-field">
                  <span>
                    <ShieldCheck aria-hidden="true" size={15} />
                    Webhook Secret
                  </span>
                  <input
                    type={secretInputType}
                    value={activeIntegration.webhookSecret}
                    onChange={(event) =>
                      updateIntegration(
                        activeIntegrationId,
                        "webhookSecret",
                        event.target.value,
                      )
                    }
                    placeholder={
                      activeIntegration.stored.webhookSecret
                        ? "保存済み（変更時のみ入力）"
                        : "任意"
                    }
                    autoComplete="new-password"
                  />
                </label>

                <label className="integration-field wide">
                  <span>
                    <Settings2 aria-hidden="true" size={15} />
                    Scopes
                  </span>
                  <textarea
                    value={activeIntegration.scopes}
                    onChange={(event) =>
                      updateIntegration(
                        activeIntegrationId,
                        "scopes",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>

              <div className="settings-actions">
                <Button
                  className="primary-button"
                  type="button"
                  variant="primary"
                  onPress={() => void saveIntegration(activeIntegrationId)}
                  isDisabled={savingIntegration}
                >
                  {savingIntegration ? (
                    <Loader2 className="spin" aria-hidden="true" size={18} />
                  ) : (
                    <Save aria-hidden="true" size={18} />
                  )}
                  <span>安全に登録</span>
                </Button>
                <Button
                  className="ghost-button"
                  type="button"
                  variant="secondary"
                  onPress={() => checkIntegrationInput(activeIntegrationId)}
                  isDisabled={savingIntegration}
                >
                  <CheckCircle2 aria-hidden="true" size={18} />
                  <span>入力確認</span>
                </Button>
                <Button
                  className="danger-button"
                  type="button"
                  variant="danger"
                  onPress={() => void clearIntegration(activeIntegrationId)}
                  isDisabled={savingIntegration}
                >
                  <Trash2 aria-hidden="true" size={18} />
                  <span>連携を削除</span>
                </Button>
              </div>
            </section>

            <aside className="integration-summary-panel">
              <div className="section-title">
                <PlugZap aria-hidden="true" size={17} />
                <span>登録状況</span>
              </div>
              {channels.map((channel) => (
                <div className="summary-row" key={`summary-${channel.id}`}>
                  <span className={`network-badge ${channel.tone}`}>
                    {channel.label.slice(0, 2)}
                  </span>
                  <div>
                    <strong>{channel.label}</strong>
                    <small>{integrations[channel.id].status}</small>
                  </div>
                  <span
                    className={`connection-dot ${getStatusTone(
                      integrations[channel.id].status,
                    )}`}
                  />
                </div>
              ))}
            </aside>
          </section>
        )}
        </section>
      </main>
      {editingAttachment?.previewUrl && (
        <MediaEditor
          fileName={editingAttachment.name}
          onClose={() => setEditingAttachmentId(null)}
          onSave={(crop) => saveAttachmentCrop(editingAttachment.id, crop)}
          previewUrl={editingAttachment.previewUrl}
          value={editingAttachment.crop ?? defaultMediaCrop}
        />
      )}
      {videoViewer && (
        <VideoViewer
          fileName={videoViewer.file.name}
          onClose={closeVideoViewer}
          onDownload={() => void downloadFile(videoViewer.file)}
          url={videoViewer.url}
          variantLabel={
            videoViewer.file.variant === "processed" ? "編集済み" : "元動画"
          }
        />
      )}
    </>
  );
}
