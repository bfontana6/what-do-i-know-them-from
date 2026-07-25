'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';

// TODO: Support watch history CSV exports from other streaming services
// (Hulu, Max/HBO, Disney+, Apple TV+). Each service has its own format/column names.

/**
 * Netflix CSV episode entries look like "Show Name: Season 4: Chapter Nine".
 * This extracts the base show name so it can match against TMDB credits.
 */
function extractTitles(rawTitle: string): string[] {
    const titles: string[] = [rawTitle];
    const match = rawTitle.match(/^(.+?):\s*Season\s+\d/i);
    if (match) titles.push(match[1].trim());
    return titles;
}

export default function HistoryUploader({ onProfileCreated }: { onProfileCreated: (name: string, titles: string[]) => Promise<void> }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState('');
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
            <h3 className="text-xl font-semibold text-white mb-2">Set Up Your Profile</h3>
            <div className="text-zinc-400 text-sm mb-6 space-y-3">
                <p>
                    Your profile and watch history are stored in the cloud — they&apos;ll be here whenever you come back.
                </p>
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

            <div className="text-zinc-400 text-sm mb-4 space-y-3">
                <p>
                    <strong>How to get your Netflix history:</strong> Go to Netflix Account settings on your browser → Profile & Parental Controls → Viewing activity → <strong>Download all</strong> at the bottom.
                </p>
            </div>

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
                    className="cursor-pointer flex items-center justify-center w-full py-4 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors border border-zinc-700 hover:border-zinc-500 border-dashed"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Setting up your profile...
                        </span>
                    ) : (
                        <span>Select CSV File</span>
                    )}
                </button>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-900/30 border border-red-800 text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}
        </div>
    );
}
