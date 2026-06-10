/**
 * ============================================
 * Threads API 사용 예제
 * ============================================
 *
 * 이 파일은 Threads API의 다양한 기능을 테스트하는 예제 코드입니다.
 * 실행 전 .env 파일에 THREADS_ACCESS_TOKEN과 THREADS_USER_ID를 설정하세요.
 *
 * 실행 방법:
 *   node index.js                  → 전체 예제 메뉴
 *   node index.js post "텍스트"     → 빠른 텍스트 게시
 *   node index.js reply ID "텍스트" → 빠른 답글 작성
 */

const { config, validateConfig, getAccountConfig } = require('./src/config');
const {
  createTextPost,
  createImagePost,
  createVideoPost,
  createCarouselPost,
  createReply,
  getUserProfile,
  getUserThreads,
  getReplies,
  getPublishingLimit,
} = require('./src/threads-api');
const {
  startScheduler,
  runOnce,
  addToQueue,
  listQueue,
  removeFromQueue,
} = require('./src/scheduler');

// ============================================
// CLI 인터페이스
// ============================================

/**
 * 사용법 출력
 */
function printUsage() {
  console.log(`
╔══════════════════════════════════════════════╗
║          Meta Threads API Client             ║
║          ─────────────────────────            ║
║     공식 Threads Graph API v1.0 기반          ║
╚══════════════════════════════════════════════╝

📌 사용법:
   node index.js <command> [options]

📋 명령어:

   ── 게시물 작성 ──────────────────────────
   post <텍스트>                    텍스트 게시물 작성
   post-image <이미지URL> [텍스트]   이미지 게시물 작성
   post-video <동영상URL> [텍스트]   동영상 게시물 작성

   ── 답글 ─────────────────────────────────
   reply <게시물ID> <텍스트>         답글(댓글) 작성

   ── 조회 ─────────────────────────────────
   profile                         프로필 정보 조회
   list [개수]                      최근 게시물 목록
   replies <게시물ID>               게시물의 답글 조회
   limit                           게시 사용량 확인

   ── 예약 발행 ────────────────────────────
   scheduler                       예약 발행 스케줄러 시작 (1분 간격)
   scheduler --once                1회 체크 후 종료
   queue                           현재 큐 목록 보기
   queue-add <텍스트> [예약시간]     큐에 게시물 추가
   queue-remove <아이템ID>          큐에서 게시물 삭제

   ── 기타 ─────────────────────────────────
   help                            이 도움말 표시
   examples                        코드 예제 표시

🔧 설정:
   .env 파일에 다음 값을 설정하세요:
   - THREADS_ACCESS_TOKEN: Meta Developer에서 발급받은 액세스 토큰
   - THREADS_USER_ID: Threads 사용자 ID (숫자)

📚 공식 문서: https://developers.facebook.com/docs/threads
  `);
}

/**
 * 코드 예제 출력
 */
function printExamples() {
  console.log(`
📝 코드 예제:

─── 텍스트 게시물 작성 ───────────────────────

  const { createTextPost } = require('./src/threads-api');

  // 기본 텍스트 게시
  await createTextPost('안녕하세요! Threads API 테스트입니다.');

  // 주제 태그 + 답글 제어 포함
  await createTextPost('개발 일지 #1', {
    topicTag: '개발',
    replyControl: 'everyone',
  });

  // 링크 첨부
  await createTextPost('흥미로운 기사를 발견했습니다', {
    linkAttachment: 'https://example.com/article',
  });

─── 이미지 게시물 작성 ───────────────────────

  const { createImagePost } = require('./src/threads-api');

  await createImagePost(
    'https://example.com/photo.jpg',
    '멋진 사진입니다!'
  );

─── 슬라이드 게시물 작성 ─────────────────────

  const { createCarouselPost } = require('./src/threads-api');

  await createCarouselPost([
    { type: 'IMAGE', url: 'https://example.com/1.jpg' },
    { type: 'IMAGE', url: 'https://example.com/2.jpg' },
    { type: 'VIDEO', url: 'https://example.com/video.mp4' },
  ], '슬라이드 게시물 테스트');

─── 답글(댓글) 작성 ──────────────────────────

  const { createReply } = require('./src/threads-api');

  // 텍스트 답글
  await createReply('1234567890', '좋은 글이네요!');

  // 이미지 답글
  await createReply('1234567890', '관련 이미지입니다', {
    mediaType: 'IMAGE',
    imageUrl: 'https://example.com/reply.jpg',
  });

─── 조회 기능 ────────────────────────────────

  const {
    getUserProfile,
    getUserThreads,
    getReplies,
    getPublishingLimit,
  } = require('./src/threads-api');

  // 프로필 조회
  const profile = await getUserProfile();

  // 최근 게시물 10개 조회
  const threads = await getUserThreads(10);

  // 특정 게시물의 답글 조회
  const replies = await getReplies('1234567890');

  // 게시 사용량 확인
  const limit = await getPublishingLimit();
  `);
}

