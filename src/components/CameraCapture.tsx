'use client';

// TODO: Explore allowing the user to tap/select a specific person when multiple
// people appear in the submitted scene image.
// TODO: Support identifying all people in a scene simultaneously (batch results).

import React, { useRef, useState } from 'react';

interface MatchItem {
    id: number;
    title: string;
    character: string;
    mediaType: string;
    posterPath: string | null;
    releaseYear: string;
    popularity?: number;
    matchedFrom?: string;
}

interface ActorResult {
    actorName: string;
    actorId: number;
    actorProfilePath?: string | null;
    imdbUrl?: string | null;
    matches: MatchItem[];
    fuzzyMatches?: MatchItem[];
    topFilmography?: Array<{
        id: number;
        title: string;
        character: string;
        mediaType: string;
        posterPath: string | null;
        poster_path?: string | null;
        releaseYear: string;
        vote_average?: number;
        popularity?: number;
    }>;
}

interface CastMember {
    id: number;
    name: string;
    character: string;
    profilePath: string | null;
}

// CHANGE 2: Resize image before Gemini upload — avoids sending unnecessarily large files
async function resizeImage(file: File, maxPx = 1024): Promise<File> {
    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
            if (scale >= 1) { resolve(file); return; }
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                (blob) => resolve(new File([blob!], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
                'image/jpeg', 0.85
            );
        };
        img.src = url;
    });
}

