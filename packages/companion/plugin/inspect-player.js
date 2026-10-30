const playing = _musicplayer.getNowPlaying();
const queue = _musicplayer.getQueue() || [];
_helpers.Report("Lexicon MCP player report");
if (playing) {
  _helpers.Report(
    JSON.stringify({
      id: playing.id,
      artist: playing.artist,
      title: playing.title,
      currentTime: _musicplayer.getCurrentTime(),
      bpm: _musicplayer.getBpm(),
    }),
  );
} else {
  _helpers.Report("No track is loaded.");
}
_helpers.Report("Queue length: " + queue.length);
for (const track of queue) {
  _helpers.Report(
    JSON.stringify({ id: track.id, artist: track.artist, title: track.title }),
  );
}
