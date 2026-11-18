import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidMount() {
    window.addEventListener('popstate', this.handleRouteReset);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this.handleRouteReset);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught error:', error, errorInfo);
  }

  handleRouteReset = () => {
    if (this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    if (window.location.pathname !== '/dashboard') {
      window.location.assign('/dashboard');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center select-none"
          style={{ direction: 'rtl' }}
        >
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 text-3xl font-black">
              !
            </div>
            <h1 className="text-xl font-bold text-white">حدث خطأ أثناء تحميل النظام</h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              تعذر تحميل بعض مكونات الصفحة بشكل صحيح. يرجى إعادة تحميل الصفحة أو التحقق من الاتصال بالخادم.
            </p>
            {this.state.error?.message && (
              <pre className="text-xs bg-slate-950/70 text-rose-400 p-3 rounded-xl overflow-x-auto text-left max-h-28">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-bold text-sm transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                إعادة تحميل الصفحة
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="py-3.5 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 font-bold text-sm transition-all border border-slate-700 cursor-pointer"
              >
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
