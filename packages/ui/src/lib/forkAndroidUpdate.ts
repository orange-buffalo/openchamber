/**
 * Fork-local Android update check.
 *
 * This fork publishes a rolling signed APK to the `android-latest` release on
 * every push to the default branch (`.github/workflows/mobile-ci.yml`). The
 * release carries an `android-latest.json` manifest whose `versionCode` is the
 * CI run number — the same value the APK is built with (`app/build.gradle`
 * reads `OPENCHAMBER_ANDROID_VERSION_CODE`) — so comparing it against the
 * installed build is authoritative rather than a heuristic.
 *
 * Upstream's own update system was removed from this fork (FORK.md #3). This is
 * a deliberately small replacement covering only the native Android shell:
 * check, then hand the APK URL to the system browser. Nothing self-installs.
 */

export const FORK_ANDROID_MANIFEST_URL =
  'https://github.com/orange-buffalo/openchamber/releases/download/android-latest/android-latest.json';

/**
 * The manifest is fetched over TLS from GitHub, but its `apkUrl` still decides
 * where the user is sent. Pin the hosts GitHub actually serves release assets
 * from so a mangled or swapped manifest cannot redirect the download.
 */
const ALLOWED_APK_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

export type ForkAndroidManifest = {
  versionCode: number;
  versionName: string;
  apkUrl: string;
};

export type ForkAndroidUpdateCheck =
  | { status: 'available'; manifest: ForkAndroidManifest }
  | { status: 'up-to-date' }
  /**
   * The check could not complete — offline, malformed manifest, or no readable
   * installed version. Deliberately distinct from `up-to-date`: a failed fetch
   * must not be reported as "you are current".
   */
  | { status: 'unknown' };

export const parseForkAndroidManifest = (raw: unknown): ForkAndroidManifest | null => {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;

  const versionCode = candidate.versionCode;
  if (typeof versionCode !== 'number' || !Number.isFinite(versionCode)) return null;

  const versionName = typeof candidate.versionName === 'string' ? candidate.versionName.trim() : '';
  if (!versionName) return null;

  const apkUrl = typeof candidate.apkUrl === 'string' ? candidate.apkUrl.trim() : '';
  if (!apkUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(apkUrl);
  } catch {
    return null;
  }
  if (parsedUrl.protocol !== 'https:' || !ALLOWED_APK_HOSTS.has(parsedUrl.hostname)) return null;

  return { versionCode, versionName, apkUrl: parsedUrl.toString() };
};

export const compareForkAndroidBuild = (
  manifest: ForkAndroidManifest | null,
  installedVersionCode: number | null,
): ForkAndroidUpdateCheck => {
  if (!manifest || installedVersionCode === null || !Number.isFinite(installedVersionCode)) {
    return { status: 'unknown' };
  }
  return manifest.versionCode > installedVersionCode
    ? { status: 'available', manifest }
    : { status: 'up-to-date' };
};

/**
 * GitHub serves release assets without an `Access-Control-Allow-Origin` header,
 * so the WebView's own fetch is blocked by CORS. CapacitorHttp issues the
 * request natively, which is the only reason this check works on-device.
 */
const fetchManifestJson = async (): Promise<unknown> => {
  const { Capacitor, CapacitorHttp } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    const response = await fetch(FORK_ANDROID_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Manifest request failed with ${response.status}`);
    return response.json();
  }

  const response = await CapacitorHttp.get({
    url: FORK_ANDROID_MANIFEST_URL,
    headers: { Accept: 'application/json' },
    responseType: 'json',
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Manifest request failed with ${response.status}`);
  }
  // Native returns a parsed object for JSON, but a string body when the server
  // labels it octet-stream, which GitHub does for release assets.
  return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
};

const readInstalledVersionCode = async (): Promise<number | null> => {
  const { App } = await import('@capacitor/app');
  const info = await App.getInfo();
  const parsed = Number.parseInt(String(info.build), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const checkForForkAndroidUpdate = async (): Promise<ForkAndroidUpdateCheck> => {
  try {
    const [raw, installedVersionCode] = await Promise.all([
      fetchManifestJson(),
      readInstalledVersionCode(),
    ]);
    return compareForkAndroidBuild(parseForkAndroidManifest(raw), installedVersionCode);
  } catch {
    return { status: 'unknown' };
  }
};
