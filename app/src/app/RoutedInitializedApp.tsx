import { BrowserRouter } from 'react-router-dom';
import type { AddToast } from '@/app/hooks/useAppModals';
import type { ToastMessage } from '@/shared/hooks/useToast';
import { InitializedApp } from './InitializedApp';

interface RoutedInitializedAppProps {
  toasts: ToastMessage[];
  addToast: AddToast;
}

export const RoutedInitializedApp: React.FC<RoutedInitializedAppProps> = ({ toasts, addToast }) => (
  <BrowserRouter>
    <InitializedApp toasts={toasts} addToast={addToast} />
  </BrowserRouter>
);
