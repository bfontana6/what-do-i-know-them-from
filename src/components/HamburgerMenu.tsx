'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { extractTitles } from '@/lib/titles';

interface HamburgerMenuProps {
    watchHistory: string[] | null;
    onHistoryUpdate: (newHistory: string[] | null) => void;
    onSetupHistory?: () => void;
}

export default function HamburgerMenu({ watchHistory, onHistoryUpdate, onSetupHistory }: HamburgerMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [showSingleTitleInput, setShowSingleTitleInput] = useState(false);
    const [showHistoryView, setShowHistoryView] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [singleTitle, setSingleTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const [showAddInSheet, setShowAddInSheet] = useState(false);
    const [newTitleInSheet, setNewTitleInSheet] = useState('');
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [confirmingClear, setConfirmingClear] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // For the viewer, show only "clean" titles — not raw Netflix episode strings
    // (those are still stored for matching purposes but would clutter the list)
    const displayHistory = (watchHistory || [])
        .filter(t => !t.match(/:\s*Season\s+\d/i))
        .sort((a, b) => a.localeCompare(b));

    const filteredHistory = historySearch.trim()
        ? displayHistory.filter(t => t.toLowerCase().includes(historySearch.toLowerCase()))
        : displayHistory;

    const removeTitle = (titleToRemove: string) => {
        const updated = (watchHistory || []).filter(t =>
            t !== titleToRemove && !t.toLowerCase().startsWith(titleToRemove.toLowerCase() + ':')
        );
        onHistoryUpdate(updated.length === 0 ? null : updated);
    };

    const handleAddInSheet = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitleInSheet.trim()) return;
        const currentTitles = watchHistory || [];
        const combinedTitles = Array.from(new Set([...currentTitles, newTitleInSheet.trim()]));
        onHistoryUpdate(combinedTitles);
        setNewTitleInSheet('');
        setShowAddInSheet(false);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadError(null);
        setLoading(true);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                try {
                    const newTitles = results.data
                        .map((row: any) => row.Title)
                        .filter((title: string) => title && title.trim().length > 0)
                        .flatMap((title: string) => extractTitles(title));

                    if (newTitles.length > 0) {
                        const currentTitles = watchHistory || [];
                        const combinedSet = new Set([...currentTitles, ...newTitles]);
                        const combinedTitles = Array.from(combinedSet);
                        onHistoryUpdate(combinedTitles);
                        setIsOpen(false);
                    } else {
                        setUploadError("No titles found in the uploaded CSV.");
                    }
                } catch (err) {
                    setUploadError("Failed to parse the CSV file.");
                } finally {
                    setLoading(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            },
            error: (err) => {
                setUploadError(err.message);
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        });
    };

    const handleAddSingleTitle = (e: React.FormEvent) => {
        e.preventDefault();
        if (!singleTitle.trim()) return;

        const currentTitles = watchHistory || [];
        const combinedSet = new Set([...currentTitles, singleTitle.trim()]);
        const combinedTitles = Array.from(combinedSet);
        onHistoryUpdate(combinedTitles);
        setSingleTitle('');
        setShowSingleTitleInput(false);
        setIsOpen(false);
    };

    const handleExportCsv = () => {
        const titles = (watchHistory || [])
            .filter(t => !t.match(/:\s*Season\s+\d/i))
            .sort((a, b) => a.localeCompare(b));
        const csvContent = 'Title\n' + titles.map(t => `"${t.replace(/"/g, '""')}"`).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'WatchHistory.csv';
        link.click();
        URL.revokeObjectURL(url);
        setIsOpen(false);
    };

    return (
        <div className="relative z-50">
            {/* Hamburger Button */}
            <button
                onClick={() => { setIsOpen(!isOpen); setUploadError(null); }}
                className="p-3 bg-[#1c1c1c] hover:bg-zinc-700 text-[#a0a0a0] rounded-xl border border-[#262626] transition shadow-lg"
                aria-label="Menu"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>

            {/* Hidden CSV Input */}
            <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                ref={fileInputRef}
                className="hidden"
            />

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-[#1c1c1c] border border-[#262626] rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 space-y-1">
                        {!showSingleTitleInput ? (
                            <>
                                {onSetupHistory && (!watchHistory || watchHistory.length === 0) && (
                                    <button
                                        onClick={() => { setIsOpen(false); onSetupHistory(); }}
                                        className="w-full text-left px-4 py-3 text-sm font-medium text-[#818cf8] hover:bg-zinc-800 rounded-lg transition flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        Set up Netflix history
                                    </button>
                                )}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={loading}
                                    className="w-full text-left px-4 py-3 text-sm font-medium text-[#818cf8] hover:bg-zinc-800 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                                    {loading ? 'Uploading...' : 'Upload CSV List'}
                                </button>
                                {uploadError && (
                                    <p className="px-4 py-2 text-xs text-red-400">{uploadError}</p>
                                )}
                                
                                <button
                                    onClick={() => setShowSingleTitleInput(true)}
                                    className="w-full text-left px-4 py-3 text-sm font-medium text-[#818cf8] hover:bg-zinc-800 rounded-lg transition flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                    Add Single Title
                                </button>

                                {watchHistory && watchHistory.length > 0 && (
                                    <>
                                        <div className="h-px bg-[#262626] my-1 mx-2"></div>
                                        <button
                                            onClick={() => { setIsOpen(false); setShowHistoryView(true); }}
                                            className="w-full text-left px-4 py-3 text-sm font-medium text-[#a0a0a0] hover:bg-zinc-800 rounded-lg transition flex items-center justify-between gap-2"
                                        >
                                            <span className="flex items-center gap-2">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                                                View History
                                            </span>
                                            <span className="text-[11px] text-[#808080] bg-[#262626] px-2 py-0.5 rounded-full">{displayHistory.length}</span>
                                        </button>
                                        <button
                                            onClick={handleExportCsv}
                                            className="w-full text-left px-4 py-3 text-sm font-medium text-[#a0a0a0] hover:bg-zinc-800 rounded-lg transition flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                            Export History CSV
                                        </button>
                                        {confirmingClear ? (
                                            <div className="px-4 py-3 animate-in fade-in duration-150">
                                                <p className="text-xs text-[#a0a0a0] mb-2">Clear all watch history?</p>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setConfirmingClear(false)} className="flex-1 py-1.5 bg-[#262626] text-[#808080] text-xs rounded-lg">Cancel</button>
                                                    <button onClick={() => { onHistoryUpdate(null); setIsOpen(false); setConfirmingClear(false); }} className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg">Clear</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmingClear(true)}
                                                className="w-full text-left px-4 py-3 text-sm font-medium text-red-400 hover:bg-zinc-800 rounded-lg transition flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                Clear All History
                                            </button>
                                        )}
                                    </>
                                )}
                            </>
                        ) : (
                            <form onSubmit={handleAddSingleTitle} className="p-2 animate-in fade-in duration-200">
                                <label className="block text-xs text-[#a0a0a0] mb-2 px-1">Enter a movie or show title:</label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={singleTitle}
                                    onChange={(e) => setSingleTitle(e.target.value)}
                                    placeholder="e.g. Forrest Gump"
                                    className="w-full bg-[#1c1c1c] border border-[#262626] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2 placeholder-[#4a4a4a]"
                                />
                                <div className="flex gap-2">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowSingleTitleInput(false)}
                                        className="flex-1 py-2 bg-[#262626] hover:bg-[#1a1a1a] text-[#a0a0a0] text-xs font-medium rounded-lg transition"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={!singleTitle.trim()}
                                        className="flex-1 py-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-medium rounded-lg transition disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
            
            {/* Click away overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[-1]"
                    onClick={() => { setIsOpen(false); setShowSingleTitleInput(false); }}
                ></div>
            )}

            {/* History bottom sheet */}
            {showHistoryView && (
                <div
                    className="fixed inset-0 z-[200] bg-black/70 flex flex-col justify-end"
                    onClick={() => { setShowHistoryView(false); setHistorySearch(''); setShowAddInSheet(false); setNewTitleInSheet(''); }}
                >
                    <div
                        className="bg-[#141414] border-t border-[#262626] rounded-t-2xl flex flex-col animate-in slide-in-from-bottom-4 duration-300"
                        style={{ maxHeight: '85vh' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-5 py-3 flex items-center justify-between border-b border-[#262626]">
                            <div>
                                <h2 className="text-[#f0f0f0] font-semibold text-base">Watch History</h2>
                                <p className="text-[#808080] text-xs mt-0.5">{displayHistory.length} titles stored</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setShowAddInSheet(!showAddInSheet); setHistorySearch(''); }}
                                    className="p-2 text-[#818cf8] hover:text-[#818cf8] transition rounded-lg hover:bg-zinc-800"
                                    aria-label="Add title"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                                </button>
                                <button
                                    onClick={() => { setShowHistoryView(false); setHistorySearch(''); setShowAddInSheet(false); setNewTitleInSheet(''); }}
                                    className="p-2 text-[#808080] hover:text-[#f0f0f0] transition rounded-lg hover:bg-zinc-800"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Inline add form */}
                        {showAddInSheet && (
                            <form onSubmit={handleAddInSheet} className="px-4 py-3 border-b border-zinc-800/40 flex gap-2 animate-in fade-in duration-150">
                                <input
                                    autoFocus
                                    type="text"
                                    value={newTitleInSheet}
                                    onChange={e => setNewTitleInSheet(e.target.value)}
                                    placeholder="Movie or show title…"
                                    className="flex-1 bg-[#1c1c1c] border border-[#262626] text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder-[#4a4a4a]"
                                />
                                <button
                                    type="submit"
                                    disabled={!newTitleInSheet.trim()}
                                    className="px-4 py-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-medium rounded-xl transition disabled:opacity-40"
                                >
                                    Add
                                </button>
                            </form>
                        )}

                        {/* Search */}
                        {!showAddInSheet && (
                            <div className="px-4 py-3 border-b border-zinc-800/40">
                                <div className="relative">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#808080]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" /></svg>
                                    <input
                                        type="text"
                                        value={historySearch}
                                        onChange={e => setHistorySearch(e.target.value)}
                                        placeholder="Search titles…"
                                        className="w-full bg-[#1c1c1c] border border-[#262626] text-white rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-[#4a4a4a]"
                                    />
                                </div>
                            </div>
                        )}

                        {/* List */}
                        <div className="overflow-y-auto flex-1 px-2 py-2">
                            {filteredHistory.length === 0 ? (
                                <p className="text-zinc-600 text-sm text-center py-10">
                                    {historySearch ? 'No titles match your search' : 'No titles in history'}
                                </p>
                            ) : (
                                <ul>
                                    {filteredHistory.map((title, idx) => (
                                        <li key={idx} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-[#1a1a1a] group">
                                            <span className="text-[#a0a0a0] text-sm truncate flex-1 pr-3">{title}</span>
                                            <button
                                                onClick={() => removeTitle(title)}
                                                className="flex-shrink-0 p-2.5 text-[#4a4a4a] hover:text-[#f87171] hover:bg-[#1a1a1a] rounded-lg transition"
                                                aria-label={`Remove ${title}`}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
