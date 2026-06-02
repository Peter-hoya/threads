# 🧵 Threads API Client

Meta 공식 **Threads Graph API v1.0** 기반의 게시물 작성 및 답글(댓글) 관리 클라이언트입니다.

## 📌 주요 기능

| 기능 | 설명 |
|------|------|
| 📝 텍스트 게시물 | 텍스트 전용 게시물 작성 (최대 500자) |
| 🖼️ 이미지 게시물 | 이미지 + 텍스트 게시물 작성 |
| 🎬 동영상 게시물 | 동영상 + 텍스트 게시물 작성 |
| 🎠 슬라이드 게시물 | 이미지/동영상 2~20개 슬라이드 |
| 💬 답글(댓글) | 특정 게시물에 텍스트/이미지/동영상 답글 |
| 🔗 링크 첨부 | 링크 미리보기 카드 포함 게시 |
| 🏷️ 주제 태그 | topic_tag를 통한 주제 태깅 |
| 📊 사용량 조회 | 24시간 게시/답글 사용량 확인 |

## 🚀 시작하기

### 1. 사전 요구사항

- **Node.js** 18.0 이상 (내장 `fetch` API 사용)
- **Meta Developer 앱** 및 **Threads API 액세스 토큰**

### 2. 설치

```bash
npm install
```

### 3. 환경 설정

`.env.example`을 복사하여 `.env` 파일을 생성하고 토큰을 입력합니다:

```bash
cp .env.example .env
```

```env
THREADS_ACCESS_TOKEN=your_access_token_here
THREADS_USER_ID=your_user_id_here
```

> ⚠️ 액세스 토큰 발급 방법은 [Meta 공식 문서](https://developers.facebook.com/docs/threads/get-started)를 참고하세요.

### 4. 실행

```bash
# 도움말
node index.js help

# 코드 예제 보기
node index.js examples
```

## 📋 CLI 명령어

```bash
# ── 게시물 작성 ──
node index.js post "안녕하세요! 첫 번째 Threads 게시물입니다."
node index.js post-image "https://example.com/photo.jpg" "사진 설명"
node index.js post-video "https://example.com/video.mp4" "동영상 설명"

# ── 답글(댓글) 작성 ──
node index.js reply "게시물ID" "좋은 글이네요!"

# ── 조회 ──
node index.js profile         # 프로필 정보
node index.js list 10         # 최근 게시물 10개
node index.js replies "ID"    # 특정 게시물의 답글
node index.js limit           # 게시 사용량 확인
```

## 💻 코드에서 사용하기

```javascript
const { createTextPost, createReply } = require('./src/threads-api');

// 텍스트 게시물 작성
await createTextPost('안녕하세요!', {
  topicTag: '개발',
  replyControl: 'everyone',
});

// 답글 작성
await createReply('1234567890', '좋은 글이네요!');

// 이미지 답글
await createReply('1234567890', '관련 이미지', {
  mediaType: 'IMAGE',
  imageUrl: 'https://example.com/img.jpg',
});
```

## 🏗️ 프로젝트 구조

```
threads/
├── index.js             # CLI 진입점 (명령어 파서)
├── src/
│   ├── config.js        # 환경변수 및 API 설정
│   └── threads-api.js   # Threads API 핵심 클라이언트
├── .env                 # 환경변수 (git 제외)
├── .env.example         # 환경변수 예제
├── .gitignore
├── package.json
└── README.md
```

## 🔧 API 아키텍처

Threads API는 **2단계 컨테이너/게시 모델**을 사용합니다:

```
┌──────────────────────────────────────────────┐
│  1단계: 미디어 컨테이너 생성                     │
│  POST /{user-id}/threads                      │
│  → media_type, text, image_url 등              │
│  → 반환: container_id                          │
├──────────────────────────────────────────────┤
│  ⏳ 30초 대기 (Meta 권장)                       │
├──────────────────────────────────────────────┤
│  2단계: 컨테이너 게시                            │
│  POST /{user-id}/threads_publish               │
│  → creation_id = container_id                  │
│  → 반환: media_id (게시 완료)                    │
└──────────────────────────────────────────────┘
```

## ⚠️ API 제한 사항

| 항목 | 제한 |
|------|------|
| 텍스트 길이 | 최대 500자 |
| 24시간 게시물 수 | 최대 250개 |
| 24시간 답글 수 | 최대 1,000개 |
| 슬라이드 미디어 | 2~20개 |
| 게시물당 링크 | 최대 5개 |
| 주제 태그 길이 | 1~50자 |
| 이미지 파일 크기 | 최대 8MB |
| 동영상 파일 크기 | 최대 1GB |
| 동영상 길이 | 최대 5분 |

## 📚 참고 자료

- [Threads API 공식 문서](https://developers.facebook.com/docs/threads)
- [게시물 만들기](https://developers.facebook.com/docs/threads/posts)
- [답글 만들기](https://developers.facebook.com/docs/threads/retrieve-and-manage-replies/create-replies)
- [API 변경 사항](https://developers.facebook.com/docs/threads/changelog)

## 📄 필요 권한

| 권한 | 용도 |
|------|------|
| `threads_basic` | 모든 API 호출 필수 |
| `threads_content_publish` | 게시물 작성 |
| `threads_manage_replies` | 답글 관리 (POST) |
| `threads_read_replies` | 답글 조회 (GET) |
