import React from 'react';
import { Outlet } from 'react-router-dom';

export function AuthLayout({ children }) {
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

      <div className="relative z-10 w-full flex items-center justify-center">
        {children || <Outlet />}
      </div>
    </div>
  );
}

export default AuthLayout;
