import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  AlertCircle,
  Scissors,
  Phone,
  Sparkles,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const SUIT_SLIDES = [
  {
    id: 1,
    image: '/suits/suit-1.jpg',
    tag: 'Black-Tie Collection',
    tagAr: 'تشكيلة التوكسيدو الملكية',
    title: 'Peak Lapel Tuxedo',
    titleAr: 'بدلة سهرة توكسيدو فاخرة',
    badge: 'Bespoke Atelier',
    badgeAr: 'تفصيل ملكي',
    author: 'Bebyoon Atelier',
    authorAr: 'دار بيبون للأزياء',
    authorSub: 'Bespoke Suits & Tailoring',
    authorSubAr: 'بدلات رجالية وتفصيل فاخر',
    category: 'Selected Works',
    categoryAr: 'تشكيلة بيبون 2026',
    actionText: 'Bespoke 2026',
    actionTextAr: 'تأجير وتفصيل',
  },
  {
    id: 2,
    image: '/suits/suit-2.jpg',
    tag: 'Velvet Midnight',
    tagAr: 'المجموعة المخملية الخاصة',
    title: 'Midnight Velvet Elegance',
    titleAr: 'أناقة المخمل والقصات العصرية',
    badge: 'VIP Rentals',
    badgeAr: 'تأجير VIP',
    author: 'Bebyoon Atelier',
    authorAr: 'صالون بيبون للبدلات',
    authorSub: 'Suits Rental & Styling',
    authorSubAr: 'تأجير وتنسيق البدلات',
    category: 'Selected Works',
    categoryAr: 'مجموعة السهرة 2026',
    actionText: 'VIP Tuxedos',
    actionTextAr: 'حجز سهرة VIP',
  },
  {
    id: 3,
    image: '/suits/suit-3.jpg',
    tag: 'Ceremonial Suits',
    tagAr: 'بدلات الأعراس والاحتفالات',
    title: 'Artisan Bespoke Craft',
    titleAr: 'تفصيل حسب المقاس وخياطة دقيقة',
    badge: 'Master Tailoring',
    badgeAr: 'مشغل الخياطة',
    author: 'Bebyoon Atelier',
    authorAr: 'مشغل بيبون المعتمد',
    authorSub: 'Master Tailors & Custom Cuts',
    authorSubAr: 'خياطة وتفصيل دقيق',
    category: 'Selected Works',
    categoryAr: 'تصميم حسب الطلب',
    actionText: 'Custom Atelier',
    actionTextAr: 'مشغل التفصيل',
  },
];

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

  // Localization toggle (defaults to Arabic)
  const [isArabic, setIsArabic] = useState(() => localStorage.getItem('bebyoon_lang') !== 'en');

  // Suit Showcase Slides Carousel
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Auto-advance showcase slides every 7 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SUIT_SLIDES.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % SUIT_SLIDES.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + SUIT_SLIDES.length) % SUIT_SLIDES.length);
  };

  const toggleLanguage = () => {
    const nextLang = !isArabic;
    setIsArabic(nextLang);
    localStorage.setItem('bebyoon_lang', nextLang ? 'ar' : 'en');
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 450);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage(
        isArabic
          ? 'الرجاء إدخال اسم المستخدم وكلمة المرور'
          : 'Please enter both username and password'
      );
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
      toast.success(
        isArabic
          ? 'تم تسجيل الدخول بنجاح! مرحباً بك'
          : 'Signed in successfully! Welcome back'
      );
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrorMessage(
        err.message ||
          (isArabic
            ? 'اسم المستخدم أو كلمة المرور غير صحيحة'
            : 'Invalid username or password')
      );
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    toast.info(
      isArabic
        ? 'يرجى مراجعة مسؤول النظام لإعادة ضبط كلمة المرور'
        : 'Please contact the system administrator to reset your password'
    );
  };



  const activeSlide = SUIT_SLIDES[currentSlide];

  return (
    <div
      className="min-h-screen w-full relative flex items-center justify-center p-3 sm:p-5 select-none overflow-x-hidden bg-[#0A0D14]"
      style={{ direction: 'ltr' }}
    >
      {/* Background Ambience: Soft tailored glow & subtle backdrop radiance */}
      <div className="absolute top-0 left-0 w-2/3 h-full opacity-20 blur-3xl pointer-events-none overflow-hidden">
        <img
          src={activeSlide.image}
          alt=""
          className="w-full h-full object-cover scale-150 transition-opacity duration-1000"
        />
      </div>
      <div className="absolute top-1/4 left-1/4 w-[450px] h-[450px] bg-neutral-800/30 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-red-950/25 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:28px_28px] pointer-events-none opacity-40" />

      {/* Main Split Container Card (Neumorphic floating frame matching reference) */}
      <div
        className={`relative z-10 max-w-[1000px] w-full bg-white rounded-[32px] sm:rounded-[38px] shadow-[0_25px_80px_-15px_rgba(0,0,0,0.6)] p-3 sm:p-4 lg:p-5 border border-white/60 flex flex-col md:flex-row items-stretch transition-transform duration-300 ${
          isShaking ? 'anim-shake' : ''
        }`}
      >
        {/* Left Column: Suit Showcase & Art Card */}
        <div className="relative w-full md:w-[48%] lg:w-[49%] h-[240px] sm:h-[300px] md:h-auto md:min-h-[560px] md:max-h-[580px] rounded-[24px] sm:rounded-[30px] overflow-hidden flex flex-col justify-between shrink-0 bg-neutral-950 text-white shadow-md">
          {/* Background Suit Images with Crossfade */}
          {SUIT_SLIDES.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                index === currentSlide ? 'opacity-100 scale-100' : 'opacity-0 scale-105 pointer-events-none'
              }`}
            >
              <img
                src={slide.image}
                alt={isArabic ? slide.titleAr : slide.title}
                className="w-full h-full object-cover object-center"
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}

          {/* Vignette Gradients (Dark at top and bottom, clear in middle for suits) */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/55 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-black/15 pointer-events-none" />

          {/* Top Header Bar Inside Showcase Card */}
          <div className="relative z-10 p-4 sm:p-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs sm:text-sm font-bold tracking-wide text-white/95 font-display drop-shadow-sm">
                {isArabic ? activeSlide.categoryAr : activeSlide.category}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-white/70 hidden sm:inline-block">
                {isArabic ? activeSlide.badgeAr : activeSlide.badge}
              </span>
              <span className="px-3.5 py-1 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/25 text-xs font-bold text-white transition shadow-sm">
                {isArabic ? activeSlide.actionTextAr : activeSlide.actionText}
              </span>
            </div>
          </div>

          {/* Middle Floating Info / Caption (Discreet, does not block the suit) */}
          <div className="relative z-10 px-4 sm:px-5 mt-auto mb-2 hidden sm:block" dir={isArabic ? 'rtl' : 'ltr'}>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/45 backdrop-blur-md border border-amber-400/30 mb-1 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-[10px] font-bold text-amber-300 uppercase tracking-widest">
                {isArabic ? activeSlide.tagAr : activeSlide.tag}
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-white font-display leading-tight drop-shadow">
              {isArabic ? activeSlide.titleAr : activeSlide.title}
            </h3>
          </div>

          {/* Bottom Bar: Master Tailor Avatar Badge & Carousel Arrows */}
          <div className="relative z-10 p-3 sm:p-4 md:p-5 flex items-center justify-between border-t border-white/15 backdrop-blur-md bg-black/25">
            {/* Atelier Circular Avatar */}
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 border-white/80 overflow-hidden shadow-lg shrink-0 bg-neutral-900">
              <img
                src="/suits/tailor-avatar.jpg"
                alt="Bebyoon Master Tailor"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Carousel Arrow Controls */}
            <div className="flex items-center gap-1.5" dir="ltr">
              <button
                type="button"
                onClick={prevSlide}
                aria-label="Previous Slide"
                className="w-8 h-8 rounded-full border border-white/30 bg-black/40 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={nextSlide}
                aria-label="Next Slide"
                className="w-8 h-8 rounded-full border border-white/30 bg-black/40 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white transition-all cursor-pointer shadow-sm"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Clean Authentication Form */}
        <div
          className="w-full md:w-[52%] lg:w-[51%] px-5 sm:px-8 lg:px-9 py-4 sm:py-5 flex flex-col justify-between bg-white z-10 rounded-[24px]"
        >
          {/* Top Bar: Brand Wordmark & Language Selector */}
          <div className="flex items-center justify-between gap-4" dir="ltr">
            {/* Brand Logo matching UISOCIAL in reference */}
            <div className="flex items-center gap-2">
              <span className="text-xl sm:text-2xl font-black tracking-wider text-neutral-900 font-display">
                BEBYOON
              </span>
              <span className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase bg-neutral-100 px-2 py-0.5 rounded-md font-display">
                POS
              </span>
              <h2 className="sr-only">Bebyoon Center</h2>
            </div>

            {/* Language Selector Pill */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-all cursor-pointer shadow-sm"
            >
              <span>{isArabic ? '🇸🇦 العربية' : '🇬🇧 EN'}</span>
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            </button>
          </div>

          {/* Form Main Body */}
          <div className="my-auto py-2" dir={isArabic ? 'rtl' : 'ltr'}>
            {/* Centered Headline & Subtitle matching reference */}
            <div className="mb-5 text-center">
              <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-black text-neutral-900 tracking-tight font-display">
                {isArabic ? 'تسجيل الدخول' : 'Welcome Back'}
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400 font-medium mt-1.5 font-display">
                {isArabic
                  ? 'سجل دخولك لإدارة مبيعات وتأجير وتفصيل البدلات الرجالية'
                  : 'Sign in to Bebyoon Suits & Tailoring POS System'}
              </p>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-3.5 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 animate-fade-in font-display">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Credentials Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Username Input */}
              <div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={isArabic ? 'اسم المستخدم أو البريد الإلكتروني...' : 'Username or Email'}
                  autoFocus={!username}
                  className="w-full px-4 py-3 text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-neutral-200 placeholder:text-neutral-400 text-neutral-900 focus:outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 transition-all bg-white font-display"
                />
              </div>

              {/* Password Input */}
              <div>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isArabic ? 'أدخل كلمة المرور...' : 'Password'}
                    autoFocus={!!username}
                    className={`w-full px-4 py-3 text-xs sm:text-sm font-medium rounded-xl sm:rounded-2xl border border-neutral-200 placeholder:text-neutral-400 text-neutral-900 focus:outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 transition-all bg-white font-display ${
                      isArabic ? 'pl-10' : 'pr-10'
                    }`}
                  />
                  {password.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className={`absolute text-neutral-400 hover:text-neutral-700 transition-colors p-1 cursor-pointer ${
                        isArabic ? 'left-2.5' : 'right-2.5'
                      }`}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Sub-row: Remember me on start edge & Forgot password on end edge */}
                <div className="flex items-center justify-between pt-1.5 px-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-neutral-300 text-[#EF4444] focus:ring-[#EF4444] accent-[#EF4444] cursor-pointer"
                    />
                    <span className="text-[11px] font-semibold text-neutral-600 font-display">
                      {isArabic ? 'تذكر اسم المستخدم' : 'Remember me'}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    tabIndex={-1}
                    className="text-[11px] font-semibold text-[#EF4444] hover:text-[#DC2626] hover:underline cursor-pointer font-display transition-colors"
                  >
                    {isArabic ? 'هل نسيت كلمة المرور؟' : 'Forgot password ?'}
                  </button>
                </div>
              </div>

              {/* Vibrant Red/Coral Action Button matching reference */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3 sm:py-3.5 px-5 rounded-xl sm:rounded-2xl bg-[#EF4444] hover:bg-[#DC2626] active:scale-[0.99] text-white text-xs sm:text-sm font-bold tracking-wide transition-all shadow-[0_8px_20px_-4px_rgba(239,68,68,0.4)] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer font-display"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{isArabic ? 'جاري التحقق...' : 'Signing in...'}</span>
                  </>
                ) : (
                  <span>{isArabic ? 'دخول إلى النظام' : 'Login'}</span>
                )}
              </button>
            </form>
          </div>

          {/* Bottom Footer: Round Action/Info Icons */}
          <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-center gap-3 text-neutral-400" dir="ltr">
            <button
              type="button"
              onClick={() => toast.info(isArabic ? 'دار بيبون للأزياء والبدلات الرجالية' : 'Bebyoon Atelier - Bespoke Formal Wear')}
              aria-label="Atelier Info"
              title={isArabic ? 'دار بيبون للأزياء' : 'Bebyoon Atelier'}
              className="w-7 h-7 rounded-full border border-neutral-200 hover:border-neutral-400 hover:text-neutral-700 flex items-center justify-center transition cursor-pointer"
            >
              <Scissors className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => toast.info(isArabic ? 'رقم الدعم الفني: 0100000000' : 'Technical Support: 0100000000')}
              aria-label="Support Phone"
              title={isArabic ? 'الدعم الفني' : 'Technical Support'}
              className="w-7 h-7 rounded-full border border-neutral-200 hover:border-neutral-400 hover:text-neutral-700 flex items-center justify-center transition cursor-pointer"
            >
              <Phone className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => toast.info(isArabic ? 'كتالوج البدلات والتفصيل متوفر في شاشات النظام' : 'Suits catalog available in system modules')}
              aria-label="Catalog"
              title={isArabic ? 'كتالوج البدلات' : 'Suits Catalog'}
              className="w-7 h-7 rounded-full border border-neutral-200 hover:border-neutral-400 hover:text-neutral-700 flex items-center justify-center transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => toast.info(isArabic ? 'نظام بيبون لإدارة وتأجير البدلات - الإصدار 1.0.6' : 'Bebyoon Suits POS System v1.0.6')}
              aria-label="System Info"
              title={isArabic ? 'معلومات النظام' : 'System Info'}
              className="w-7 h-7 rounded-full border border-neutral-200 hover:border-neutral-400 hover:text-neutral-700 flex items-center justify-center transition cursor-pointer"
            >
              <Info className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
