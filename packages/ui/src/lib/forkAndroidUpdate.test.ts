import { describe, expect, test } from 'bun:test';

import {
  compareForkAndroidBuild,
  parseForkAndroidManifest,
  type ForkAndroidManifest,
} from './forkAndroidUpdate';

// Shape published by .github/workflows/mobile-ci.yml.
const validManifest = {
  versionCode: 7,
  versionName: 'openchamber-7',
  commit: 'a4509b4bf32f50cd37a3e6d2d22299e269c0a250',
  publishedAt: '2026-08-21T11:35:13Z',
  apkUrl: 'https://github.com/orange-buffalo/openchamber/releases/download/android-latest/OpenChamber-android.apk',
  runUrl: 'https://github.com/orange-buffalo/openchamber/actions/runs/32475638755',
};

const manifest = (overrides: Partial<typeof validManifest> = {}) => ({ ...validManifest, ...overrides });

describe('parseForkAndroidManifest', () => {
  test('accepts the published manifest shape', () => {
    expect(parseForkAndroidManifest(manifest())).toEqual({
      versionCode: 7,
      versionName: 'openchamber-7',
      apkUrl: validManifest.apkUrl,
    });
  });

  test('rejects an apkUrl pointing off GitHub', () => {
    expect(parseForkAndroidManifest(manifest({ apkUrl: 'https://example.com/evil.apk' }))).toBeNull();
  });

  test('rejects a plaintext apkUrl', () => {
    expect(parseForkAndroidManifest(manifest({
      apkUrl: 'http://github.com/orange-buffalo/openchamber/releases/download/android-latest/OpenChamber-android.apk',
    }))).toBeNull();
  });

  test('rejects a non-numeric versionCode', () => {
    expect(parseForkAndroidManifest(manifest({ versionCode: '7' as unknown as number }))).toBeNull();
  });

  test('rejects malformed input', () => {
    expect(parseForkAndroidManifest(null)).toBeNull();
    expect(parseForkAndroidManifest('nope')).toBeNull();
    expect(parseForkAndroidManifest({})).toBeNull();
  });
});

describe('compareForkAndroidBuild', () => {
  const parsed = parseForkAndroidManifest(manifest()) as ForkAndroidManifest;

  test('offers a newer build', () => {
    expect(compareForkAndroidBuild(parsed, 6)).toEqual({ status: 'available', manifest: parsed });
  });

  test('stays quiet on the current build', () => {
    expect(compareForkAndroidBuild(parsed, 7)).toEqual({ status: 'up-to-date' });
  });

  test('stays quiet when the installed build is ahead of the release', () => {
    // Local debug builds default to versionCode 1, but a developer build can
    // also run ahead of the published rolling APK.
    expect(compareForkAndroidBuild(parsed, 9)).toEqual({ status: 'up-to-date' });
  });

  test('reports unknown rather than up-to-date when the manifest is unusable', () => {
    expect(compareForkAndroidBuild(null, 6)).toEqual({ status: 'unknown' });
  });

  test('reports unknown when the installed build cannot be read', () => {
    expect(compareForkAndroidBuild(parsed, null)).toEqual({ status: 'unknown' });
  });
});