// ============================================
// 명령어 실행
// ============================================

/**
 * CLI 인자에서 --account 옵션을 찾아 추출하고 배열에서 제거합니다.
 */
function getAccountFromArgs(args) {
  const accountIndex = args.indexOf('--account');
  if (accountIndex !== -1 && args[accountIndex + 1]) {
    const accountName = args[accountIndex + 1];
    args.splice(accountIndex, 2);
    return accountName;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const accountName = getAccountFromArgs(args);
  let accountConfig = null;

  // 설정 검사
  validateConfig();

  if (accountName) {
    try {
      accountConfig = getAccountConfig(accountName);
      console.log(`👤 다중 계정 설정 적용됨: [${accountName}]`);
    } catch (e) {
      console.error(`❌ 계정 로드 실패: ${e.message}`);
      return;
    }
  }

  const command = args[0];

  if (!command || command === 'help') {
    printUsage();
    return;
  }

  if (command === 'examples') {
    printExamples();
    return;
  }

  try {
    switch (command) {
      // 텍스트 게시물
      case 'post': {
        const text = args.slice(1).join(' ');
        if (!text) {
          console.error('❌ 게시할 텍스트를 입력하세요.');
          console.log('   예: node index.js post "안녕하세요!"');
          return;
        }
        await createTextPost(text, {}, accountConfig);
        break;
      }

      // 이미지 게시물
      case 'post-image': {
        const imageUrl = args[1];
        const text = args.slice(2).join(' ');
        if (!imageUrl) {
          console.error('❌ 이미지 URL을 입력하세요.');
          console.log('   예: node index.js post-image "https://example.com/img.jpg" "설명"');
          return;
        }
        await createImagePost(imageUrl, text, {}, accountConfig);
        break;
      }

      // 동영상 게시물
      case 'post-video': {
        const videoUrl = args[1];
        const text = args.slice(2).join(' ');
        if (!videoUrl) {
          console.error('❌ 동영상 URL을 입력하세요.');
          return;
        }
        await createVideoPost(videoUrl, text, {}, accountConfig);
        break;
      }

      // 답글 작성
      case 'reply': {
        const replyToId = args[1];
        const replyText = args.slice(2).join(' ');
        if (!replyToId || !replyText) {
          console.error('❌ 게시물 ID와 답글 텍스트를 모두 입력하세요.');
          console.log('   예: node index.js reply "1234567890" "좋은 글이네요!"');
          return;
        }
        await createReply(replyToId, replyText, {}, accountConfig);
        break;
      }

      // 프로필 조회
      case 'profile': {
        await getUserProfile(accountConfig);
        break;
      }

      // 게시물 목록 조회
      case 'list': {
        const count = parseInt(args[1], 10) || 10;
        await getUserThreads(count, undefined, accountConfig);
        break;
      }

      // 답글 조회
      case 'replies': {
        const mediaId = args[1];
        if (!mediaId) {
          console.error('❌ 게시물 ID를 입력하세요.');
          console.log('   예: node index.js replies "1234567890"');
          return;
        }
        await getReplies(mediaId, undefined, accountConfig);
        break;
      }

      // 사용량 확인
      case 'limit': {
        await getPublishingLimit(accountConfig);
        break;
      }

      // 예약 발행 스케줄러
      case 'scheduler': {
        if (args[1] === '--once') {
          await runOnce();
        } else {
          await startScheduler();
        }
        break;
      }

      // 큐 목록 보기
      case 'queue': {
        listQueue();
        break;
      }

      // 큐에 추가
      case 'queue-add': {
        const content = args[1];
        const scheduledAt = args[2] || null;
        if (!content) {
          console.error('❌ 게시할 텍스트를 입력하세요.');
          console.log('   예: node index.js queue-add "안녕하세요!" "2026-06-03T09:00:00+09:00"');
          return;
        }
        addToQueue(content, scheduledAt, { account: accountName });
        break;
      }

      // 큐에서 삭제
      case 'queue-remove': {
        const itemId = args[1];
        if (!itemId) {
          console.error('❌ 삭제할 아이템 ID를 입력하세요.');
          console.log('   예: node index.js queue-remove "threads_001"');
          return;
        }
        removeFromQueue(itemId);
        break;
      }

      default:
        console.error(`❌ 알 수 없는 명령어: ${command}`);
        printUsage();
    }
  } catch (error) {
    console.error(`\n❌ 오류 발생: ${error.message}`);
    if (error.message.includes('액세스 토큰')) {
      console.log('\n💡 해결 방법:');
      console.log('   1. https://developers.facebook.com 에서 앱을 생성');
      console.log('   2. Threads API 액세스 토큰 발급');
      console.log('   3. .env 파일에 THREADS_ACCESS_TOKEN 설정');
    }
  }
}

main();
