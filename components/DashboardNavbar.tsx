"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from "next-auth/react";
import {
    LayoutDashboard,
    Clock,
    Stethoscope,
    FileText,
    User,
    LogOut,
    Menu,
    X,
    HelpCircle,
    ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';

interface DashboardNavbarProps {
    user: any;
}

export default function DashboardNavbar({ user }: DashboardNavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

    // Determines active state based on URL path
    const isActive = (path: string) => {
        if (path === '/dashboard' && pathname === '/dashboard') return true;
        if (path === '/profile' && pathname === '/profile') return true;
        if (path !== '/dashboard' && pathname.startsWith(path)) return true;
        return false;
    };

    const handleSignOut = async () => {
        setIsProfileOpen(false);
        await signOut({ callbackUrl: '/' });
    };

    useEffect(() => {
        const controlNavbar = () => {
            if (typeof window !== 'undefined') {
                const currentScrollY = window.scrollY;

                // Close menus on scroll
                if (Math.abs(currentScrollY - lastScrollY) > 5) {
                    setIsProfileOpen(false);
                    setIsMobileMenuOpen(false);
                }

                if (currentScrollY > lastScrollY && currentScrollY > 100) {
                    setIsVisible(false);
                } else {
                    setIsVisible(true);
                }
                setLastScrollY(currentScrollY);
            }
        };
        window.addEventListener('scroll', controlNavbar);
        return () => window.removeEventListener('scroll', controlNavbar);
    }, [lastScrollY]);

    const dashboardHref = user?.id ? `/dashboard?patientUserId=${encodeURIComponent(user.id)}` : '/dashboard';
    const navLinks = [
        { name: 'Dashboard', href: dashboardHref, icon: <LayoutDashboard className="w-4 h-4" /> },
    ];

    return (
        <>
            <nav className={`fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 transition-transform duration-300 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-20">
                        {/* Logo */}
                        <Link href={dashboardHref} className="flex-shrink-0 flex items-center gap-2 group cursor-pointer">
                            <div className="relative w-9 h-9 rounded-xl overflow-hidden shadow-sm shrink-0">
                                <Image
                                    src="/Nrivaa Logo.jpeg"
                                    alt="Niraiva Logo"
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 36px, 36px"
                                    quality={100}
                                />
                            </div>
                            <span className="font-bold text-xl tracking-tight text-slate-800">
                                Niraiva<span className="text-teal-600">Health</span>
                            </span>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden md:flex items-center space-x-1">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${isActive(link.href)
                                        ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }`}
                                >
                                    {link.icon}
                                    {link.name}
                                </Link>
                            ))}
                        </div>

                        {/* User Profile */}
                        <div className="hidden md:flex items-center gap-4">
                            <div className="relative pl-4 border-l border-slate-200">
                                <button
                                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                                    className="flex items-center gap-3 focus:outline-none group text-right"
                                >
                                    <div className="hidden lg:block">
                                        <p className="text-sm font-bold text-slate-900 group-hover:text-teal-700 transition-colors">{user?.name || "User"}</p>
                                        <p className="text-xs text-slate-500">Patient ID: {user?.customId || "Pending"}</p>
                                    </div>

                                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 p-0.5 shadow-md transition-all ${isProfileOpen ? 'ring-2 ring-teal-200 shadow-teal-200' : 'group-hover:shadow-teal-200'}`}>
                                        <div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                                            {user?.image ? (
                                                <Image
                                                    src={user.image}
                                                    alt="Profile"
                                                    width={40}
                                                    height={40}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                                                    <User className="w-5 h-5" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 hidden lg:block ${isProfileOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Dropdown Menu */}
                                <AnimatePresence>
                                    {isProfileOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            transition={{ duration: 0.2 }}
                                            className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-[60]"
                                        >
                                            <div className="p-4 bg-slate-50 border-b border-slate-100">
                                                <p className="text-sm font-bold text-slate-900">{user?.name || "Guest User"}</p>
                                                <p className="text-xs text-slate-500 truncate">{user?.email || "No email provided"}</p>
                                            </div>
                                            <div className="p-2 space-y-1">
                                                <Link
                                                    href="/profile"
                                                    onClick={() => setIsProfileOpen(false)}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive('/profile') ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                                >
                                                    <User className="w-4 h-4" />
                                                    Profile & Settings
                                                </Link>
                                                <button
                                                    onClick={() => {
                                                        setIsProfileOpen(false);
                                                        router.push('/help-support');
                                                    }}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                                                >
                                                    <HelpCircle className="w-4 h-4" />
                                                    Help & Support
                                                </button>
                                            </div>
                                            <div className="p-2 border-t border-slate-100">
                                                <button
                                                    onClick={() => setShowSignOutConfirm(true)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                                >
                                                    <LogOut className="w-4 h-4" />
                                                    Sign Out
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Mobile Menu Button */}
                        <div className="md:hidden flex items-center">
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none"
                            >
                                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMobileMenuOpen && (
                    <div className="md:hidden bg-white border-t border-slate-100 px-4 pt-2 pb-6 shadow-lg">
                        <div className="space-y-2 mt-2">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.name}
                                    href={link.href!}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${isActive(link.href)
                                        ? 'bg-teal-50 text-teal-700'
                                        : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                >
                                    {link.icon}
                                    {link.name}
                                </Link>
                            ))}
                            <div className="pt-4 mt-4 border-t border-slate-100 space-y-2">
                                <Link
                                    href="/profile"
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${isActive('/profile') ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <User className="w-5 h-5" />
                                    Profile & Settings
                                </Link>
                                <button
                                    onClick={() => {
                                        setIsMobileMenuOpen(false);
                                        router.push('/help-support');
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                                >
                                    <HelpCircle className="w-5 h-5" />
                                    Help & Support
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </nav>

            {/* Sign Out Confirmation Modal */}
            <AnimatePresence>
                {showSignOutConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 flex flex-col"
                        >
                            <div className="p-6 text-center bg-slate-50 border-b border-slate-100">
                                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4 text-red-600">
                                    <LogOut className="w-8 h-8 ml-1" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900">Sign Out?</h3>
                                <p className="text-slate-500 font-medium text-sm mt-2">Are you sure you want to end your session?</p>
                            </div>
                            <div className="p-6 grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setShowSignOutConfirm(false)}
                                    className="py-3 px-4 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSignOut}
                                    className="py-3 px-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors shadow-lg shadow-red-200"
                                >
                                    Sign Out
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
