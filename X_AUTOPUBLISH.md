# X Auto Publish Standard

이 문서는 최근 성공한 X 게시 절차를 다시 쓰기 쉽게 고정한 표준 절차다.

## 기본 원칙

1. 저장소 작업 위치는 항상 `/root/repos/threads`로 고정한다.
2. 시작할 때 반드시 `git status --short --branch`로 현재 상태를 먼저 확인한다.
3. 로컬에 사용자 변경이 있거나 로컬 브랜치가 원격보다 앞서 있으면 변경을 날리지 말고 그대로 보존한다.
4. `pull --rebase`는 원격 변경을 받아야 할 필요가 있고, 로컬 변경을 안전하게 유지할 수 있을 때만 수행한다.
5. X 게시는 기존 Chrome 원격 디버깅 `127.0.0.1:9222`에 연결한 뒤 `https://x.com/home` 탭을 재사용한다.

## 게시 우선순위

1. 먼저 브라우저에 이미 열려 있는 초안이 있는지 확인한다.
2. 초안이 있고 게시 버튼이 활성화되어 있으면 그 초안을 최우선으로 게시한다.
3. 초안이 비어 있거나 게시 불가 상태면 `queue/x_queue.json`의 다음 `ready` 항목 1건만 작성창에 넣어 게시한다.
4. 한 번 실행에서 정확히 1건만 게시한다.

## 표준 절차

1. `curl http://127.0.0.1:9222/json/list`로 `https://x.com/home` 페이지 탭의 `webSocketDebuggerUrl`을 찾는다.
2. CDP로 해당 페이지에 연결한다.
3. 작성창 `[data-testid="tweetTextarea_0"]`와 게시 버튼 `[data-testid="tweetButtonInline"]` 상태를 읽는다.
4. 작성창에 이미 초안이 있으면 그 내용을 유지하고, 실제로 초안이 존재하는지 다시 확인한다.
5. 초안이 없으면 다음 `ready` 항목 본문을 작성창에 넣고, 최종 게시 직전 작성창에 초안이 들어갔는지 다시 확인한다.
6. 게시 버튼은 반드시 일반 클릭을 1순위로 시도한다.
7. 일반 클릭이 실패한 경우에만 fallback을 사용한다.

## 기본 클릭 방식

- 선택자: `[data-testid="tweetButtonInline"]`
- 1순위: `element.click()`
- 성공 판단:
  - `게시물을 전송했습니다.` 토스트가 보이거나
  - 작성창이 비워진다.
  - 게시 버튼이 다시 비활성화된다.
  - 타임라인 `article`에서 방금 올린 본문이 보인다.
  - 해당 글의 `/status/` 링크를 추출할 수 있다.

## fallback 사용 조건

아래 경우에만 fallback을 쓴다.

- 일반 클릭 후에도 버튼이 계속 활성 상태로 남아 있다.
- 작성창 내용이 그대로다.
- 타임라인에 새 글이 확인되지 않는다.

fallback 예시:

- 버튼으로 스크롤 후 다시 `click()`
- `MouseEvent` dispatch
- 좌표 클릭

단, fallback은 일반 클릭 실패가 확인된 뒤에만 사용한다.

## 실행 후 반영

1. `queue/x_queue.json`에서 해당 항목을 `posted`로 바꾸고 `posted_at`을 기록한다.
2. 필요하면 `logs/x_posted_log.json`에도 같은 항목을 남긴다.
3. `git status --short --branch`로 변경 파일을 다시 확인한다.
4. `git push`를 시도하되 인증 실패 시 로컬 반영 상태만 정확히 보고한다.
