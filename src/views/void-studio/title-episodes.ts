import type { Meta } from "@/lib/cinemeta";
import type { Episode } from "@/lib/providers/tmdb";
import type { PlayEpisode } from "@/lib/view";

export type VoidEpisode = {
  key: string;
  number: number;
  title: string;
  description: string;
  image?: string;
  date?: string;
  play: PlayEpisode;
};

export function episodesFromCinemeta(
  videos: NonNullable<Meta["videos"]>,
  season: number,
): VoidEpisode[] {
  return videos
    .filter((video) => (video.season ?? 1) === season)
    .map((video, index) => {
      const number = video.episode ?? video.number ?? index + 1;
      return {
        key: `${season}:${number}:${video.id ?? index}`,
        number,
        title: video.title || video.name || `Episode ${number}`,
        description: video.overview || video.description || "",
        image: video.thumbnail,
        date: video.released || video.firstAired,
        play: {
          season,
          episode: number,
          name: video.title || video.name,
          videoId: video.id,
          airDate: video.released || video.firstAired,
        },
      };
    })
    .sort((a, b) => a.number - b.number);
}

export function episodesFromTmdb(episodes: Episode[]): VoidEpisode[] {
  return episodes
    .map((episode) => ({
      key: `${episode.seasonNumber}:${episode.episodeNumber}`,
      number: episode.episodeNumber,
      title: episode.name || `Episode ${episode.episodeNumber}`,
      description: episode.overview || "",
      image:
        episode.stillUrl ||
        (episode.stillPath ? `https://image.tmdb.org/t/p/w500${episode.stillPath}` : undefined),
      date: episode.airDate || undefined,
      play: {
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        name: episode.name,
        still:
          episode.stillUrl ||
          (episode.stillPath ? `https://image.tmdb.org/t/p/w500${episode.stillPath}` : undefined),
        overview: episode.overview,
        airDate: episode.airDate || undefined,
        runtime: episode.runtime || undefined,
      },
    }))
    .sort((a, b) => a.number - b.number);
}

export function mergeEpisodes(cinemetaEpisodes: VoidEpisode[], tmdbEpisodes: VoidEpisode[]) {
  if (!tmdbEpisodes.length) return cinemetaEpisodes;
  if (!cinemetaEpisodes.length) return tmdbEpisodes;
  // Keep Stremio/addon video IDs while using the richer localized episode artwork and text.
  const sourceEpisodes = new Map(cinemetaEpisodes.map((entry) => [entry.number, entry]));
  const enriched = tmdbEpisodes.map((entry) => {
    const native = sourceEpisodes.get(entry.number);
    sourceEpisodes.delete(entry.number);
    return native
      ? { ...entry, key: native.key, play: { ...entry.play, videoId: native.play.videoId } }
      : entry;
  });
  return [...enriched, ...sourceEpisodes.values()].sort((a, b) => a.number - b.number);
}
