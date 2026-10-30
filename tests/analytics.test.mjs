import assert from 'node:assert/strict';
import { startAnalytics, eventParameters, analyticsDisabled, setAnalyticsDisabled, ANALYTICS_PREFERENCE_KEY } from '../docs/analytics.mjs';
import { analyticsConfig } from '../docs/analytics-config.mjs';

const config = { measurementId: 'G-TEST123456', hostname: 'della-su.github.io', basePath: '/dropi/' };
function fixture(url = `https://${config.hostname}${config.basePath}?email=private@example.com#private`) {
  const listeners = new Map(), scripts = [];
  const stored = new Map();
  const win = { location: new URL(url), navigator: {}, localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key,value) => stored.set(key,value), removeItem: key => stored.delete(key) } };
  const doc = {
    referrer: 'https://example.org/private?email=private@example.com',
    head: { append: script => scripts.push(script) },
    createElement: () => ({}),
    addEventListener: (type, callback) => listeners.set(type, callback),
  };
  const commands = () => (win.dataLayer ?? []).map(args => [...args]);
  return { win, doc, listeners, scripts, commands };
}

assert.deepEqual(eventParameters({action:'jpg',file_count:2,filename:'private.png',error:'private detail',download_kind:'single',output_count:1}), {
  tool:'jpg', file_count:2, output_count:1, download_kind:'single',
});
assert.deepEqual(eventParameters({action:'private filename',file_count:Infinity,output_count:301,download_kind:'private'}), {});
for (const url of ['file:///Users/private/test.html', 'http://localhost:4317/', 'https://another.example/', 'https://della-su.github.io/', 'https://della-su.github.io/hachiware-collection/', 'https://della-su.github.io/dropi-other/']) {
  const f=fixture(url); assert.equal(startAnalytics(f.win,f.doc,config),false); assert.equal(f.scripts.length,0); assert.equal(f.commands().length,0);
}
for (const measurementId of ['', 'GTM-MR8BMVFK', 'G-XXXXXXXXXX', '<script>']) {
  const f=fixture(); assert.equal(startAnalytics(f.win,f.doc,{...config,measurementId}),false); assert.equal(f.scripts.length,0);
}
assert.match(analyticsConfig.measurementId,/^G-[A-Z0-9]+$/);
assert.equal(analyticsConfig.hostname,config.hostname);
const liveConfig=fixture(); assert.equal(startAnalytics(liveConfig.win,liveConfig.doc,analyticsConfig),true);
assert.equal(liveConfig.scripts[0].src,`https://www.googletagmanager.com/gtag/js?id=${analyticsConfig.measurementId}`);
const privateBrowser=fixture();privateBrowser.win.navigator.globalPrivacyControl=true;assert.equal(startAnalytics(privateBrowser.win,privateBrowser.doc,config),false);
const f=fixture();assert.equal(startAnalytics(f.win,f.doc,config),true);assert.equal(startAnalytics(f.win,f.doc,config),false);
assert.equal(f.scripts.length,1);assert.equal(f.scripts[0].src,`https://www.googletagmanager.com/gtag/js?id=${config.measurementId}`);
assert.equal(f.commands().filter(c=>c[1]==='page_view').length,1);
const tagConfig=f.commands().find(c=>c[0]==='config')[2];assert.equal(tagConfig.page_location,`https://${config.hostname}${config.basePath}`);assert.equal(tagConfig.page_referrer,'https://example.org');assert.equal(tagConfig.send_page_view,false);assert.equal(tagConfig.allow_google_signals,false);
assert.equal(tagConfig.cookie_domain,'none');assert.equal(tagConfig.cookie_path,'/dropi/');assert.equal(tagConfig.cookie_prefix,'dropi');assert.equal(tagConfig.cookie_update,false);assert.equal(tagConfig.cookie_expires,31536000);
f.listeners.get('dropi:analytics')({detail:{event:'conversion_complete',action:'pdf',file_count:2,output_count:1,filename:'secret.png',error:'secret'}});
assert.deepEqual(f.commands().at(-1),['event','conversion_complete',{tool:'pdf',file_count:2,output_count:1,send_to:config.measurementId}]);
const count=f.commands().length;f.listeners.get('dropi:analytics')({detail:{event:'secret event'}});assert.equal(f.commands().length,count);
function click(href){f.listeners.get('click')({target:{closest:()=>({href})}});}
click(`https://${config.hostname}${config.basePath}downloads/Dropi-1.2.5-macOS-Universal-Preview.dmg`);assert.equal(f.commands().at(-1)[1],'app_download');
const downloads=f.commands().length;click(`https://${config.hostname}${config.basePath}downloads/Dropi-1.2.5-macOS-Universal-Preview.dmg.sha256`);click('blob:https://example.org/private-file.pdf');click('https://example.org/downloads/Dropi-test.dmg');assert.equal(f.commands().length,downloads);
assert(!JSON.stringify(f.commands()).includes('private@example.com'));
console.log('Analytics checks passed: verified stream configuration, production-only, one page view, sanitized events, host-only cookies, download filtering.');

const preference=fixture();preference.win.localStorage.setItem(ANALYTICS_PREFERENCE_KEY,'true');assert.equal(startAnalytics(preference.win,preference.doc,config),false);assert.equal(preference.scripts.length,0);
assert.equal(setAnalyticsDisabled(preference.win,preference.doc,false,config.measurementId).disabled,false);assert.equal(startAnalytics(preference.win,preference.doc,config),true);
const beforeDisable=preference.commands().length;setAnalyticsDisabled(preference.win,preference.doc,true,config.measurementId);preference.listeners.get('dropi:analytics')({detail:{event:'conversion_complete',action:'jpg'}});assert.equal(preference.commands().length,beforeDisable);assert.equal(analyticsDisabled(preference.win,config.measurementId),true);
const cookieFixture=fixture();let cookies=[];Object.defineProperty(cookieFixture.doc,'cookie',{get:()=> 'dropi_ga=one; dropi_ga_EFWF1ERPJF=two; _ga=other-site; unrelated=keep',set:value=>cookies.push(value)});setAnalyticsDisabled(cookieFixture.win,cookieFixture.doc,true,config.measurementId);assert.equal(cookies.length,2);assert(cookies.every(c=>c.startsWith('dropi_ga')&&c.includes('Path=/dropi/')));assert(!cookies.some(c=>c.startsWith('_ga=')));
console.log('GitHub migration checks passed: project-path gate, isolated cookies, opt-out persistence and opt-in recovery.');
