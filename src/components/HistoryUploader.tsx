'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { extractTitles } from '@/lib/titles';

export default function HistoryUploader({ onProfileCreated, onSkip }: { onProfileCreated: (name: string, titles: string[]) => Promise<void>; onSkip?: () => void }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [titleCount, setTitleCount] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!name.trim()) {
            setError('Please enter your name first.');
            return;
        }

        setLoading(true);
        setError(null);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const newTitles = results.data
                        .map((row: any) => row.Title)
                        .filter((title: string) => title && title.trim().length > 0)
                        .flatMap((title: string) => extractTitles(title));

                    if (newTitles.length === 0) {
                        setError('Could not find any titles in the CSV. Make sure it is a Netflix ViewingActivity.csv format.');
                        setLoading(false);
                        return;
                    }

                    const uniqueTitles = Array.from(new Set(newTitles));
                    setTitleCount(uniqueTitles.length);
                    await onProfileCreated(name.trim(), uniqueTitles);
                    setLoading(false);
                } catch (err: any) {
                    setError(err?.message || 'Something went wrong. Please try again.');
                    setLoading(false);
                }
            },
            error: (err) => {
                setError(err.message);
                setLoading(false);
            }
        });
    };

    const handleUploadClick = () => {
        if (!name.trim()) {
            setError('Please enter your name first.');
            return;
        }
        setError(null);
        fileInputRef.current?.click();
    };

    return (
        <div className="bg-zinc-900/50 backdrop-blur-md rounded-2xl p-6 border border-zinc-800 shadow-xl transition-all">
            <h3 className="text-xl font-semibold text-white mb-2">One-time setup</h3>
            <div className="text-zinc-400 text-sm mb-6">
                <p>We&apos;ll match actors to shows YOU&apos;VE already watched — but first we need your Netflix viewing history.</p>
            </div>

            {/* Profile name */}
            <div className="mb-5">
                <label className="block text-xs text-zinc-500 mb-1.5 px-1">Your name</label>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Brian"
                    className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-zinc-600"
                />
            </div>

            <ol className="text-zinc-400 text-sm mb-4 list-decimal list-inside space-y-1.5">
                <li>Open netflix.com in your browser</li>
                <li>Account &rarr; Profile &amp; Parental Controls &rarr; Viewing Activity</li>
                <li>
                    Tap &quot;Download all&quot; at the bottom of the page
                    <p className="text-zinc-500 text-xs mt-0.5 ml-4">Note: Netflix may send you an email with the file instead of an instant download.</p>
                </li>
            </ol>

            <div className="relative">
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                    className="hidden"
                    id="csv-upload"
                />
                <button
                    type="button"
                    onClick={handleUploadClick}
                    className="cursor-pointer flex items-center justify-center gap-2 w-full py-4 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors shadow-lg"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Setting up your profile...{titleCount !== null ? ` (${titleCount} titles found)` : ''}
                        </span>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                            Select CSV File
                        </>
                    )}
                </button>
                {onSkip && (
                    <button
                        type="button"
                        onClick={onSkip}
                        className="mt-4 w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition"
                    >
                        Skip for now — I&apos;ll add history later
                    </button>
                )}
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-800 text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}
        </div>
    );
}
