'use strict';
/* [SEO] Verificación de Google Search Console y Bing: el código que dan se pone en GOOGLE_SITE_VERIFICATION / BING_SITE_VERIFICATION
   (el valor o la etiqueta <meta> entera) y aparece en la página principal. Nada raro llega a la página.
   [ANUNCIOS] Con ADS_CLIENT (ca-pub-…) la página lleva google-adsense-account y se sirve /ads.txt, para que AdSense verifique la web. */
const { spawn } = require('child_process'); const path = require('path'); const fs = require('fs');
let failed = 0; const ok = (c, m) => { console.log(c ? 'ok  ' : 'FALLO', m); if (!c) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = []; process.on('exit', () => { for (const p of procs) try { p.kill(); } catch (e) { /* nada */ } });
const run = async (port, env) => { const p = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: fs.mkdtempSync('/tmp/ppr-seo-'), FILL_BOTS: '0', REQUIRE_TERMS: '0', DATABASE_URL: '', GOOGLE_SITE_VERIFICATION: '', BING_SITE_VERIFICATION: '', ADS_CLIENT: '', ADS_PROVIDER: '' }, env), stdio: 'ignore' }); procs.push(p); await sleep(1300); const html = await (await fetch('http://127.0.0.1:' + port + '/')).text(); const ar = await fetch('http://127.0.0.1:' + port + '/ads.txt'); run.ads = { status: ar.status, text: await ar.text() }; p.kill(); return html; };
(async () => {
  try {
    let h = await run(3981, { GOOGLE_SITE_VERIFICATION: '<meta name="google-site-verification" content="AbC123_xyz-9876543210QwErTy" />', BING_SITE_VERIFICATION: '0123456789ABCDEF0123456789ABCDEF', PUBLIC_URL: 'https://krunxa.up.railway.app' });
    ok(h.includes('<meta name="google-site-verification" content="AbC123_xyz-9876543210QwErTy">'), 'pegando la etiqueta entera de Google, la página lleva su código');
    ok(h.includes('<meta name="msvalidate.01" content="0123456789ABCDEF0123456789ABCDEF">'), 'y el de Bing (pegando solo el valor)');
    ok(h.includes('<link rel="canonical" href="https://krunxa.up.railway.app/">') && !h.includes('__VERIFY__'), 'la dirección oficial es la de PUBLIC_URL y no queda el marcador');
    h = await run(3982, { GOOGLE_SITE_VERIFICATION: '"><script>alert(1)</script>' });
    ok(!/google-site-verification|<script>alert/.test(h) && !h.includes('__VERIFY__'), 'un valor raro no se pone en la página (ni se cuela código)');
    h = await run(3983, {});
    ok(!/google-site-verification|msvalidate/.test(h) && !h.includes('__VERIFY__'), 'sin las variables no hay etiquetas');
    ok(run.ads.status === 404 && !/google-adsense-account/.test(h), 'sin ID de AdSense no hay ads.txt ni etiqueta de AdSense');
    h = await run(3984, { ADS_CLIENT: 'ca-pub-1234567890123456' });
    ok(h.includes('<meta name="google-adsense-account" content="ca-pub-1234567890123456">'), 'con ADS_CLIENT la página lleva la etiqueta de verificación de AdSense (aunque los anuncios sigan apagados)');
    ok(run.ads.status === 200 && run.ads.text === 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n', 'y /ads.txt autoriza a Google con ese ID de editor');
    h = await run(3986, { ADS_CLIENT: '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7729377107829533" crossorigin="anonymous"></script>' });
    ok(h.includes('<meta name="google-adsense-account" content="ca-pub-7729377107829533">') && run.ads.text.includes('pub-7729377107829533, DIRECT'), 'pegando el fragmento <script> entero de AdSense también vale: se saca el ID');
    h = await run(3987, { ADS_CLIENT: ' "ca-pub-1234567890123456" ' });
    ok(run.ads.status === 200 && h.includes('content="ca-pub-1234567890123456"'), 'y con comillas o espacios alrededor');
    h = await run(3985, { ADS_CLIENT: 'ca-pub-12"><script>' });
    ok(!/google-adsense-account|<script>alert/.test(h) && run.ads.status === 404, 'un ID de AdSense mal escrito no se usa');
  } catch (e) { ok(false, 'excepción: ' + e.stack); }
  console.log(failed ? '\n' + failed + ' FALLOS' : '\nTODO CORRECTO'); process.exit(failed ? 1 : 0);
})();
