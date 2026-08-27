import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import { useUIStore } from '@/store/useUIStore';
import { getTimelineMediaItems } from '@/features/timeline/domain/timelineMedia';
import { useTimelineMediaUrl } from '@/features/timeline/hooks/useTimelineMediaUrl';
import type { TimelineItem } from '@/features/timeline/domain/types';

interface TimelineFeedProps {
  onOpenLightbox: (src: string, isVideo?: boolean) => void;
  onOpenAddPost: () => void;
}

export const TimelineFeed: React.FC<TimelineFeedProps> = ({
  onOpenLightbox,
  onOpenAddPost,
}) => {
  const timelineItems = useTimelineStore(s => s.timelineItems);
  const timelineFilter = useTimelineStore(s => s.timelineFilter);
  const setTimelineFilter = useTimelineStore(s => s.setTimelineFilter);
  const selectedCalendarDate = useTimelineStore(s => s.selectedCalendarDate);
  const toggleLike = useTimelineStore(s => s.toggleLike);
  const searchQuery = useUIStore(s => s.searchQuery);

  const filterChips = [
    { id: 'all', label: 'Tất cả' },
    { id: 'milestone', label: 'Cột mốc vàng 🌟' },
    { id: 'feeding', label: 'Ăn dặm & Sữa 🥑' },
    { id: 'mom', label: 'Chăm sóc Mẹ 🤱' },
    { id: 'health', label: 'Sức khỏe & Đo lường 🩺' },
  ];

  // Filter timeline items
  const filteredItems = timelineItems.filter((item) => {
    // Search query match
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchText =
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.tag.toLowerCase().includes(q);
      if (!matchText) return false;
    }

    // Category filter match
    if (timelineFilter !== 'all') {
      if (timelineFilter === 'milestone' && item.tagType !== 'milestone') return false;
      if (timelineFilter === 'feeding' && item.tagType !== 'feeding') return false;
      if (timelineFilter === 'mom' && item.tagType !== 'mom') return false;
      if (timelineFilter === 'health' && item.type !== 'growth') return false;
    }

    return true;
  });

  return (
    <div className="timeline-feed-wrapper">
      {/* Action header with add post button */}
      <div className="section-header-row" style={{ marginTop: '8px' }}>
        <h3 className="section-title">
          Nhật ký sinh hoạt {selectedCalendarDate ? `(${selectedCalendarDate})` : ''}
        </h3>
        <button className="section-action-link" onClick={onOpenAddPost}>
          + Viết nhật ký
        </button>
      </div>

      {/* Filter Chips Scroll Row */}
      <div className="timeline-filter-chips-row">
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            className={`timeline-filter-chip ${timelineFilter === chip.id ? 'active' : ''}`}
            onClick={() => setTimelineFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Feed List */}
      {filteredItems.length === 0 ? (
        <div className="empty-state-card">
          <span style={{ fontSize: '32px' }}>📝</span>
          <h4 style={{ margin: '8px 0 4px 0' }}>Chưa có nhật ký phù hợp</h4>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Hãy bấm "+ Viết nhật ký" để lưu lại khoảnh khắc đáng nhớ của con nhé!
          </p>
          <button className="primary-btn-pill" style={{ marginTop: '12px' }} onClick={onOpenAddPost}>
            + Thêm nhật ký ngay
          </button>
        </div>
      ) : (
        <div className="timeline-posts-container">
          {filteredItems.map((item) => (
            <TimelinePostCard
              key={item.id}
              item={item}
              onToggleLike={() => toggleLike(item.id)}
              onOpenLightbox={onOpenLightbox}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface TimelinePostCardProps {
  item: TimelineItem;
  onToggleLike: () => void;
  onOpenLightbox: (src: string, isVideo?: boolean) => void;
}

const TimelinePostCard: React.FC<TimelinePostCardProps> = ({
  item,
  onToggleLike,
  onOpenLightbox,
}) => {
  const media = getTimelineMediaItems(item)[0];
  const mediaSrc = useTimelineMediaUrl(media ?? { type: 'photo' });
  return (
    <div className="timeline-card-item">
      {/* Post Author Header */}
      <div className="timeline-card-header">
        <div className="timeline-author-group">
          <img className="timeline-author-avatar" src={item.authorAvatar} alt={item.author} />
          <div>
            <h5 className="timeline-author-name">{item.author}</h5>
            <span className="timeline-post-time">{item.time}</span>
          </div>
        </div>
        <span className={`timeline-tag-badge ${item.tagType}`}>{item.tag}</span>
      </div>

      {/* Title & Body */}
      <h4 className="timeline-card-title">{item.title}</h4>
      <p className="timeline-card-content">{item.content}</p>

      {/* Optional Photo Attachment */}
      {media && mediaSrc && (
        <div
          className="timeline-photo-container"
          data-native-pressable
          onClick={() => onOpenLightbox(mediaSrc, media.type === 'video')}
        >
          {media.type === 'video'
            ? <video src={mediaSrc} className="timeline-post-image" preload="metadata" />
            : <img src={mediaSrc} alt={item.title} className="timeline-post-image" />}
          <span className="photo-zoom-badge">🔍 Chạm để phóng to</span>
        </div>
      )}

      {/* Key Metric / Stats Tags */}
      {item.stats && item.stats.length > 0 && (
        <div className="timeline-stats-row">
          {item.stats.map((st, idx) => (
            <span key={idx} className="timeline-stat-pill">
              {st}
            </span>
          ))}
        </div>
      )}

      {/* Footer Like & Comments */}
      <div className="timeline-card-footer">
        <button
          className={`timeline-action-btn like ${item.userLiked ? 'liked' : ''}`}
          onClick={onToggleLike}
        >
          <span className={`like-icon ${item.userLiked ? 'animate-heart' : ''}`}>
            {item.userLiked ? '❤️' : '🤍'}
          </span>
          <span>{item.likes} Yêu thích</span>
        </button>

        <button className="timeline-action-btn comment">
          <span>💬</span>
          <span>{item.comments} Bình luận</span>
        </button>
      </div>
    </div>
  );
};
