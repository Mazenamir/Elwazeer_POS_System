import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from '../common/Button';

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'تأكيد العملية',
  message = 'هل أنت متأكد من رغبتك في إتمام هذا الإجراء؟ لا يمكن التراجع عنه لاحقاً.',
  confirmText = 'تأكيد',
  cancelText = 'إلغاء',
  variant = 'danger',
  isLoading = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <p className="text-sm font-semibold text-slate-600 mb-6 leading-relaxed">
          {message}
        </p>

        <div className="flex items-center justify-center gap-3 w-full">
          <Button
            type="button"
            variant={variant}
            onClick={onConfirm}
            isLoading={isLoading}
            className="flex-1 !py-3"
          >
            {confirmText}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 !py-3"
          >
            {cancelText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmationDialog;
