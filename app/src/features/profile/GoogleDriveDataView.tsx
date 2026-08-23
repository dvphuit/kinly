import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, ClipboardCopy, Cloud, Database, FileJson,
  HardDrive, Image as ImageIcon, Images, RefreshCw, ShieldCheck, Smartphone, Terminal, Trash2, Video,
} from 'lucide-react';
import { AppBar } from '@/shared/ui/AppBar';
import { HavenDialog } from '@/shared/ui/HavenDialog';
import {
  checkDriveBackup,
  deleteTimelineMediaFromDrive,
  downloadTimelineMediaFromDrive,
  getLastSyncedAt,
  isGoogleLinked,
  isGoogleSessionActive,
  listTimelineMediaFromDrive,
  requestGoogleAccessToken,
  subscribeSyncState,
  SYNC_KEYS,
  type DriveBackupSummary,
  type DriveTimelineMediaFile,
} from '@/features/sync';
import {
  getAllLocalRecords,
  listLocalMedia,
  removeLocalMedia,
  waitForLocalRecordWrites,
  type LocalMediaRecord,
} from '@/data/localDb';
import {
  clearDiagnosticLogs,
  formatDiagnosticLogs,
  getDiagnosticLogs,
  logDiagnostic,
  subscribeDiagnosticLogs,
  type DiagnosticLogEntry,
} from '@/app/diagnostics/diagnosticLog';
import { useTimelineStore } from '@/features/timeline/store/useTimelineStore';
import type { TimelineMediaItem } from '@/features/timeline';

