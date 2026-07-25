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

  // Load profile from Supabase on mount
  useEffect(() => {
    setIsClient(true);
    const storedProfileId = localStorage.getItem('profileId');
    if (storedProfileId) {
      loadProfile(storedProfileId);
    } else {
      setLoading(false);
    }
  }, []);

  const loadProfile = async (id: string) => {
    try {
      const [profileRes, historyRes] = await Promise.all([
        supabase.from('profiles').select('name').eq('id', id).single(),
        supabase.from('watch_history').select('title').eq('profile_id', id),
      ]);

      if (profileRes.error || !profileRes.data) {
        // Profile not found in cloud — clear stale local pointer
        localStorage.removeItem('profileId');
        setLoading(false);
        return;
      }

      setProfileId(id);
      setProfileName(profileRes.data.name);
      setWatchHistory(historyRes.data ? historyRes.data.map(r => r.title) : []);
    } catch (e) {
      console.error('Failed to load profile from Supabase', e);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileCreated = async (name: string, titles: string[]) => {
    // Create profile in Supabase
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
    setProfileId(newProfileId);
    setProfileName(name);

    // Bulk insert watch history
    if (titles.length > 0) {
      const rows = titles.map(title => ({ profile_id: newProfileId, title }));
      // Supabase has a row limit per insert, batch in chunks of 500
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

    if (!newHistory || newHistory.length === 0) {
      // Clear all history in Supabase
      await supabase.from('watch_history').delete().eq('profile_id', profileId);
      return;
    }

    // Sync: delete removed titles, insert new ones
    const { data: existing } = await supabase
      .from('watch_history')
      .select('title')
      .eq('profile_id', profileId);

    const existingTitles = new Set((existing || []).map(r => r.title));
    const newTitles = new Set(newHistory);

    // Titles to delete
    const toDelete = [...existingTitles].filter(t => !newTitles.has(t));
    if (toDelete.length > 0) {
      await supabase
        .from('watch_history')
        .delete()
        .eq('profile_id', profileId)
        .in('title', toDelete);
    }

    // Titles to insert
    const toInsert = [...newTitles].filter(t => !existingTitles.has(t));
    if (toInsert.length > 0) {
      const rows = toInsert.map(title => ({ profile_id: profileId, title }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await supabase.from('watch_history').upsert(chunk, { onConflict: 'profile_id,title' });
      }
    }
  }, [profileId]);

  if (!isClient || loading) return null;

  return (
    <main
      className="flex-1 flex flex-col max-w-lg w-full mx-auto px-4 min-h-screen"
      style={{
        background: 'radial-gradient(ellipse at 15% 5%, rgba(79,22,130,0.45) 0%, transparent 55%), radial-gradient(ellipse at 85% 95%, rgba(6,78,59,0.35) 0%, transparent 50%)',
      }}
    >
      <div className="flex-1 flex flex-col">

        {/* Header — profile name + hamburger when profile is loaded */}
        <header className="py-5 flex items-center justify-between min-h-[60px]">
          {profileName && profileId ? (
            <p className="text-zinc-500 text-sm">Welcome back, <span className="text-zinc-300 font-medium">{profileName}</span></p>
          ) : <div />}
          {profileId && (
            <HamburgerMenu
              watchHistory={watchHistory || []}
              onHistoryUpdate={handleHistoryUpdate}
            />
          )}
        </header>

        {/* Dynamic Content — fills remaining height */}
        <div className="flex-1 flex flex-col pb-6">
          {!profileId ? (
            <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-700">
              <HistoryUploader onProfileCreated={handleProfileCreated} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col animate-in fade-in duration-500">
              <CameraCapture watchHistory={watchHistory || []} onHistoryUpdate={handleHistoryUpdate} />
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
