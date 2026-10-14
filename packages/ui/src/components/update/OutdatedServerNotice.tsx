import { useI18n } from '@/lib/i18n';

/** Keep the compatibility gate without restoring the fork's removed updater. */
export function OutdatedServerNotice({ version }: { version: string }) {
  const { t } = useI18n();
  return (
    <div className="flex w-full flex-col gap-2">
      <h1 className="typography-title text-foreground">{t('startup.serverOutdated.title')}</h1>
      <p className="typography-body text-muted-foreground">{t('startup.serverOutdated.description', { version })}</p>
    </div>
  );
}
