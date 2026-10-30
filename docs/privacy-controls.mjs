import { analyticsDisabled, setAnalyticsDisabled, startAnalytics } from './analytics.mjs?v=3';

const button = document.getElementById('analytics-choice');
const status = document.getElementById('analytics-choice-status');
function render(message = '') {
  const disabled = analyticsDisabled(window);
  status.textContent = message || (disabled ? '이 브라우저에서는 이용 통계를 보내지 않아요.' : '이 브라우저에서는 이용 통계를 보내고 있어요.');
  button.textContent = disabled ? '이용 통계 허용하기' : '이용 통계 중지하기';
  button.disabled = Boolean(navigator.globalPrivacyControl);
  if (navigator.globalPrivacyControl) status.textContent = '브라우저의 개인정보 보호 신호에 따라 이용 통계를 보내지 않아요.';
}
button.addEventListener('click', () => {
  const result = setAnalyticsDisabled(window, document, !analyticsDisabled(window));
  if (!result.disabled) startAnalytics(window, document);
  render(result.saved ? '' : '이 페이지에는 적용했지만 설정을 저장하지 못했어요. 브라우저 저장소 설정을 확인해 주세요.');
});
render();
