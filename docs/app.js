import('./web-app.mjs?v=web-3').catch(() => {
  const status = document.getElementById('web-status');
  if (status) { status.hidden = false; status.textContent = '웹 변환 도구를 불러오지 못했어요. 새로고침하거나 Mac 앱을 이용해 주세요.'; status.setAttribute('role','alert'); }
});
