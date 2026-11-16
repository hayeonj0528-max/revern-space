import { useEffect, useState } from 'react';
import { SHOP, SHOP_ITEMS, formatWon, kakaoRemitUrl, type PayMode, type ShopItemId } from '../shared/shop';
import { useSpace } from './network';
import { RoomHud } from './RoomHud';

function openKakaoRemit(amount: number) {
  const url = kakaoRemitUrl(amount);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function ShopInteraction() {
  const { snapshot, id } = useSpace();
  const self = snapshot?.players.find(p => p.id === id);
  const [itemId, setItemId] = useState<ShopItemId | null>(null);
  const [pay, setPay] = useState<PayMode | null>(null);
  const [toast, setToast] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [qrOk, setQrOk] = useState(true);
  const near = !!self && self.zone === 'courtyard' && Math.hypot(self.x - SHOP.x, self.z - SHOP.z) <= SHOP.reach;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!near) { setItemId(null); setPay(null); setShowQr(false); }
  }, [near]);
  if (!self || !near) return null;
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  const metaversePay = () => {
    setToast(`${item?.name ?? '간식'} 후원이 메타버스에 남겨졌어요. 고마워요.`);
    setPay(null);
    setItemId(null);
  };
  const startKakao = () => {
    if (!item) return;
    openKakaoRemit(item.price);
    setShowQr(false);
    setQrOk(true);
    setPay('kakao');
  };
  return <RoomHud label={SHOP.name} className="shop-hud">
    <div className="hud-main">
      <span className="hud-status" role="status">
        {pay === 'kakao' ? '카카오톡 송금으로 연결'
          : pay === 'metaverse' ? '메타버스 후원 확인'
            : item ? `${item.name} · ${formatWon(item.price)}`
              : '라면 · 맥반석 계란 · 식혜'}
      </span>
      {(item || pay) && <button className="secondary" onClick={() => { if (pay) { setPay(null); setShowQr(false); } else setItemId(null); }}>{pay ? '뒤로' : '취소'}</button>}
    </div>
    {!item && !pay && <div className="shop-items" role="list">
      {SHOP_ITEMS.map(i => (
        <button key={i.id} type="button" className="shop-item" onClick={() => setItemId(i.id)}>
          <span className="shop-item-copy"><strong>{i.name}</strong><small>{i.blurb}</small></span>
          <span className="shop-item-price">{formatWon(i.price)}</span>
        </button>
      ))}
    </div>}
    {item && !pay && <div className="hud-controls shop-pay-choices">
      <p className="shop-pay-intro">후원 방식을 골라 주세요. 실제 입금은 카카오톡 송금만 해당돼요.</p>
      <button className="secondary" onClick={() => setPay('metaverse')}>메타버스 후원 (체험)</button>
      <button className="primary" onClick={startKakao}>카카오톡으로 {formatWon(item.price)} 송금</button>
    </div>}
    {pay === 'metaverse' && item && <div className="shop-checkout">
      <p>가짜 메타버스 결제예요. 돈이 오가지 않고, 마음만 남겨 두어요.</p>
      <button className="primary" onClick={metaversePay}>{formatWon(item.price)} 후원하기</button>
    </div>}
    {pay === 'kakao' && item && <div className="shop-checkout shop-kakao">
      <p>{SHOP.kakaoHint}</p>
      <p className="shop-kakao-amount"><strong>{item.name}</strong> · {formatWon(item.price)}</p>
      <button className="primary" onClick={() => openKakaoRemit(item.price)}>카카오톡 송금 다시 열기</button>
      {!showQr
        ? <button className="secondary" type="button" onClick={() => setShowQr(true)}>QR로 보내기</button>
        : qrOk
          ? <img className="shop-qr" src={SHOP.kakaoQrSrc} alt="카카오톡 송금 QR 코드" onError={() => setQrOk(false)} />
          : <div className="shop-qr-missing" role="status">
              <strong>QR 이미지를 찾을 수 없어요</strong>
              <span>위 버튼으로 카카오톡 송금을 열어 주세요.</span>
            </div>}
      <a className="shop-kakao-link" href={kakaoRemitUrl(item.price)} target="_blank" rel="noopener noreferrer">링크로 열기</a>
    </div>}
    {toast && <p className="hud-status shop-toast" role="status">{toast}</p>}
  </RoomHud>;
}
