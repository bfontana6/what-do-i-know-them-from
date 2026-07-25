import { NextResponse } from 'next/server';
import { TMDB } from 'tmdb-ts';

let _tmdb: TMDB | null = null;
const getTMDB = () => {
  if (!_tmdb) _tmdb = new TMDB(process.env.TMDB_ACCESS_TOKEN!);
  return _tmdb;
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { showName } = body;

        if (!showName) {
            return NextResponse.json({ error: 'Show name is required' }, { status: 400 });
        }

        // Search TV and movie in parallel
        const [tvResults, movieResults] = await Promise.all([
            getTMDB().search.tvShows({ query: showName }),
            getTMDB().search.movies({ query: showName }),
        ]);

        // Pick the best result: highest popularity across both types
        const bestTv = tvResults.results?.[0];
        const bestMovie = movieResults.results?.[0];

        let mediaType: 'tv' | 'movie';
        let mediaId: number;
        let mediaTitle: string;

        if (!bestTv && !bestMovie) {
            return NextResponse.json({ error: 'No show or movie found with that title' }, { status: 404 });
        }

        const tvPop = bestTv?.popularity ?? 0;
        const moviePop = bestMovie?.popularity ?? 0;

        if (tvPop >= moviePop) {
            mediaType = 'tv';
            mediaId = bestTv!.id;
            mediaTitle = (bestTv as any).name ?? '';
        } else {
            mediaType = 'movie';
            mediaId = bestMovie!.id;
            mediaTitle = (bestMovie as any).title ?? '';
        }

        // Fetch credits
        let cast: Array<{ id: number; name: string; character: string; profilePath: string | null }> = [];

        if (mediaType === 'tv') {
            const credits = await getTMDB().tvShows.credits(mediaId);
            cast = (credits.cast || []).slice(0, 20).map((m: any) => ({
                id: m.id,
                name: m.name,
                character: m.character || '',
                profilePath: m.profile_path ? `https://image.tmdb.org/t/p/w185${m.profile_path}` : null,
            }));
        } else {
            const credits = await getTMDB().movies.credits(mediaId);
            cast = (credits.cast || []).slice(0, 20).map((m: any) => ({
                id: m.id,
                name: m.name,
                character: m.character || '',
                profilePath: m.profile_path ? `https://image.tmdb.org/t/p/w185${m.profile_path}` : null,
            }));
        }

        return NextResponse.json({ mediaTitle, mediaType, cast });

    } catch (error) {
        console.error('Error in cast-lookup:', error);
        return NextResponse.json({ error: 'Failed to look up cast' }, { status: 500 });
    }
}
