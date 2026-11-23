import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import { useToast } from '../../context/ToastContext';
import client from '../../services/api/client';
import {
  AlertTriangle,
  RefreshCw,
  Download,
  Trash2,
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

const SOURCE_OPTIONS = [
  { value: 'all', label: 'كل المصادر' },
  { value: 'server', label: 'السيرفر (Server)' },
  { value: 'frontend', label: 'الواجهة (Frontend)' },
  { value: 'sync', label: 'المزامنة (Sync)' },
  { value: 'electron', label: 'تطبيق سطح المكتب (Electron)' },
];

const SOURCE_BADGES = {
  server: { label: 'Server', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  frontend: { label: 'Frontend', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  sync: { label: 'Sync', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  electron: { label: 'Electron', className: 'bg-purple-50 text-purple-700 border-purple-200' },
};

function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return ts;
  }
}

export default function ErrorLogsPanel() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');
  const [fileSizeBytes, setFileSizeBytes] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [clearing, setClearing] = useState(false);

  const loadLogs = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await client.get('/error-logs', {
        params: {
          source: source !== 'all' ? source : undefined,
          search: search.trim() || undefined,
          limit: 150,
        },
      });
      setItems(Array.isArray(res?.items) ? res.items : []);
      setFileSizeBytes(Number(res?.fileSizeBytes || 0));
    } catch (err) {
      toast.error(err.message || 'تعذر تحميل سجل الأخطاء');
    } finally {
      setLoading(false);
    }
  }, [source, search, toast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleDownload = async () => {
    try {
      const blob = await client.get('/error-logs/download', { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elwazeer-errors-${new Date().toISOString().slice(0, 10)}.jsonl`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('تم تحميل ملف سجل الأخطاء');
    } catch (err) {
      toast.error(err.message || 'فشل تحميل سجل الأخطاء');
    }
  };

  const handleClear = async () => {
    if (!window.confirm('هل أنت متأكد من مسح جميع سجلات الأخطاء المسجلة؟')) return;
    try {
      setClearing(true);
      await client.delete('/error-logs');
      toast.success('تم مسح سجل الأخطاء بنجاح');
      loadLogs();
    } catch (err) {
      toast.error(err.message || 'فشل مسح السجل');
    } finally {
      setClearing(false);
    }
  };

  const handleCopyEntry = (entry) => {
    try {
      navigator.clipboard?.writeText(JSON.stringify(entry, null, 2));
      setCopiedId(entry.errorId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="سجل أخطاء النظام المركزي (Error Logs)"
          subtitle="تسجيل تلقائي ومنقّى لأخطاء السيرفر، الواجهة، المزامنة، وتطبيق سطح المكتب لتسهيل التشخيص والدعم الفني"
          icon={AlertTriangle}
        />

        <div className="p-4 sm:p-5 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 relative">
              <Input
                placeholder="بحث برقم المرجع (ERR-...) أو الرسالة أو المسار أو المستخدم..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={Search}
              />
            </div>

            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 min-h-[42px]"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => loadLogs()} isLoading={loading}>
                تحديث
              </Button>
              <Button variant="primary" size="sm" icon={Download} onClick={handleDownload}>
                تحميل الملف
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={Trash2}
                onClick={handleClear}
                isLoading={clearing}
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                مسح السجل
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 font-bold bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
            <span>عدد السجلات المعروضة: {items.length}</span>
            <span className="font-mono">
              حجم ملف السجل: {(fileSizeBytes / 1024).toFixed(1)} KB
            </span>
          </div>

          {/* Logs List */}
          {loading ? (
            <div className="py-12 text-center text-sm font-bold text-slate-500">جاري تحميل سجل الأخطاء...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center bg-emerald-50/50 rounded-2xl border border-emerald-200 text-emerald-800 space-y-1">
              <p className="text-sm font-black">لا توجد أخطاء مسجلة حالياً</p>
              <p className="text-xs text-emerald-700">النظام يعمل بشكل مستقر وفق الفلتر المحدد.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map((entry, idx) => {
                const key = entry.errorId || `${entry.timestamp}-${idx}`;
                const isExpanded = expandedId === key;
                const badge = SOURCE_BADGES[entry.source] || {
                  label: entry.source || 'System',
                  className: 'bg-slate-100 text-slate-700 border-slate-200',
                };

                return (
                  <div
                    key={key}
                    className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-all"
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : key)}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer hover:bg-slate-50"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="mt-0.5 text-slate-400 shrink-0">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center flex-wrap gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black ${badge.className}`}>
                              {badge.label}
                            </span>
                            {entry.errorId && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono text-[10px] font-bold text-slate-700">
                                {entry.errorId}
                              </span>
                            )}
                            {entry.code && (
                              <Badge variant={entry.level === 'warn' ? 'warning' : 'danger'}>
                                {entry.code}
                              </Badge>
                            )}
                            {entry.statusCode && (
                              <span className="text-[10px] font-mono font-bold text-slate-500">
                                HTTP {entry.statusCode}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-900 break-words">{entry.message}</p>
                          {(entry.path || entry.username) && (
                            <div className="flex items-center flex-wrap gap-3 text-[11px] text-slate-500 font-mono">
                              {entry.path && (
                                <span>
                                  {entry.method ? `${entry.method} ` : ''}
                                  {entry.path}
                                </span>
                              )}
                              {entry.username && <span>user: {entry.username}</span>}
                              {entry.branchId && <span>branch: #{entry.branchId}</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyEntry(entry);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                          title="نسخ تفاصيل الخطأ"
                        >
                          {copiedId === entry.errorId ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-950 text-slate-100 p-3.5 space-y-2.5 text-xs">
                        {entry.rawMessage && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                              Raw Error Message
                            </div>
                            <pre className="text-amber-300 font-mono whitespace-pre-wrap break-all text-[11px] text-left dir-ltr" dir="ltr">
                              {entry.rawMessage}
                            </pre>
                          </div>
                        )}
                        {entry.details && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                              Details (Sanitized)
                            </div>
                            <pre className="text-sky-300 font-mono whitespace-pre-wrap break-all text-[11px] max-h-48 overflow-auto text-left" dir="ltr">
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          </div>
                        )}
                        {entry.stack && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                              Stack Trace
                            </div>
                            <pre className="text-rose-300 font-mono whitespace-pre-wrap break-all text-[11px] max-h-60 overflow-auto text-left" dir="ltr">
                              {entry.stack}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
