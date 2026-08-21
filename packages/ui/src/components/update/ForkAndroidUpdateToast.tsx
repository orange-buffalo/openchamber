import * as React from 'react';

import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui/toast';
import { checkForForkAndroidUpdate } from '@/lib/forkAndroidUpdate';
import { useI18n } from '@/lib/i18n';
import { getClientPlatform } from '@/lib/platform';
import { openExternalUrl } from '@/lib/url';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';

const TOAST_ID = 'fork-android-update-available';
const DISMISSED_VERSION_KEY = 'fork-android-update-dismissed-version-code';
/** The rolling release moves on every push; re-checking on resume is enough. */
const MIN_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Offers the rolling APK from this fork's `android-latest` release when the
 * installed build is behind. Native Android shell only — a browser on Android
 * is not running the APK, so there is nothing for it to update.
 */
export const ForkAndroidUpdateToast: React.FC = () => {
  const { t } = useI18n();
  const lastCheckedAtRef = React.useRef(0);
  const promptedVersionsRef = React.useRef(new Set<number>());

  React.useEffect(() => {
    if (getClientPlatform() !== 'android') {
      return;
    }

    let disposed = false;

    const runCheck = async () => {
      const now = Date.now();
      if (now - lastCheckedAtRef.current < MIN_CHECK_INTERVAL_MS) return;
      lastCheckedAtRef.current = now;

      const result = await checkForForkAndroidUpdate();
      // 'unknown' means the check failed; leave any existing toast alone rather
      // than implying the app is current.
      if (disposed || result.status !== 'available') return;

      const { versionCode, versionName, apkUrl } = result.manifest;
      if (promptedVersionsRef.current.has(versionCode)) return;
      if (getDeferredSafeStorage().getItem(DISMISSED_VERSION_KEY) === String(versionCode)) return;
      promptedVersionsRef.current.add(versionCode);

      toast.info(t('mobileUpdate.toast.available.title'), {
        id: TOAST_ID,
        description: t('mobileUpdate.toast.available.description', { version: versionName }),
        duration: Infinity,
        icon: <Icon name="download" className="h-4 w-4 text-muted-foreground" />,
        action: {
          label: t('mobileUpdate.toast.actions.download'),
          onClick: () => {
            void openExternalUrl(apkUrl);
          },
        },
        cancel: {
          label: t('mobileUpdate.toast.actions.dismiss'),
          onClick: () => {
            getDeferredSafeStorage().setItem(DISMISSED_VERSION_KEY, String(versionCode));
            toast.dismiss(TOAST_ID);
          },
        },
      });
    };

    void runCheck();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void runCheck();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [t]);

  return null;
};
