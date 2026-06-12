# Pixel Color Pick — Color Picker Web App 스펙

## Context

화면 어디서든 색상을 추출해서 HEX/RGB/HSL 코드를 즉시 복사할 수 있는 미니멀 웹 도구.
EyeDropper API를 사용해 OS 수준 픽셀 선택을 지원하며, Chrome/Edge 전용으로 단순하게 구현한다.

---

## 기술 스택

- **순수 HTML + CSS + Vanilla JS** (빌드 도구 없음, 파일 3개)
- **EyeDropper API** (`window.EyeDropper`) — OS 전체 화면 색상 추출
  - 반환값: `{ sRGBHex: "#RRGGBB" }`
  - 보안 컨텍스트 필요: 로컬 개발은 `localhost` OK, 배포 시 HTTPS 필수
  - 사용자 제스처(클릭) 이후에만 호출 가능 — 버튼 클릭으로 이미 충족

---

## 파일 구조

```
index.html
style.css
script.js
SPEC.md
```

---

## 기능 명세

### 1. 색상 추출

- 버튼 레이블: **"스포이드로 추출"**
- 클릭 시 `new EyeDropper().open()` 호출
- 피킹 중: OS 기본 스포이드 커서만 표시 (커스텀 루페 없음)
- 클릭으로 색상 확정 → 결과 화면에 표시
- Escape 취소 시: `AbortError` catch하여 조용히 무시 (이전 상태 유지)

### 2. 색상 결과 표시

색상을 추출하면 다음을 동시에 보여준다:

| 영역 | 내용 |
|------|------|
| 색상 스와치 | 추출된 색으로 채워진 큰 사각형 |
| HEX 행 | `#FF5733` + [Copy] 버튼 |
| RGB 행 | `rgb(255, 87, 51)` + [Copy] 버튼 |
| HSL 행 | `hsl(14, 100%, 60%)` + [Copy] 버튼 |

**초기 상태 (추출 전)**: 스와치는 회색 점선 테두리 빈 박스, 각 행은 `—` 플레이스홀더 표시.

### 3. 복사 동작

- 각 포맷에 독립 [Copy] 버튼
- 클릭 시 해당 포맷 문자열을 `navigator.clipboard.writeText()`로 복사
- 버튼이 즉시 **"✓ Copied!"** 로 바뀌고 2초 후 원래 텍스트로 복원
- 복사 형식 예시: `#FF5733` / `rgb(255, 87, 51)` / `hsl(14, 100%, 60%)`

### 4. 브라우저 호환성 처리

| 환경 | 동작 |
|------|------|
| Chrome 95+ / Edge 95+ | 정상 동작 |
| Firefox / Safari | 추출 버튼 비활성화 + 안내 배너: `"이 기능은 Chrome 또는 Edge에서만 지원됩니다"` |
| 모바일 (터치) | 동일하게 미지원 메시지 표시 |

감지: `typeof window.EyeDropper !== 'undefined'` 체크 (페이지 로드 시)

---

## 색상 변환 로직 (script.js)

```
EyeDropper → #RRGGBB
  ↓
hexToRgb(hex) → { r, g, b }
  ↓
rgbToHsl(r, g, b) → { h, s, l }
  ↓
표시: HEX uppercase, rgb(), hsl() CSS 함수 표기
```

HSL 포맷은 `hsl(H, S%, L%)` 구형 쉼표 구문 사용 (CSS 호환성 최대).  
HEX는 대문자 (`#FF5733` not `#ff5733`).

---

## 비주얼 디자인

- **테마**: 라이트 모드 고정 (화이트/라이트 그레이 배경)
- **레이아웃**: 화면 중앙 정렬, 단일 카드
- **폰트**: 시스템 sans-serif (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- **스타일**: 미니멀, 그림자 있는 카드, 둥근 모서리
- 다크 모드 토글 없음

---

## 인터뷰에서 결정된 주요 트레이드오프

| 결정 | 선택 | 포기한 것 |
|------|------|-----------|
| 추출 범위 | OS 전체 (EyeDropper API) | Firefox/Safari 지원 |
| 커서 UI | 기본 OS 스포이드 | 커스텀 루페 오버레이 |
| 색상 수 | 마지막 1개만 표시 | 히스토리/팔레트 |
| 플랫폼 | PC 브라우저 전용 | 모바일 |
| 샘플 콘텐츠 | 없음 (순수 도구) | 내부 테스트용 이미지 |

---

## 검증 절차

1. `index.html`을 Chrome에서 열기 (`http://localhost` 또는 `file://`)
2. **"스포이드로 추출"** 클릭 → 커서가 OS 스포이드로 변경 확인
3. 화면 임의 위치 클릭 → HEX/RGB/HSL 세 행이 모두 채워지는지 확인
4. 각 [Copy] 버튼 클릭 → "✓ Copied!" 로 2초간 변경, 클립보드에 해당 포맷 문자열 확인
5. Escape 키로 피킹 취소 → 에러 없이 이전 상태 유지 확인
6. Firefox / Safari에서 열기 → 버튼 비활성화 + 안내 메시지 표시 확인
7. HTTPS 배포 후 재테스트 (EyeDropper는 secure context 필요)
