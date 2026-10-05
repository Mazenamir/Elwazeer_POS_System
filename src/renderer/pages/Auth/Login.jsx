import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/ui/Button';

export function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const toast = useToast();

  const [username, setUsername] = useState(() => localStorage.getItem('bebyoon_remembered_username') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('bebyoon_remembered_username'));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [greeting, setGreeting] = useState('أهلاً بك 🌙');

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      setGreeting('صباح الخير ☀️');
    } else if (hour >= 12 && hour < 18) {
      setGreeting('مساء الخير 🌤️');
    } else {
      setGreeting('أهلاً بك 🌙');
    }
  }, []);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('الرجاء إدخال اسم المستخدم وكلمة المرور');
      triggerShake();
      return;
    }

    setErrorMessage('');
    setLoading(true);

    try {
      await login(username.trim(), password);
      if (rememberMe) {
        localStorage.setItem('bebyoon_remembered_username', username.trim());
      } else {
        localStorage.removeItem('bebyoon_remembered_username');
      }
      toast.success('تم تسجيل الدخول بنجاح! مرحباً بك');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'اسم المستخدم أو كلمة المرور غير صحيحة');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-10 select-none overflow-x-hidden relative"
      style={{ direction: 'rtl' }}
    >
      {/* Ambient Glow Blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 -right-32 w-96 sm:w-[32rem] h-96 sm:h-[32rem] rounded-full bg-indigo-600/20 blur-[100px] anim-pulse-slow" />
        <div
          className="absolute -bottom-32 -left-32 w-96 sm:w-[32rem] h-96 sm:h-[32rem] rounded-full bg-rose-600/15 blur-[100px] anim-pulse-slow"
          style={{ animationDelay: '-4s' }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full bg-blue-600/10 blur-[130px]" />
      </div>

      {/* Main Container Card */}
      <main
        className={`w-full max-w-5xl rounded-[2.5rem] bg-slate-900/90 border border-slate-800/80 shadow-2xl shadow-black/60 overflow-hidden relative z-10 flex flex-col lg:flex-row items-stretch min-h-[640px] transition-transform duration-300 ${
          isShaking ? 'anim-shake' : ''
        }`}
      >
        {/* Left Side: Brand Showcase & Creative Visuals */}
        <section className="lg:w-1/2 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/70 p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden border-b lg:border-b-0 lg:border-l border-slate-800/60 brand-pattern">
          {/* Ambient interior light */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Header & Brand Badge */}
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-slate-300 text-xs font-bold shadow-sm backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="w-2 h-2 rounded-full bg-emerald-400 -mr-3.5" />
              <span>النظام متصل ومستقر</span>
            </div>

            <div className="mt-8 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 p-0.5 shadow-xl shadow-indigo-500/20 anim-float">
                <div className="w-full h-full rounded-[14px] bg-slate-950 flex items-center justify-center p-2 overflow-hidden">
                  <img
                    src="/logos/app-icon.png"
                    alt="Logo"
                    className="w-full h-full object-contain"
                    onError={(e) => (e.target.style.display = 'none')}
                  />
                </div>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Bebyoon Center
                </h1>
                <p className="text-xs sm:text-sm font-semibold text-slate-400 mt-1">
                  نظام إدارة المبيعات والمخزون والتأجير المتكامل
                </p>
              </div>
            </div>
          </div>

          {/* Feature Showcase Pills */}
          <div className="my-8 relative z-10 space-y-3.5">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">إدارة متكاملة للتأجير والمبيعات</h4>
                <p className="text-xs text-slate-400 font-medium">
                  حجز وتأجير البدل، التفصيل، الباركود، الفواتير الحرارية
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">بياناتك محمية ومؤمنة محلياً</h4>
                <p className="text-xs text-slate-400 font-medium">
                  قاعدة بيانات PostgreSQL عالية الاعتمادية ومزامنة سريعة
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Footer Info */}
          <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>الإصدار 2.0 (React SPA)</span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> جاهز للعمل
            </span>
          </div>
        </section>

        {/* Right Side: Login Form */}
        <section className="lg:w-1/2 p-8 sm:p-12 flex flex-col justify-center bg-slate-900/60 relative">
          <div className="max-w-md w-full mx-auto">
            {/* Header Greeting */}
            <div className="mb-8">
              <div className="text-sm font-bold text-indigo-400 tracking-wide mb-1">
                {greeting}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white">تسجيل الدخول للنظام</h2>
              <p className="text-xs sm:text-sm font-semibold text-slate-400 mt-2">
                أدخل بيانات حسابك للمتابعة إلى لوحة التحكم
              </p>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm font-bold flex items-center gap-3 animate-fade-in">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username Input */}
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
                    placeholder="أدخل اسم المستخدم..."
                    autoFocus={!username}
                    className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl py-3.5 pr-12 pl-4 text-sm font-bold text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 tracking-wide block">
                  كلمة المرور
                </label>
                <div className="relative flex items-center">
                  <div className="absolute right-4 text-slate-400 pointer-events-none">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoFocus={!!username}
                    className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl py-3.5 pr-12 pl-12 text-sm font-bold text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-4 text-slate-400 hover:text-white transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded-md bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500/30 accent-indigo-600"
                  />
                  <span className="text-xs font-bold text-slate-300">تذكر اسم المستخدم</span>
                </label>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={loading}
                className="w-full !rounded-2xl !py-3.5 !bg-indigo-600 hover:!bg-indigo-500 !shadow-lg !shadow-indigo-600/30 text-white font-black text-base mt-2"
              >
                دخول إلى النظام
              </Button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Login;