interface GoogleDriveDataViewProps {
  onOpenLightbox: (src: string, isVideo?: boolean) => void;
  onShowToast?: (message: string, icon?: string) => void;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Không rõ dung lượng';
  if (value === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** unitIndex;
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

function getTextSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isMediaBackedUp(mediaItems?: TimelineMediaItem[]): boolean {
  return Boolean(mediaItems?.length) && mediaItems!.every((media) => Boolean(media.driveFileId));
}

function formatDate(value?: string): string {
  if (!value) return 'Chưa rõ thời gian';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Chưa rõ thời gian';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatLogTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function DriveMediaTile({
  file,
  linkedTitle,
  onOpen,
  onDelete,
  onError,
}: {
  file: DriveTimelineMediaFile;
  linkedTitle?: string;
  onOpen: (src: string, isVideo: boolean) => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) {
  const isVideo = file.mimeType.startsWith('video/');
  const [opening, setOpening] = useState(false);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  const openMedia = async () => {
    if (opening) return;
    setOpening(true);
    try {
      if (!objectUrl.current) {
        const blob = await downloadTimelineMediaFromDrive(file.id, { interactive: true });
        objectUrl.current = URL.createObjectURL(blob);
      }
      if (objectUrl.current) onOpen(objectUrl.current, isVideo);
    } catch (openError) {
      onError(openError instanceof Error ? openError.message : 'Không thể mở media từ Google Drive.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <article className="drive-media-card">
      <button
        type="button"
        className="drive-media-preview"
        onClick={() => void openMedia()}
        aria-label={`Xem ${isVideo ? 'video' : 'ảnh'} ${file.name}`}
        disabled={opening}
      >
        <span className="drive-media-placeholder" aria-hidden="true">{isVideo ? <Video size={24} /> : <ImageIcon size={24} />}</span>
        {file.thumbnailLink && <img src={file.thumbnailLink} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
        <span className="drive-media-kind">{isVideo ? <><Video size={12} /> Video</> : <><ImageIcon size={12} /> Ảnh</>}</span>
      </button>
      <div className="drive-media-info">
        <strong title={file.name}>{file.name}</strong>
        <span>{formatBytes(file.size)} · {formatDate(file.modifiedTime || file.createdTime)}</span>
        <small>{linkedTitle ? `Đang dùng trong “${linkedTitle}”` : 'Không còn liên kết trên thiết bị này'}</small>
      </div>
      <button type="button" className="drive-media-delete" onClick={onDelete} aria-label={`Xóa ${file.name} khỏi Google Drive`}>
        <Trash2 size={16} />
      </button>
    </article>
  );
}

function LocalMediaTile({
  record,
  linkedTitle,
  linkedMedia,
  onOpen,
  onDelete,
}: {
  record: LocalMediaRecord;
  linkedTitle?: string;
  linkedMedia?: TimelineMediaItem[];
  onOpen: (src: string, isVideo: boolean) => void;
  onDelete: () => void;
}) {
  const metadata = linkedMedia?.[0];
  const isVideo = record.mimeType.startsWith('video/') || metadata?.type === 'video';
  const backedUp = isMediaBackedUp(linkedMedia);
  const name = metadata?.name || `${isVideo ? 'Video' : 'Ảnh'} ${record.id.slice(-8)}`;
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    const nextObjectUrl = URL.createObjectURL(record.blob);
    setObjectUrl(nextObjectUrl);
    return () => URL.revokeObjectURL(nextObjectUrl);
  }, [record.blob]);

  return (
    <article className="drive-media-card local-media-card">
      <button
        type="button"
        className="drive-media-preview"
        onClick={() => objectUrl && onOpen(objectUrl, isVideo)}
        aria-label={`Xem ${isVideo ? 'video' : 'ảnh'} local ${name}`}
      >
        <span className="drive-media-placeholder" aria-hidden="true">{isVideo ? <Video size={24} /> : <ImageIcon size={24} />}</span>
        {objectUrl && (isVideo
          ? <video src={objectUrl} muted preload="metadata" />
          : <img src={objectUrl} alt="" loading="lazy" />)}
        <span className={`local-media-status ${backedUp ? 'is-backed-up' : 'is-local-only'}`}>
          {backedUp ? <><CheckCircle2 size={11} /> Đã backup</> : <><Smartphone size={11} /> Chỉ trên máy</>}
        </span>
      </button>
      <div className="drive-media-info">
        <strong title={name}>{name}</strong>
        <span>{formatBytes(record.size)} · {record.mimeType || (isVideo ? 'video' : 'image')}</span>
        <small>{linkedTitle ? `Trong “${linkedTitle}”` : 'Không còn liên kết trong nhật ký'}</small>
      </div>
      <button type="button" className="drive-media-delete" onClick={onDelete} aria-label={`Xóa bản local ${name}`}>
        <Trash2 size={16} />
      </button>
    </article>
  );
}

export function GoogleDriveDataView({ onOpenLightbox, onShowToast }: GoogleDriveDataViewProps) {
  const navigate = useNavigate();
  const timelineItems = useTimelineStore((state) => state.timelineItems);
  const [linked, setLinked] = useState(isGoogleLinked());
  const [sessionActive, setSessionActive] = useState(isGoogleSessionActive());
  const [files, setFiles] = useState<DriveTimelineMediaFile[]>([]);
  const [backup, setBackup] = useState<DriveBackupSummary | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DriveTimelineMediaFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [localFiles, setLocalFiles] = useState<LocalMediaRecord[]>([]);
  const [localRecordCount, setLocalRecordCount] = useState(0);
  const [localRecordSize, setLocalRecordSize] = useState(0);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate>({});
  const [localLoading, setLocalLoading] = useState(true);
  const [localDeleteTarget, setLocalDeleteTarget] = useState<LocalMediaRecord | null>(null);
  const [localDeleting, setLocalDeleting] = useState(false);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>(getDiagnosticLogs);

  useEffect(() => subscribeDiagnosticLogs(setLogs), []);
  useEffect(() => subscribeSyncState(() => {
    setLinked(isGoogleLinked());
    setSessionActive(isGoogleSessionActive());
  }), []);

  const linkedMedia = useMemo(() => {
    const result = new Map<string, { title: string; media: TimelineMediaItem[] }>();
    timelineItems.forEach((item) => {
      (item.mediaItems ?? []).forEach((media) => {
        if (!media.driveFileId) return;
        const current = result.get(media.driveFileId);
        result.set(media.driveFileId, {
          title: current?.title ?? item.title,
          media: [...(current?.media ?? []), media],
        });
      });
    });
    return result;
  }, [timelineItems]);

  const linkedLocalMedia = useMemo(() => {
    const result = new Map<string, { title: string; media: TimelineMediaItem[] }>();
    timelineItems.forEach((item) => {
      (item.mediaItems ?? []).forEach((media) => {
        if (!media.blobId) return;
        const current = result.get(media.blobId);
        result.set(media.blobId, {
          title: current?.title ?? item.title,
          media: [...(current?.media ?? []), media],
        });
      });
    });
    return result;
  }, [timelineItems]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const videoCount = useMemo(() => files.filter((file) => file.mimeType.startsWith('video/')).length, [files]);
  const localMediaSize = useMemo(() => localFiles.reduce((sum, file) => sum + file.size, 0), [localFiles]);
  const localAppSize = localRecordSize + localMediaSize;
  const backedUpLocalFiles = useMemo(() => localFiles.filter((file) => (
    isMediaBackedUp(linkedLocalMedia.get(file.id)?.media)
  )), [linkedLocalMedia, localFiles]);

  const loadLocalData = useCallback(async () => {
    logDiagnostic('local-data', 'info', 'Local data refresh started');
    setLocalLoading(true);
    try {
      const recordKeys = [...SYNC_KEYS, 'babygrowth_v4_sync_meta'];
      const [nextFiles, records, nextStorageEstimate] = await Promise.all([
        listLocalMedia(),
        getAllLocalRecords(recordKeys),
        navigator.storage?.estimate?.() ?? Promise.resolve({}),
      ]);
      setLocalFiles(nextFiles);
      setLocalRecordCount(Object.keys(records).length);
      setLocalRecordSize(Object.values(records).reduce((sum, value) => sum + getTextSize(value), 0));
      setStorageEstimate(nextStorageEstimate);
      logDiagnostic('local-data', 'info', 'Local data refresh completed', {
        mediaCount: nextFiles.length,
        mediaBytes: nextFiles.reduce((sum, file) => sum + file.size, 0),
        recordCount: Object.keys(records).length,
      });
    } catch (loadError) {
      logDiagnostic('local-data', 'error', 'Local data refresh failed', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Không thể đọc dữ liệu trên thiết bị.');
    } finally {
      setLocalLoading(false);
    }
  }, []);

  const loadDriveData = useCallback(async () => {
    logDiagnostic('drive-ui', 'info', 'Drive management refresh started');
    setLoading(true);
    setError(null);
    try {
      const [nextFiles, nextBackup, nextLastSyncedAt] = await Promise.all([
        listTimelineMediaFromDrive({ interactive: false }),
        checkDriveBackup(),
        getLastSyncedAt(),
      ]);
      setFiles(nextFiles);
      setBackup(nextBackup);
      setLastSyncedAt(nextLastSyncedAt);
      setLinked(true);
      setSessionActive(true);
      logDiagnostic('drive-ui', 'info', 'Drive management refresh completed', {
        mediaCount: nextFiles.length,
        backupFound: nextBackup.found,
      });
    } catch (loadError) {
      logDiagnostic('drive-ui', 'error', 'Drive management refresh failed', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Không thể đọc dữ liệu Google Drive.');
      setLinked(isGoogleLinked());
      setSessionActive(isGoogleSessionActive());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionActive) void loadDriveData();
  }, [sessionActive, loadDriveData]);

  useEffect(() => {
    void loadLocalData();
  }, [loadLocalData]);

  const connectGoogle = async () => {
    logDiagnostic('drive-ui', 'info', 'Google authentication requested');
    setLoading(true);
    setError(null);
    try {
      await requestGoogleAccessToken();
      setLinked(true);
      setSessionActive(true);
    } catch (connectError) {
      logDiagnostic('drive-ui', 'error', 'Google authentication failed', connectError);
      setLinked(isGoogleLinked());
      setSessionActive(isGoogleSessionActive());
      setError(connectError instanceof Error ? connectError.message : 'Không thể kết nối Google Drive.');
      setLoading(false);
    }
  };

  const deleteFile = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleting(true);
    logDiagnostic('drive-ui', 'info', 'Delete media requested', { fileId: target.id, name: target.name });
    setError(null);
    try {
      await deleteTimelineMediaFromDrive(target.id, { interactive: true });
      const linkedMediaItems = linkedMedia.get(target.id)?.media ?? [];
      await Promise.all(linkedMediaItems.flatMap((media) => media.blobId ? [removeLocalMedia(media.blobId)] : []));
      if (linkedMediaItems.length > 0) {
        useTimelineStore.setState((state) => ({
          timelineItems: state.timelineItems.map((item) => {
            const mediaItems = (item.mediaItems ?? []).filter((media) => media.driveFileId !== target.id);
            if (mediaItems.length === (item.mediaItems ?? []).length) return item;
            return {
              ...item,
              mediaItems,
              mediaUrl: mediaItems[0]?.url ?? null,
              mediaType: mediaItems[0]?.type ?? null,
            };
          }),
        }));
        await waitForLocalRecordWrites(['babygrowth_v4_timeline']);
      }
      setFiles((current) => current.filter((file) => file.id !== target.id));
      await loadLocalData();
      setDeleteTarget(null);
      onShowToast?.('Đã xóa media khỏi Google Drive.', '✓');
    } catch (deleteError) {
      logDiagnostic('drive-ui', 'error', 'Delete media failed', { fileId: target.id, error: deleteError });
      setError(deleteError instanceof Error ? deleteError.message : 'Không thể xóa media khỏi Google Drive.');
    } finally {
      setDeleting(false);
    }
  };

  const removeMediaFromTimeline = async (blobIds: Set<string>) => {
    useTimelineStore.setState((state) => ({
      timelineItems: state.timelineItems.map((item) => {
        const mediaItems = (item.mediaItems ?? []).filter((media) => !media.blobId || !blobIds.has(media.blobId));
        if (mediaItems.length === (item.mediaItems ?? []).length) return item;
        return {
          ...item,
          mediaItems,
          mediaUrl: mediaItems[0]?.url ?? null,
          mediaType: mediaItems[0]?.type ?? null,
        };
      }),
    }));
    await waitForLocalRecordWrites(['babygrowth_v4_timeline']);
  };

  const deleteLocalFile = async () => {
    const target = localDeleteTarget;
    if (!target) return;
    const linkedLocal = linkedLocalMedia.get(target.id);
    const backedUp = isMediaBackedUp(linkedLocal?.media);
    setLocalDeleting(true);
    setError(null);
    logDiagnostic('local-data', 'info', 'Local media delete requested', {
      blobId: target.id,
      size: target.size,
      backedUp,
    });
    try {
      await removeLocalMedia(target.id);
      if (!backedUp && linkedLocal) await removeMediaFromTimeline(new Set([target.id]));
      setLocalDeleteTarget(null);
      await loadLocalData();
      onShowToast?.(backedUp ? 'Đã xóa bản media trên thiết bị.' : 'Đã xóa media local khỏi nhật ký.', '✓');
      logDiagnostic('local-data', 'info', 'Local media delete completed', { blobId: target.id, backedUp });
    } catch (deleteError) {
      logDiagnostic('local-data', 'error', 'Local media delete failed', { blobId: target.id, error: deleteError });
      setError(deleteError instanceof Error ? deleteError.message : 'Không thể xóa media trên thiết bị.');
    } finally {
      setLocalDeleting(false);
    }
  };

  const cleanupBackedUpMedia = async () => {
    if (backedUpLocalFiles.length === 0) return;
    setLocalDeleting(true);
    setError(null);
    const ids = backedUpLocalFiles.map((file) => file.id);
    logDiagnostic('local-data', 'info', 'Backed-up local media cleanup started', { mediaCount: ids.length });
    try {
      await Promise.all(ids.map(removeLocalMedia));
      setCleanupConfirmOpen(false);
      await loadLocalData();
      onShowToast?.(`Đã dọn ${ids.length} media đã backup.`, '✓');
      logDiagnostic('local-data', 'info', 'Backed-up local media cleanup completed', { mediaCount: ids.length });
    } catch (cleanupError) {
      logDiagnostic('local-data', 'error', 'Backed-up local media cleanup failed', cleanupError);
      setError(cleanupError instanceof Error ? cleanupError.message : 'Không thể dọn media đã backup.');
    } finally {
      setLocalDeleting(false);
    }
  };

  const copyLogs = async () => {
    try {
      await copyText(formatDiagnosticLogs(logs));
      onShowToast?.('Đã sao chép logs chẩn đoán.', '✓');
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Không thể sao chép logs.');
    }
  };

  return createPortal(
    <div className="baby-profile-view-container profile-page-overlay drive-data-page">
      <AppBar
        className="profile-app-bar"
        tone="baby"
        variant="page"
        ariaLabel="Quản lý dữ liệu"
        start={<button type="button" className="profile-icon-btn" onClick={() => navigate('/profile')} aria-label="Về hồ sơ"><ArrowLeft size={20} /></button>}
        center={<div className="profile-top-heading"><span className="profile-top-eyebrow">DỮ LIỆU RIÊNG TƯ</span><h1>Quản lý dữ liệu</h1></div>}
        end={<button type="button" className="profile-icon-btn" onClick={() => { void loadLocalData(); if (sessionActive) void loadDriveData(); }} aria-label="Làm mới dữ liệu" disabled={loading || localLoading}><RefreshCw size={18} className={loading || localLoading ? 'spin' : ''} /></button>}
      />

      <section className="profile-section-block local-data-section" aria-labelledby="local-data-title">
        <div className="profile-section-heading">
          <div><span className="profile-section-kicker">TRÊN THIẾT BỊ</span><h2 id="local-data-title">Dữ liệu local</h2></div>
          <span className="section-score-pill">Riêng tư</span>
        </div>

        <section className="drive-data-summary local-data-summary" aria-label="Tổng quan dữ liệu local">
          <article><span><Images size={17} /></span><small>Media local</small><strong>{localFiles.length}</strong></article>
          <article><span><FileJson size={17} /></span><small>Dữ liệu app</small><strong>{formatBytes(localAppSize)}</strong></article>
          <article><span><HardDrive size={17} /></span><small>Trình duyệt</small><strong>{formatBytes(storageEstimate.usage ?? 0)}</strong></article>
        </section>

        <div className="local-storage-card">
          <span className="local-storage-icon"><Smartphone size={19} /></span>
          <div>
            <strong>{localRecordCount} nhóm dữ liệu · {formatBytes(localRecordSize)} nội dung</strong>
            <span>{storageEstimate.quota ? `${formatBytes(storageEstimate.usage ?? 0)} / ${formatBytes(storageEstimate.quota)} bộ nhớ trình duyệt` : 'Dung lượng được trình duyệt quản lý tự động'}</span>
            {storageEstimate.quota && <span className="local-storage-track"><i style={{ width: `${Math.min(100, ((storageEstimate.usage ?? 0) / storageEstimate.quota) * 100)}%` }} /></span>}
          </div>
        </div>

        <div className="local-media-heading">
          <div><strong>Ảnh và video trên máy</strong><span>Media gốc lưu trực tiếp, không chuyển Base64</span></div>
          {backedUpLocalFiles.length > 0 && (
            <button type="button" onClick={() => setCleanupConfirmOpen(true)} disabled={localDeleting}>
              <Trash2 size={14} /> Dọn {backedUpLocalFiles.length} đã backup
            </button>
          )}
        </div>

        {localLoading && localFiles.length === 0 ? (
          <div className="drive-data-state local-data-state" role="status"><RefreshCw size={20} className="spin" /><span>Đang đọc dữ liệu trên thiết bị...</span></div>
        ) : localFiles.length === 0 ? (
          <div className="drive-data-state local-data-state"><Smartphone size={24} /><strong>Không có media local</strong><span>Media đã dọn vẫn có thể được đọc lại từ Google Drive nếu đã backup.</span></div>
        ) : (
          <div className="drive-media-list">
            {localFiles.map((file) => {
              const linkedLocal = linkedLocalMedia.get(file.id);
              return (
                <LocalMediaTile
                  key={file.id}
                  record={file}
                  linkedTitle={linkedLocal?.title}
                  linkedMedia={linkedLocal?.media}
                  onOpen={onOpenLightbox}
                  onDelete={() => setLocalDeleteTarget(file)}
                />
              );
            })}
          </div>
        )}
      </section>

      <div className="drive-area-heading">
        <span className="drive-area-icon"><Cloud size={19} /></span>
        <div><span>TRÊN ĐÁM MÂY</span><strong>Google Drive</strong></div>
        <small>{sessionActive ? 'Đã xác thực' : linked ? 'Đã liên kết' : 'Chưa kết nối'}</small>
      </div>

      {!sessionActive ? (
        <section className="drive-connect-card">
          <span className="drive-connect-icon"><Cloud size={30} /></span>
          <h2>{linked ? 'Xác thực Google Drive' : 'Kết nối Google Drive'}</h2>
          <p>{linked
            ? 'Tài khoản Google đã liên kết. Xác thực lại để xem và quản lý dữ liệu trên Drive.'
            : 'Media được lưu trong vùng riêng tư của ứng dụng. Hãy kết nối đúng tài khoản để xem và quản lý.'}</p>
          <button type="button" className="profile-action-btn primary" onClick={() => void connectGoogle()} disabled={loading}>
            <ShieldCheck size={17} /> {loading ? 'Đang xác thực...' : linked ? 'Xác thực để xem dữ liệu' : 'Kết nối Google'}
          </button>
        </section>
      ) : (
        <>
          <section className="drive-data-summary" aria-label="Tổng quan dữ liệu Drive">
            <article><span><Images size={17} /></span><small>Media</small><strong>{files.length}</strong></article>
            <article><span><Video size={17} /></span><small>Video</small><strong>{videoCount}</strong></article>
            <article><span><HardDrive size={17} /></span><small>Dung lượng</small><strong>{formatBytes(totalSize)}</strong></article>
          </section>

          <section className="drive-backup-card">
            <span className="drive-backup-icon"><Database size={19} /></span>
            <div>
              <strong>{backup?.found ? 'Bản sao lưu đang hoạt động' : 'Chưa tìm thấy bản sao lưu'}</strong>
              <span>{lastSyncedAt ? `Đồng bộ gần nhất ${formatDate(lastSyncedAt)}` : 'Chưa có thời gian đồng bộ'}</span>
            </div>
            <ShieldCheck size={18} />
          </section>

          <section className="profile-section-block" aria-labelledby="drive-media-title">
            <div className="profile-section-heading">
              <div><span className="profile-section-kicker">ẢNH VÀ VIDEO</span><h2 id="drive-media-title">Media trên Drive</h2></div>
              <span className="section-score-pill">Riêng tư</span>
            </div>

            {loading && files.length === 0 ? (
              <div className="drive-data-state" role="status"><RefreshCw size={20} className="spin" /><span>Đang đọc dữ liệu Drive...</span></div>
            ) : files.length === 0 ? (
              <div className="drive-data-state"><Cloud size={24} /><strong>Chưa có media trên Drive</strong><span>Ảnh và video sẽ xuất hiện sau lần đồng bộ tiếp theo.</span></div>
            ) : (
              <div className="drive-media-list">
                {files.map((file) => (
                  <DriveMediaTile
                    key={file.id}
                    file={file}
                    linkedTitle={linkedMedia.get(file.id)?.title}
                    onOpen={onOpenLightbox}
                    onDelete={() => setDeleteTarget(file)}
                    onError={setError}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {error && <p className="drive-data-error" role="alert">{error}</p>}

      <section className={`drive-log-panel ${logsOpen ? 'is-open' : ''}`} aria-labelledby="drive-log-title">
        <button type="button" className="drive-log-toggle" onClick={() => setLogsOpen((current) => !current)} aria-expanded={logsOpen}>
          <span className="drive-log-icon"><Terminal size={17} /></span>
          <span><strong id="drive-log-title">Logs chẩn đoán</strong><small>{logs.length} sự kiện gần nhất · chỉ lưu trên thiết bị này</small></span>
          {logsOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
        </button>
        {logsOpen && (
          <div className="drive-log-content">
            <div className="drive-log-actions">
              <button type="button" onClick={() => void copyLogs()} disabled={logs.length === 0}><ClipboardCopy size={14} /> Sao chép</button>
              <button type="button" onClick={clearDiagnosticLogs} disabled={logs.length === 0}><Trash2 size={14} /> Xóa logs</button>
            </div>
            {logs.length === 0 ? (
              <p className="drive-log-empty">Chưa có log. Hãy thử kết nối hoặc làm mới Google Drive.</p>
            ) : (
              <div className="drive-log-list" aria-label="Danh sách logs chẩn đoán">
                {[...logs].reverse().map((entry) => (
                  <article className={`drive-log-entry level-${entry.level}`} key={entry.id}>
                    <header><time dateTime={entry.timestamp}>{formatLogTime(entry.timestamp)}</time><span>{entry.level}</span><strong>{entry.scope}</strong></header>
                    <p>{entry.message}</p>
                    {entry.details !== undefined && <pre>{JSON.stringify(entry.details, null, 2)}</pre>}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <HavenDialog
        open={deleteTarget !== null}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        title="Xóa media khỏi Drive?"
        description={deleteTarget?.name}
        footer={<><button type="button" className="haven-dialog-secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Giữ lại</button><button type="button" className="haven-dialog-primary drive-delete-confirm" onClick={() => void deleteFile()} disabled={deleting}><Trash2 size={15} /> {deleting ? 'Đang xóa...' : 'Xóa media'}</button></>}
      >
        <p className="drive-delete-copy">Media sẽ bị xóa khỏi Google Drive và khỏi các khoảnh khắc đang liên kết trên thiết bị này. Thao tác này không thể hoàn tác.</p>
      </HavenDialog>

      <HavenDialog
        open={localDeleteTarget !== null}
        onClose={() => { if (!localDeleting) setLocalDeleteTarget(null); }}
        title={isMediaBackedUp(linkedLocalMedia.get(localDeleteTarget?.id ?? '')?.media) ? 'Xóa bản trên thiết bị?' : 'Media này chưa được backup'}
        description={linkedLocalMedia.get(localDeleteTarget?.id ?? '')?.media[0]?.name || localDeleteTarget?.id}
        footer={<><button type="button" className="haven-dialog-secondary" onClick={() => setLocalDeleteTarget(null)} disabled={localDeleting}>Giữ lại</button><button type="button" className="haven-dialog-primary drive-delete-confirm" onClick={() => void deleteLocalFile()} disabled={localDeleting}><Trash2 size={15} /> {localDeleting ? 'Đang xóa...' : 'Xóa media'}</button></>}
      >
        {isMediaBackedUp(linkedLocalMedia.get(localDeleteTarget?.id ?? '')?.media) ? (
          <p className="drive-delete-copy">Chỉ bản local được xóa để giải phóng dung lượng. Media vẫn còn trên Google Drive và vẫn hiển thị trong nhật ký khi có mạng.</p>
        ) : (
          <div className="local-delete-warning"><AlertTriangle size={20} /><p>Đây là bản duy nhất. Xóa sẽ gỡ media khỏi các khoảnh khắc đang liên kết và không thể khôi phục từ Drive.</p></div>
        )}
      </HavenDialog>

      <HavenDialog
        open={cleanupConfirmOpen}
        onClose={() => { if (!localDeleting) setCleanupConfirmOpen(false); }}
        title="Dọn media đã backup?"
        description={`${backedUpLocalFiles.length} ảnh/video · ${formatBytes(backedUpLocalFiles.reduce((sum, file) => sum + file.size, 0))}`}
        footer={<><button type="button" className="haven-dialog-secondary" onClick={() => setCleanupConfirmOpen(false)} disabled={localDeleting}>Để sau</button><button type="button" className="haven-dialog-primary" onClick={() => void cleanupBackedUpMedia()} disabled={localDeleting}><Trash2 size={15} /> {localDeleting ? 'Đang dọn...' : 'Dọn bản local'}</button></>}
      >
        <p className="drive-delete-copy">Chỉ các file đã có bản trên Google Drive được xóa khỏi thiết bị. Nhật ký và media chưa backup được giữ nguyên.</p>
      </HavenDialog>
    </div>,
    document.body,
  );
}
