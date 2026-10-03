const configuredBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";

const normalizedBasePath = configuredBasePath
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

export function appPath(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBasePath}${normalizedPath}`;
}
