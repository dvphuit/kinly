import { useCallback, useMemo, useState } from 'react';
import type { ActivityLogMode } from '@/features/activities/ActivityLogModal';

export type AddToast = (message: string, icon?: string) => void;

export interface AppModalController {
  isAnyModalOpen: boolean;
  isNotificationOpen: boolean;
  isQuickLogOpen: boolean;
  isAddGrowthOpen: boolean;
  isAddPumpingOpen: boolean;
  isAddExpenseOpen: boolean;
  isAddPostOpen: boolean;
  isEditProfileOpen: boolean;
  activityLogMode: ActivityLogMode | null;
  lightboxSrc: string | null;
  lightboxIsVideo: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
  openQuickLog: () => void;
  closeQuickLog: () => void;
  openAddGrowth: () => void;
  closeAddGrowth: () => void;
  openAddPumping: () => void;
  closeAddPumping: () => void;
  openAddExpense: () => void;
  closeAddExpense: () => void;
  closeAddPost: () => void;
  openEditProfile: () => void;
  closeEditProfile: () => void;
  closeActivityLog: () => void;
  openLightbox: (src: string, isVideo?: boolean) => void;
  closeLightbox: () => void;
  handleQuickAction: (actionType: string) => void;
}

export function useAppModals(): AppModalController {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);
  const [isAddGrowthOpen, setIsAddGrowthOpen] = useState(false);
  const [isAddPumpingOpen, setIsAddPumpingOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isAddPostOpen, setIsAddPostOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [activityLogMode, setActivityLogMode] = useState<ActivityLogMode | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxIsVideo, setLightboxIsVideo] = useState(false);

  const openNotifications = useCallback(() => setIsNotificationOpen(true), []);
  const closeNotifications = useCallback(() => setIsNotificationOpen(false), []);
  const openQuickLog = useCallback(() => setIsQuickLogOpen(true), []);
  const closeQuickLog = useCallback(() => setIsQuickLogOpen(false), []);
  const openAddGrowth = useCallback(() => setIsAddGrowthOpen(true), []);
  const closeAddGrowth = useCallback(() => setIsAddGrowthOpen(false), []);
  const openAddPumping = useCallback(() => setIsAddPumpingOpen(true), []);
  const closeAddPumping = useCallback(() => setIsAddPumpingOpen(false), []);
  const openAddExpense = useCallback(() => setIsAddExpenseOpen(true), []);
  const closeAddExpense = useCallback(() => setIsAddExpenseOpen(false), []);
  const closeAddPost = useCallback(() => setIsAddPostOpen(false), []);
  const openEditProfile = useCallback(() => setIsEditProfileOpen(true), []);
  const closeEditProfile = useCallback(() => setIsEditProfileOpen(false), []);
  const closeActivityLog = useCallback(() => setActivityLogMode(null), []);
  const openLightbox = useCallback((src: string, isVideo?: boolean) => {
    setLightboxSrc(src);
    setLightboxIsVideo(Boolean(isVideo));
  }, []);
  const closeLightbox = useCallback(() => setLightboxSrc(null), []);

  const handleQuickAction = useCallback((actionType: string) => {
    switch (actionType) {
      case 'growth':
        setIsAddGrowthOpen(true);
        break;
      case 'feeding':
      case 'baby-sleep':
      case 'diaper':
      case 'mom-sleep':
      case 'mom-mood':
      case 'medicine':
      case 'temperature':
      case 'health':
        setActivityLogMode(actionType === 'health' ? 'temperature' : actionType);
        break;
      case 'moment':
      case 'diary':
        setIsAddPostOpen(true);
        break;
      case 'pumping':
        setIsAddPumpingOpen(true);
        break;
      case 'smart-expense':
      case 'expense':
        setIsAddExpenseOpen(true);
        break;
      case 'vaccine':
        setIsNotificationOpen(true);
        break;
      default:
        setIsQuickLogOpen(true);
        break;
    }
  }, []);

  const isAnyModalOpen = Boolean(
    isNotificationOpen ||
    isQuickLogOpen ||
    isAddGrowthOpen ||
    isAddPumpingOpen ||
    isAddExpenseOpen ||
    isAddPostOpen ||
    isEditProfileOpen ||
    activityLogMode ||
    lightboxSrc
  );

  return useMemo(() => ({
    isAnyModalOpen,
    isNotificationOpen,
    isQuickLogOpen,
    isAddGrowthOpen,
    isAddPumpingOpen,
    isAddExpenseOpen,
    isAddPostOpen,
    isEditProfileOpen,
    activityLogMode,
    lightboxSrc,
    lightboxIsVideo,
    openNotifications,
    closeNotifications,
    openQuickLog,
    closeQuickLog,
    openAddGrowth,
    closeAddGrowth,
    openAddPumping,
    closeAddPumping,
    openAddExpense,
    closeAddExpense,
    closeAddPost,
    openEditProfile,
    closeEditProfile,
    closeActivityLog,
    openLightbox,
    closeLightbox,
    handleQuickAction,
  }), [
    isAnyModalOpen, isNotificationOpen, isQuickLogOpen, isAddGrowthOpen,
    isAddPumpingOpen, isAddExpenseOpen, isAddPostOpen, isEditProfileOpen,
    activityLogMode, lightboxSrc, lightboxIsVideo,
    openNotifications, closeNotifications, openQuickLog, closeQuickLog,
    openAddGrowth, closeAddGrowth, openAddPumping, closeAddPumping,
    openAddExpense, closeAddExpense, closeAddPost,
    openEditProfile, closeEditProfile, closeActivityLog,
    openLightbox, closeLightbox, handleQuickAction,
  ]);
}
