/**
 * ============================================
 * Threads 예약 발행 스케줄러
 * ============================================
 *
 * queue/threads_queue.json 파일에서 예약된 게시물을 읽어
 * scheduled_at 시간이 되면 자동으로 Threads에 게시합니다.
 *
 * 실행 방법:
 *   node index.js scheduler          → 스케줄러 시작 (1분 간격 체크)
 *   node index.js scheduler --once   → 1회만 체크 후 종료
 *
 * 큐 파일 형식 (queue/threads_queue.json):
 * {
 *   "items": [
 *     {
 *       "id": "threads_001",
 *       "category": "카테고리",
 *       "content": "게시할 텍스트",
 *       "scheduled_at": "2026-06-03T09:00:00+09:00",
 *       "status": "ready",
 *       "options": {
 *         "topicTag": "개발",
 *         "replyControl": "everyone"
 *       }
 *     }
 *   ]
 * }
 *
 * status 값:
 *   - ready: 발행 대기 (scheduled_at 시간이 되면 발행)
 *   - posted: 발행 완료
 *   - failed: 발행 실패
 *   - paused: 일시 중지 (스케줄러가 건너뜀)
 */

const fs = require('fs');
const path = require('path');
const { config, validateConfig, getAccountConfig } = require('./config');
const { createTextPost, createImagePost, createVideoPost } = require('./threads-api');

// 파일 경로 상수
const QUEUE_FILE = path.join(__dirname, '..', 'queue', 'threads_queue.json');
const POSTED_LOG_FILE = path.join(__dirname, '..', 'logs', 'threads_posted_log.json');
const ERROR_LOG_FILE = path.join(__dirname, '..', 'logs', 'error_log.json');

// 스케줄러 체크 간격 (밀리초) - 기본 1분
const CHECK_INTERVAL_MS = parseInt(process.env.SCHEDULER_INTERVAL_MS, 10) || 60000;

// ============================================
// 파일 I/O 유틸리티
// ============================================

/**
 * JSON 파일 읽기 (파일이 없거나 비어있으면 기본값 반환)
 */
function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return { items: [] };
    return JSON.parse(raw);
  } catch {
    return { items: [] };
  }
}

/**
 * JSON 파일 쓰기 (포맷팅 포함)
 */
function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================
// 로그 기록
// ============================================

const X_QUEUE_FILE = path.join(__dirname, '..', 'queue', 'x_queue.json');

/**
 * X(트위터)의 글자 수 가중치를 계산하는 함수
 * (한글/중국어/일어 등 CJK 문자는 2글자, 영문/숫자/기호/공백은 1글자 취급)
 */
function getXCharacterWeight(text) {
  let weight = 0;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // CJK 유니코드 범위 체크 (한글, 한자, 일어 등)
    if (
      (charCode >= 0x1100 && charCode <= 0x11FF) || // 한글 자모
      (charCode >= 0x3000 && charCode <= 0x303F) || // CJK 기호 및 문장 부호
      (charCode >= 0x3040 && charCode <= 0x309F) || // 히라가나
      (charCode >= 0x30A0 && charCode <= 0x30FF) || // 가타카나
      (charCode >= 0x3130 && charCode <= 0x318F) || // 한글 호환 자모
      (charCode >= 0x4E00 && charCode <= 0x9FFF) || // CJK 통합 한자
      (charCode >= 0xAC00 && charCode <= 0xD7A3) || // 한글 음절
      (charCode >= 0xFF00 && charCode <= 0xFFEF)    // 전각 문자
    ) {
      weight += 2;
    } else {
      weight += 1;
    }
  }
  return weight;
}

/**
 * Threads 글을 X 스타일로 변환하여 x_queue.json에 추가
 */
