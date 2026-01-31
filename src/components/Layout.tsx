import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useState } from 'react';
import { Menu } from 'lucide-react';

export function Layout() {
    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="flex h-screen bg-background transition-colors duration-300">
            {/* Desktop sidebar */}
            <div className="hidden lg:flex">
                <Sidebar />
            </div>

            {/* Mobile: hamburger + overlay sidebar when open */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex items-center gap-3 p-3 lg:hidden border-b border-border bg-card">
                    <button
                        aria-label="Open menu"
                        onClick={() => setMobileOpen(true)}
                        className="p-2 rounded hover:bg-slate-200/10"
                    >
                        <Menu className="h-5 w-5" />
                    </button>
                    <div className="flex-1" />
                </header>

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    <Outlet />
                </main>
            </div>

            {mobileOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
                    <div className="absolute inset-y-0 left-0 w-64">
                        <Sidebar />
                    </div>
                </div>
            )}
        </div>
    );
}
