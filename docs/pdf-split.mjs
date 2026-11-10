// One-based, inclusive ranges, shared by the preview and the converter.
export function splitPlan(pageCount, { splitMode = 'all', splitCount = 2, splitPages = 1 } = {}) {
  if (!Number.isInteger(pageCount) || pageCount < 2) throw new Error('1페이지 PDF는 더 나눌 수 없어요. 2페이지 이상인 PDF를 선택해 주세요.');
  if (!['parts', 'pages', 'all'].includes(splitMode)) throw new Error('나누는 방식을 선택해 주세요.');
  if (splitMode === 'parts' && (!Number.isInteger(splitCount) || splitCount < 2 || splitCount > pageCount)) throw new Error(`나눌 파일 개수는 2~${pageCount} 사이의 정수로 입력해 주세요.`);
  if (splitMode === 'pages' && (!Number.isInteger(splitPages) || splitPages < 1 || splitPages >= pageCount)) throw new Error(`파일당 페이지 수는 1~${pageCount - 1} 사이의 정수로 입력해 주세요.`);
  const ranges = [];
  if (splitMode === 'parts') {
    const size = Math.floor(pageCount / splitCount), extra = pageCount % splitCount;
    let start = 1;
    for (let i = 0; i < splitCount; i++) {
      const end = start + size + (i < extra ? 1 : 0) - 1;
      ranges.push({ start, end }); start = end + 1;
    }
  } else {
    const size = splitMode === 'all' ? 1 : splitPages;
    for (let start = 1; start <= pageCount; start += size) ranges.push({ start, end: Math.min(start + size - 1, pageCount) });
  }
  return ranges;
}

export const pageRangeLabel = ({ start, end }) => start === end ? `${start}페이지` : `${start}~${end}페이지`;