// CHANGE 1: Accept profileId prop alongside watchHistory
export default function CameraCapture({
    watchHistory,
    profileId,
    onHistoryUpdate,
}: {
    watchHistory: string[];
    profileId: string;
    onHistoryUpdate?: (h: string[]) => void;
}) {
    const [image, setImage] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loadingState, setLoadingState] = useState<'idle' | 'recognizing' | 'cross-referencing' | 'cast-lookup'>('idle');
    const [result, setResult] = useState<ActorResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    // CHANGE 7: Removed feedback state — was dead UI (never submitted anywhere)
    const [showCorrectionInput, setShowCorrectionInput] = useState(false);
    const [correctionName, setCorrectionName] = useState('');

    // Add-to-history from results
    const [addedTitles, setAddedTitles] = useState<Set<string>>(new Set());
    const [showAddCustomTitle, setShowAddCustomTitle] = useState(false);
    const [customTitleValue, setCustomTitleValue] = useState('');

    // Dismissed fuzzy matches (client-side only, not removed from history)
    const [dismissedFuzzy, setDismissedFuzzy] = useState<Set<string>>(new Set());

    // "Not found" helper flow
    const [actorNotFound, setActorNotFound] = useState(false);
    const [helperMode, setHelperMode] = useState<'actor' | 'show' | null>(null);
    const [helperActorName, setHelperActorName] = useState('');
    const [helperShowName, setHelperShowName] = useState('');
    const [castResults, setCastResults] = useState<CastMember[] | null>(null);
    const [castMediaTitle, setCastMediaTitle] = useState('');

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const libraryInputRef = useRef<HTMLInputElement>(null);
    // CHANGE 3: AbortController ref for cancellation and timeout
    const abortRef = useRef<AbortController | null>(null);

    const resetAll = () => {
        // CHANGE 3: Cancel any in-flight request on reset
        abortRef.current?.abort();
        setPreviewUrl(null);
        setImage(null);
        setResult(null);
        setError(null);
        // CHANGE 7: Removed setFeedback(null)
        setShowCorrectionInput(false);
        setCorrectionName('');
        setActorNotFound(false);
        setHelperMode(null);
        setHelperActorName('');
        setHelperShowName('');
        setCastResults(null);
        setCastMediaTitle('');
        setAddedTitles(new Set());
        setDismissedFuzzy(new Set());
        setShowAddCustomTitle(false);
        setCustomTitleValue('');
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (libraryInputRef.current) libraryInputRef.current.value = '';
    };

    const handleCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // CHANGE 2: Resize before processing to keep uploads fast
        const resized = await resizeImage(file);
        setImage(resized);
        setPreviewUrl(URL.createObjectURL(resized));
        setResult(null);
        setError(null);
        // CHANGE 7: Removed setFeedback(null)
        setShowCorrectionInput(false);
        setCorrectionName('');

        await processImage(resized);
    };

    // CHANGE 3: AbortController + 15-second timeout; CHANGE 1: sends profileId instead of watchHistory
    const processImage = async (file: File) => {
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;
        const timeoutId = setTimeout(() => abortRef.current?.abort(), 15000);

        try {
            setLoadingState('recognizing');

            // Step 1: Recognize Actor
            const formData = new FormData();
            formData.append('image', file);

            const recognitionRes = await fetch('/api/recognize', {
                method: 'POST',
                body: formData,
                signal,
            });

            const recognitionData = await recognitionRes.json();

            if (recognitionRes.status === 404) {
                // Could not identify — show the helper flow instead of a generic error
                setActorNotFound(true);
                setLoadingState('idle');
                return;
            }

            if (!recognitionRes.ok) {
                throw new Error(recognitionData.error || 'Failed to recognize actor');
            }

            const actorName = recognitionData.actor.name;

            // Step 2: Cross Reference — CHANGE 1: profileId replaces watchHistory
            setLoadingState('cross-referencing');

            const crossRefRes = await fetch('/api/cross-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actorName, profileId }),
                signal,
            });

            const crossRefData = await crossRefRes.json();

            if (!crossRefRes.ok) {
                throw new Error(crossRefData.error || 'Failed to cross reference');
            }

            setResult({
                actorName: crossRefData.actorName,
                actorId: crossRefData.actorId,
                actorProfilePath: crossRefData.actorProfilePath || null,
                imdbUrl: crossRefData.imdbUrl || null,
                matches: crossRefData.matches || [],
                fuzzyMatches: crossRefData.fuzzyMatches || [],
                topFilmography: crossRefData.topFilmography || [],
            });

        } catch (err: any) {
            // CHANGE 3: Distinguish abort/timeout from other errors
            if (err.name === 'AbortError') {
                setError('Request timed out or was cancelled. Check your connection and try again.');
            } else {
                setError(err.message || 'An unexpected error occurred');
            }
        } finally {
            clearTimeout(timeoutId);
            setLoadingState('idle');
        }
    };

    const addTitleToHistory = (title: string) => {
        const updated = Array.from(new Set([...watchHistory, title]));
        onHistoryUpdate?.(updated);
        setAddedTitles(prev => new Set([...prev, title]));
    };

    const lookupShowCast = async (showName: string) => {
        setCastResults(null);
        setCastMediaTitle('');
        try {
            setLoadingState('cast-lookup');
            const res = await fetch('/api/cast-lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ showName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to look up cast');
            setCastMediaTitle(data.mediaTitle || showName);
            setCastResults(data.cast || []);
        } catch (err: any) {
            setError(err.message || 'Failed to look up cast');
            setActorNotFound(false);
        } finally {
            setLoadingState('idle');
        }
    };

    // CHANGE 1: sends profileId instead of watchHistory; CHANGE 7: removed setFeedback(null)
    const lookupActor = async (actorName: string) => {
        setShowCorrectionInput(false);
        setCorrectionName('');
        setActorNotFound(false);
        setHelperMode(null);
        setHelperActorName('');
        setHelperShowName('');
        setCastResults(null);
        setCastMediaTitle('');
        setResult(null);
        setError(null);
        try {
            setLoadingState('cross-referencing');
            const crossRefRes = await fetch('/api/cross-reference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actorName, profileId }),
            });
            const crossRefData = await crossRefRes.json();
            if (!crossRefRes.ok) throw new Error(crossRefData.error || 'Failed to cross reference');
            setResult({
                actorName: crossRefData.actorName,
                actorId: crossRefData.actorId,
                actorProfilePath: crossRefData.actorProfilePath || null,
                imdbUrl: crossRefData.imdbUrl || null,
                matches: crossRefData.matches || [],
                fuzzyMatches: crossRefData.fuzzyMatches || [],
                topFilmography: crossRefData.topFilmography || [],
            });
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred');
        } finally {
            setLoadingState('idle');
        }
    };

    // Compute discover titles: top-rated filmography items the user hasn't already seen.
    const seenTitlesLower = new Set([
        ...(result?.matches || []).map((m) => m.title.toLowerCase()),
        ...(result?.fuzzyMatches || []).map((m) => m.title.toLowerCase()),
    ]);

    const discoverTitles = (result?.topFilmography || [])
        .filter((t) => !seenTitlesLower.has(t.title.toLowerCase()))
        .slice(0, 5);

    return (
        <div className="flex-1 flex flex-col w-full gap-4">

            {/* Hero + action rows */}
            {!previewUrl && (
                <div className="flex-1 flex flex-col">
                    {/* Title */}
                    <div className="pt-2 pb-10">
                        <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
                            What do I{' '}
                            <span className="text-indigo-400">know</span>
                            <br />them from?
                        </h1>
                    </div>

                    {/* CHANGE 5: Stacked action rows — Upload first (primary), Camera second */}
                    <div className="flex flex-col gap-0">

                        {/* Upload row — CHANGE 5: promoted to primary; CHANGE 11: focus-visible ring */}
                        <button
                            onClick={() => libraryInputRef.current?.click()}
                            className="w-full flex items-center gap-4 px-5 py-4 bg-[#141414] hover:bg-[#1a1a1a] border border-[#262626] rounded-2xl active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-all duration-150"
                        >
                            <div className="w-12 h-12 rounded-xl bg-[rgba(79,70,229,0.12)] border border-[rgba(79,70,229,0.20)] flex items-center justify-center flex-shrink-0">
                                <svg className="w-6 h-6 text-[#818cf8]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-white font-semibold text-base">Upload Screenshot</p>
                                {/* CHANGE 5: Updated description to emphasise screenshots */}
                                <p className="text-zinc-500 text-sm">From your library or screenshots</p>
                            </div>
                            <svg className="w-5 h-5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>

                        {/* OR divider */}
                        <div className="flex items-center gap-3 py-3 px-2">
                            <div className="flex-1 h-px bg-[#262626]" />
                            <span className="text-[#808080] text-xs font-medium tracking-widest">OR</span>
                            <div className="flex-1 h-px bg-[#262626]" />
                        </div>

                        {/* Camera row — CHANGE 5: demoted to secondary; CHANGE 11: focus-visible ring */}
                        <button
                            onClick={() => cameraInputRef.current?.click()}
                            className="w-full flex items-center gap-4 px-5 py-4 bg-[#141414] hover:bg-[#1a1a1a] border border-[#262626] rounded-2xl active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black transition-all duration-150"
                        >
                            <div className="w-12 h-12 rounded-xl bg-[rgba(79,70,229,0.12)] border border-[rgba(79,70,229,0.20)] flex items-center justify-center flex-shrink-0">
                                <svg className="w-6 h-6 text-[#818cf8]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                </svg>
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-white font-semibold text-base">Take Photo</p>
                                <p className="text-zinc-500 text-sm">Point at your TV or screen</p>
                            </div>
                            <svg className="w-5 h-5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>

                    {/* CHANGE 10: tip text contrast — was text-[11px] text-zinc-700 */}
                    <p className="text-center text-xs text-[#808080] mt-6">
                        <span className="text-[#808080]">Tip:</span> Screenshot your screen first, then tap Upload for best results.
                    </p>
                </div>
            )}

            {/* Camera input — opens camera directly */}
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleCapture} />
            {/* Library input — opens photo picker */}
            <input type="file" accept="image/*" className="hidden" ref={libraryInputRef} onChange={handleCapture} />

            {/* Preview strip — CHANGE 4: subtitle driven by loadingState */}
            {previewUrl && (
                <div className="w-full flex items-center gap-3 px-1">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-[#262626] flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Preview" className="object-cover w-full h-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#808080] mb-0.5">Your capture</p>
                        {/* CHANGE 4: Was hardcoded "Analyzing scene…" */}
                        <p className="text-sm text-[#a0a0a0] font-medium truncate">
                            {loadingState === 'recognizing' ? 'Identifying actor…'
                                : loadingState === 'cross-referencing' ? 'Checking your history…'
                                : result ? 'Match found'
                                : 'Ready'}
                        </p>
                    </div>
                    {/* CHANGE 9: This "New scan" button at top of viewport is the primary reset entry point */}
                    <button onClick={resetAll} className="px-3 py-1.5 bg-zinc-800 text-xs font-medium text-zinc-300 rounded-full hover:bg-zinc-700 hover:text-white transition flex-shrink-0">
                        New scan
                    </button>
                </div>
            )}

            {/* CHANGE 3: Loading spinner with cancel button */}
            {loadingState !== 'idle' && (
                <div className="w-full p-6 bg-[#141414] rounded-2xl flex flex-col items-center justify-center border border-[#262626]">
                    <svg className="animate-spin h-10 w-10 text-[#4f46e5] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-white font-medium">
                        {loadingState === 'recognizing' ? 'Identifying actor...' : loadingState === 'cast-lookup' ? 'Looking up cast...' : 'Checking your watch history...'}
                    </p>
                    {/* CHANGE 3: Cancel button */}
                    <button
                        onClick={() => { abortRef.current?.abort(); setLoadingState('idle'); }}
                        className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition underline underline-offset-2"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {error && (
                <div className="w-full p-5 bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col items-center gap-3">
                    <p className="text-red-400 text-sm text-center">{error}</p>
                    <div className="flex gap-2">
                        {image && (
                            <button
                                onClick={() => { setError(null); processImage(image); }}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition"
                            >
                                Try Again
                            </button>
                        )}
                        <button
                            onClick={resetAll}
                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition"
                        >
                            New Scan
                        </button>
                    </div>
                </div>
            )}

            {/* Actor not found — helper flow */}
            {actorNotFound && loadingState === 'idle' && (
                <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-5 border-b border-zinc-800/60">
                        <p className="text-white font-semibold text-base">Couldn&apos;t identify anyone</p>
                        <p className="text-zinc-500 text-sm mt-0.5">Help us out — tell us who it is or what you&apos;re watching.</p>
                    </div>

                    {!helperMode && (
                        <div className="p-4 flex flex-col gap-3">
                            <button
                                onClick={() => setHelperMode('actor')}
                                className="w-full flex items-center gap-3 px-4 py-3.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition text-left"
                            >
                                <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                </div>
                                <div>
                                    <p className="text-white text-sm font-medium">I know their name</p>
                                    <p className="text-zinc-500 text-xs">Enter the actor&apos;s name directly</p>
                                </div>
                            </button>
                            <button
                                onClick={() => setHelperMode('show')}
                                className="w-full flex items-center gap-3 px-4 py-3.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition text-left"
                            >
                                <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 20.25h12m-7.5-3v3m3-3v3m-10.125-3h17.25c.621 0 1.125-.504 1.125-1.125V4.875c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125z" /></svg>
                                </div>
                                <div>
                                    <p className="text-white text-sm font-medium">I know the show</p>
                                    <p className="text-zinc-500 text-xs">Browse the cast and pick who it is</p>
                                </div>
                            </button>
                            {/* CHANGE 10: was text-zinc-600 */}
                            <button onClick={resetAll} className="text-xs text-[#808080] hover:text-zinc-400 transition text-center mt-1">
                                Start over
                            </button>
                        </div>
                    )}

                    {helperMode === 'actor' && (
                        <form
                            onSubmit={(e) => { e.preventDefault(); if (helperActorName.trim()) lookupActor(helperActorName.trim()); }}
                            className="p-4 flex flex-col gap-3 animate-in fade-in duration-200"
                        >
                            <label className="text-xs text-zinc-400 px-1">Actor or actress name:</label>
                            <input
                                autoFocus
                                type="text"
                                value={helperActorName}
                                onChange={(e) => setHelperActorName(e.target.value)}
                                placeholder="e.g. Bryan Cranston"
                                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-zinc-600"
                            />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setHelperMode(null)} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition">Back</button>
                                <button type="submit" disabled={!helperActorName.trim()} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition disabled:opacity-50">Look Up</button>
                            </div>
                        </form>
                    )}

                    {helperMode === 'show' && !castResults && (
                        <form
                            onSubmit={(e) => { e.preventDefault(); if (helperShowName.trim()) lookupShowCast(helperShowName.trim()); }}
                            className="p-4 flex flex-col gap-3 animate-in fade-in duration-200"
                        >
                            <label className="text-xs text-zinc-400 px-1">Movie or show title:</label>
                            <input
                                autoFocus
                                type="text"
                                value={helperShowName}
                                onChange={(e) => setHelperShowName(e.target.value)}
                                placeholder="e.g. Breaking Bad"
                                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-zinc-600"
                            />
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setHelperMode(null)} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium rounded-xl transition">Back</button>
                                <button type="submit" disabled={!helperShowName.trim()} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-xl transition disabled:opacity-50">Find Cast</button>
                            </div>
                        </form>
                    )}

                    {helperMode === 'show' && castResults && (
                        <div className="p-4 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-sm text-zinc-300 font-medium">Cast of <span className="text-white">{castMediaTitle}</span></p>
                                {/* CHANGE 10: was text-zinc-600 */}
                                <button onClick={() => { setCastResults(null); setHelperShowName(''); }} className="text-xs text-[#808080] hover:text-zinc-400 transition">Change show</button>
                            </div>
                            {/* CHANGE 8: Removed max-h-[50vh] overflow-y-auto — let page scroll handle it */}
                            <div className="grid grid-cols-3 gap-2">
                                {castResults.map((member) => (
                                    <button
                                        key={member.id}
                                        onClick={() => lookupActor(member.name)}
                                        className="flex flex-col items-center gap-1.5 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition active:scale-95 text-center"
                                    >
                                        {member.profilePath ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={member.profilePath} alt={member.name} className="w-16 h-16 rounded-full object-cover border border-zinc-700" />
                                        ) : (
                                            <div className="w-16 h-16 rounded-full bg-zinc-700 border border-zinc-600 flex items-center justify-center">
                                                <svg className="w-7 h-7 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                                            </div>
                                        )}
                                        <p className="text-white text-[11px] font-medium leading-tight">{member.name}</p>
                                        {member.character && <p className="text-zinc-500 text-[10px] leading-tight truncate w-full">{member.character}</p>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {result && (
                <div className="w-full bg-[#141414] rounded-2xl overflow-hidden border border-[#262626] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="py-6 pr-6 pl-5 border-l-4 border-l-[#4f46e5] border-b border-[#262626]">
                        <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#818cf8] mb-3">Actor Identified!</p>
                        <div className="flex items-center gap-4">
                            {result.actorProfilePath && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={result.actorProfilePath}
                                    alt={result.actorName}
                                    className="w-16 h-16 rounded-full object-cover border-2 border-[rgba(79,70,229,0.40)] shadow-lg flex-shrink-0"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <h2 className="text-2xl font-bold text-[#f0f0f0] leading-tight">{result.actorName}</h2>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    {result.imdbUrl && (
                                        <a
                                            href={result.imdbUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300 text-sm font-medium transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M14 3v2h-4V3H6v18h4v-2h4v2h4V3h-4zm-4 14v-2h4v2h-4zm0-10h4v2h-4V7z"/></svg>
                                            IMDb
                                        </a>
                                    )}
                                    {!showCorrectionInput && (
                                        <button
                                            onClick={() => setShowCorrectionInput(true)}
                                            className="text-[#808080] hover:text-[#a0a0a0] text-xs transition-colors border border-[#262626] hover:border-zinc-500 rounded-lg px-2.5 py-1"
                                        >
                                            Wrong person?
                                        </button>
                                    )}
                                </div>
                                {/* Correction panel — sibling block so w-full is never inside a flex gap context */}
                                {showCorrectionInput && (
                                    <div className="mt-3 w-full space-y-3 animate-in fade-in duration-150">
                                        {/* Try again — re-run full recognition */}
                                        <button
                                            type="button"
                                            onClick={() => { setShowCorrectionInput(false); setCorrectionName(''); if (image) processImage(image); }}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1c1c1c] hover:bg-[#262626] border border-[#262626] text-[#a0a0a0] hover:text-[#f0f0f0] text-sm rounded-xl transition"
                                        >
                                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                            </svg>
                                            Try recognition again
                                        </button>
                                        {/* Manual name entry */}
                                        <form
                                            onSubmit={(e) => { e.preventDefault(); if (correctionName.trim()) { lookupActor(correctionName.trim()); setShowCorrectionInput(false); setCorrectionName(''); } }}
                                            className="space-y-2"
                                        >
                                            <p className="text-[11px] text-[#808080] uppercase tracking-[0.12em]">Or enter their name</p>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={correctionName}
                                                    onChange={(e) => setCorrectionName(e.target.value)}
                                                    placeholder="Actor name…"
                                                    className="flex-1 min-w-0 bg-[#1c1c1c] border border-[#262626] text-[#f0f0f0] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5] placeholder-[#4a4a4a]"
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={!correctionName.trim()}
                                                    className="flex-shrink-0 px-3 py-2 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-medium rounded-xl transition disabled:opacity-40"
                                                >
                                                    Look up
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { setShowCorrectionInput(false); setCorrectionName(''); }}
                                                className="w-full py-1.5 text-[#808080] hover:text-[#a0a0a0] text-xs transition text-center"
                                            >
                                                I don&apos;t know — cancel
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="p-6">
                        {/* CHANGE 13: Empty-history nudge — shown when no CSV uploaded yet */}
                        {watchHistory.length === 0 && (
                            <div className="mb-4 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-xs text-zinc-400">
                                No watch history loaded — upload your Netflix CSV from the menu to see where you&apos;ve seen this actor before.
                            </div>
                        )}

                        {/* "You've seen them in" — ALL exact watch-history matches, no cap */}
                        {result.matches.length > 0 && (
                            <div className="mb-5">
                                <h3 className="text-[11px] font-semibold text-[#808080] uppercase tracking-[0.12em] mb-3">You&apos;ve seen them in:</h3>
                                <div className="space-y-3">
                                    {result.matches.map((item, idx) => (
                                        <div key={`match-${item.id}-${idx}`} className="flex gap-4 p-3 bg-[rgba(255,255,255,0.03)] rounded-xl border border-[#262626] hover:bg-[#1a1a1a] transition">
                                            {item.posterPath ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={item.posterPath} alt={item.title} className="w-16 h-24 object-cover rounded-lg shadow" />
                                            ) : (
                                                <div className="w-16 h-24 bg-zinc-800 rounded-lg flex items-center justify-center text-xs text-zinc-500 text-center p-1">No Image</div>
                                            )}
                                            <div className="flex-1 py-1">
                                                <h4 className="font-semibold text-[#f0f0f0] text-base leading-tight mb-1">{item.title}</h4>
                                                <p className="text-[#808080] text-sm mb-1">{item.releaseYear}</p>
                                                {item.character && (
                                                    <p className="text-sm text-indigo-300">as {item.character}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Possible fuzzy matches from history */}
                        {result.fuzzyMatches && result.fuzzyMatches.filter(m => !dismissedFuzzy.has(m.title)).length > 0 && (
                            <div className="mb-5">
                                <h3 className="text-[11px] font-semibold text-[#808080] uppercase tracking-[0.12em] mb-1">Possible matches:</h3>
                                <p className="text-zinc-500 text-xs mb-3">These aren&apos;t exact matches but may be related to titles in your history</p>
                                <div className="space-y-2">
                                    {result.fuzzyMatches.filter(m => !dismissedFuzzy.has(m.title)).map((item, idx) => (
                                        <div key={`fuzzy-${item.id}-${idx}`} className="p-3 bg-zinc-800/20 rounded-xl border border-zinc-800/30 transition opacity-80">
                                            <div className="flex gap-3">
                                                {item.posterPath ? (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img src={item.posterPath} alt={item.title} className="w-12 h-16 object-cover rounded-md shadow opacity-70" />
                                                ) : (
                                                    <div className="w-12 h-16 bg-zinc-800 rounded-md flex items-center justify-center text-xs text-zinc-600 text-center p-1">?</div>
                                                )}
                                                <div className="flex-1 py-1">
                                                    <h4 className="font-medium text-zinc-400 text-base leading-tight mb-0.5">{item.title}</h4>
                                                    <p className="text-zinc-500 text-sm mb-0.5">{item.releaseYear}</p>
                                                    {item.character && (
                                                        <p className="text-sm text-zinc-500">as {item.character}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {item.matchedFrom && (
                                                <p className="text-[#fbbf24] text-xs mt-2 px-1">Suggested because you watched &ldquo;{item.matchedFrom}&rdquo;</p>
                                            )}
                                            <button
                                                onClick={() => setDismissedFuzzy(prev => new Set([...prev, item.title]))}
                                                className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition underline underline-offset-2"
                                            >
                                                Dismiss — not relevant
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Actor not in watch history — only shown when history is loaded but actor isn't in it */}
                        {result.matches.length === 0 && (result.fuzzyMatches?.length ?? 0) === 0 && watchHistory.length > 0 && (
                            <div className="mb-5">
                                <div className="flex items-center gap-2 py-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#818cf8] flex-shrink-0 mt-0.5" />
                                    <p className="text-[#a0a0a0] text-sm">New to you — not in your watch history</p>
                                </div>
                            </div>
                        )}

                        {/* Discover — top-rated titles the user hasn't seen, always shown inline */}
                        {discoverTitles.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-zinc-800">
                                <h4 className="text-[11px] font-semibold text-[#808080] uppercase tracking-[0.12em] mb-3">
                                    Their other work
                                </h4>
                                <div className="space-y-2">
                                    {discoverTitles.map((title, i) => (
                                        <div key={i} className="flex items-center gap-3 py-2">
                                            {title.poster_path ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w92${title.poster_path}`}
                                                    alt={title.title}
                                                    className="w-12 h-[72px] object-cover rounded-md flex-shrink-0 bg-zinc-800"
                                                />
                                            ) : (
                                                <div className="w-12 h-[72px] rounded-md flex-shrink-0 bg-zinc-800 flex items-center justify-center">
                                                    <span className="text-zinc-600 text-xs">?</span>
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[15px] font-medium text-[#f0f0f0] leading-snug truncate">{title.title}</p>
                                                <p className="text-xs text-[#808080] mt-0.5">
                                                    {title.releaseYear}
                                                    {title.mediaType === 'tv' ? ' · TV' : ''}
                                                    {title.vote_average && title.vote_average > 0
                                                        ? ` · ★ ${title.vote_average.toFixed(1)}`
                                                        : ''}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Add a title to watch history */}
                        <div className="pt-4">
                            {!showAddCustomTitle ? (
                                <button
                                    onClick={() => setShowAddCustomTitle(true)}
                                    className="w-full flex items-center gap-2 px-4 py-3 bg-zinc-800/50 hover:bg-zinc-800 border border-dashed border-zinc-700 rounded-xl transition text-sm text-zinc-400 hover:text-white"
                                >
                                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                    Add a title you&apos;ve seen them in
                                </button>
                            ) : (
                                <form
                                    onSubmit={(e) => { e.preventDefault(); if (customTitleValue.trim()) { addTitleToHistory(customTitleValue.trim()); setCustomTitleValue(''); setShowAddCustomTitle(false); } }}
                                    className="flex gap-2 animate-in fade-in duration-150"
                                >
                                    <input
                                        autoFocus
                                        type="text"
                                        value={customTitleValue}
                                        onChange={e => setCustomTitleValue(e.target.value)}
                                        placeholder="e.g. Mad Men"
                                        className="flex-1 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-zinc-600"
                                    />
                                    <button type="button" onClick={() => { setShowAddCustomTitle(false); setCustomTitleValue(''); }} className="px-3 py-2.5 bg-zinc-800 text-zinc-400 rounded-xl text-sm transition hover:bg-zinc-700">Cancel</button>
                                    <button type="submit" disabled={!customTitleValue.trim()} className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition disabled:opacity-40">Add</button>
                                </form>
                            )}
                        </div>

                        {/* CHANGE 7: Removed feedback thumbs section — was dead UI (local state, never submitted) */}

                        {/* CHANGE 9: Secondary reset — also accessible from preview strip "New scan" at top */}
                        <button
                            onClick={resetAll}
                            className="w-full mt-6 py-4 bg-[#4f46e5] hover:bg-[#4338ca] text-white font-semibold rounded-2xl shadow-lg transition-transform active:scale-95"
                        >
                            Scan Another Face
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
