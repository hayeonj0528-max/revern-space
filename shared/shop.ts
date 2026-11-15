/** Courtyard snack stall — proximity shop, not a travel zone. */
export const SHOP = {
  /** South of the onsen approach — beside the path, never on it. */
  x: 12.4,
  z: 11.0,
  yaw: 0,
  reach: 3.6,
  name: '숲속 매점',
  english: 'SNACK STAND',
  /** Drop your KakaoTalk remittance QR here (PNG/JPG/WebP). */
  kakaoQrSrc: '/shop/kakao-remit-qr.png',
  kakaoHint: '카카오톡 송금 QR을 스캔해 주세요. 실제 송금은 카카오톡에서 이뤄집니다.'
} as const;

export type ShopItemId = 'ramen' | 'egg' | 'sikhye';

export const SHOP_ITEMS: readonly {
  id: ShopItemId;
  name: string;
  price: number;
  blurb: string;
}[] = [
  { id: 'ramen', name: '라면', price: 4000, blurb: '김 오른 컵라면 한 그릇' },
  { id: 'egg', name: '맥반석 계란', price: 1000, blurb: '따뜻하게 구운 계란 두 알' },
  { id: 'sikhye', name: '식혜', price: 3000, blurb: '달큰한 식혜 한 병' }
];

export type PayMode = 'metaverse' | 'kakao';

export function formatWon(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}
