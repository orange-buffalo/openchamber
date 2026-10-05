import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '@/lib/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GitHeader } from './GitHeader';

describe('Git header tree entry point', () => {
  for (const isClean of [true, false]) {
    test(`remains available with isClean=${isClean}`, () => {
      const noop = () => {};
      const markup = renderToStaticMarkup(
        <I18nProvider><TooltipProvider><GitHeader
          directory="/repo"
          status={{ current: 'main', tracking: null, ahead: 0, behind: 0, files: [], isClean }}
          localBranches={['main']} remoteBranches={[]} branchInfo={undefined}
          syncAction={null} remotes={[]} onFetch={noop} onPull={noop} onSync={noop}
          onPublish={noop} onChooseSyncTargets={noop} onRemoveRemote={noop}
          removingRemoteName={null} onCheckoutBranch={noop} onCreateBranch={async () => {}}
          activeIdentityProfile={null} availableIdentities={[]} onSelectIdentity={noop}
          isApplyingIdentity={false} isWorktreeMode={false} onOpenChanges={noop}
        /></TooltipProvider></I18nProvider>,
      );
      expect(markup).toContain('aria-label="Tree view"');
      expect(markup).toContain('node-tree');
    });
  }
});
