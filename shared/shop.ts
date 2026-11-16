/** Courtyard snack stall — proximity shop, not a travel zone. */
export const SHOP = {
  /** South of the onsen approach — beside the path, never on it. */
  x: 12.4,
  z: 11.0,
  yaw: 0,
  reach: 3.6,
  name: '숲속 매점',
  english: 'SNACK STAND',
  /** Decoded from public/shop/kakao-remit-qr.png — opens Kakao Pay remittance. */
  kakaoRemitUrl: 'https://qr.kakaopay.com/281006011112499622003768',
  /** Optional QR fallback for devices that cannot open KakaoTalk. */
  kakaoQrSrc: '/shop/kakao-remit-qr.png',
  kakaoHint: '버튼을 누르면 카카오톡 송금으로 바로 연결돼요. 앱이 안 열리면 같은 버튼을 다시 눌러 주세요.'
} as const;

export type ShopItemId = 'ramen' | 'egg' | 'sikhye' | 'hotbar' | 'tteokbokki';

export const SHOP_ITEMS: readonly {
  id: ShopItemId;
  name: string;
  price: number;
  blurb: string;
}[] = [
  { id: 'ramen', name: '라면', price: 4000, blurb: '김 오른 컵라면 한 그릇' },
  { id: 'egg', name: '맥반석 계란', price: 1000, blurb: '따뜻하게 구운 계란 두 알' },
  { id: 'sikhye', name: '식혜', price: 3000, blurb: '달큰한 식혜 한 병' },
  { id: 'hotbar', name: '핫바', price: 2000, blurb: '따끈한 핫바 한 꼬치' },
  { id: 'tteokbokki', name: '떡볶이', price: 5000, blurb: '매콤달콤 떡볶이 한 접시' }
];

export type PayMode = 'metaverse' | 'kakao';

export function formatWon(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

/** Kakao Pay remittance link, optionally with the item amount pre-filled. */
export function kakaoRemitUrl(amount?: number) {
  const base = SHOP.kakaoRemitUrl;
  if (!amount || amount < 1) return base;
  // Amount is encoded as (won * 2^19) in hex after the pay code.
  return `${base}${(amount * 524288).toString(16)}`;
}
