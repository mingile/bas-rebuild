// 문자열을 HTML로 해석하지 않고 DOM을 만든다. 데이터 값은 항상 텍스트로만 들어간다.
// props는 요소 프로퍼티(className, textContent, href ...), attrs는 setAttribute로 넣을 속성(aria-* 등).
export function el(tag, { attrs = {}, ...props } = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

// SVG 요소는 네임스페이스가 달라 createElement로는 만들 수 없다. 속성은 모두 setAttribute로 넣는다.
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}
