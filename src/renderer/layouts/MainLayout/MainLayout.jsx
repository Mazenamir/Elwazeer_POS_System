import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../../components/navigation/Sidebar';
import Header from '../../components/navigation/Header';

export function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50/70" style={{ direction: 'rtl' }}>
      {/* Sidebar Navigation */}
      <div className="no-print print:hidden">
        <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="no-print print:hidden">
          <Header onToggleMobileMenu={() => setMobileOpen((prev) => !prev)} />
        </div>
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
