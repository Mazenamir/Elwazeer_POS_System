import React from 'react';
import { Outlet } from 'react-router-dom';

export function AuthLayout({ children }) {
  return (
    <div
      className="min-h-screen w-full relative flex items-center justify-center p-3 sm:p-6 lg:p-8 select-none overflow-x-hidden bg-[#0A0D14]"
      style={{ direction: 'ltr' }}
    >
      <div className="absolute top-10 left-10 w-[500px] h-[500px] bg-neutral-800/25 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[450px] h-[450px] bg-red-950/20 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:28px_28px] pointer-events-none opacity-40" />
      <div className="relative z-10 w-full flex items-center justify-center">
        {children || <Outlet />}
      </div>
    </div>
  );
}

export default AuthLayout;
