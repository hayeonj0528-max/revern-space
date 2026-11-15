# 자산 출처와 사용 조건

작성일: 2026-11-02

## 이 프로젝트에서 직접 만든 자산

| 자산 | 구현 위치 | 출처·상태 |
| --- | --- | --- |
| 곡선 한옥 지붕, 추녀, 서까래, 창호, 대문, 건축 비례 | `client/World.tsx` | 이번 작업에서 코드로 제작. 타 서비스의 모델·배치·로고를 가져오지 않음 |
| 목재·석재·기와·한지·창호·잎 텍스처 | `client/materials.ts` | Canvas로 절차 생성. 외부 사진이나 텍스처 없음 |
| 나무·가지·잎 군집과 바람 | `client/World.tsx` | 인스턴싱한 자체 기하와 자체 잎 텍스처 |
| 방문객·요가 가이드·수건·컵·주전자 | `client/Avatar.tsx` | 자체 모델·관절 동작. 간결한 초기 모델이며 상용 아트로 추가 개선 가능 |
| 요가 8자세·공통 루틴·부드러운 전환 | `shared/yoga.ts`, `client/Avatar.tsx` | 이번 작업에서 직접 작성한 관절 애니메이션. 실제 사람의 동작을 촬영·추적하지 않음 |
| 온탕·냉탕·계단·손잡이·핀란드 사우나·단 벤치·돌 히터·국자·증기 | `client/World.tsx`, `client/Avatar.tsx`, `shared/spa.ts` | 이번 확장에서 직접 만든 기하·동작·수면 셰이더. 외부 사우나 모델·사진 없음 |
| 매트·튜브·테이블·좌석·불빛 | `client/World.tsx` | 자체 기하 |
| 수면 셰이더 | `client/World.tsx` | 자체 작성. 고화질 반사는 Three.js Reflector API 사용 |
| 아이콘 | `client/App.tsx` | 이번 작업에서 직접 작성한 SVG 경로 |
| 환경음·따르기 효과 | `client/audio.ts` | WebAudio 노이즈로 직접 합성. 클래식 녹음은 아래 외부 구성 요소 참조 |
| 휴식 안내 글 | `shared/world.ts` | 이번 수정에서 직접 작성. 음성 재생 없음 |

자체 자산의 프로젝트 전체에 대한 별도 오픈소스 라이선스는 부여하지 않았습니다. 제3자 라이선스를 자체 자산에 잘못 표시하지 않습니다.

## 외부 구성 요소

| 구성 요소 | 공식 출처 | 사용 조건 |
| --- | --- | --- |
| Three.js 및 Reflector | https://github.com/mrdoob/three | MIT. 패키지의 `LICENSE` 참조 |
| React Three Fiber | https://github.com/pmndrs/react-three-fiber | MIT. 패키지의 `LICENSE` 참조 |
| React / React DOM | https://github.com/facebook/react | MIT. 패키지의 `LICENSE` 참조 |
| ws | https://github.com/websockets/ws | MIT. 패키지의 `LICENSE` 참조 |
| Noto Sans KR | https://fonts.google.com/noto/specimen/Noto+Sans+KR | Google Fonts CSS로 요청. SIL Open Font License 1.1. 공식 라이선스: https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE |
| Noto Serif KR | https://fonts.google.com/noto/specimen/Noto+Serif+KR | Google Fonts CSS로 요청. SIL Open Font License 1.1. 공식 라이선스: https://github.com/notofonts/noto-cjk/blob/main/Serif/LICENSE |
| Gymnopédie No. 1 — Erik Satie / 연주 Kevin MacLeod | https://commons.wikimedia.org/wiki/File:Gymnopedie_No._1_(ISRC_USUAN1100787).mp3 | CC BY 3.0: https://creativecommons.org/licenses/by/3.0/ . 원본 MP3를 수정 없이 포함. 앱에서 반복·페이드인·음량 조절. 화면과 `public/audio/music/ATTRIBUTION.md`에 출처 명시 |

Google Fonts가 연결되지 않아도 시스템 산세리프/세리프 글꼴로 표시됩니다. 현재 글꼴 파일을 프로젝트에 재배포하지 않습니다. 나중에 자체 호스팅할 경우 해당 글꼴의 저작권 고지와 OFL 전문을 함께 보관하세요.

SANSA와 아쿠아필드는 사용자 브리프의 분위기 참고로만 사용했습니다. 해당 서비스의 코드·정확한 공간 배치·음원·상표 이미지는 사용하지 않았습니다.

핀란드 사우나의 벤치·돌 히터·국자로 물을 부어 내는 증기라는 공간 구성은 [핀란드 사우나 협회 안내](https://sauna.fi/wp-content/uploads/2021/03/saunacomic_en.pdf)와 [Sauna from Finland의 벤치 아래 조명 안내](https://saunafromfinland.com/finnish-sauna-experience/tips-for-building-your-own-sauna-details/)를 참고했습니다. 시각 모델은 자체 제작했으며, 해당 사이트의 이미지·공간 배치·음원은 복제하지 않았습니다.

## 교체·추가가 필요한 것

- 공간별 현장 녹음 환경음은 추가할 수 있습니다. 사용자의 변경 요청에 따라 음성 나레이션은 사용하지 않으며, 플로팅에는 위 클래식 녹음을 포함했습니다.
- 사진 기반 고해상도 PBR, 최종 한옥·식재 GLB, 완성도 높은 캐릭터 리깅. 현재 자체 모델은 실제 사용 가능하지만 사진 수준의 건축 시각화는 아닙니다.
- 외부 자산을 추가할 때 원본 주소, 제작자, 정확한 라이선스, 변경 여부와 구매·허가 근거를 이 문서에 추가해야 합니다.
