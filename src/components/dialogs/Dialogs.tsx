import { lazy, Suspense } from 'react';
import type { DialogId } from '../../app/state';

const CommandPalette = lazy(() => import('./CommandPalette'));
const ShortcutsDialog = lazy(() => import('./ShortcutsDialog'));
const GitHubDialog = lazy(() => import('./GitHubDialog'));
const PasteDialog = lazy(() => import('./PasteDialog'));
const ExportDialog = lazy(() => import('./ExportDialog'));
const BeautifyDialog = lazy(() => import('./BeautifyDialog'));
const ViewBadgeDialog = lazy(() => import('./ViewBadgeDialog'));
const TableDialog = lazy(() => import('./TableDialog'));
const BadgeBuilderDialog = lazy(() => import('./BadgeBuilderDialog'));
const TemplatesDialog = lazy(() => import('./TemplatesDialog'));
const SectionsDialog = lazy(() => import('./SectionsDialog'));
const EmojiDialog = lazy(() => import('./EmojiDialog'));

/** Mounts the open dialog (each one is its own lazy chunk). */
export default function Dialogs({ dialog }: { dialog: Exclude<DialogId, null> }) {
  return (
    <Suspense fallback={null}>
      {dialog === 'palette' && <CommandPalette />}
      {dialog === 'shortcuts' && <ShortcutsDialog />}
      {dialog === 'github' && <GitHubDialog />}
      {dialog === 'paste' && <PasteDialog />}
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'beautify' && <BeautifyDialog />}
      {dialog === 'viewBadge' && <ViewBadgeDialog />}
      {dialog === 'table' && <TableDialog />}
      {dialog === 'badgeBuilder' && <BadgeBuilderDialog />}
      {dialog === 'templates' && <TemplatesDialog />}
      {dialog === 'sections' && <SectionsDialog />}
      {dialog === 'emoji' && <EmojiDialog />}
    </Suspense>
  );
}
