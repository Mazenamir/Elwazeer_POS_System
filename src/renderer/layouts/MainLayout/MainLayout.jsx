import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../../components/navigation/Sidebar';
import Header from '../../components/navigation/Header';

export function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem('sidebarPinned') !== 'false');

  const toggleSidebarPin = () => {
    setSidebarPinned((prev) => {
      const next = !prev;
      localStorage.setItem('sidebarPinned', next ? 'true' : 'false');
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-[#F8F2E4] text-[#24221F]" style={{ direction: 'rtl' }}>
      {/* Sidebar Navigation */}
      <div
        className={`no-print print:hidden shrink-0 relative z-[80] transition-[width] duration-200 ease-in-out ${
          sidebarPinned ? 'w-72' : 'w-20'
        }`}
      >
        <Sidebar
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          isPinned={sidebarPinned}
          onTogglePin={toggleSidebarPin}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="no-print print:hidden">
          <Header onToggleMobileMenu={() => setMobileOpen((prev) => !prev)} />
        </div>
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
