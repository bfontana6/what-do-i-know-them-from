import { NextResponse } from 'next/server';
import { TMDB } from 'tmdb-ts';
import { supabase } from '@/lib/supabase';

let _tmdb: TMDB | null = null;
const getTMDB = () => {
  if (!_tmdb) _tmdb = new TMDB(process.env.TMDB_ACCESS_TOKEN!);
  return _tmdb;
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { actorName, profileId } = body;

        if (!actorName || typeof actorName !== 'string') {
            return NextResponse.json({ error: 'actorName is required' }, { status: 400 });
        }

        let watchHistory: string[] = [];
        if (profileId) {
            const { data: historyRows } = await supabase
                .from('watch_history')
                .select('title')
                .eq('profile_id', profileId);
            watchHistory = historyRows?.map(r => r.title) ?? [];
        }

        // 1. Search for the actor by name
        const searchResult = await getTMDB().search.people({ query: actorName });

        if (!searchResult.results || searchResult.results.length === 0) {
            return NextResponse.json({ error: 'Actor not found in TMDB' }, { status: 404 });
        }

        const personId = searchResult.results[0].id;
        const currentName = searchResult.results[0].name;
        const profilePath = searchResult.results[0].profile_path;

        // 2. Fetch credits and person details (for imdb_id) in parallel
        const [credits, personDetails] = await Promise.all([
            getTMDB().people.combinedCredits(personId),
            getTMDB().people.details(personId),
        ]);

        // 3. Cross-reference with watch history
        // For MVP, we'll do a simple lowercase exact or partial match.
        const normalizedHistory = (watchHistory || []).map((t: string) => t.toLowerCase());

        const exactMatches = [];
        const fuzzyMatches = [];

        // Cast will contain movies and tv shows
        for (const credit of credits.cast || []) {
            // TMDB uses 'title' for movies and 'name' for TV shows
            const isMovie = (credit as any).media_type === 'movie';

            // Apply correct typing manually since the SDK returns a union type that TypeScript struggles with
            const title = isMovie ? (credit as any).title : (credit as any).name;
            const releaseDate = isMovie ? (credit as any).release_date : (credit as any).first_air_date;

            if (!title) continue;

            const normalizedTitle = title.toLowerCase();

            // Exact match: history contains an item that is exactly this title
            const isExact = normalizedHistory.some((h: string) => h === normalizedTitle);

            if (isExact) {
                exactMatches.push({
                    id: credit.id,
                    title: title as string,
                    character: credit.character,
                    mediaType: (credit as any).media_type,
                    posterPath: credit.poster_path ? `https://image.tmdb.org/t/p/w500${credit.poster_path}` : null,
                    releaseYear: releaseDate ? releaseDate.split('-')[0] : 'Unknown',
                    popularity: credit.popularity || 0
                });
                continue;
            }

            // Fuzzy match: only triggers when a history item starts with the TMDB title
            // followed by a colon (Netflix episode format like "Show: Season 1: Episode").
            // This avoids false positives from short titles (e.g. "Love" matching "Love Is Blind").
            let matchedHistoryItem: string | null = null;
            if (normalizedTitle.length >= 4) {
                const found = normalizedHistory.find((historyItem: string) =>
                    historyItem.startsWith(normalizedTitle + ':') ||
                    historyItem.startsWith(normalizedTitle + ' :')
                );
                if (found) matchedHistoryItem = found;
            }

            if (matchedHistoryItem) {
                // Find the original-cased version from the raw watch history
                const originalItem = (watchHistory || []).find(
                    (h: string) => h.toLowerCase() === matchedHistoryItem
                ) || matchedHistoryItem;

                fuzzyMatches.push({
                    id: credit.id,
                    title: title as string,
                    character: credit.character,
                    mediaType: (credit as any).media_type,
                    posterPath: credit.poster_path ? `https://image.tmdb.org/t/p/w500${credit.poster_path}` : null,
                    releaseYear: releaseDate ? releaseDate.split('-')[0] : 'Unknown',
                    popularity: credit.popularity || 0,
                    matchedFrom: originalItem as string
                });
            }
        }

        // Deduplicate and sort each list
        const uniqueExactMatches = Array.from(new Map(exactMatches.map(item => [item.title, item])).values())
            .sort((a, b) => b.popularity - a.popularity);
        const uniqueFuzzyMatches = Array.from(new Map(fuzzyMatches.map(item => [item.title, item])).values())
            .sort((a, b) => b.popularity - a.popularity);

        // Keep legacy `matches` as exact-only for backwards compatibility
        const uniqueMatches = uniqueExactMatches;

        // Prepare top filmography items — used for the "Discover" (unseen) section on the client.
        // Sort by vote_average desc so highest-rated work surfaces first; fall back to popularity.
        const allCredits = credits.cast || [];
        const topFilmography = allCredits
            .filter(c => c.poster_path) // only items with posters look good
            .sort((a, b) => ((b as any).vote_average || 0) - ((a as any).vote_average || 0) || (b.popularity || 0) - (a.popularity || 0))
            .slice(0, 12)
            .map(credit => {
                const isMovie = (credit as any).media_type === 'movie';
                const title = isMovie ? (credit as any).title : (credit as any).name;
                const releaseDate = isMovie ? (credit as any).release_date : (credit as any).first_air_date;

                return {
                    id: credit.id,
                    title: title as string,
                    character: credit.character,
                    mediaType: (credit as any).media_type,
                    posterPath: `https://image.tmdb.org/t/p/w500${credit.poster_path}`,
                    poster_path: credit.poster_path || null,
                    releaseYear: releaseDate ? releaseDate.split('-')[0] : 'Unknown',
                    vote_average: (credit as any).vote_average || 0,
                    popularity: credit.popularity || 0,
                };
            });

        // Deduplicate top filmography
        const uniqueTopFilmography = Array.from(new Map(topFilmography.map(item => [item.title, item])).values());

        return NextResponse.json({
            success: true,
            actorId: personId,
            actorName: currentName,
            actorProfilePath: profilePath ? `https://image.tmdb.org/t/p/w185${profilePath}` : null,
            imdbUrl: (personDetails as any).imdb_id ? `https://www.imdb.com/name/${(personDetails as any).imdb_id}` : null,
            matches: uniqueMatches,
            fuzzyMatches: uniqueFuzzyMatches,
            topFilmography: uniqueTopFilmography
        });

    } catch (error) {
        console.error('Error cross-referencing data:', error);
        return NextResponse.json({ error: 'Failed to cross-reference data' }, { status: 500 });
    }
}