function addXQueueItem(threadsItem) {
  const xQueue = readJsonFile(X_QUEUE_FILE);
  
  // 이미 동일한 원본 글로 등록된 이력이 있는지 검사
  const exists = (xQueue.items || []).some(
    (item) => item.created_from_threads === threadsItem.id
  );
  if (exists) return;

  // 1. X 스타일 텍스트 변환: 줄바꿈 압축 (\n\n -> \n)
  let xContentBody = (threadsItem.content || '').replace(/\n\n/g, '\n');

  // 2. 카테고리별 해시태그 추가
  const hashtagMap = {
    estimate: '#견적 #프리랜서 #외주',
    consulting: '#고객상담 #프리랜서 #비즈니스',
    sales: '#영업 #마케팅 #수주',
    workflow: '#업무효율 #생산성 #프리랜서',
  };
  const hashtags = hashtagMap[threadsItem.category] || '#프리랜서 #1인기업';
  
  // X의 글자 수 제한: 280 가중치 자수
  const maxWeight = 280;
  const hashtagsWeight = getXCharacterWeight(`\n\n${hashtags}`);
  const maxBodyWeight = maxWeight - hashtagsWeight - 6; // 안전마진 (' ...' 여유분 확보)

  // 본문 가중치 계산
  let currentBodyWeight = getXCharacterWeight(xContentBody);

  // 본문이 허용치를 초과하는 경우 절삭 진행
  if (currentBodyWeight > maxBodyWeight) {
    let truncatedBody = '';
    let accumulatedWeight = 0;

    for (let i = 0; i < xContentBody.length; i++) {
      const char = xContentBody[i];
      const charWeight = getXCharacterWeight(char);
      if (accumulatedWeight + charWeight > maxBodyWeight) {
        break;
      }
      truncatedBody += char;
      accumulatedWeight += charWeight;
    }
    xContentBody = `${truncatedBody.trim()} ...`;
  }

  // 최종 조합
  const finalContent = `${xContentBody}\n\n${hashtags}`;

  const newItem = {
    id: threadsItem.id.replace('threads_', 'x_'),
    account: threadsItem.account || null,
    category: threadsItem.category || '',
    content: finalContent,
    status: 'ready',
    created_from_threads: threadsItem.id,
    created_at: new Date().toISOString(),
  };

  if (!xQueue.items) {
    xQueue.items = [];
  }
  
  xQueue.items.push(newItem);
  writeJsonFile(X_QUEUE_FILE, xQueue);
  console.log(`   🐦 X 대기 큐 자동 등록 완료! (ID: ${newItem.id}, 글자수: ${getXCharacterWeight(finalContent)}자)`);
}

/**
 * 발행 성공 로그 기록
 */
function logPosted(queueItem, result) {
  const logData = readJsonFile(POSTED_LOG_FILE);
  logData.items.push({
    ...queueItem,
    status: 'posted',
    threads_media_id: result.id,
    posted_at: new Date().toISOString(),
  });
  writeJsonFile(POSTED_LOG_FILE, logData);

  // X 대기 큐 자동 등록 트리거
  try {
    addXQueueItem(queueItem);
  } catch (error) {
    console.error(`   ⚠️ X 대기 큐 등록 실패: ${error.message}`);
  }
}

/**
 * 발행 실패 로그 기록
 */
function logError(queueItem, error) {
  const logData = readJsonFile(ERROR_LOG_FILE);
  logData.items.push({
    id: queueItem.id,
    content_preview: (queueItem.content || '').substring(0, 50),
    error_message: error.message || String(error),
    failed_at: new Date().toISOString(),
    scheduled_at: queueItem.scheduled_at || null,
  });
  writeJsonFile(ERROR_LOG_FILE, logData);
}

// ============================================
// 게시물 발행 로직
// ============================================

/**
 * 큐 아이템 하나를 Threads에 발행
 *
 * @param {Object} item - 큐 아이템
 * @returns {Promise<Object>} 발행 결과
 */
async function publishItem(item, accountConfig = null) {
  const options = item.options || {};

  // 미디어 타입에 따라 분기
  if (item.image_url) {
    return await createImagePost(item.image_url, item.content || '', options, accountConfig);
  } else if (item.video_url) {
    return await createVideoPost(item.video_url, item.content || '', options, accountConfig);
  } else {
    return await createTextPost(item.content, options, accountConfig);
  }
}

/**
 * 현재 시간 기준으로 발행 가능한 큐 아이템 필터링
 *
 * @returns {Array} 발행 대상 아이템 배열
 */
