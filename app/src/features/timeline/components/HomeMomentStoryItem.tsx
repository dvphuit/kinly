import { Image as ImageIcon } from 'lucide-react';
import { getTimelineMediaItems } from '@/features/timeline/domain/timelineMedia';
import { TimelineMediaButton } from '@/features/timeline/components/TimelineMediaButton';
import { timelineEntryElementId } from '@/features/timeline/hooks/useRecentlyAddedTimelineAnimation';
import type { TimelineItem, TimelineMediaItem } from '@/features/timeline/domain/types';

interface HomeMomentStoryItemProps {
  item: TimelineItem;
  occurredAt: string;
  formattedTime: string;
  onOpenEntry: () => void;
  onOpenMedia: (
    items: TimelineMediaItem[],
    initialIndex: number,
    title: string,
    layoutId: string,
    originSrc: string,
    getLayoutId?: (index: number, media: TimelineMediaItem) => string,
  ) => void;
}

export function HomeMomentStoryItem({
  item,
  occurredAt,
  formattedTime,
  onOpenEntry,
  onOpenMedia,
}: HomeMomentStoryItemProps) {
  const mediaItems = getTimelineMediaItems(item);
  const visibleMediaItems = mediaItems.slice(0, 4);

  return (
    <article id={timelineEntryElementId(item.id)} className="journal-story-item tone-moment is-moment">
      <time className="journal-story-time" dateTime={occurredAt}>{formattedTime}</time>
      <span className="journal-story-icon" aria-hidden="true"><ImageIcon size={16} /></span>
      <div className="journal-story-content">
        <button
          type="button"
          className="journal-story-main"
          onClick={onOpenEntry}
          aria-label={`${item.title}, ${formattedTime}`}
        >
          <span className="journal-story-heading">
            <strong className="journal-story-title">{item.title}</strong>
          </span>
          {item.content && <span className="journal-story-detail">{item.content}</span>}
        </button>
        {mediaItems.length > 0 && (
          <div className={`journal-story-media-bento count-${visibleMediaItems.length}`} aria-label={`${mediaItems.length} media của ${item.title}`}>
            {visibleMediaItems.map((media, index) => (
              <TimelineMediaButton
                className="journal-story-media"
                key={media.id ?? media.blobId ?? `${media.url}-${index}`}
                media={media}
                layoutId={`moment-home-${item.id}-${media.id ?? media.blobId ?? index}`}
                onOpen={(originSrc) => onOpenMedia(
                  mediaItems,
                  index,
                  item.title,
                  `moment-home-${item.id}-${media.id ?? media.blobId ?? index}`,
                  originSrc,
                  (idx) => {
                    const targetIdx = Math.min(idx, visibleMediaItems.length - 1);
                    const targetMedia = visibleMediaItems[targetIdx] ?? mediaItems[0];
                    return `moment-home-${item.id}-${targetMedia?.id ?? targetMedia?.blobId ?? targetIdx}`;
                  },
                )}
                ariaLabel={mediaItems.length === 1
                  ? `Mở ${media.type === 'video' ? 'video' : 'ảnh'} ${item.title}`
                  : `Mở ${media.type === 'video' ? 'video' : 'ảnh'} ${index + 1} của ${item.title}`}
                alt=""
                imageStyle={{ objectPosition: `${media.focalX ?? 50}% ${media.focalY ?? 38}%` }}
                playSize={19}
                moreCount={index === 3 && mediaItems.length > 4 ? mediaItems.length - 4 : 0}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
