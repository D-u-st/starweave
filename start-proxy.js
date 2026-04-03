// Monkey-patch ws module to use proxy for all WebSocket connections
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy) {
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const agent = new HttpsProxyAgent(proxy);

  // Patch ws module before discord.js loads it
  const wsModule = require('ws');
  const OrigWebSocket = wsModule.WebSocket;

  const _origOn = OrigWebSocket.prototype.on;
  // Override the internal ws constructor to inject agent
  const mod = require.cache[require.resolve('ws')];
  const OrigClass = mod.exports;

  function PatchedWebSocket(address, protocols, options) {
    if (typeof protocols === 'object' && !Array.isArray(protocols) && protocols !== null) {
      options = protocols;
      protocols = undefined;
    }
    if (!options) options = {};
    if (!options.agent) options.agent = agent;

    if (new.target) {
      return new OrigClass(address, protocols, options);
    }
    return OrigClass(address, protocols, options);
  }

  PatchedWebSocket.prototype = OrigClass.prototype;
  Object.keys(OrigClass).forEach(k => { PatchedWebSocket[k] = OrigClass[k]; });
  PatchedWebSocket.WebSocket = PatchedWebSocket;
  PatchedWebSocket.Server = OrigClass.Server;
  PatchedWebSocket.Receiver = OrigClass.Receiver;
  PatchedWebSocket.Sender = OrigClass.Sender;
  PatchedWebSocket.CONNECTING = OrigClass.CONNECTING;
  PatchedWebSocket.OPEN = OrigClass.OPEN;
  PatchedWebSocket.CLOSING = OrigClass.CLOSING;
  PatchedWebSocket.CLOSED = OrigClass.CLOSED;

  mod.exports = PatchedWebSocket;
  console.log(`[proxy] WebSocket patched → ${proxy}`);
}

require('./dist/index.js');
