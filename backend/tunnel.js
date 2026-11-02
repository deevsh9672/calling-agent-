const localtunnel = require('localtunnel');

const PORT = process.env.PORT || 3000;
const SUBDOMAIN = process.env.SUBDOMAIN || 'bhsoft-voice-webhook';

async function startTunnel() {
  try {
    console.log(`[TUNNEL] Establishing localtunnel on port ${PORT} with subdomain '${SUBDOMAIN}'...`);
    const tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN });

    console.log(`[TUNNEL] Live URL: ${tunnel.url}`);

    tunnel.on('close', () => {
      console.warn('[TUNNEL] Tunnel closed. Reconnecting in 3 seconds...');
      setTimeout(startTunnel, 3000);
    });

    tunnel.on('error', (err) => {
      console.error('[TUNNEL] Tunnel error:', err.message);
      try { tunnel.close(); } catch (e) {}
      setTimeout(startTunnel, 3000);
    });
  } catch (err) {
    console.error('[TUNNEL] Initialization error:', err.message);
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();
