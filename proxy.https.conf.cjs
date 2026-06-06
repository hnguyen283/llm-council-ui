const target = 'http://localhost:8080';

function stripBrowserOrigin(proxyReq) {
  proxyReq.removeHeader('Origin');
}

function configure(proxy) {
  proxy.on('proxyReq', stripBrowserOrigin);
}

const common = {
  target,
  changeOrigin: true,
  secure: false,
  logLevel: 'debug',
  configure,
  onProxyReq: stripBrowserOrigin,
};

module.exports = {
  '/auth': common,
  '/me': common,
  '/jobs': {
    ...common,
    timeout: 900000,
    proxyTimeout: 900000,
    buffer: false,
  },
};
