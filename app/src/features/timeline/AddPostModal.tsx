import { useMemo } from 'react';
import {
  TimelineEntryDialog,
  type JournalTimelineEntry,
} from '@/features/timeline/components/TimelineEntryDialog';
import { useUIStore } from '@/store/useUIStore';
import type { TimelineItem } from '@/features/timeline/domain/types';

type PostTagType = TimelineItem['tagType'];

interface AddPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast: (msg: string, icon?: string) => void;
  presetTagType?: PostTagType;
}

const TAG_LABELS: Record<PostTagType, string> = {
  general: 'Khoảnh khắc',
  milestone: 'Cột mốc',
  feeding: 'Ăn dặm',
  health: 'Sức khỏe',
  mom: 'Của mẹ',
};

function createMomentDraft(
  owner: 'baby' | 'mom',
  tagType: PostTagType,
  now = new Date(),
): JournalTimelineEntry {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  const date = local.toISOString().slice(0, 10);
  const timeFormatted = local.toISOString().slice(11, 16);
  const [year, month, day] = date.split('-');
  const moment: TimelineItem = {
    id: 'draft-moment',
    owner,
    date,
    timeFormatted,
    time: `${day}/${month}/${year} • ${timeFormatted}`,
    author: '',
    authorAvatar: '',
    title: '',
    content: '',
    mediaItems: [],
    mediaUrl: null,
    mediaType: null,
    stats: [],
    likes: 0,
    comments: 0,
    userLiked: false,
    tag: TAG_LABELS[tagType],
    tagType,
    type: 'daily',
  };

  return {
    id: 'moment-draft',
    occurredAt: now.toISOString(),
    owner,
    type: 'moment',
    title: 'Khoảnh khắc',
    detail: '',
    stats: [],
    moment,
  };
}

export function AddPostModal({
  isOpen,
  onClose,
  onSuccessToast,
  presetTagType = 'general',
}: AddPostModalProps) {
  const profileMode = useUIStore((state) => state.profileMode);
  const draft = useMemo(
    () => createMomentDraft(profileMode, presetTagType),
    [presetTagType, profileMode],
  );

  return (
    <TimelineEntryDialog
      open={isOpen}
      entry={draft}
      initialEditing
      creating
      titleOverride="Khoảnh khắc"
      onClose={onClose}
      onSaved={(savedTitle) => {
        onSuccessToast(savedTitle
          ? `Đã lưu khoảnh khắc “${savedTitle}”.`
          : 'Đã lưu khoảnh khắc.', '✓');
      }}
    />
  );
}
