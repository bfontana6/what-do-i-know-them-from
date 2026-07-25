'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import CameraCapture from '@/components/CameraCapture';
import HistoryUploader from '@/components/HistoryUploader';
import HamburgerMenu from '@/components/HamburgerMenu';

export default function Home() {
  const [watchHistory, setWatchHistory] = useState<string[] | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const storedProfileId = localStorage.getItem('profileId');
    if (storedProfileId) {
      loadProfile(storedProfileId);
    } else {
      setWatchHistory([]);
      setLoading(false);
    }
  }, []);

  const loadProfile = async (id: string) => {
    try {
      const [profileRes, historyRes] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', id).single(),
        supabase.from('watch_history').select('title').eq('profile_id', id),
      ]);

      if (profileRes.error) {
        // PGRST116 = PostgREST "no rows returned" — profile genuinely deleted
        // Every other code (auth, schema, network) is a transient failure — keep localStorage
        if (profileRes.error.code === 'PGRST116') {
          localStorage.removeItem('profileId');
          localStorage.removeItem('profileName');
        } else {
          // Use cached name so user still gets into the app
          const cachedName = localStorage.getItem('profileName');
          setProfileId(id);
          setProfileName(cachedName || 'You');
          setWatchHistory([]);
        }
        setLoading(false);
        return;
      }

      if (!profileRes.data) {
        localStorage.removeItem('profileId');
        localStorage.removeItem('profileName');
        setLoading(false);
        return;
      }

      setProfileId(id);
      setProfileName(profileRes.data.name);
      localStorage.setItem('profileName', profileRes.data.name);
      setWatchHistory(historyRes.data ? historyRes.data.map(r => r.title) : []);
    } catch (e) {
      console.error('Failed to load profile', e);
      // Network totally unreachable — use whatever is cached
      const cachedName = localStorage.getItem('profileName');
      setProfileId(id);
      setProfileName(cachedName || 'You');
      setWatchHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileCreated = async (name: string, titles: string[]) => {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .insert({ name })
      .select('id')
      .single();

    if (profileError || !profile) {
      throw new Error(profileError?.message || 'Failed to create profile in Supabase');
    }

    const newProfileId = profile.id;
    localStorage.setItem('profileId', newProfileId);
    localStorage.setItem('profileName', name);
    setProfileId(newProfileId);
    setProfileName(name);
    setShowSetup(false);

    if (titles.length > 0) {
      const rows = titles.map(title => ({ profile_id: newProfileId, title }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await supabase.from('watch_history').upsert(chunk, { onConflict: 'profile_id,title' });
      }
    }

    setWatchHistory(titles);
  };

  const handleHistoryUpdate = useCallback(async (newHistory: string[] | null) => {
    setWatchHistory(newHistory);

    if (!profileId) return;

    try {
      if (!newHistory || newHistory.length === 0) {
        await supabase.from('watch_history').delete().eq('profile_id', profileId);
        setHistoryError(null);
        return;
      }

      const { data: existing } = await supabase
        .from('watch_history')
        .select('title')
        .eq('profile_id', profileId);

      const existingTitles = new Set((existing || []).map(r => r.title));
      const newTitles = new Set(newHistory);

      const toDelete = [...existingTitles].filter(t => !newTitles.has(t));
      if (toDelete.length > 0) {
        await supabase.from('watch_history').delete().eq('profile_id', profileId).in('title', toDelete);
      }

      const toInsert = [...newTitles].filter(t => !existingTitles.has(t));
      if (toInsert.length > 0) {
        const rows = toInsert.map(title => ({ profile_id: profileId, title }));
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          await supabase.from('watch_history').upsert(chunk, { onConflict: 'profile_id,title' });
        }
      }
      setHistoryError(null);
    } catch (e) {
      console.error('Failed to sync history', e);
      setHistoryError('Failed to save changes. Check your connection.');
    }
  }, [profileId]);

  if (!isClient || loading) {
    return (
      <main className="flex-1 flex flex-col max-w-lg w-full mx-auto px-4 min-h-screen">
        <div className="flex-1 flex flex-col">
          <header className="py-5 min-h-[60px]" />
          <div className="flex-1 flex flex-col justify-center items-center gap-4 pb-6">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <p className="text-zinc-600 text-sm">Loading…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {loadError && (
        <div className="fixed top-4 left-4 right-4 z-50 p-3 bg-zinc-900 border border-zinc-700 rounded-xl flex items-center justify-between shadow-xl">
          <p className="text-zinc-300 text-sm">{loadError}</p>
          <button onClick={() => setLoadError(null)} className="text-zinc-500 hover:text-white ml-3 text-lg leading-none">✕</button>
        </div>
      )}
      <main
        className="flex-1 flex flex-col max-w-lg w-full mx-auto px-4 min-h-screen"
        style={{
          background: 'radial-gradient(ellipse 100% 40% at 50% 0%, rgba(79,70,229,0.06) 0%, transparent 100%)',
        }}
      >
        <div className="flex-1 flex flex-col">

          <header className="py-5 flex flex-col min-h-[60px]">
            {historyError && (
              <div className="px-4 py-2 bg-red-900/20 border border-red-800/40 rounded-lg mb-2 flex items-center justify-between">
                <p className="text-red-400 text-xs">{historyError}</p>
                <button onClick={() => setHistoryError(null)} className="text-red-600 hover:text-red-400 text-xs ml-3">✕</button>
              </div>
            )}
            <div className="flex items-center justify-between">
              {profileName ? (
                <div className="flex items-center gap-2 bg-[#141414] border border-[#262626] rounded-full pl-1 pr-3 py-1">
                  <div className="w-6 h-6 rounded-full bg-[rgba(79,70,229,0.12)] border border-[rgba(79,70,229,0.20)] flex items-center justify-center flex-shrink-0">
                    <span className="text-[#818cf8] text-[10px] font-bold uppercase leading-none">
                      {profileName[0]}
                    </span>
                  </div>
                  <span className="text-[#a0a0a0] text-xs leading-none">
                    {profileName}
                    {watchHistory && watchHistory.length > 0 && (
                      <span className="text-[#4a4a4a] ml-1">· {watchHistory.length}</span>
                    )}
                  </span>
                </div>
              ) : <div />}
              <HamburgerMenu
                watchHistory={watchHistory || []}
                onHistoryUpdate={handleHistoryUpdate}
                onSetupHistory={() => setShowSetup(true)}
              />
            </div>
          </header>

          <div className="flex-1 flex flex-col pb-6">
            {showSetup ? (
              <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
                <HistoryUploader
                  onProfileCreated={handleProfileCreated}
                  onSkip={() => setShowSetup(false)}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col animate-in fade-in duration-500">
                <CameraCapture
                  watchHistory={watchHistory || []}
                  profileId={profileId || ''}
                  onHistoryUpdate={handleHistoryUpdate}
                />
              </div>
            )}
          </div>

        </div>
      </main>
    </>
  );
}