function getDueItems() {
  const queue = readJsonFile(QUEUE_FILE);
  const now = new Date();

  if (!queue.items || queue.items.length === 0) {
    return [];
  }

  // 1. ready 상태인 것들만 1차 필터링
  const readyItems = queue.items.filter((item) => item.status === 'ready');
  if (readyItems.length === 0) {
    return [];
  }

  // 2. 예약 시간(scheduled_at)이 명확히 현재 시간 이전으로 지정된 글들 추출
  const explicitDueItems = readyItems.filter((item) => {
    if (!item.scheduled_at) return false;
    const scheduledTime = new Date(item.scheduled_at);
    return scheduledTime <= now;
  });

  // 명시적 예약 대상이 있다면 그것들을 반환
  if (explicitDueItems.length > 0) {
    return explicitDueItems;
  }

  // 3. 만약 명시적 예약 대상은 없으나, 예약 시간(scheduled_at)이 아예 없는 ready 상태 글이 존재한다면
  // 리스트 순서상 가장 첫 번째 글 딱 1개만 즉시 발행 대상으로 지정
  const unscheduledReadyItem = readyItems.find((item) => !item.scheduled_at);
  if (unscheduledReadyItem) {
    return [unscheduledReadyItem];
  }

  return [];
}

/**
 * 큐에서 특정 아이템의 상태 업데이트
 */
function updateQueueItemStatus(itemId, newStatus) {
  const queue = readJsonFile(QUEUE_FILE);
  const item = queue.items.find((i) => i.id === itemId);
  if (item) {
    item.status = newStatus;
    writeJsonFile(QUEUE_FILE, queue);
  }
}

/**
 * 발행 대상 아이템들을 순차 처리
 *
 * @returns {Promise<{success: number, failed: number}>}
 */
