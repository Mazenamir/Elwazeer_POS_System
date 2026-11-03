import React, { useState, useEffect, useCallback } from 'react';
import {
  DownloadCloud,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  X,
  Loader2,
  ArrowRight,
} from 'lucide-react';

export function UpdateStatusBanner() {
  const [updaterState, setUpdaterState] = useState(null);
  const [message, setMessage] = useState(null);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [targetVersion, setTargetVersion] = useState(null);

  const handleStatusEvent = useCallback((channel, data) => {
    switch (channel) {
      case 'updater:checking':
        setUpdaterState('checking');
        setMessage({
          ar: 'جاري التحقق من وجود تحديثات للنظام...',
          en: 'Checking for system updates...',
        });
        setVisible(true);
        break;

      case 'updater:available':
        // autoDownload=true: download starts immediately, show progress bar at 0%
        setUpdaterState('downloading');
        setTargetVersion(data?.version || null);
        setProgress(0);
        setMessage({
          ar: `يتوفر تحديث جديد (الإصدار ${data?.version || ''}). جاري التنزيل في الخلفية...`,
          en: `New update available (${data?.version || ''}). Downloading in background...`,
        });
        setVisible(true);
        break;

      case 'updater:not-available':
        setUpdaterState('up-to-date');
        setMessage({
          ar: 'النظام محدث لأحدث إصدار.',
          en: 'Your application is up to date.',
        });
        // Auto-hide up-to-date message after 4 seconds
        setTimeout(() => {
          setVisible((prev) => (updaterState === 'up-to-date' ? false : prev));
        }, 4000);
        break;

      case 'updater:progress':
        setUpdaterState('downloading');
        setProgress(Math.round(data?.percent || 0));
        setMessage({
          ar: `جاري تنزيل التحديث في الخلفية (${Math.round(data?.percent || 0)}%)...`,
          en: `Downloading update in background (${Math.round(data?.percent || 0)}%)...`,
        });
        setVisible(true);
        break;

      case 'updater:downloaded':
        setUpdaterState('downloaded');
        setTargetVersion(data?.version || null);
        setMessage({
          ar: `تم تنزيل التحديث ${data?.version || ''} بنجاح. سيتم تطبيقه تلقائياً عند نقطة آمنة.`,
          en: `Update ${data?.version || ''} downloaded. It will be safely applied.`,
        });
        setVisible(true);
        break;

      case 'updater:waiting-for-safe-point':
        setUpdaterState('waiting-for-safe-point');
        setMessage({
          ar: 'التحديث جاهز، في انتظار نقطة آمنة دون مقاطعة أي عملية بيع.',
          en: 'Update ready, waiting for a safe point without interrupting transactions.',
        });
        setVisible(true);
        break;

      case 'updater:preparing-maintenance':
        setUpdaterState('maintenance');
        setIsMaintenance(true);
        setMessage({
          ar: 'جاري تجهيز الصيانة الآمنة لتطبيق التحديث...',
          en: 'Preparing safe maintenance to apply update...',
        });
        setVisible(true);
        break;

      case 'updater:draining-operations':
        setUpdaterState('draining');
        setIsMaintenance(true);
        setMessage({
          ar: 'جاري استكمال وحفظ العمليات الجارية بأمان...',
          en: 'Safely completing active transactions...',
        });
        setVisible(true);
        break;

      case 'updater:stopping-services':
        setUpdaterState('stopping');
        setIsMaintenance(true);
        setMessage({
          ar: 'جاري إيقاف الخدمات وقاعدة البيانات بأمان...',
          en: 'Safely stopping database and services...',
        });
        setVisible(true);
        break;

      case 'updater:installing':
        setUpdaterState('installing');
        setIsMaintenance(true);
        setMessage({
          ar: 'جاري تثبيت التحديث المعتمد وإعادة تشغيل النظام...',
          en: 'Installing verified update and restarting...',
        });
        setVisible(true);
        break;

      case 'updater:drain-timeout':
        setUpdaterState('drain-suspended');
        setIsMaintenance(false);
        setMessage({
          ar: 'تم تأجيل التحديث لوجود عمليات بيع نشطة. تم الحفاظ على استمرارية العمل.',
          en: 'Update suspended due to active sales. Business continuity preserved.',
        });
        setTimeout(() => setVisible(false), 8000);
        break;

      case 'updater:error':
        setUpdaterState('error');
        setIsMaintenance(false);
        setMessage({
          ar: 'تعذر إتمام فحص أو تنزيل التحديث. النظام يعمل بصورة طبيعية دون تأثر.',
          en: 'Update check or download could not complete. POS continues operating normally.',
        });
        setTimeout(() => setVisible(false), 6000);
        break;

      default:
        break;
    }
  }, [updaterState]);

  useEffect(() => {
    if (!window.electronAPI?.updater) return;

    // Fetch initial status
    window.electronAPI.updater.getStatus().then((res) => {
      if (res?.success && res.status) {
        if (res.status.isDownloading) {
          setUpdaterState('downloading');
          setVisible(true);
        } else if (res.status.updateDownloaded) {
          setUpdaterState('downloaded');
          setVisible(true);
        }
      }
    }).catch(() => {});

    // Subscribe to status events
    const unsubscribe = window.electronAPI.updater.onStatus((channel, data) => {
      handleStatusEvent(channel, data);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [handleStatusEvent]);

  if (!visible || !message) return null;

  const isError = updaterState === 'error';
  const isSuccess = updaterState === 'downloaded' || updaterState === 'up-to-date';
  const isProgress = updaterState === 'downloading';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-4 left-4 z-50 max-w-md p-4 rounded-xl shadow-2xl border transition-all duration-300 ease-in-out ${
        isMaintenance
          ? 'bg-amber-900 border-amber-500 text-amber-50'
          : isError
          ? 'bg-red-950 border-red-500 text-red-50'
          : isSuccess
          ? 'bg-emerald-950 border-emerald-500 text-emerald-50'
          : 'bg-[#1C1A17] border-[#3D3A34] text-[#EFEBE4]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-black/20 text-white flex-shrink-0 mt-0.5">
          {isMaintenance ? (
            <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
          ) : isProgress ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          ) : isSuccess ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : isError ? (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          ) : (
            <DownloadCloud className="w-5 h-5 text-amber-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-white tracking-wide">
              {isMaintenance
                ? 'وضع الصيانة المجدولة (Update Maintenance)'
                : 'تحديث النظام (System Update)'}
            </h4>
            {!isMaintenance && (
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md transition-colors"
                title="إخفاء التنبيه"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="text-xs mt-1 text-gray-200 leading-relaxed font-medium">
            {message.ar}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5" dir="ltr">
            {message.en}
          </p>

          {isProgress && (
            <div className="mt-2.5 w-full bg-black/30 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UpdateStatusBanner;
