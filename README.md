# RotWorld

실행 사이트: https://rot-world.hyunu0703.chatgpt.site

도시·이동 시제품: 인간 12명과 건물 12개, 길 찾기, 인간 선택과 상태 확인, 정지·1/2/4배속, 지도 이동·확대·추적.

## 제작과 검증

GameDesign.md 전체와 AGENTS.md를 먼저 읽는다. 로컬호스트 개발·미리보기 서버를 사용하지 않는다. 소스 편집과 정적 빌드 후 기존 Sites 프로젝트에 게시하고 지정 사이트에서 브라우저 동작을 확인한다.

- 의존성: `pnpm install --frozen-lockfile`
- 타입 검사와 정적 빌드: `pnpm build`
- 시뮬레이션 검증(Node 24): `pnpm test`
- 게시 대상: `.openai/hosting.json`의 기존 프로젝트와 `dist/`.

`src/simulation`은 화면과 독립적인 상태·시간·길 찾기, `src/rendering`은 PixiJS 지도와 카메라, `src/ui`는 정보창과 조작, `src/assets`는 재사용 픽셀 텍스처, `src/data`는 시제품 수치를 관리한다.

드래그·방향키로 지도 이동, 휠·＋/−로 확대·축소, F로 전체 보기. 인간 클릭 또는 인간 목록에서 선택한다. 지도에 포커스한 상태에서 Space로 정지·재개한다. 모바일은 드래그·두 손가락 확대 및 버튼을 지원한다.

생존 수치는 초기값 표시만 연결했다. 생존 AI·좀비·물자·캐릭터 생성·저장은 후속 단계다. 새로고침 시 시제품 상태는 초기화된다.
