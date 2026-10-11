const container = document.querySelector('.tiles');
const rtmpUrlEl = document.querySelector('.rtmp-url');

const tiles = new Map();

mpegts.LoggingControl.enableAll = false;

// ----------------------------------------------------------
// STATE
// ----------------------------------------------------------

let state;

const getFlvUrl = (stream) => `${state.flvUrl}${stream.streamPath}.flv`;

const updateStatus = () => {
  rtmpUrlEl.textContent = `${state.rtmpUrl}/<jouw-naam>`;
};

// ----------------------------------------------------------
// EVENT HANDLING
// ----------------------------------------------------------

const events = new EventSource('/events');

events.onmessage = (event) => {
  state = JSON.parse(event.data);

  const toAdd = state.streams.filter((s) => !tiles.has(s.id));
  const toRemove = Array.from(tiles.keys()).filter((k) => !state.streams.some((s) => s.id === k));

  toAdd.forEach(createTile);
  toRemove.forEach(removeTile);

  recomputeLayout();
  updateStatus();
};

// ----------------------------------------------------------
// LAYOUT
// ----------------------------------------------------------

const findBestLayout = (count, gap = 8, aspect = 16 / 9) => {
  let best = { cols: 1, rows: 1, tileW: 0, tileH: 0 };

  const width = container.clientWidth;
  const height = container.clientHeight;

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);

    const cellW = (width - gap * (cols - 1)) / cols;
    const cellH = (height - gap * (rows - 1)) / rows;

    const tileW = Math.min(cellW, cellH * aspect);
    const tileH = tileW / aspect;

    if (tileW > best.tileW) best = { cols, rows, tileW, tileH };
  }

  return best;
};

const recomputeLayout = () => {
  const { tileW, tileH } = findBestLayout(tiles.size);
  container.style.setProperty('--width', `${Math.floor(tileW)}px`);
  container.style.setProperty('--height', `${Math.floor(tileH)}px`);
};

new ResizeObserver(recomputeLayout).observe(container);

// ----------------------------------------------------------
// CREATE AND REMOVE TILES
// ----------------------------------------------------------

const createTile = (stream) => {
  console.log(`Creating stream: ${stream.id}`);

  const element = document.createElement('div');
  element.classList.add('tile');
  container.append(element);

  const video = document.createElement('video');
  video.muted = true;
  element.append(video);

  const label = document.createElement('span');
  label.classList.add('label');
  label.textContent = stream.name;
  element.append(label);

  const player = mpegts.createPlayer(
    { type: 'flv', isLive: true, url: getFlvUrl(stream) },
    {
      enableWorker: true,
      enableStashBuffer: false,
      lazyLoad: false,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 1.5,
      liveBufferLatencyMinRemain: 0.3,
    },
  );

  player.attachMediaElement(video);
  player.load();
  player.play();

  video.onwaiting = () => element.classList.add('stalled');
  video.onplaying = () => element.classList.remove('stalled');

  const tile = { ...stream, player, element, video };
  tiles.set(stream.id, tile);
};

const removeTile = (id) => {
  console.log(`Removing stream: ${id}`);

  const tile = tiles.get(id);
  tiles.delete(id);

  tile.player.pause();
  tile.player.unload();
  tile.player.detachMediaElement();
  tile.player.destroy();

  tile.element.remove();
};
