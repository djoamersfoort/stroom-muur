import os from 'os';
import express from 'express';
import NodeMediaServer from 'node-media-server';
import Config from './config.ts';

// ----------------------------------------------------------
// TYPES
// ----------------------------------------------------------

interface Session {
  reject: () => void;
}

interface Publisher {
  id: string;
  name: string;
  streamPath: string;
  startedAt: number;
}

// ----------------------------------------------------------
// STATE
// ----------------------------------------------------------

const publishers = new Map<string, Publisher>();

const getLanAddress = () => {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
};

const getRtmpUrl = () => `rtmp://${getLanAddress()}:${Config.rtmpPort}`;
const getFlvUrl = () => `http://${getLanAddress()}:${Config.flvPort}`;
const getWebUrl = () => `http://${getLanAddress()}:${Config.webPort}`;

const getSnapshot = () => ({
  rtmpUrl: getRtmpUrl(),
  flvUrl: getFlvUrl(),
  streams: Array.from(publishers.values()),
});

// ----------------------------------------------------------
// MEDIA SERVER
// ----------------------------------------------------------

const mediaServer = new NodeMediaServer({
  logType: 1,
  rtmp: {
    port: Config.rtmpPort,
    chunk_size: 60000,
    gop_cache: true,
    ping: 30,
    ping_timeout: 60,
  },
  http: {
    port: Config.flvPort,
    mediaroot: './.output',
    allow_origin: '*',
  },
});

mediaServer.on('prePublish', (id, streamPath) => {
  const session = mediaServer.getSession(id) as Session;

  if (publishers.size >= Config.maxStreams) {
    console.log(`Stream rejected: too many clients (${id})`);
    session.reject();
  }
});

mediaServer.on('postPublish', (id, streamPath) => {
  const startedAt = Date.now();
  const name = streamPath.split('/').at(1)?.slice(0, 60) ?? '';

  console.log(`Stream started: ${name} (${id})`);

  publishers.set(id, { id, name, streamPath, startedAt });
  broadcast();
});

mediaServer.on('donePublish', (id, streamPath) => {
  const publisher = publishers.get(id);
  if (!publisher) return;

  console.log(`Stream stopped: ${publisher.name} (${id})`);

  publishers.delete(id);
  broadcast();
});

// ----------------------------------------------------------
// WEB SERVER
// ----------------------------------------------------------

const web = express();
web.use(express.static('./public'));

// ----------------------------------------------------------
// WEB EVENTS
// ----------------------------------------------------------

const clients = new Set<express.Response>();

const getSnapshotData = () => `data: ${JSON.stringify(getSnapshot())}\n\n`;

const broadcast = () => {
  const msg = getSnapshotData();
  for (const res of clients) res.write(msg);
};

web.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.flushHeaders();
  res.write(getSnapshotData());

  clients.add(res);
  req.on('close', () => clients.delete(res));
});

setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 25000);

// ----------------------------------------------------------
// STARTING
// ----------------------------------------------------------

mediaServer.run();

web.listen(Config.webPort, () => {
  console.log('Listening:');
  console.log();
  console.log(`WEB:  ${getWebUrl()}`);
  console.log(`FLV:  ${getFlvUrl()}`);
  console.log(`RTMP: ${getRtmpUrl()}`);
  console.log();
});
