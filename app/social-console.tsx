"use client";

import { Button } from "@heroui/react";
import type { User } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowRight,
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
  ImagePlus,
  Inbox,
  KeyRound,
  Link2,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
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
  X as CloseIcon,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
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
import { ChannelLogo, type ChannelId } from "./channel-logo";
import { filterPosts, scheduledPosts, type PostFilter, type PostStatus } from "./lib/post-list";
import {
  freezeXMediaFile, parseXConnectionPreview, parseXNotStartedFailure, parseXPublishResult, reconcileXAttempts,
  parseXScheduledPublication, validateXScheduledPost, xScheduleCanCancel, xScheduleCancelMediaWarning,
  xScheduleErrorMessage,
  xScheduleKnownEnqueueFailure, xScheduleStateLabel,
  removeXOptimisticAttempt, removeXPendingRequest,
  validateXPost, xAttemptLocksPost, xAttemptProjection, xMediaDigest,
  xPostLink, xPublishBody, xPublishErrorMessage, xPublishMessage, xPublishStateLabel,
  type XExpectedFile, type XPublicationAttempt, type XPublishExpected, type XPublishResult,
} from "./lib/x-posting";
import {
  getXOAuthCallbackUrl,
  hasUnsavedComposer,
  integrationInputReady,
  isXOAuthConnected,
  parseXOAuthCallback,
  safeXAuthorizationUrl,
  xOAuthCallbackMessage,
  xOAuthConfigureBody,
  xOAuthFailureMessage,
  XOAuthUiError,
  type XOAuthCallback,
} from "./lib/x-oauth";

type ViewId =
  | "compose"
  | "calendar"
  | "history"
  | "inbox"
  | "analytics"
  | "settings";
type ApiStatus = "未設定" | "登録済み" | "入力確認済み" | "要確認";
type RecordStatus = PostStatus;

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
  xScheduleState?: string | null;
  xScheduleErrorCode?: string | null;
};

type XPublishConfirmation = {
  workspaceId: string;
  body: string;
  files: Array<LocalAttachment | SavedFile>;
  channels: ChannelId[];
  postId?: string;
  requestId: string;
  resume: boolean;
  expected: XPublishExpected;
  username?: string;
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
    created_at: string;
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
  x: "tweet.read tweet.write users.read offline.access media.write",
  threads: "threads_basic, threads_content_publish, threads_manage_replies",
};

const views: Array<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: "compose", label: "投稿を作成", icon: Send },
  { id: "calendar", label: "予約一覧", icon: CalendarDays },
  { id: "history", label: "投稿履歴", icon: History },
  { id: "inbox", label: "受信箱", icon: Inbox },
  { id: "analytics", label: "運用集計", icon: BarChart3 },
  { id: "settings", label: "SNS接続設定", icon: PlugZap },
];

const viewDescriptions: Record<ViewId, string> = {
  compose: "ひとつの画面から、複数のSNSへの投稿を準備。",
  calendar: "これからの投稿を、公開予定の順に確認。",
  history: "保存した投稿を検索して、内容やファイルを確認。",
  inbox: "コメント・DMの取り込みは、今後の連携で利用できます。",
  analytics: "このアプリに保存した投稿の状況を確認。",
  settings: "SNSごとのAPI情報を登録・管理。",
};

