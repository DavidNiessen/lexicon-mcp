const tracks = _vars.tracksSelected || [];
const playlists = _vars.playlistsSelected || [];
_helpers.Report("Lexicon MCP selection report");
_helpers.Report("Track count: " + tracks.length);
for (const track of tracks) {
  _helpers.Report(
    JSON.stringify({ id: track.id, artist: track.artist, title: track.title }),
  );
}
_helpers.Report("Playlist count: " + playlists.length);
for (const playlist of playlists) {
  _helpers.Report(JSON.stringify({ id: playlist.id, name: playlist.name }));
}
_helpers.Report(
  "Share these IDs with your assistant, or ask it to inspect the current selection.",
);
