const ADJECTIVES = [
  '고요한', '느린', '따뜻한', '깊은', '맑은', '잔잔한', '부드러운', '은은한', '포근한', '한가한'
];
const NOUNS = [
  '나그네', '숲바람', '달빛쉼', '돌길', '물결', '안개', '이슬', '느티', '저녁불', '새벽'
];

export function randomNickname(rand = Math.random) {
  const adj = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(rand() * NOUNS.length)]!;
  const num = Math.floor(rand() * 90) + 10;
  const withNum = `${adj}${noun}${num}`;
  if (withNum.length <= 12) return withNum;
  const plain = `${adj}${noun}`;
  return plain.length <= 12 ? plain : noun.slice(0, 12);
}