const historyFilters: PostFilter[] = ["all", "予約済み", "下書き", "公開済み", "失敗"];

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
  const [autoPublishXScheduled, setAutoPublishXScheduled] = useState(false);
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
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
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
  const [canPublishX, setCanPublishX] = useState(false);
  const [xAttempts, setXAttempts] = useState<Record<string, XPublicationAttempt>>({});
  const [xAttemptsLoaded, setXAttemptsLoaded] = useState(false);
  const [xScheduleStatusAvailable, setXScheduleStatusAvailable] = useState(false);
  const [xScheduleReady, setXScheduleReady] = useState(false);
  const [xScheduleLocalStates, setXScheduleLocalStates] = useState<Record<string, string>>({});
  const [xNextChecks, setXNextChecks] = useState<Record<string, string>>({});
  const [xCheckTime, setXCheckTime] = useState(0);
  const [xPublishingId, setXPublishingId] = useState<string | null>(null);
  const xPublishBusy = useRef(false);
  const [xConfirmation, setXConfirmation] = useState<XPublishConfirmation | null>(null);
  const xConfirmationRef = useRef<HTMLDialogElement>(null);
  const xComposerValidation = validateXPost(postText, attachedFiles);
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
  const [xOAuthServer, setXOAuthServer] = useState<"unknown" | "checking" | "ready" | "unavailable">("unknown");
  const xScheduleConnectionReady = canPublishX &&
    integrations.x.status === "登録済み" && xOAuthServer === "ready";
  const xAutoPublishReady = xScheduleStatusAvailable && xScheduleReady && xScheduleConnectionReady;
  const [pendingXCallback, setPendingXCallback] = useState<XOAuthCallback | null>(() =>
    typeof window === "undefined" ? null : parseXOAuthCallback(window.location.href).callback,
  );
  const calculatedXCallbackUrl = getXOAuthCallbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const reloadXIntegration = useCallback(async (id: string) => {
    if (!supabase) return false;
    const [metadata, result] = await Promise.all([
      supabase.from("social_integrations")
        .select("app_id, callback_url, scopes, status, updated_at")
        .eq("workspace_id", id).eq("channel", "x").maybeSingle(),
      supabase.functions.invoke("social-x-oauth", {
        body: { action: "status", workspaceId: id },
      }),
    ]);
    if (metadata.error || result.error || !result.data?.status) {
      setXOAuthServer("unavailable");
      throw new Error("x_status_unavailable");
    }
    setXOAuthServer("ready");
    const flags = result.data.status;
    const stored: SecretFlags = {
      clientSecret: flags.clientSecret === true,
      accessToken: flags.accessToken === true,
      refreshToken: flags.refreshToken === true,
      webhookSecret: flags.webhookSecret === true,
    };
    const connected = isXOAuthConnected(metadata.data?.status, result.data);
    setIntegrations((current) => ({
      ...current,
      x: {
        ...createIntegration("x"),
        appId: metadata.data?.app_id ?? "",
        scopes: metadata.data?.scopes ?? defaultScopes.x,
        callbackUrl: calculatedXCallbackUrl,
        stored,
        status: connected ? "登録済み" : metadata.data ? "要確認" : "未設定",
        updatedAt: metadata.data ? formatDateTime(metadata.data.updated_at) : "未保存",
      },
    }));
    return connected;
  }, [calculatedXCallbackUrl]);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
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
  const [historyFilter, setHistoryFilter] = useState<PostFilter>("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (xConfirmation) xConfirmationRef.current?.showModal();
    else xConfirmationRef.current?.close();
  }, [xConfirmation]);

  useEffect(() => {
    const waitingUntil = Object.values(xNextChecks).map(Date.parse).filter((time) => time > Date.now());
    if (!waitingUntil.length) return;
    // Local countdown only. Never poll X or automatically continue publication.
    const timer = window.setTimeout(() => setXCheckTime(Date.now()), Math.min(...waitingUntil) - Date.now() + 20);
    return () => window.clearTimeout(timer);
  }, [xNextChecks, xCheckTime]);

  function openView(view: ViewId, filter: PostFilter = "all") {
    setActiveView(view);
    setSearchQuery("");
    setHistoryFilter(filter);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      mobileMenuButtonRef.current?.focus();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      if (!sessionUser) {
        videoRequestId.current += 1;
        setIsAdmin(false);
        setWorkspaceId(null);
        setCanPublishX(false);
        setXAttempts({});
        setXAttemptsLoaded(false);
        setXScheduleStatusAvailable(false);
        setAutoPublishXScheduled(false);
        setXScheduleReady(false);
        setXScheduleLocalStates({});
        setXConfirmation(null);
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
        setCanPublishX(false);
        setXAttempts({});
        setXAttemptsLoaded(false);
        setXScheduleStatusAvailable(false);
        setAutoPublishXScheduled(false);
        setXScheduleReady(false);
        setXScheduleLocalStates({});
        setXConfirmation(null);
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
    const result = parseXOAuthCallback(window.location.href);
    if (result.hasCallbackParams) {
      window.history.replaceState(window.history.state, "", result.cleanedUrl);
    }
  }, []);

  useEffect(() => {
    if (!user || !workspaceId || dataLoading || !pendingXCallback) return;
    const callback = pendingXCallback;
    let active = true;
    void Promise.resolve().then(() => reloadXIntegration(workspaceId)).then((connected) => {
      if (!active) return;
      setActiveView("settings");
      setActiveIntegrationId("x");
      setMobileMenuOpen(false);
      setNotice({
        tone: callback.status === "success" && connected ? "success" : callback.status === "denied" ? "info" : "error",
        text: callback.status === "success" && !connected
          ? "Xの認可後の保存状態を確認できませんでした。接続完了ではありません。再読み込みするか、Xに再連携してください。"
          : xOAuthCallbackMessage(callback),
      });
      setPendingXCallback(null);
    }).catch(() => {
      if (active) {
        setActiveView("settings");
        setActiveIntegrationId("x");
        setMobileMenuOpen(false);
        setNotice({ tone: "error", text: xOAuthFailureMessage("") });
        setPendingXCallback(null);
      }
    });
    return () => { active = false; };
  }, [user, workspaceId, dataLoading, pendingXCallback, reloadXIntegration]);

  useEffect(() => {
    if (!supabase || !workspaceId || activeView !== "settings" || activeIntegrationId !== "x") return;
    let active = true;
    void supabase.functions.invoke("social-x-oauth", {
      body: { action: "status", workspaceId },
    }).then(({ data, error }) => {
      if (active) setXOAuthServer(error || !data?.status ? "unavailable" : "ready");
    }).catch(() => {
      if (active) setXOAuthServer("unavailable");
    });
    return () => { active = false; };
  }, [workspaceId, activeView, activeIntegrationId]);

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
        integrations[channel.id].status === "登録済み",
      ).length,
    [integrations],
  );
  const filteredHistory = useMemo(
    () => filterPosts(history, searchQuery, historyFilter),
    [history, searchQuery, historyFilter],
  );
  const allScheduledPosts = useMemo(() => scheduledPosts(history), [history]);
  const queue = filterPosts(allScheduledPosts, searchQuery);
  const selectedHistory = filteredHistory.find((record) => record.id === selectedHistoryId)
    ?? filteredHistory[0];
  const draftCount = history.filter((record) => record.status === "下書き").length;
  const failedCount = history.filter((record) => record.status === "失敗").length;
  const firstPreviewFile = attachedFiles.find((file) => /^(image|video)\//.test(file.type));
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

  // Only identifiers are retained locally. No text, file bytes, or credentials.
  // A lost response without a server row must not become a fresh send on reload.
  function xUncertainKey(id: string) { return `instatic-talksx:x-publish-pending:${id}`; }
  function readXUncertain(id: string): Array<{ postId: string; requestId: string }> {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(xUncertainKey(id)) ?? "[]");
      return Array.isArray(saved) ? saved.filter((value) =>
        value && typeof value.postId === "string" && typeof value.requestId === "string",
      ).slice(-100) : [];
    } catch { return []; }
  }
  function rememberXUncertain(id: string, postId: string, requestId: string, keep: boolean) {
    try {
      const pending = readXUncertain(id);
      const saved = keep ? pending.filter((item) => item.postId !== postId) : removeXPendingRequest(pending, postId, requestId);
      if (keep) saved.push({ postId, requestId });
      localStorage.setItem(xUncertainKey(id), JSON.stringify(saved.slice(-100)));
    } catch { /* Server-side attempt locking remains authoritative. */ }
  }
  async function loadXAttempts(id: string) {
    if (!supabase) return;
    const { data, error } = await supabase.from("social_x_publication_attempts")
      .select(xAttemptProjection).eq("workspace_id", id)
      .order("created_at", { ascending: false });
    if (error) {
      setXAttemptsLoaded(false);
      return;
    }
    const pending = readXUncertain(id);
    const next = reconcileXAttempts((data ?? []) as unknown as XPublicationAttempt[], pending, id);
    for (const item of pending) {
      if (next[item.postId]?.state === "published" ||
          (next[item.postId]?.request_id === item.requestId && next[item.postId]?.state === "rejected")) {
        rememberXUncertain(id, item.postId, item.requestId, false);
      }
    }
    setXAttempts(next);
    setXAttemptsLoaded(true);
  }
  function applyXResult(id: string, postId: string, result: XPublishResult) {
    setXCheckTime(Date.now());
    setXNextChecks((current) => {
      const next = { ...current };
      if (result.state === "preparing" && result.nextCheckAt) next[postId] = result.nextCheckAt;
      else delete next[postId];
      return next;
    });
    rememberXUncertain(id, postId, result.requestId, !["published", "rejected"].includes(result.state));
    setXAttempts((current) => ({
      ...current,
      [postId]: {
        id: result.attemptId, post_id: postId, workspace_id: id, request_id: result.requestId,
        state: result.state, remote_post_id: result.remotePostId ?? null,
        error_code: result.errorCode ?? null, created_at: current[postId]?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
  }
  async function invokeXPublish(id: string, postId: string, requestId: string, fileIds: string[], expected: XPublishExpected) {
    if (!supabase) return { result: null, failureMessage: "", notStarted: false };
    rememberXUncertain(id, postId, requestId, true);
    applyXResult(id, postId, { state: "unknown", attemptId: "", requestId });
    try {
      const { data, error } = await supabase.functions.invoke("social-x-publish", {
        body: xPublishBody(postId, requestId, fileIds, expected),
      });
      const result = parseXPublishResult(data);
      if (error || !result || result.requestId !== requestId) {
        let failureMessage = "";
        let failureData: unknown = data;
        if (error?.context instanceof Response) {
          failureData = await error.context.json().catch(() => null);
        }
        const failureCode = (failureData as { error?: unknown } | null)?.error;
        if (typeof failureCode === "string") failureMessage = xPublishErrorMessage(failureCode);
        const proof = parseXNotStartedFailure(failureData, requestId);
        if (proof) {
          rememberXUncertain(id, postId, proof.requestId, false);
          setXAttempts((current) => removeXOptimisticAttempt(current, postId, proof.requestId));
          // Restore server-authoritative attempts, including any earlier attempt.
          // A failed reload blocks history actions, but does not undo the proof.
          await loadXAttempts(id).catch(() => setXAttemptsLoaded(false));
          return { result: null, failureMessage: xPublishErrorMessage(proof.error), notStarted: true };
        }
        return { result: null, failureMessage, notStarted: false };
      }
      applyXResult(id, postId, result);
      return { result, failureMessage: "", notStarted: false };
    } catch { return { result: null, failureMessage: "", notStarted: false }; }
  }
  async function checkXPublishStatus(postId: string) {
    if (!supabase || !workspaceId || xPublishBusy.current) return;
    xPublishBusy.current = true;
    setXPublishingId(postId);
    try {
      // This endpoint reads saved state only, not the provider.
      const { data, error } = await supabase.functions.invoke("social-x-publish", {
        body: { action: "status", postId },
      });
      const parsed = parseXPublishResult(data);
      const pendingRequest = xAttempts[postId]?.request_id;
      const result = !error && parsed && (!pendingRequest || parsed.requestId === pendingRequest || parsed.state === "published")
        ? parsed : null;
      if (result) applyXResult(workspaceId, postId, result);
      await loadXAttempts(workspaceId);
      setNotice({
        tone: result?.state === "published" ? "success" : "info",
        text: result ? xPublishMessage(result.state) : "保存状態を確定できません。再送せずX上の投稿を手動で確認してください。",
      });
    } catch {
      setNotice({ tone: "error", text: "保存状態を確認できません。再送せずX上の投稿を手動で確認してください。" });
    } finally {
      xPublishBusy.current = false;
      setXPublishingId(null);
    }
  }
  async function confirmXPublish(record?: HistoryRecord) {
    if (!supabase || !workspaceId || !canPublishX || xPublishBusy.current || xConfirmation) return;
    const attempt = record ? xAttempts[record.id] : null;
    const resume = attempt?.state === "preparing";
    if (record && resume && Date.parse(xNextChecks[record.id] ?? "") > Date.now()) {
      setNotice({ tone: "info", text: "Xで動画を処理中です。表示された時刻以降に確認してください。" });
      return;
    }
    if (record && (!xAttemptsLoaded || (xAttemptLocksPost(attempt) && !resume))) return;
    const body = record?.body ?? postText;
    const files = record ? record.files.filter((file) => file.variant === "original") : [...attachedFiles];
    const targetChannels = record?.channels ?? [...selectedChannels];
    const validation = validateXPost(body, files);
    if (!targetChannels.includes("x") || !validation.valid) {
      setNotice({ tone: "error", text: validation.error || "投稿先にXを選択してください。" });
      return;
    }
    if (integrations.x.status !== "登録済み") {
      setNotice({ tone: "error", text: "SNS接続設定でXに接続してください。" });
      return;
    }
    if (files.length && !integrations.x.scopes.split(/[,\s]+/).includes("media.write")) {
      setNotice({ tone: "error", text: xPublishErrorMessage("media_permission_required") });
      return;
    }
    const requestId = resume && attempt ? attempt.request_id : crypto.randomUUID();
    const confirmedWorkspace = workspaceId;
    // Capture all content before any await. These copies, not live composer state,
    // become the confirmation and the eventual request.
    const rawBody = record ? body : validation.text;
    const capturedFiles = files.map((file) => ({ ...file }));
    const capturedChannels = [...targetChannels];
    xPublishBusy.current = true;
    setXPublishingId(record?.id ?? "composer");
    try {
      const { data, error } = await supabase.functions.invoke("social-x-publish", {
        body: { action: "preview", workspaceId: confirmedWorkspace },
      });
      const connection = !error ? parseXConnectionPreview(data) : null;
      if (!connection) throw new Error("not_connected");
      const frozenFiles: Array<LocalAttachment | SavedFile> = [];
      const expectedFiles: XExpectedFile[] = [];
      for (const file of capturedFiles) {
        if ("file" in file) {
          const frozen = await freezeXMediaFile(file.file, file.size);
          frozenFiles.push({ ...file, file: frozen.file });
          expectedFiles.push({
            id: file.id, storagePath: "", mimeType: file.type, sizeBytes: file.size, sha256: frozen.sha256,
          });
        } else {
          const { data: blob, error: downloadError } = await supabase.storage
            .from("social-post-files").download(file.storagePath);
          if (downloadError || !blob) throw new Error("storage_failed");
          const { sha256 } = await xMediaDigest(blob, file.size);
          frozenFiles.push(file);
          expectedFiles.push({
            id: file.id, storagePath: file.storagePath, mimeType: file.type, sizeBytes: file.size, sha256,
          });
        }
      }
      setXConfirmation({
        workspaceId: confirmedWorkspace, body: validation.text, files: frozenFiles, channels: capturedChannels,
        postId: record?.id, requestId, resume: Boolean(resume), username: connection.username,
        expected: { body: rawBody, files: expectedFiles, connectionFingerprint: connection.fingerprint },
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: xPublishErrorMessage(error instanceof Error ? error.message : "storage_failed"),
      });
    } finally {
      xPublishBusy.current = false;
      setXPublishingId(null);
    }
  }
  async function publishConfirmedX() {
    const snapshot = xConfirmation;
    if (!snapshot || !supabase || !user || snapshot.workspaceId !== workspaceId ||
        !canPublishX || xPublishBusy.current) return;
    xPublishBusy.current = true;
    setSavingPost(true);
    setXPublishingId(snapshot.postId ?? "composer");
    setXConfirmation(null);
    let postId = snapshot.postId ?? null;
    let dispatchAttempted = false;
    const uploadedStoragePaths: string[] = [];
    const fileIds: string[] = [];
    const expected: XPublishExpected = {
      body: snapshot.expected.body, files: snapshot.expected.files.map((file) => ({ ...file })),
      connectionFingerprint: snapshot.expected.connectionFingerprint,
    };
    let message = "";
    let tone: "success" | "error" | "info" = "info";
    try {
      if (!postId) {
        const { data: post, error: postError } = await supabase.from("social_posts").insert({
          workspace_id: snapshot.workspaceId, title: snapshot.body.replace(/\s+/g, " ").slice(0, 48),
          body: expected.body, scheduled_at: null, status: "draft",
          owner_name: user.email ?? "担当者", format: "Post", created_by: user.id,
        }).select("id").single();
        if (postError) throw postError;
        postId = post.id;
        const { error: channelError } = await supabase.from("social_post_channels").insert(
          snapshot.channels.map((channel) => ({ post_id: post.id, channel })),
        );
        if (channelError) throw channelError;
        for (const [index, attachment] of (snapshot.files as LocalAttachment[]).entries()) {
          const storagePath = `${snapshot.workspaceId}/${post.id}/${crypto.randomUUID()}-${safeFileName(attachment.name)}`;
          const { error: uploadError } = await supabase.storage.from("social-post-files").upload(storagePath, attachment.file, {
            contentType: attachment.type, upsert: false,
          });
          if (uploadError) throw uploadError;
          uploadedStoragePaths.push(storagePath);
          const { data: saved, error: fileError } = await supabase.from("social_post_files").insert({
            workspace_id: snapshot.workspaceId, post_id: post.id, storage_path: storagePath,
            file_name: attachment.name, content_type: attachment.type, file_size: attachment.size,
            created_by: user.id, media_variant: "original",
          }).select("id").single();
          if (fileError) throw fileError;
          fileIds.push(saved.id);
          expected.files[index] = { ...expected.files[index], id: saved.id, storagePath };
        }
        // Manual X publishing uses originals, never the crop/Cloud Run dispatcher.
        for (const attachment of attachedFiles) if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        setPostText("");
        setScheduledAt("");
        setAttachedFiles([]);
      } else {
        fileIds.push(...snapshot.files.map((file) => file.id));
      }
      if (!postId) throw new Error("missing_saved_post");
      // Beyond this boundary, retain the post/files even if every response is lost.
      dispatchAttempted = true;
      const { result, failureMessage, notStarted } = await invokeXPublish(snapshot.workspaceId, postId, snapshot.requestId, fileIds, expected);
      message = notStarted
        ? `${failureMessage} Xへの送信は開始されていません。内容を確認してから再度操作してください。`
        : xPublishMessage(result?.state ?? "unknown");
      if (failureMessage && !notStarted) message += ` ${failureMessage}`;
      if (result?.state === "rejected") message += ` ${xPublishErrorMessage(result.errorCode)}`;
      tone = result?.state === "published" ? "success" : result?.state === "rejected" || notStarted ? "error" : "info";
      await loadWorkspaceData(user);
      setSelectedHistoryId(postId);
      setActiveView("history");
    } catch {
      if (!dispatchAttempted && !snapshot.postId && postId) {
        await rollbackFailedSchedule(postId, uploadedStoragePaths);
      }
      message = dispatchAttempted ? xPublishMessage("unknown") : "投稿の保存に失敗しました。Xには送信していません。";
      tone = dispatchAttempted ? "info" : "error";
      if (dispatchAttempted) setActiveView("history");
    } finally {
      setNotice({ tone, text: message });
      setSavingPost(false);
      setXPublishingId(null);
      xPublishBusy.current = false;
    }
  }

  async function loadWorkspaceData(currentUser: User) {
    if (!supabase) return;
    setDataLoading(true);
    setXAttemptsLoaded(false);
    setCanPublishX(false);
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
        setXScheduleStatusAvailable(false);
        setAutoPublishXScheduled(false);
        setXScheduleReady(false);
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
      if (activeWorkspace.created_by === currentUser.id) {
        setCanPublishX(true);
      } else {
        const { data: role, error: roleError } = await supabase
          .from("social_workspace_members").select("role")
          .eq("workspace_id", activeWorkspace.id).eq("user_id", currentUser.id).maybeSingle();
        setCanPublishX(!roleError && Boolean(role && ["owner", "admin", "member"].includes(role.role)));
      }
      setCurrentStore(selectedStore as StoreRow);
      setSelectedStoreId(selectedStore.id);
      setStoreSelectionRequired(false);
      clearPendingStoreId();

      const [postsResult, integrationsResult, mediaJobsResult] =
        await Promise.all([
          supabase
            .from("social_posts")
            .select(
              "id, title, body, scheduled_at, status, owner_name, format, created_at, social_post_channels(channel), social_post_files(id, file_name, file_size, content_type, storage_path, media_variant, created_at)",
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

      const { data: xScheduleReadyData, error: xScheduleReadyError } = await supabase.rpc(
        "social_x_schedule_is_ready",
        { p_workspace: activeWorkspace.id },
      );
      setXScheduleReady(!xScheduleReadyError && xScheduleReadyData === true);

      const savedPostIds = ((postsResult.data ?? []) as unknown as DbPostRow[])
        .map((post) => post.id);
      const xScheduleResult = savedPostIds.length
        ? await supabase.from("social_x_scheduled_publications")
          .select("post_id,state,error_code,scheduled_at")
          .in("post_id", savedPostIds)
        : { data: [], error: null };
      setXScheduleStatusAvailable(!xScheduleResult.error);
      if (xScheduleResult.error) setAutoPublishXScheduled(false);
      const schedulesByPostId = new Map<string, NonNullable<ReturnType<typeof parseXScheduledPublication>>>();
      for (const row of xScheduleResult.data ?? []) {
        const parsed = parseXScheduledPublication(row);
        if (parsed) schedulesByPostId.set(parsed.postId, parsed);
      }
      if (!xScheduleResult.error) {
        setXScheduleLocalStates((current) => {
          const next = { ...current };
          // A successful query is authoritative even when a post has no queue row.
          for (const postId of savedPostIds) delete next[postId];
          return next;
        });
      }

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
          xScheduleState: schedulesByPostId.get(post.id)?.state ??
            (xScheduleResult.error ? xScheduleLocalStates[post.id] ?? null : null),
          xScheduleErrorCode: schedulesByPostId.get(post.id)?.errorCode ?? null,
          files: [...(post.social_post_files ?? [])].sort((a, b) =>
            a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
          ).map((file) => ({
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
      await loadXAttempts(activeWorkspace.id);
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

      // A legacy manually stored X token is not proof of an OAuth connection.
      const xMetadata = (integrationsResult.data ?? []).find((row) => row.channel === "x");
      if (xMetadata) {
        nextIntegrations.x.status = "要確認";
        const { data: xStatus, error: xError } = await supabase.functions.invoke("social-x-oauth", {
          body: { action: "status", workspaceId: activeWorkspace.id },
        });
        if (!xError && xStatus?.status) {
          nextIntegrations.x.stored = {
            clientSecret: xStatus.status.clientSecret === true,
            accessToken: xStatus.status.accessToken === true,
            refreshToken: xStatus.status.refreshToken === true,
            webhookSecret: xStatus.status.webhookSecret === true,
          };
          if (isXOAuthConnected(xMetadata.status, xStatus)) {
            nextIntegrations.x.status = "登録済み";
          }
          setXOAuthServer("ready");
        } else {
          setXOAuthServer("unavailable");
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
    if (xPublishBusy.current || xConfirmation) return;
    setAutoPublishXScheduled(false);
    setSelectedChannels((current) =>
      current.includes(id)
        ? current.filter((channelId) => channelId !== id)
        : [...current, id],
    );
  }

  function optimizeCopy() {
    if (xPublishBusy.current || xConfirmation) return;
    const base =
      postText.trim() ||
      "投稿本文を入力すると、運用向けの文面に整えられます。";
    setPostText(
      `${base}\n\n詳細はプロフィールのリンクからご確認ください。\n#SNS運用 #マーケティング`,
    );
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    if (xPublishBusy.current || xConfirmation) return;
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
        previewUrl: /^(image|video)\//.test(file.type)
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
    if (xPublishBusy.current || xConfirmation) return;
    setAttachedFiles((current) => {
      const target = current.find((file) => file.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((file) => file.id !== id);
    });
    if (editingAttachmentId === id) setEditingAttachmentId(null);
  }

  function saveAttachmentCrop(id: string, crop: MediaCropConfig) {
    if (xPublishBusy.current || xConfirmation) return;
    setAttachedFiles((current) =>
      current.map((file) => (file.id === id ? { ...file, crop } : file)),
    );
    setEditingAttachmentId(null);
  }

  async function schedulePost() {
    if (xPublishBusy.current || xConfirmation) return;
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

    if (autoPublishXScheduled && (!xScheduleStatusAvailable || !xScheduleReady)) {
      setNotice({
        tone: "info",
        text: !xScheduleStatusAvailable
          ? "X自動公開の予約状態を読み込めません。安全のため自動公開予約は中止しました。通常の予約保存は利用できます。"
          : "X自動公開の実行基盤はまだ有効化されていないか、状態を確認できません。通常の予約保存のみ利用できます。",
      });
      return;
    }

    const scheduledXValidation = validateXScheduledPost({
      channels: selectedChannels,
      text: postText,
      files: attachedFiles.map((file) => ({
        id: file.id, name: file.name, type: file.type, size: file.size, hasCrop: Boolean(file.crop),
      })),
      connected: integrations.x.status === "登録済み" && xOAuthServer === "ready",
      canPublish: canPublishX,
      mediaWrite: integrations.x.scopes.split(/[,\s]+/).includes("media.write"),
    });
    if (autoPublishXScheduled && !scheduledXValidation.valid) {
      setNotice({ tone: "error", text: scheduledXValidation.error });
      return;
    }
    let scheduledXConnection: ReturnType<typeof parseXConnectionPreview> = null;
    if (autoPublishXScheduled) {
      xPublishBusy.current = true;
      setXPublishingId("schedule-preview");
      try {
        // This endpoint reads the current DB connection binding only; it does
        // not refresh credentials or contact X. Bind consent to this snapshot.
        const { data, error } = await supabase.functions.invoke("social-x-publish", {
          body: { action: "preview", workspaceId },
        });
        scheduledXConnection = !error ? parseXConnectionPreview(data) : null;
        if (!scheduledXConnection) {
          setNotice({
            tone: "error",
            text: "対象のXアカウントを確認できません。予約を保存する前に接続状態を再確認してください。",
          });
          return;
        }
      } catch {
        setNotice({
          tone: "error",
          text: "対象のXアカウントを確認できません。予約を保存する前に接続状態を再確認してください。",
        });
        return;
      } finally {
        xPublishBusy.current = false;
        setXPublishingId(null);
      }
    }
    const scheduledXFilesSummary = attachedFiles.length
      ? attachedFiles.map((file) => `${file.name} / ${formatFileSize(file.size)} / ${file.type}`).join("\n")
      : "添付なし";
    if (autoPublishXScheduled && !window.confirm(
      `次の予約をXだけに自動公開します。\n\n送信先: ${scheduledXConnection?.username ? `@${scheduledXConnection.username}` : "現在接続中のXアカウント"}\n予定: ${formatDateTime(scheduledAt)}\n添付:\n${scheduledXFilesSummary}\n本文: ${scheduledXValidation.text}\n\nX APIクレジットを消費し、費用が発生する可能性があります。予約時刻までに接続・権限・メディア条件が変わった場合、公開されないことがあります。実際のX公開を許可しますか？`,
    )) return;

    setSavingPost(true);
    setNotice(null);
    let postId: string | null = null;
    let scheduleContentSaved = false;
    let scheduleEnqueueOutcome: "not_attempted" | "pending" | "queued" | "rejected" | "unknown" = "not_attempted";
    const uploadedStoragePaths: string[] = [];
    const expectedXFiles: XExpectedFile[] = [];
    let mediaJobCount = 0;
    let cloudRunConnected = true;
    let xScheduleWarning = "";
    let xScheduleUiState: string | null = null;

    try {
      const savedBody = autoPublishXScheduled ? scheduledXValidation.text : postText.trim();
      const title =
        savedBody.replace(/\s+/g, " ").slice(0, 48) ||
        "予約投稿";
      const format = selectedChannels.includes("tiktok")
        ? "Short / Reel"
        : "Post";

      const { data: post, error: postError } = await supabase
        .from("social_posts")
        .insert({
          workspace_id: workspaceId,
          title,
          body: savedBody,
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
        if (autoPublishXScheduled) {
          const { sha256 } = await xMediaDigest(attachment.file, attachment.size);
          expectedXFiles.push({
            id: savedFile.id,
            storagePath,
            mimeType: attachment.type,
            sizeBytes: attachment.size,
            sha256,
          });
        }

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

      // From here on the saved post is durable. A schedule RPC failure must
      // never roll back the post or its uploads, because its result may be
      // uncertain and deleting them could race a committed queue entry.
      scheduleContentSaved = true;

      if (autoPublishXScheduled) {
        // Bind the queue entry to the currently authorized X connection just as
        // manual publication binds its immutable confirmation snapshot.
        const connection = scheduledXConnection;
        if (!connection) {
          xScheduleWarning = "投稿と添付は保存しましたが、X接続の再確認ができず自動公開予約は登録していません。予約一覧で状態を確認してください。";
        } else {
          const requestId = crypto.randomUUID();
          scheduleEnqueueOutcome = "pending";
          const { data: queued, error: enqueueError } = await supabase.rpc("social_x_schedule_enqueue", {
            p_post: post.id,
            p_request: requestId,
            p_expected: {
              body: savedBody,
              files: expectedXFiles,
              connectionFingerprint: connection.fingerprint,
            },
          });
          if (enqueueError) {
            const knownFailure = xScheduleKnownEnqueueFailure(enqueueError);
            if (knownFailure) {
              // PostgreSQL raised a whitelisted P0001 error, proving the
              // enqueue transaction rolled back. Do not label this unknown.
              scheduleEnqueueOutcome = "rejected";
              xScheduleWarning = knownFailure === "schedule_not_ready"
                ? "予約投稿は保存しましたが、X自動公開の実行基盤が未有効のため自動公開予約は登録されていません。"
                : "予約投稿は保存しましたが、X自動公開予約は登録されていません。予約投稿の状態を確認してください。";
            } else {
              // A transport/server error may hide a committed transaction.
              // Preserve the post and prohibit automatic retries.
              scheduleEnqueueOutcome = "unknown";
              xScheduleWarning = "予約投稿は保存済みですが、X自動公開の登録結果を確認できません。重複登録を避けるため再操作せず、予約一覧の状態を確認してください。";
              xScheduleUiState = "unknown";
            }
          } else if (queued?.state !== "queued" || typeof queued?.scheduledAt !== "string" ||
              !Number.isFinite(Date.parse(queued.scheduledAt))) {
            scheduleEnqueueOutcome = "unknown";
            xScheduleWarning = "予約投稿は保存済みですが、X自動公開の登録結果を確認できません。予約一覧の状態を確認してください。";
            xScheduleUiState = "unknown";
          } else {
            scheduleEnqueueOutcome = "queued";
            xScheduleUiState = "queued";
          }
        }
      }

      for (const attachment of attachedFiles) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      setPostText("");
      setScheduledAt("");
      setAutoPublishXScheduled(false);
      setAttachedFiles([]);
      setNotice({
        tone: xScheduleWarning ? "info" : cloudRunConnected ? "success" : "info",
        text: xScheduleWarning || (
          mediaJobCount === 0
            ? "予約投稿と添付ファイルをSupabaseへ保存しました。"
            : cloudRunConnected
              ? `予約投稿を保存し、動画処理${mediaJobCount}件を開始しました。`
              : `予約投稿を保存し、動画処理${mediaJobCount}件をキューへ登録しました。Cloud Run接続後に処理されます。`),
      });
      if (autoPublishXScheduled && postId && xScheduleUiState) {
        setXScheduleLocalStates((current) => ({ ...current, [postId!]: xScheduleUiState! }));
      }
      await loadWorkspaceData(user);
      if (autoPublishXScheduled && postId && xScheduleUiState) {
        const savedPostId = postId;
        setHistory((current) => current.map((record) => record.id === savedPostId
          ? { ...record, xScheduleState: xScheduleUiState }
          : record));
      }
      setActiveView("calendar");
    } catch (error) {
      if (postId && !scheduleContentSaved) {
        await rollbackFailedSchedule(postId, uploadedStoragePaths);
      }
      if (scheduleContentSaved && postId) {
        const outcome = scheduleEnqueueOutcome;
        const uncertain = outcome === "pending" || outcome === "unknown";
        const visibleState = uncertain ? "unknown" : outcome === "queued" ? "queued" : null;
        const message = uncertain
          ? "予約投稿は保存済みですが、X自動公開の登録結果を確認できません。重複登録を避けるため再操作せず、予約一覧の状態を確認してください。"
          : outcome === "queued"
            ? "予約投稿とX自動公開予約は登録済みですが、一覧を再読み込みできませんでした。予約一覧を再読み込みして状態を確認してください。"
            : autoPublishXScheduled
              ? "予約投稿は保存済みですが、X自動公開予約は登録されていません。予約一覧で状態を確認してください。"
              : "予約投稿は保存済みですが、一覧を再読み込みできませんでした。予約一覧を再読み込みしてください。";
        if (visibleState) {
          setXScheduleLocalStates((current) => ({ ...current, [postId!]: visibleState }));
        }
        setNotice({ tone: "info", text: message });
        if (user) {
          try {
            await loadWorkspaceData(user);
          } catch {
            // The saved content and queue outcome remain authoritative.
          }
          const savedPostId = postId;
          if (visibleState) {
            setHistory((current) => current.map((record) => record.id === savedPostId
              ? { ...record, xScheduleState: visibleState }
              : record));
          }
          setNotice({ tone: "info", text: message });
          setActiveView("calendar");
        }
        return;
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
    if (!xAttemptsLoaded || xPublishingId) return;
    const target = history.find((record) => record.id === postId);
    if (!target || target.status !== "予約済み") return;
    const hasAutoXSchedule = Boolean(target.xScheduleState);
    const scheduleAttempt = xAttempts[postId];
    if (hasAutoXSchedule && !xScheduleCanCancel(target.xScheduleState ?? "", scheduleAttempt)) {
      setNotice({ tone: "info", text: "X自動公開の処理中または結果確認中です。外部公開の有無を確認できるまでキャンセルできません。" });
      return;
    }
    if (!hasAutoXSchedule && xAttemptLocksPost(scheduleAttempt)) return;
    let confirmation = hasAutoXSchedule
      ? target.xScheduleState === "failed"
        ? "確定した失敗を解除し、投稿を下書きに戻しますか？不明な公開結果はキャンセルできません。"
        : "Xへの自動公開予約をキャンセルしますか？投稿は下書きに戻ります。"
      : "この予約投稿をキャンセルして下書きに戻しますか？";
    const mediaWarning = hasAutoXSchedule
      ? xScheduleCancelMediaWarning(target.xScheduleState ?? "", target.files.length)
      : null;
    if (mediaWarning) confirmation += `\n\n${mediaWarning}`;
    if (!window.confirm(confirmation)) {
      return;
    }

    setNotice(null);
    if (hasAutoXSchedule) {
      const { data: cancelled, error: cancelError } = await supabase.rpc("social_x_schedule_cancel", {
        p_post: postId,
      });
      if (cancelError || cancelled?.state !== "cancelled") {
        setXScheduleLocalStates((current) => ({ ...current, [postId]: "unknown" }));
        setHistory((current) => current.map((record) => record.id === postId
          ? { ...record, xScheduleState: "unknown" }
          : record));
        setNotice({
          tone: "error",
          text: "X自動公開予約のキャンセル結果を確認できません。重複操作を避け、予約一覧の状態を再読み込みしてください。",
        });
        return;
      }
      setXScheduleLocalStates((current) => ({ ...current, [postId]: "cancelled" }));
      setNotice({ tone: "success", text: "X自動公開予約をキャンセルしました。" });
      await loadWorkspaceData(user);
      return;
    }

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
    if (!xAttemptsLoaded || xAttemptLocksPost(xAttempts[postId]) || xPublishingId) return;
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
    if (!xAttemptsLoaded || xAttemptLocksPost(xAttempts[postId]) || xPublishingId) return;
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

  async function invokeXOAuth(body: Record<string, unknown>) {
    if (!supabase) throw new XOAuthUiError(xOAuthFailureMessage("not_configured"));
    let result;
    try {
      result = await supabase.functions.invoke("social-x-oauth", { body });
    } catch {
      setXOAuthServer("unavailable");
      throw new XOAuthUiError(xOAuthFailureMessage(""));
    }
    const { data, error } = result;
    if (error) {
      // Only a bounded error code is forwarded. Provider bodies and secrets never reach notices.
      let code = "";
      if ("context" in error && error.context instanceof Response) {
        try {
          const failure = await error.context.clone().json();
          code = typeof failure?.error === "string" ? failure.error : "";
        } catch { /* Network/unpublished function errors use the generic safe notice. */ }
      }
      setXOAuthServer("unavailable");
      throw new XOAuthUiError(xOAuthFailureMessage(code));
    }
    if (!data || data.ok === false) throw new XOAuthUiError(xOAuthFailureMessage(data?.error));
    setXOAuthServer("ready");
    return data;
  }

  async function configureXOAuth() {
    if (!workspaceId) throw new XOAuthUiError(xOAuthFailureMessage("not_configured"));
    const target = integrations.x;
    if (!integrationInputReady("x", target)) {
      throw new XOAuthUiError("OAuth 2.0 Client IDを入力してください。数値のApp IDではありません。");
    }
    const data = await invokeXOAuth(xOAuthConfigureBody(workspaceId, target));
    setIntegrations((current) => ({
      ...current,
      x: {
        ...current.x,
        clientSecret: "",
        accessToken: "",
        refreshToken: "",
        webhookSecret: "",
        callbackUrl: calculatedXCallbackUrl,
        status: "要確認",
        updatedAt: formatDateTime(new Date().toISOString()),
        stored: {
          ...current.x.stored,
          clientSecret: data.status?.clientSecret === true || current.x.stored.clientSecret,
        },
      },
    }));
  }

  async function startXOAuth() {
    if (!supabase || !user || !workspaceId || savingIntegration) return;
    if (hasUnsavedComposer({ postText, attachmentCount: attachedFiles.length, scheduledAt, channelCount: selectedChannels.length })) {
      setNotice({
        tone: "info",
        text: "認可画面への移動で未保存の投稿が失われないよう、先に下書きを保存するか未保存の入力を消してからXに連携してください。",
      });
      return;
    }
    setSavingIntegration(true);
    setNotice(null);
    try {
      await configureXOAuth();
      const data = await invokeXOAuth({ action: "start", workspaceId });
      const authorizationUrl = safeXAuthorizationUrl(data.authorizationUrl);
      window.location.assign(authorizationUrl);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof XOAuthUiError ? error.message :
          error instanceof Error && error.message === "invalid_authorization_url"
            ? "認可URLを安全に確認できませんでした。Xの認可画面には移動していません。"
            : xOAuthFailureMessage(""),
      });
    } finally {
      setSavingIntegration(false);
    }
  }

  async function refreshXOAuth() {
    if (!supabase || !user || !workspaceId || savingIntegration || !integrations.x.stored.refreshToken) return;
    setSavingIntegration(true);
    setNotice(null);
    try {
      await invokeXOAuth({ action: "refresh", workspaceId });
      const connected = await reloadXIntegration(workspaceId);
      setNotice({
        tone: connected ? "success" : "error",
        text: connected ? "Xのトークンを更新しました。自動公開はまだ行われません。" : "Xの接続状態を確認できません。Xに再連携してください。",
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof XOAuthUiError ? error.message : xOAuthFailureMessage("") });
    } finally {
      setSavingIntegration(false);
    }
  }

  async function saveIntegration(id: ChannelId) {
    if (!supabase || !user || !workspaceId || savingIntegration) return;
    const target = integrations[id];
    if (!integrationInputReady(id, target)) {
      setNotice({
        tone: "error",
        text: id === "x" ? "OAuth 2.0 Client IDを入力してください。" : "Client ID / App ID と Access Token は必須です。",
      });
      return;
    }

    setSavingIntegration(true);
    setNotice(null);

    try {
      if (id === "x") {
        await configureXOAuth();
        setNotice({
          tone: "info",
          text: "Xのアプリ設定を保存しました。「Xに連携」で許可を完了してください。投稿・自動公開はまだ有効になりません。",
        });
        return;
      }
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
            status: "needs_review",
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
        text: id === "x"
          ? error instanceof XOAuthUiError ? error.message : xOAuthFailureMessage("")
          : getErrorMessage(error, "連携情報の保存に失敗しました。"),
      });
    } finally {
      setSavingIntegration(false);
    }
  }

  function checkIntegrationInput(id: ChannelId) {
    const target = integrations[id];
    const ready = integrationInputReady(id, target);
    setIntegrations((current) => ({
      ...current,
      [id]: {
        ...current[id],
        status: ready ? "入力確認済み" : "要確認",
      },
    }));
    setNotice({
      tone: ready ? "success" : "error",
      text: id === "x"
        ? ready ? "Client IDを確認しました。これは入力確認のみです。「Xに連携」でXの許可を完了してください。" : "OAuth 2.0 Client IDを確認してください。"
        : ready
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
      <main className="auth-shell social-auth">
        <Loader2 className="spin" aria-hidden="true" size={28} />
        <p>安全な接続を確認しています</p>
      </main>
    );
  }

  if (!supabase) {
    return (
      <main className="auth-shell social-auth">
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
      <main className="auth-shell social-auth social-auth--split">
        <section className="auth-intro" aria-label="アプリについて">
          <div className="auth-intro-brand"><div className="brand-mark">IX</div><h1>Instatic TalksX</h1></div>
          <div className="auth-intro-copy">
            <p className="eyebrow">YOUR SOCIAL WORKSPACE</p>
            <h2>SNSの運用を、<br />ひとつの場所で。</h2>
            <p>投稿をつくる。予定を整える。<br />店舗の発信を、もっとスムーズに。</p>
            <div className="auth-channel-row">
              {channels.map((channel) => (
                <div key={channel.id}><ChannelLogo channel={channel.id} /><span>{channel.label}</span></div>
              ))}
            </div>
            <div className="auth-feature-list">
              <span><CheckCircle2 size={16} aria-hidden="true" />複数SNSの投稿をまとめて準備</span>
              <span><CheckCircle2 size={16} aria-hidden="true" />予約・履歴・ファイルを店舗ごとに管理</span>
            </div>
          </div>
          <p className="auth-intro-footer">MARUGO GROUP · SOCIAL OPERATIONS</p>
        </section>
        <section className="auth-panel">
          <div className="auth-brand">
            <div className="brand-mark">IX</div>
            <div>
              <p className="eyebrow">SNS Ops Console</p>
              <p className="auth-short-title">Instatic TalksX</p>
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
                placeholder="メールアドレスを入力"
                required
              />
            </label>
            <div className="auth-password-field">
              <label htmlFor="auth-password">パスワード</label>
              <div className="auth-password-input">
              <input
                id="auth-password"
                type={authPasswordVisible ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  authMode === "signin" ? "current-password" : "new-password"
                }
                minLength={authMode === "signup" ? 12 : undefined}
                placeholder={authMode === "signup" ? "12文字以上で設定" : "パスワードを入力"}
                required
              />
              <button type="button" aria-label={authPasswordVisible ? "パスワードを隠す" : "パスワードを表示"}
                aria-pressed={authPasswordVisible} onClick={() => setAuthPasswordVisible((visible) => !visible)}>
                {authPasswordVisible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
              </div>
            </div>
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
                setAuthPasswordVisible(false);
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
      <main className="auth-shell social-auth">
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
      <main className="app-shell social-app">
      <a className="skip-link" href="#social-workspace">作業画面へ移動</a>
      <aside className={`sidebar ${mobileMenuOpen ? "is-open" : ""}`} aria-label="SNS管理メニュー">
        <div className="sidebar-brand-row">
        <div className="brand-lockup">
          <div className="brand-mark">IX</div>
          <div>
            <p className="eyebrow">MARUGO · SNS WORKSPACE</p>
            <h1>Instatic TalksX</h1>
          </div>
        </div>
        <button className="icon-button mobile-menu-toggle" type="button" aria-expanded={mobileMenuOpen}
          ref={mobileMenuButtonRef}
          aria-controls="social-navigation" aria-label={mobileMenuOpen ? "メニューを閉じる" : "メニューを開く"}
          onClick={() => setMobileMenuOpen((open) => !open)}>
          {mobileMenuOpen ? <CloseIcon size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        </div>

        <div className="sidebar-content" id="social-navigation">
        <div className="store-context" aria-label="現在の店舗">
          <Building2 aria-hidden="true" size={17} />
          <div>
            <small>所属店舗</small>
            <strong>{currentStore?.name ?? "店舗未設定"}</strong>
          </div>
        </div>

        <button className="sidebar-create" type="button" onClick={() => openView("compose")}>
          <Plus size={18} aria-hidden="true" /><span>投稿を作成</span>
        </button>
        <p className="nav-section-label">ワークスペース</p>
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
                onClick={() => openView(view.id)}
                aria-pressed={activeView === view.id}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{view.label}</span>
                {view.id === "calendar" && allScheduledPosts.length > 0 && <span className="nav-count">{allScheduledPosts.length}</span>}
                {view.id === "inbox" && <small className="nav-soon">準備中</small>}
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
            <span>SNSアカウント</span><small>{registeredCount}/{channels.length} 登録済み</small>
          </div>
          {channels.map((channel) => (
            <button
              className={`account-row ${activeView === "settings" && activeIntegrationId === channel.id ? "active" : ""}`}
              key={channel.id}
              type="button"
              onClick={() => {
                setActiveIntegrationId(channel.id);
                openView("settings");
              }}
            >
              <ChannelLogo channel={channel.id} />
              <span>
                <strong>{channel.label}</strong>
                <small>API設定</small>
              </span>
              <span className={`account-health ${getStatusTone(integrations[channel.id].status)}`}>
                {integrations[channel.id].status}
              </span>
            </button>
          ))}
        </section>

        <div className="user-panel">
          <div>
            <strong>{user.email}</strong>
            <small>{currentStore?.name ?? "店舗未設定"}</small>
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
        </div>
      </aside>

      <section className="workspace" id="social-workspace" tabIndex={-1}>
        <header className="topbar">
          <div>
            <p className="eyebrow">
              ワークスペース / {currentStore?.name ?? "店舗未設定"}
            </p>
            <h2>
              {activeView === "compose" && "投稿を作成"}
              {activeView === "calendar" && "予約一覧"}
              {activeView === "history" && "投稿履歴"}
              {activeView === "inbox" && "コメントとDM"}
              {activeView === "analytics" && "運用集計"}
              {activeView === "settings" && "連携設定"}
            </h2>
            <p className="view-description">{viewDescriptions[activeView]}</p>
          </div>
          <div className="topbar-actions">
            {(activeView === "history" || activeView === "calendar") && <div className="search-box">
              <Search aria-hidden="true" size={17} />
              <span className="sr-only">投稿を検索</span>
              <input
                aria-label="投稿を検索"
                placeholder="投稿・担当者・SNSを検索"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && <button type="button" aria-label="検索をクリア" onClick={() => setSearchQuery("")}><CloseIcon size={15} aria-hidden="true" /></button>}
            </div>}
            <button
              className="icon-button"
              type="button"
              aria-label="最新の情報に更新"
              title="最新の情報に更新"
              onClick={() => void loadWorkspaceData(user)}
              disabled={dataLoading}
            >
              <RefreshCcw
                className={dataLoading ? "spin" : undefined}
                aria-hidden="true"
                size={18}
              />
            </button>
            {activeView !== "compose" && <button className="primary-button topbar-create" type="button" onClick={() => openView("compose")}>
              <Plus aria-hidden="true" size={17} /><span>投稿を作成</span>
            </button>}
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

        {["compose", "calendar", "history"].includes(activeView) && <section className="status-strip" aria-label="運用状況" aria-busy={dataLoading}>
          {[
            { label: "保存した投稿", value: history.length, icon: FileText, filter: "all" as PostFilter, view: "history" as ViewId },
            { label: "予約中", value: allScheduledPosts.length, icon: CalendarDays, filter: "all" as PostFilter, view: "calendar" as ViewId },
            { label: "下書き", value: draftCount, icon: History, filter: "下書き" as PostFilter, view: "history" as ViewId },
            { label: "要確認", value: failedCount, icon: AlertCircle, filter: "失敗" as PostFilter, view: "history" as ViewId },
          ].map((item) => <button type="button" className={`status-card ${item.filter === "失敗" && item.value ? "needs-attention" : ""}`} key={item.label}
            onClick={() => openView(item.view, item.filter)} aria-label={`${item.label} ${dataLoading ? "読み込み中" : `${item.value}件`}を表示`}>
            <span className="stat-label"><item.icon size={17} aria-hidden="true" />{item.label}</span>
            <strong>{dataLoading ? "—" : item.value}<small>件</small></strong><ArrowRight size={16} className="stat-arrow" aria-hidden="true" />
          </button>)}
        </section>}

        {activeView === "compose" && (
          <section className="compose-layout" aria-label="投稿作成">
            <div className="composer-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">NEW POST</p>
                  <h3>新しい投稿</h3>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={savingPost || Boolean(xPublishingId)}
                  onClick={optimizeCopy}
                >
                  <Wand2 aria-hidden="true" size={17} />
                  <span>文面を整える</span>
                </button>
              </div>

              <div className="compose-step-heading"><span>1</span><h4>投稿先を選ぶ</h4><small>複数選択できます</small></div>
              <div className="channel-toggle-grid" aria-label="投稿先">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    disabled={savingPost || Boolean(xPublishingId)}
                    className={selectedChannels.includes(channel.id) ? `channel-toggle ${channel.tone} active` : `channel-toggle ${channel.tone}`}
                    onClick={() => toggleChannel(channel.id)}
                    aria-pressed={selectedChannels.includes(channel.id)}
                  >
                    <ChannelLogo channel={channel.id} />
                    <span><strong>{channel.label}</strong><small>{integrations[channel.id].status}</small></span>
                    {selectedChannels.includes(channel.id) && <CheckCircle2 aria-hidden="true" size={18} />}
                  </button>
                ))}
              </div>
              <div className="compose-step-heading"><span>2</span><h4>投稿内容をつくる</h4></div>
              <label className="field-label" htmlFor="post-copy">
                投稿本文
              </label>
              <textarea
                id="post-copy"
                disabled={savingPost || Boolean(xPublishingId)}
                value={postText}
                onChange={(event) => setPostText(event.target.value)}
                maxLength={2200}
                placeholder="新メニューのお知らせ、今日のおすすめ、店舗の近況など…"
              />
              <div className="field-meta">
                <span>本文は2,200文字まで</span>
                <span>{postText.length.toLocaleString()}/2,200</span>
              </div>

              <div className="file-upload-row">
                <label className="file-upload-button">
                  <ImagePlus aria-hidden="true" size={20} />
                  <span><strong>画像・動画・ファイルを添付</strong><small>クリックしてファイルを選択</small></span>
                  <input
                    type="file"
                    disabled={savingPost || Boolean(xPublishingId)}
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
                            disabled={savingPost || Boolean(xPublishingId)}
                          >
                            <Scissors aria-hidden="true" size={14} />
                            <span>動画編集</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={savingPost || Boolean(xPublishingId)}
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

              <div className="compose-step-heading"><span>3</span><h4>公開予定を決める</h4></div>
              <div className="schedule-row">
                <label>
                  <span>公開予定日時（端末の現地時間）</span>
                  <input
                    type="datetime-local"
                    disabled={savingPost || Boolean(xPublishingId)}
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
                  isDisabled={savingPost || Boolean(xPublishingId)}
                >
                  {savingPost ? (
                    <Loader2 className="spin" aria-hidden="true" size={18} />
                  ) : (
                    <Plus aria-hidden="true" size={18} />
                  )}
                  <span>{savingPost ? "保存しています…" : "予約を保存"}</span>
                </Button>
              </div>
              {selectedChannels.length === 1 && selectedChannels[0] === "x" && (
                <div className="x-publication-panel" aria-label="X自動公開予約">
                  <label className="field-label">
                    <input
                      type="checkbox"
                      checked={autoPublishXScheduled}
                      disabled={savingPost || Boolean(xPublishingId) || !xAutoPublishReady}
                      onChange={(event) => setAutoPublishXScheduled(event.target.checked)}
                    />
                    Xへ予約時刻に自動公開する
                  </label>
                  {!xScheduleStatusAvailable
                    ? <p role="status">X自動公開の予約状態を読み込めないため、自動公開は選べません。通常の予約は内容保存のみで、自動公開されません。</p>
                    : !xScheduleReady
                    ? <p role="status">X自動公開の実行基盤が未有効化、または状態を確認できません。通常の予約は内容保存のみで、自動公開されません。</p>
                    : !xScheduleConnectionReady
                    ? <p role="status">X接続と投稿権限を確認できないため、自動公開予約は選べません。通常の予約保存はできます。</p>
                    : <p>通常は予約内容を保存するだけです。この項目を選ぶと、指定時刻にXへ公開します。X APIクレジットを消費し、費用が発生する可能性があります。予約確定前に確認画面が表示されます。</p>}
                  {autoPublishXScheduled && (
                    <p className="x-publication-warning" role="status">
                      Xのみが対象です。本文は加重280文字以内、画像は元のJPEG/PNG最大4枚（各5MiB）、または元のMP4動画1本（20MiB）に限ります。動画編集・他SNSとの同時予約は使えません。
                    </p>
                  )}
                </div>
              )}
              <p className="publishing-note"><AlertCircle size={15} aria-hidden="true" />
                {autoPublishXScheduled
                  ? "自動公開の予約は、X接続状況と対象内容を確認した後に登録します。"
                  : "通常の予約は内容を保存するだけで、SNSへ自動公開しません。"}
              </p>
              <section className="x-publication-panel" aria-label="Xへの手動投稿">
                <h4><ChannelLogo channel="x" small />Xへ今すぐ投稿</h4>
                <p>文章と元のJPEG・PNG画像（4枚まで・各5MiB）、または元のMP4動画（1本・20MiB）を送信します。動画編集は反映しません。</p>
                <p>日時の指定は不要です。他のSNSには送信しません。X APIの利用クレジットを消費し、費用が発生する可能性があります。</p>
                <div className="x-publication-actions">
                  <Button className="primary-button" type="button" variant="primary"
                    onPress={() => confirmXPublish()}
                    isDisabled={savingPost || Boolean(xPublishingId) || !canPublishX ||
                      !selectedChannels.includes("x") || integrations.x.status !== "登録済み" || !xComposerValidation.valid ||
                      (attachedFiles.length > 0 && !integrations.x.scopes.split(/[,\s]+/).includes("media.write"))}>
                    <Send aria-hidden="true" size={17} /><span>Xへの投稿内容を確認</span>
                  </Button>
                  <span>X加重文字数 {xComposerValidation.weightedLength}/280</span>
                </div>
                {selectedChannels.includes("x") && xComposerValidation.error &&
                  <p className="x-publication-warning" role="status">{xComposerValidation.error}</p>}
                {!canPublishX && <p>閲覧専用の利用者はXへ投稿できません。</p>}
                {integrations.x.status !== "登録済み" && <p>Xの本人認可と接続を完了してから利用できます。</p>}
                {attachedFiles.length > 0 && !integrations.x.scopes.split(/[,\s]+/).includes("media.write") &&
                  <p className="x-publication-warning">画像・動画にはXの追加権限が必要です。API設定でmedia.writeを保存し、Xへ再連携してください。文章だけなら現在の権限で利用できます。</p>}
              </section>
            </div>

            <aside className="preview-panel" aria-label="投稿内容の確認">
              <div className="panel-heading"><div><p className="eyebrow">LIVE PREVIEW</p><h3>投稿内容の確認</h3></div><Eye size={19} aria-hidden="true" /></div>
              <div className="post-preview-card">
                <div className="post-preview-account"><span className="preview-avatar"><Building2 size={21} aria-hidden="true" /></span>
                  <div><strong>{currentStore?.name ?? "店舗未設定"}</strong><small>{selectedLabels.join(" / ") || "投稿先を選択してください"}</small></div>
                </div>
                <div className={`post-preview-media ${firstPreviewFile ? "has-media" : ""}`}>
                  {firstPreviewFile?.type.startsWith("image/") ? (
                    // Local object URLs preserve private file bytes in the browser.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={firstPreviewFile.previewUrl} alt="添付画像のプレビュー" />
                  ) : firstPreviewFile?.type.startsWith("video/") ? (
                    <video src={firstPreviewFile.previewUrl} controls playsInline preload="metadata" aria-label="添付動画のプレビュー" />
                  ) : <><ImagePlus size={32} strokeWidth={1.3} aria-hidden="true" /><p>写真や動画で、<br />伝わる投稿に。</p></>}
                </div>
                <p className={`post-preview-body ${postText.trim() ? "" : "is-placeholder"}`}>{postText.trim() || "入力した投稿本文がここに表示されます。"}</p>
                {attachedFiles.length > 1 && <p className="preview-file-count"><Paperclip size={14} aria-hidden="true" />添付ファイル {attachedFiles.length}件</p>}
              </div>
              <dl className="preview-details">
                <div><dt>投稿先</dt><dd>{selectedLabels.join("・") || "未選択"}</dd></div>
                <div><dt>公開予定</dt><dd>{scheduledAt ? formatDateTime(scheduledAt) : "未設定"}</dd></div>
                <div><dt>添付</dt><dd>{attachedFiles.length}ファイル</dd></div>
              </dl>
              <p className="preview-caption">内容確認用のプレビューです。SNS上の実際の表示とは異なります。動画編集の結果は保存後に履歴で確認できます。</p>
              <p className="private-file-note"><ShieldCheck size={15} aria-hidden="true" />ファイルは非公開で保存されます</p>
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
                {dataLoading ? <div className="empty-state"><Loader2 size={24} className="spin" aria-hidden="true" /><p>予約を読み込んでいます…</p></div> : queue.length ? (
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
                              <ChannelLogo channel={channelId} small />
                              {channelById[channelId].label}
                            </span>
                          ))}
                        </div>
                        {post.channels.includes("x") && (
                          <p className="publishing-note">
                            {post.channels.length === 1 && !xScheduleStatusAvailable
                              ? "X自動公開状態を取得できません。自動公開の有無は不明です。再読み込みして確認してください。"
                              : post.xScheduleState
                              ? xScheduleStateLabel(post.xScheduleState)
                              : "保存のみ（SNSへの自動公開なし）"}
                            {post.xScheduleErrorCode
                              ? `。${xScheduleErrorMessage(post.xScheduleErrorCode)}`
                              : ""}
                          </p>
                        )}
                      </div>
                      <div className="queue-actions">
                        <span className="status-pill ready">{post.status}</span>
                        <button
                          className="queue-cancel-button"
                          type="button"
                          disabled={!xAttemptsLoaded ||
                            (post.channels.length === 1 && post.channels[0] === "x" && !xScheduleStatusAvailable) ||
                            (post.xScheduleState
                              ? !xScheduleCanCancel(post.xScheduleState, xAttempts[post.id])
                              : xAttemptLocksPost(xAttempts[post.id])) ||
                            Boolean(xPublishingId)}
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
                    <h3>{searchQuery ? "条件に合う予約がありません" : "次の投稿を準備しましょう"}</h3>
                    <p>{searchQuery ? "別のキーワードで検索してください。" : "投稿を作成して予定を保存すると、ここに表示されます。"}</p>
                    <button className="primary-button" type="button" onClick={() => searchQuery ? setSearchQuery("") : openView("compose")}>
                      {searchQuery ? "検索をクリア" : "投稿を作成"}<ArrowRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            <aside className="approval-panel">
              <div className="section-title">
                <ShieldCheck aria-hidden="true" size={17} />
                <span>予約について</span>
              </div>
              <div className="approval-step done">
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>日時・本文・添付をまとめて保存</span>
              </div>
              <div className="approval-step done">
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>キャンセルした予約は下書きへ</span>
              </div>
              <div className="approval-step done">
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>下書きは履歴から再予約できます</span>
              </div>
              <div className="approval-step current">
                <AlertCircle aria-hidden="true" size={17} />
                <span>通常予約は保存のみ。Xだけを選び、明示的に有効化した予約は自動公開します</span>
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
                  <h3>保存した投稿</h3>
                </div>
                <span className="count-pill">
                  {filteredHistory.length}件
                </span>
              </div>
              <div className="history-filter-bar" role="group" aria-label="投稿の状態で絞り込み">
                {historyFilters.map((filter) => <button type="button" key={filter} className={historyFilter === filter ? "active" : ""}
                  aria-pressed={historyFilter === filter} onClick={() => setHistoryFilter(filter)}>{filter === "all" ? "すべて" : filter}</button>)}
              </div>
              <div className="history-list">
                {dataLoading ? <div className="empty-state"><Loader2 size={24} className="spin" aria-hidden="true" /><p>履歴を読み込んでいます…</p></div> : filteredHistory.length ? (
                  filteredHistory.map((record) => (
                    <button
                      className={
                        selectedHistory?.id === record.id
                          ? "history-card active"
                          : "history-card"
                      }
                      key={record.id}
                      type="button"
                      aria-pressed={selectedHistory?.id === record.id}
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
                              <ChannelLogo channel={channelId} small />
                              {channelById[channelId].label}
                              {channelId === "x" && xAttempts[record.id] && <small>{xPublishStateLabel(xAttempts[record.id].state)}</small>}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span
                        className={`status-pill ${
                          record.status === "失敗" ? "warning" : record.status === "下書き" ? "idle" : "ready"
                        }`}
                      >
                        {record.status}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="empty-state compact">
                    <History aria-hidden="true" size={22} />
                    <h3>{searchQuery || historyFilter !== "all" ? "条件に合う投稿がありません" : "まだ投稿がありません"}</h3>
                    <p>{searchQuery || historyFilter !== "all" ? "検索や絞り込みを変更してください。" : "最初の投稿を作成して、予定を保存しましょう。"}</p>
                    <button className="ghost-button" type="button" onClick={() => searchQuery || historyFilter !== "all" ? openView("history") : openView("compose")}>
                      {searchQuery || historyFilter !== "all" ? "絞り込みをクリア" : "投稿を作成"}<ArrowRight size={16} aria-hidden="true" />
                    </button>
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
                        <ChannelLogo channel={channelId} small />
                        {channelById[channelId].label}
                        {channelId === "x"
                          ? <small>{xAttempts[selectedHistory.id] ? xPublishStateLabel(xAttempts[selectedHistory.id].state) : "未公開"}</small>
                          : <small>未公開（送信機能は未実装）</small>}
                      </span>
                    ))}
                  </div>
                  {selectedHistory.channels.includes("x") && (
                    <section className="x-publication-panel" aria-label="保存済み投稿のX公開状態">
                      <h4>{xAttempts[selectedHistory.id] ? xPublishStateLabel(xAttempts[selectedHistory.id].state) : "X: 未公開"}</h4>
                      {!xAttemptsLoaded ? <p>公開状態を読み込めません。内容の変更・削除・送信は保留してください。</p>
                        : xAttempts[selectedHistory.id] && <p>{xPublishMessage(xAttempts[selectedHistory.id].state)}</p>}
                      {xAttempts[selectedHistory.id]?.state === "rejected" &&
                        <p>{xPublishErrorMessage(xAttempts[selectedHistory.id].error_code)}</p>}
                      {xNextChecks[selectedHistory.id] && <p>動画の次回確認: {formatDateTime(xNextChecks[selectedHistory.id])} 以降</p>}
                      {xPostLink(xAttempts[selectedHistory.id]?.remote_post_id) &&
                        <a href={xPostLink(xAttempts[selectedHistory.id]?.remote_post_id)!} target="_blank" rel="noopener noreferrer">Xの公開投稿を開く</a>}
                      <div className="x-publication-actions">
                        {canPublishX && xAttemptsLoaded &&
                          (!xAttemptLocksPost(xAttempts[selectedHistory.id]) || xAttempts[selectedHistory.id]?.state === "preparing") &&
                          ["下書き", "予約済み", "失敗"].includes(selectedHistory.status) && (
                            <button type="button" className="primary-button" disabled={Boolean(xPublishingId) || savingPost ||
                              xCheckTime < Date.parse(xNextChecks[selectedHistory.id] ?? "")}
                              onClick={() => confirmXPublish(selectedHistory)}>
                              {xAttempts[selectedHistory.id]?.state === "preparing" ? "動画の処理状況を確認して投稿" : "Xへの投稿内容を確認"}
                            </button>
                          )}
                        <button type="button" className="ghost-button" disabled={Boolean(xPublishingId)}
                          onClick={() => void checkXPublishStatus(selectedHistory.id)}>
                          保存状態を確認（X APIへの通信なし）
                        </button>
                      </div>
                      <p>即時公開は内容確認後の手動操作です。予約は通常保存のみで、Xだけを選んで自動公開を明示したものだけ実行対象です。</p>
                      {selectedHistory.channels.length === 1 && selectedHistory.channels[0] === "x" &&
                        selectedHistory.status === "予約済み" && (
                          <p role="status">
                            {selectedHistory.xScheduleState
                              ? xScheduleStateLabel(selectedHistory.xScheduleState)
                              : xScheduleStatusAvailable
                                ? "通常の保存予約（Xへの自動公開なし）"
                                : "X自動公開状態を読み込めません。キャンセル・再操作は保留してください。"}
                          </p>
                        )}
                    </section>
                  )}
                  {!xAttemptLocksPost(xAttempts[selectedHistory.id]) && (selectedHistory.status === "下書き" ||
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
                          disabled={updatingHistoryId === selectedHistory.id || !xAttemptsLoaded || Boolean(xPublishingId)}
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
                          disabled={updatingHistoryId === selectedHistory.id || !xAttemptsLoaded || Boolean(xPublishingId)}
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
                <div className="empty-state compact"><FileText size={24} aria-hidden="true" /><p>投稿を選ぶと、詳細がここに表示されます。</p></div>
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
                    <ChannelLogo channel={channel.id} />
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
              <p className="connection-help">SNSを選んでAPI情報を登録してください。情報を登録しても、SNSへの自動公開はまだ行われません。</p>
            </aside>

            <section className="integration-editor-panel">
              <div className="panel-heading">
                <div className="integration-title">
                  <ChannelLogo channel={activeChannel.id} />
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

              {activeIntegrationId === "x" && (
                <div className="x-oauth-note" role="status">
                  <p>OAuth 2.0のClient IDを使用します。数値のApp IDやBearer Tokenではありません。</p>
                  <p>Access TokenとRefresh TokenはXの許可後にサーバーで管理され、画面には表示しません。手動公開は投稿内容の確認後に実行します。予約の自動公開は行いません。</p>
                  <p>画像・動画にはmedia.writeの追加権限が必要です。Scopesの変更を保存すると現在の接続は無効になり、Xへの再連携が必要です。設定変更や再連携は自動で行いません。</p>
                  {xOAuthServer !== "ready" && (
                    <p>
                      {xOAuthServer === "checking" ? "連携サーバーの公開状態を確認中です。" :
                        "表示中のCallback URLは接続先から計算した予定URLです。連携サーバーが未公開・未設定、または応答を確認できないため、まだ使用可能とは確認できません。"}
                    </p>
                  )}
                </div>
              )}

              <fieldset className="form-grid integration-fields" disabled={savingIntegration}>
                <label className="integration-field">
                  <span>
                    <KeyRound aria-hidden="true" size={15} />
                    {activeIntegrationId === "x" ? "OAuth 2.0 Client ID" : "Client ID / App ID"}
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
                    placeholder={activeIntegrationId === "x" ? "X Developer ConsoleのOAuth 2.0 Client ID" : `${activeChannel.label} App ID`}
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

                {activeIntegrationId === "x" ? (
                  <>
                    <div className="integration-field">
                      <span><ShieldCheck aria-hidden="true" size={15} />Access Token</span>
                      <p className="server-managed-token">
                        {activeIntegration.stored.accessToken ? "保存済み・サーバー管理（値は非表示）" : "未取得・「Xに連携」で取得"}
                      </p>
                    </div>
                    <div className="integration-field">
                      <span><RefreshCcw aria-hidden="true" size={15} />Refresh Token</span>
                      <p className="server-managed-token">
                        {activeIntegration.stored.refreshToken ? "保存済み・サーバー管理（値は非表示）" : "未取得・offline.accessの許可後に取得"}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}

                <label className="integration-field wide">
                  <span>
                    <Link2 aria-hidden="true" size={15} />
                    Callback URL
                  </span>
                  <input
                    value={activeIntegrationId === "x" ? calculatedXCallbackUrl : activeIntegration.callbackUrl}
                    readOnly={activeIntegrationId === "x"}
                    onChange={(event) =>
                      updateIntegration(
                        activeIntegrationId,
                        "callbackUrl",
                        event.target.value,
                      )
                    }
                    placeholder={activeIntegrationId === "x" ? "Supabaseの公開URLが未設定です" : `https://your-domain.example/oauth/${activeIntegrationId}/callback`}
                    autoComplete="url"
                  />
                </label>

                {activeIntegrationId !== "x" && (
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
                )}

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
                  {activeIntegrationId === "x" && !activeIntegration.scopes.split(/[,\s]+/).includes("media.write") && (
                    <button className="ghost-button" type="button" onClick={() =>
                      updateIntegration("x", "scopes", defaultScopes.x)}>
                      画像・動画用のScopesを入力（まだ保存しません）
                    </button>
                  )}
                </label>
              </fieldset>

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
                  <span>{activeIntegrationId === "x" ? "アプリ設定を保存" : "安全に登録"}</span>
                </Button>
                {activeIntegrationId === "x" && (
                  <>
                    <Button
                      className="primary-button"
                      type="button"
                      variant="primary"
                      onPress={() => void startXOAuth()}
                      isDisabled={savingIntegration || !calculatedXCallbackUrl}
                    >
                      <PlugZap aria-hidden="true" size={18} />
                      <span>{activeIntegration.stored.accessToken ? "Xに再連携" : "Xに連携"}</span>
                    </Button>
                    <Button
                      className="ghost-button"
                      type="button"
                      variant="secondary"
                      onPress={() => void refreshXOAuth()}
                      isDisabled={savingIntegration || !activeIntegration.stored.refreshToken}
                    >
                      <RefreshCcw aria-hidden="true" size={18} />
                      <span>トークンを更新</span>
                    </Button>
                  </>
                )}
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

          </section>
        )}
        </section>
      </main>
      <dialog ref={xConfirmationRef} className="x-publish-dialog" aria-labelledby="x-publish-confirm-title"
        onCancel={(event) => { event.preventDefault(); setXConfirmation(null); }}>
        {xConfirmation && (
          <>
            <h3 id="x-publish-confirm-title">Xへの公開を確認</h3>
            <p><strong>送信先: {xConfirmation.username ? `@${xConfirmation.username}` : "接続済みのXアカウント"} のみ</strong></p>
            <p>他のSNSには送信しません。X APIのクレジットを消費し、費用が発生する可能性があります。</p>
            <p>以下の本文と元ファイルをそのまま送信します。動画編集は反映しません。</p>
            <p className="x-publish-frozen-body">{xConfirmation.body}</p>
            <p>X加重文字数 {validateXPost(xConfirmation.body, xConfirmation.files).weightedLength}/280</p>
            <ul>{xConfirmation.files.map((file) => <li key={file.id}>{file.name} / {formatFileSize(file.size)} / {file.type}</li>)}</ul>
            {xConfirmation.resume && <p>保存済みの同じ送信要求を続行し、動画の処理状態を確認します。</p>}
            <p>公開結果が不明な場合は自動再送しません。X上の投稿を手動で確認してください。</p>
            <div className="x-publication-actions">
              <button className="ghost-button" type="button" onClick={() => setXConfirmation(null)}>戻る</button>
              <button className="primary-button" type="button" disabled={savingPost || Boolean(xPublishingId)}
                onClick={() => void publishConfirmedX()}>{xConfirmation.resume ? "動画の処理状況を確認して投稿" : "この内容をXへ公開する"}</button>
            </div>
          </>
        )}
      </dialog>
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