async function processQueue() {
  const dueItems = getDueItems();

  if (dueItems.length === 0) {
    return { success: 0, failed: 0 };
  }

  console.log(`\n📬 발행 대상 ${dueItems.length}개 발견`);

  let success = 0;
  let failed = 0;

  for (const item of dueItems) {
    try {
      console.log(`\n── 발행 중: [${item.id}] ──`);
      console.log(`   내용: "${(item.content || '').substring(0, 60)}..."`);

      if (item.scheduled_at) {
        console.log(`   예약 시간: ${item.scheduled_at}`);
      }

      // 계정 설정 가져오기 (item.account 필드를 확인하고 매핑)
      let accountConfig = null;
      if (item.account) {
        console.log(`   대상 계정: ${item.account}`);
        accountConfig = getAccountConfig(item.account);
      } else {
        console.log('   대상 계정: 기본 계정');
      }

      // 발행 진행 중 표시
      updateQueueItemStatus(item.id, 'publishing');

      const result = await publishItem(item, accountConfig);

      // 성공 처리
      updateQueueItemStatus(item.id, 'posted');
      logPosted(item, result);
      success++;

      console.log(`   ✅ 발행 성공! (Media ID: ${result.id})`);
    } catch (error) {
      // 실패 처리
      updateQueueItemStatus(item.id, 'failed');
      logError(item, error);
      failed++;

      console.error(`   ❌ 발행 실패: ${error.message}`);
    }

    // 연속 발행 시 API 부하 방지 (5초 간격)
    if (dueItems.indexOf(item) < dueItems.length - 1) {
      console.log('   ⏳ 다음 발행까지 5초 대기...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  return { success, failed };
}

// ============================================
// 스케줄러 메인 루프
// ============================================

/**
 * 스케줄러 시작 (주기적 체크)
 */
async function startScheduler() {
  const isConfigValid = validateConfig();
  if (!isConfigValid) {
    console.error('❌ .env 설정을 먼저 완료하세요.');
    process.exit(1);
  }

  const intervalSec = CHECK_INTERVAL_MS / 1000;

  console.log(`
╔══════════════════════════════════════════════╗
║       🕐 Threads 예약 발행 스케줄러           ║
╚══════════════════════════════════════════════╝

  체크 간격: ${intervalSec}초
  큐 파일:   ${QUEUE_FILE}
  로그 파일: ${POSTED_LOG_FILE}
  시작 시간: ${new Date().toLocaleString('ko-KR')}
  
  종료하려면 Ctrl+C를 누르세요.
`);

  // 최초 1회 즉시 체크
  await runCheck();

  // 이후 주기적 체크
  const intervalId = setInterval(async () => {
    await runCheck();
  }, CHECK_INTERVAL_MS);

  // 종료 시그널 처리
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log('\n\n👋 스케줄러가 종료되었습니다.');
    process.exit(0);
  });
}

/**
 * 1회 체크 실행
 */
async function runCheck() {
  const now = new Date().toLocaleString('ko-KR');
  console.log(`\n⏰ [${now}] 큐 체크 중...`);

  const queue = readJsonFile(QUEUE_FILE);
  const readyCount = (queue.items || []).filter((i) => i.status === 'ready').length;
  console.log(`   대기 중인 게시물: ${readyCount}개`);

  if (readyCount === 0) {
    console.log('   💤 발행 대상 없음. 다음 체크까지 대기...');
    return;
  }

  const { success, failed } = await processQueue();
  console.log(`\n📊 결과: ✅ ${success}건 성공, ❌ ${failed}건 실패`);
}

/**
 * 1회만 체크 후 종료
 */
async function runOnce() {
  const isConfigValid = validateConfig();
  if (!isConfigValid) {
    console.error('❌ .env 설정을 먼저 완료하세요.');
    process.exit(1);
  }

  console.log('🔍 큐를 1회 체크합니다...');
  await runCheck();
  console.log('\n✅ 체크 완료.');
}

// ============================================
// 큐 관리 유틸리티
// ============================================

/**
 * 큐에 새 게시물 추가
 *
 * @param {string} content - 게시할 텍스트
 * @param {string} scheduledAt - 예약 시간 (ISO 8601, 예: "2026-06-03T09:00:00+09:00")
 * @param {Object} [options] - 추가 옵션
 * @returns {Object} 추가된 아이템
 */
function addToQueue(content, scheduledAt, options = {}) {
  const queue = readJsonFile(QUEUE_FILE);

  // 고유 ID 생성
  const id = `threads_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newItem = {
    id,
    account: options.account || null,
    category: options.category || '',
    content,
    scheduled_at: scheduledAt || null,
    status: 'ready',
    created_at: new Date().toISOString(),
    options: {},
  };

  // 선택 옵션 추가
  if (options.topicTag) newItem.options.topicTag = options.topicTag;
  if (options.replyControl) newItem.options.replyControl = options.replyControl;
  if (options.linkAttachment) newItem.options.linkAttachment = options.linkAttachment;
  if (options.imageUrl) newItem.image_url = options.imageUrl;
  if (options.videoUrl) newItem.video_url = options.videoUrl;

  queue.items.push(newItem);
  writeJsonFile(QUEUE_FILE, queue);

  console.log(`\n✅ 큐에 추가 완료!`);
  console.log(`   ID: ${id}`);
  console.log(`   내용: "${content.substring(0, 50)}..."`);
  if (scheduledAt) {
    console.log(`   예약 시간: ${scheduledAt}`);
  } else {
    console.log(`   예약 시간: 즉시 (스케줄러 다음 체크 시 발행)`);
  }

  return newItem;
}

/**
 * 큐 목록 출력
 */
function listQueue() {
  const queue = readJsonFile(QUEUE_FILE);

  if (!queue.items || queue.items.length === 0) {
    console.log('\n📭 큐가 비어있습니다.');
    return;
  }

  console.log(`\n📋 현재 큐 (총 ${queue.items.length}개):\n`);

  const statusEmoji = {
    ready: '🟢',
    publishing: '🔄',
    posted: '✅',
    failed: '❌',
    paused: '⏸️',
  };

  queue.items.forEach((item, index) => {
    const emoji = statusEmoji[item.status] || '❓';
    const preview = (item.content || '').substring(0, 45);
    const time = item.scheduled_at
      ? new Date(item.scheduled_at).toLocaleString('ko-KR')
      : '즉시';

    const accountInfo = item.account ? ` | 계정: ${item.account}` : '';
    console.log(`  ${emoji} [${index + 1}] ${item.id}`);
    console.log(`     내용: "${preview}..."`);
    console.log(`     예약: ${time} | 상태: ${item.status}${accountInfo}`);
    console.log('');
  });
}

/**
 * 큐에서 아이템 삭제
 *
 * @param {string} itemId - 삭제할 아이템 ID
 */
function removeFromQueue(itemId) {
  const queue = readJsonFile(QUEUE_FILE);
  const initialLength = queue.items.length;
  queue.items = queue.items.filter((i) => i.id !== itemId);

  if (queue.items.length === initialLength) {
    console.log(`❌ ID "${itemId}"를 찾을 수 없습니다.`);
    return;
  }

  writeJsonFile(QUEUE_FILE, queue);
  console.log(`✅ "${itemId}" 큐에서 삭제 완료.`);
}

// ============================================
// 모듈 내보내기
// ============================================

module.exports = {
  startScheduler,
  runOnce,
  processQueue,
  addToQueue,
  listQueue,
  removeFromQueue,
  getDueItems,
};
