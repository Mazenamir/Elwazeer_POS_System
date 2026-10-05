import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Lock, BadgeCheck, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api/client';
import Button from '../../components/common/Button';

export function Setup() {
  const navigate = useNavigate();
  const { setSetupRequired } = useAuth();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    async function checkSetupStatus() {
      try {
        const res = await api.get('/public/check-setup');
        if (!res?.needsSetup && !res?.setupRequired) {
          navigate('/login', { replace: true });
        }
      } catch (err) {
        console.error('Error checking setup:', err);
      } finally {
        setChecking(false);
      }
    }
    checkSetupStatus();
  }, [navigate]);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim() || !password) {
      setErrorMessage('الرجاء إدخال جميع البيانات المطلوبة');
      triggerShake();
      return;
    }
    if (password.length < 6) {
      setErrorMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      triggerShake();
      return;
    }

    setErrorMessage('');
    setLoading(true);

    try {
      await api.post('/public/setup', {
        full_name: fullName.trim(),
        username: username.trim(),
        password,
      });

      if (setSetupRequired) {
        setSetupRequired(false);
      }

      toast.success('تم إنشاء حساب المدير بنجاح! يمكنك الآن تسجيل الدخول');
      navigate('/login', { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'حدث خطأ أثناء إعداد النظام');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <span className="text-sm font-bold text-slate-300">جاري فحص حالة النظام...</span>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-10 select-none overflow-x-hidden relative"
      style={{ direction: 'rtl' }}
    >
      {/* Ambient Glow Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -right-32 w-96 sm:w-[32rem] h-96 sm:h-[32rem] rounded-full bg-indigo-600/20 blur-[100px] anim-pulse-slow" />
        <div
          className="absolute -bottom-32 -left-32 w-96 sm:w-[32rem] h-96 sm:h-[32rem] rounded-full bg-blue-600/15 blur-[100px] anim-pulse-slow"
          style={{ animationDelay: '-4s' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full bg-emerald-600/10 blur-[130px]" />
      </div>

      <main
        className={`w-full max-w-lg rounded-[2.5rem] bg-slate-900/90 border border-slate-800/80 shadow-2xl shadow-black/60 overflow-hidden relative z-10 p-8 sm:p-12 transition-transform duration-300 ${
          isShaking ? 'anim-shake' : ''
        }`}
      >
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-xl shadow-indigo-600/20 mb-4 anim-float">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">إعداد النظام الأولي</h1>
          <p className="text-xs sm:text-sm font-semibold text-slate-400 mt-1.5">
            إنشاء أول حساب مدير للنظام لبدء الاستخدام
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm font-bold flex items-center gap-3 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 tracking-wide block">
              الاسم الكامل
            </label>
            <div className="relative flex items-center">
              <div className="absolute right-4 text-slate-400 pointer-events-none">
                <BadgeCheck className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="أدخل اسمك الكامل..."
                autoFocus
                className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl py-3 pr-12 pl-4 text-sm font-bold text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 tracking-wide block">
              اسم المستخدم
            </label>
            <div className="relative flex items-center">
              <div className="absolute right-4 text-slate-400 pointer-events-none">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم للوحة التحكم..."
                className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl py-3 pr-12 pl-4 text-sm font-bold text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 tracking-wide block">
              كلمة المرور
            </label>
            <div className="relative flex items-center">
              <div className="absolute right-4 text-slate-400 pointer-events-none">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="•••••••• (6 أحرف على الأقل)"
                className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl py-3 pr-12 pl-4 text-sm font-bold text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={loading}
            className="w-full !rounded-2xl !py-3.5 !bg-indigo-600 hover:!bg-indigo-500 !shadow-lg !shadow-indigo-600/30 text-white font-black text-base mt-4"
          >
            إنشاء الحساب وبدء النظام
          </Button>
        </form>
      </main>
    </div>
  );
}

export default Setup;
