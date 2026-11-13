// First-class VOID nav artwork. Static React SVG, no DOM observers or image replacements.
// The paths follow the lightweight VOID icon set; this is intentionally independent of CSS masks.
const PATHS: Readonly<Record<string, string>> = {
  home: "M12 2.6 2.4 10.8h2.8V21h5.4v-6h2.8v6h5.4V10.8h2.8L12 2.6z",
  discover: "M12 2a10 10 0 100 20 10 10 0 000-20zm4.2 5.8-1.9 6.5-6.5 1.9 1.9-6.5 6.5-1.9zM12 10.7a1.3 1.3 0 100 2.6 1.3 1.3 0 000-2.6z",
  catalogs: "M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z",
  movies: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm0 2v2h2V5H5zm0 4v2h2V9H5zm0 4v2h2v-2H5zm0 4v2h2v-2H5zM17 5v2h2V5h-2zm0 4v2h2V9h-2zm0 4v2h2v-2h-2zm0 4v2h2v-2h-2zM9 5v6h6V5H9zm0 8v6h6v-6H9z",
  shows: "M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2h-5l1.4 2.4H7.6L9 18H4a2 2 0 01-2-2V6a2 2 0 012-2zm1 2.5v9h14v-9H5z",
  anime: "M12.1 2.1a9.9 9.9 0 100 19.8 9.6 9.6 0 007.2-3.2 8.2 8.2 0 01-9.8-12 8.4 8.4 0 012.6-4.6zM17 5l.8 2.3L20 8l-2.2.8L17 11l-.8-2.2L14 8l2.2-.7L17 5z",
  manga: "M6 2h12a2 2 0 012 2v13H7.5A1.5 1.5 0 006 18.5V2zm2 2.5v6h10v-6H8zM6 20a2 2 0 012-2h12v4H8a2 2 0 01-2-2z",
  ebook: "M4 4.5A2.5 2.5 0 016.5 2H20v15H6.5A1.5 1.5 0 005 18.5v-14zM5 20a2 2 0 012-2h13v3.5H7A2 2 0 015 20z",
  music: "M9 3.5 20 2v13.2a3.3 3.3 0 11-2-3V6.3l-7 1v10.4a3.3 3.3 0 11-2-3V3.5z",
  games: "M7 6h10c2.3 0 3.8 1.6 4.3 4l1.1 6c.5 2.8-2.4 4.7-4.4 2.8L15.3 16H8.7L6 18.8c-2 1.9-4.9 0-4.4-2.8l1.1-6C3.2 7.6 4.7 6 7 6zm-.8 3.5v2H4.3v1.7h1.9v2H8v-2h1.9v-1.7H8v-2zm10.3.5a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm2.8 3a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z",
  live: "M12 9.2a2.8 2.8 0 110 5.6 2.8 2.8 0 010-5.6zM6.2 6.2a8.2 8.2 0 000 11.6l1.5-1.5a6.1 6.1 0 010-8.6L6.2 6.2zm11.6 0-1.5 1.5a6.1 6.1 0 010 8.6l1.5 1.5a8.2 8.2 0 000-11.6zM3.4 3.4a12.2 12.2 0 000 17.2l1.5-1.5a10.1 10.1 0 010-14.2L3.4 3.4zm17.2 0-1.5 1.5a10.1 10.1 0 010 14.2l1.5 1.5a12.2 12.2 0 000-17.2z",
  sports: "M7 3h10v2.2h3.2V8a4.2 4.2 0 01-4 4.2 5.4 5.4 0 01-2.9 2.9V17H16v3H8v-3h2.8v-1.9a5.4 5.4 0 01-2.9-2.9A4.2 4.2 0 013.8 8V5.2H7V3z",
  vod: "M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2h-5l1.4 2.4H7.6L9 18H4a2 2 0 01-2-2V6a2 2 0 012-2zm1 2.5v9h14v-9H5z",
  kids: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm0 2v2h2V5H5zm0 4v2h2V9H5zm0 4v2h2v-2H5zm0 4v2h2v-2H5zM17 5v2h2V5h-2zm0 4v2h2V9h-2zm0 4v2h2v-2h-2zm0 4v2h2v-2h-2zM9 5v6h6V5H9zm0 8v6h6v-6H9z",
  library: "M3 3h4.2v18H3V3zM9 3h4.2v18H9V3zM15.1 4.6l3.9-1 3.3 16.1-3.9 1-3.3-16.1z",
  collections: "M6 3h12a1 1 0 011 1v17.4l-7-4.2-7 4.2V4a1 1 0 011-1z",
  downloads: "M10.8 3h2.4v8.6l3.2-3.2 1.7 1.7L12 16l-6.1-5.9 1.7-1.7 3.2 3.2V3zM4 18h16v3H4v-3z",
  calendar: "M7 2h2v2h6V2h2v2h2a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h2V2zM5 10v10h14V10H5zm2 2h3v3H7v-3z",
  addons: "M8 6V5a3 3 0 016 0v1h3a1 1 0 011 1v3h1a3 3 0 010 6h-1v4a1 1 0 01-1 1h-3v-1a3 3 0 00-6 0v1H4a1 1 0 01-1-1v-4h1a3 3 0 000-6H3V7a1 1 0 011-1z",
  plugins: "M8 2h2v4h4V2h2v4h1a1 1 0 011 1v4a6 6 0 01-5 5.9V22h-2v-5.1A6 6 0 016 11V7a1 1 0 011-1h1V2z",
  settings: "M12 3.9l1.95-1.7 1.88.56.67 2.5 1.23 1.01 2.59.17.92 1.73-1.3 2.25.16 1.58 1.71 1.95-.57 1.88-2.5.67-1.01 1.23-.17 2.59-1.73.92-2.25-1.3-1.58.16-1.95 1.71-1.88-.57-.67-2.5-1.23-1.01-2.59-.17-.92-1.73 1.3-2.25L3.9 12l-1.71-1.95.57-1.88 2.5-.67 1.01-1.23.17-2.59 1.73-.92 2.25 1.3L12 3.9zM12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z",
  "collections-hub": "M6 3h12a1 1 0 011 1v17.4l-7-4.2-7 4.2V4a1 1 0 011-1z",
  ebooks: "M4 4.5A2.5 2.5 0 016.5 2H20v15H6.5A1.5 1.5 0 005 18.5v-14zM5 20a2 2 0 012-2h13v3.5H7A2 2 0 015 20z"
};

export function hasVoidNavIcon(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(PATHS, id);
}

export function VoidNavIcon({ id }: { id: string }) {
  const d = PATHS[id];
  if (!d) return null;
  return (
    <svg
      className="void-native-nav-svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} fillRule="evenodd" />
    </svg>
  );
}
