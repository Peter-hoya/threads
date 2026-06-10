/**
 * ============================================
 * Meta Threads API 클라이언트
 * ============================================
 *
 * Meta 공식 Threads Graph API v1.0 기반
 * 2단계 컨테이너/게시 모델 구현
 *
 * 주요 기능:
 *  - 텍스트 게시물 작성 (createTextPost)
 *  - 이미지 게시물 작성 (createImagePost)
 *  - 동영상 게시물 작성 (createVideoPost)
 *  - 슬라이드 게시물 작성 (createCarouselPost)
 *  - 답글(댓글) 작성 (createReply)
 *  - 답글 제어 설정 (reply_control)
 *  - 주제 태그 지원 (topic_tag)
 *  - 링크 첨부 지원 (link_attachment)
 *  - 게시 사용량 조회 (getPublishingLimit)
 *  - 미디어 컨테이너 상태 확인 (checkContainerStatus)
 *
 * 공식 문서: https://developers.facebook.com/docs/threads
 */

const { config } = require('./config');

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 지정된 밀리초만큼 대기
 * @param {number} ms - 대기 시간 (밀리초)
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Threads Graph API에 요청을 보내는 범용 함수
 * @param {string} endpoint - API 엔드포인트 경로
 * @param {string} method - HTTP 메서드 (GET, POST)
 * @param {Object} params - 요청 파라미터
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} API 응답 데이터
 */
async function apiRequest(endpoint, method = 'GET', params = {}, accountConfig = null) {
  const url = `${config.baseUrl}${endpoint}`;

  const currentToken = accountConfig ? accountConfig.accessToken : config.accessToken;

  if (!currentToken) {
    throw new Error(
      '❌ 액세스 토큰이 설정되지 않았습니다.\n' +
      '   .env 파일에 THREADS_ACCESS_TOKEN 또는 THREADS_MULTI_ACCOUNTS를 입력하세요.\n' +
      '   발급 방법: https://developers.facebook.com/docs/threads/get-started'
    );
  }

  const requestParams = {
    ...params,
    access_token: currentToken,
  };

  let response;

  if (method === 'GET') {
    const queryString = new URLSearchParams(requestParams).toString();
    response = await fetch(`${url}?${queryString}`, { method: 'GET' });
  } else {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(requestParams).toString(),
    });
  }

  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data?.error?.message || JSON.stringify(data);
    const errorCode = data?.error?.code || response.status;
    throw new Error(`Threads API 오류 [${errorCode}]: ${errorMessage}`);
  }

  return data;
}

// ============================================
// 미디어 컨테이너 관리
// ============================================

/**
 * 미디어 컨테이너 상태 확인
 * 게시 전 컨테이너가 완전히 처리되었는지 확인할 때 사용
 *
 * @param {string} containerId - 미디어 컨테이너 ID
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 상태 정보 { id, status, error_message? }
 */
async function checkContainerStatus(containerId, accountConfig = null) {
  console.log(`📋 미디어 컨테이너 상태 확인 중... (ID: ${containerId})`);

  const data = await apiRequest(`/${containerId}`, 'GET', {
    fields: 'id,status,error_message',
  }, accountConfig);

  console.log(`   상태: ${data.status}`);
  if (data.error_message) {
    console.log(`   오류: ${data.error_message}`);
  }

  return data;
}

/**
 * 미디어 컨테이너를 게시
 * 2단계 프로세스의 최종 게시 단계
 *
 * @param {string} creationId - 1단계에서 생성된 미디어 컨테이너 ID
 * @param {boolean} [skipWait=false] - 대기 시간 건너뛰기 여부
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 게시된 미디어 ID { id }
 */
async function publishContainer(creationId, skipWait = false, accountConfig = null) {
  if (!skipWait) {
    const waitSeconds = config.publishWaitMs / 1000;
    console.log(`⏳ 서버 처리 대기 중... (${waitSeconds}초 - Meta 권장사항)`);
    await sleep(config.publishWaitMs);
  }

  console.log(`📤 게시 중... (Container ID: ${creationId})`);

  const currentUserId = accountConfig ? accountConfig.userId : config.userId;

  const data = await apiRequest(`/${currentUserId}/threads_publish`, 'POST', {
    creation_id: creationId,
  }, accountConfig);

  console.log(`✅ 게시 완료! (Media ID: ${data.id})`);
  return data;
}

// ============================================
// 게시물 작성 기능
// ============================================

/**
 * 텍스트 게시물 작성
 *
 * @param {string} text - 게시할 텍스트 (최대 500자)
 * @param {Object} [options] - 추가 옵션
 * @param {string} [options.replyControl] - 답글 제어 ('everyone' | 'accounts_you_follow' | 'mentioned_only')
 * @param {string} [options.topicTag] - 주제 태그 (1~50자, 마침표/앰퍼샌드 불가)
 * @param {string} [options.linkAttachment] - 링크 첨부 URL
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 게시된 미디어 ID { id }
 */
async function createTextPost(text, options = {}, accountConfig = null) {
  console.log('\n📝 텍스트 게시물 작성 시작...');
  console.log(`   텍스트: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

  // 글자 수 검증
  if (text.length > config.limits.maxTextLength) {
    throw new Error(`텍스트가 ${config.limits.maxTextLength}자를 초과합니다. (현재: ${text.length}자)`);
  }

  const params = {
    media_type: config.mediaTypes.TEXT,
    text,
  };

  // 선택적 파라미터 추가
  if (options.replyControl) {
    params.reply_control = options.replyControl;
  }
  if (options.topicTag) {
    params.topic_tag = options.topicTag;
  }
  if (options.linkAttachment) {
    params.link_attachment = options.linkAttachment;
  }

  const currentUserId = accountConfig ? accountConfig.userId : config.userId;

  // 1단계: 미디어 컨테이너 생성
  console.log('   1️⃣  미디어 컨테이너 생성 중...');
  const container = await apiRequest(`/${currentUserId}/threads`, 'POST', params, accountConfig);
  console.log(`   ✅ 컨테이너 생성 완료 (ID: ${container.id})`);

  // 2단계: 게시
  return await publishContainer(container.id, false, accountConfig);
}

/**
 * 이미지 게시물 작성
 *
 * @param {string} imageUrl - 공용 서버에 호스팅된 이미지 URL
 * @param {string} [text] - 이미지와 함께 게시할 텍스트 (선택사항)
 * @param {Object} [options] - 추가 옵션
 * @param {string} [options.replyControl] - 답글 제어
 * @param {string} [options.topicTag] - 주제 태그
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 게시된 미디어 ID
 */
async function createImagePost(imageUrl, text = '', options = {}, accountConfig = null) {
  console.log('\n🖼️  이미지 게시물 작성 시작...');

  const params = {
    media_type: config.mediaTypes.IMAGE,
    image_url: imageUrl,
  };

  if (text) params.text = text;
  if (options.replyControl) params.reply_control = options.replyControl;
  if (options.topicTag) params.topic_tag = options.topicTag;

  const currentUserId = accountConfig ? accountConfig.userId : config.userId;

  // 1단계: 미디어 컨테이너 생성
  console.log('   1️⃣  미디어 컨테이너 생성 중...');
  const container = await apiRequest(`/${currentUserId}/threads`, 'POST', params, accountConfig);
  console.log(`   ✅ 컨테이너 생성 완료 (ID: ${container.id})`);

  // 2단계: 게시
  return await publishContainer(container.id, false, accountConfig);
}

/**
 * 동영상 게시물 작성
 *
 * @param {string} videoUrl - 공용 서버에 호스팅된 동영상 URL
 * @param {string} [text] - 동영상과 함께 게시할 텍스트 (선택사항)
 * @param {Object} [options] - 추가 옵션
 * @param {string} [options.replyControl] - 답글 제어
 * @param {string} [options.topicTag] - 주제 태그
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 게시된 미디어 ID
 */
async function createVideoPost(videoUrl, text = '', options = {}, accountConfig = null) {
  console.log('\n🎬 동영상 게시물 작성 시작...');

  const params = {
    media_type: config.mediaTypes.VIDEO,
    video_url: videoUrl,
  };

  if (text) params.text = text;
  if (options.replyControl) params.reply_control = options.replyControl;
  if (options.topicTag) params.topic_tag = options.topicTag;

  const currentUserId = accountConfig ? accountConfig.userId : config.userId;

  // 1단계: 미디어 컨테이너 생성
  console.log('   1️⃣  미디어 컨테이너 생성 중...');
  const container = await apiRequest(`/${currentUserId}/threads`, 'POST', params, accountConfig);
  console.log(`   ✅ 컨테이너 생성 완료 (ID: ${container.id})`);

  // 2단계: 게시 (동영상은 처리 시간이 더 걸릴 수 있음)
  return await publishContainer(container.id, false, accountConfig);
}

/**
 * 슬라이드(캐러셀) 게시물 작성
 * 이미지, 동영상 또는 혼합 미디어를 2~20개까지 포함 가능
 *
 * @param {Array<Object>} mediaItems - 미디어 아이템 배열
 * @param {string} mediaItems[].type - 'IMAGE' 또는 'VIDEO'
 * @param {string} mediaItems[].url - 미디어 URL
 * @param {string} [text] - 슬라이드와 함께 게시할 텍스트
 * @param {Object} [options] - 추가 옵션
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 게시된 미디어 ID
 */
async function createCarouselPost(mediaItems, text = '', options = {}, accountConfig = null) {
  console.log('\n🎠 슬라이드 게시물 작성 시작...');

  // 슬라이드 아이템 수 검증
  if (mediaItems.length < config.limits.minCarouselItems) {
    throw new Error(`슬라이드는 최소 ${config.limits.minCarouselItems}개의 미디어가 필요합니다.`);
  }
  if (mediaItems.length > config.limits.maxCarouselItems) {
    throw new Error(`슬라이드는 최대 ${config.limits.maxCarouselItems}개의 미디어까지 가능합니다.`);
  }

  const currentUserId = accountConfig ? accountConfig.userId : config.userId;

  // 1단계: 각 미디어 아이템의 개별 컨테이너 생성
  console.log(`   1️⃣  미디어 컨테이너 ${mediaItems.length}개 생성 중...`);
  const containerIds = [];

  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    const params = {
      is_carousel_item: 'true',
      media_type: item.type,
    };

    if (item.type === config.mediaTypes.IMAGE) {
      params.image_url = item.url;
    } else if (item.type === config.mediaTypes.VIDEO) {
      params.video_url = item.url;
    }

    const container = await apiRequest(`/${currentUserId}/threads`, 'POST', params, accountConfig);
    containerIds.push(container.id);
    console.log(`      ✅ [${i + 1}/${mediaItems.length}] 컨테이너 생성 (ID: ${container.id})`);
  }

  // 2단계: 슬라이드 컨테이너 생성
  console.log('   2️⃣  슬라이드 컨테이너 생성 중...');
  const carouselParams = {
    media_type: config.mediaTypes.CAROUSEL,
    children: containerIds.join(','),
  };

  if (text) carouselParams.text = text;
  if (options.replyControl) carouselParams.reply_control = options.replyControl;
  if (options.topicTag) carouselParams.topic_tag = options.topicTag;

  const carouselContainer = await apiRequest(`/${currentUserId}/threads`, 'POST', carouselParams, accountConfig);
  console.log(`   ✅ 슬라이드 컨테이너 생성 완료 (ID: ${carouselContainer.id})`);

  // 3단계: 게시
  return await publishContainer(carouselContainer.id, false, accountConfig);
}

// ============================================
// 답글(댓글) 기능
// ============================================

/**
 * 답글(댓글) 작성
 * 특정 게시물 또는 답글에 대한 답글을 생성합니다.
 *
 * 권한 요구 사항 (하나 이상 충족 필요):
 *  - 루트 스레드 게시물의 소유자
 *  - threads_keyword_search 권한 보유
 *  - threads_manage_mentions 권한 보유
 *
 * @param {string} replyToId - 답글을 달 대상 게시물/답글의 ID
 * @param {string} text - 답글 텍스트
 * @param {Object} [options] - 추가 옵션
 * @param {string} [options.mediaType] - 미디어 타입 (기본값: 'TEXT')
 * @param {string} [options.imageUrl] - 이미지 URL (mediaType이 IMAGE일 때)
 * @param {string} [options.videoUrl] - 동영상 URL (mediaType이 VIDEO일 때)
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 게시된 답글 미디어 ID { id }
 */
async function createReply(replyToId, text, options = {}, accountConfig = null) {
  console.log('\n💬 답글 작성 시작...');
  console.log(`   대상 게시물 ID: ${replyToId}`);
  console.log(`   텍스트: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

  const mediaType = options.mediaType || config.mediaTypes.TEXT;

  const params = {
    media_type: mediaType,
    text,
    reply_to_id: replyToId,
  };

  // 미디어 첨부
  if (mediaType === config.mediaTypes.IMAGE && options.imageUrl) {
    params.image_url = options.imageUrl;
  } else if (mediaType === config.mediaTypes.VIDEO && options.videoUrl) {
    params.video_url = options.videoUrl;
  }

  // 1단계: 답글 컨테이너 생성
  console.log('   1️⃣  답글 컨테이너 생성 중...');
  const container = await apiRequest('/me/threads', 'POST', params, accountConfig);
  console.log(`   ✅ 컨테이너 생성 완료 (ID: ${container.id})`);

  // 2단계: 게시
  return await publishContainer(container.id, false, accountConfig);
}

// ============================================
// 조회 및 유틸리티 기능
// ============================================

/**
 * 게시 사용량 제한 조회
 * 24시간 내 게시/답글 사용량과 최대치를 확인합니다.
 *
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 사용량 정보
 */
async function getPublishingLimit(accountConfig = null) {
  console.log('\n📊 게시 사용량 조회 중...');

  const currentUserId = accountConfig ? accountConfig.userId : config.userId;

  const data = await apiRequest(`/${currentUserId}/threads_publishing_limit`, 'GET', {
    fields: 'quota_usage,config,reply_quota_usage,reply_config',
  });

  if (data.data && data.data.length > 0) {
    const limit = data.data[0];
    console.log('   📈 게시물 사용량:');
    console.log(`      - 사용: ${limit.quota_usage || 0} / ${limit.config?.quota_total || 250}`);
    console.log('   💬 답글 사용량:');
    console.log(`      - 사용: ${limit.reply_quota_usage || 0} / ${limit.reply_config?.quota_total || 1000}`);
  }

  return data;
}

/**
 * 사용자의 게시물 목록 조회
 *
 * @param {number} [limit=10] - 가져올 게시물 수
 * @param {string} [fields] - 조회할 필드 목록
 * @returns {Promise<Object>} 게시물 목록
 */
async function getUserThreads(limit = 10, fields = 'id,text,timestamp,media_type,permalink', accountConfig = null) {
  console.log(`\n📄 최근 게시물 ${limit}개 조회 중...`);

  const currentUserId = accountConfig ? accountConfig.userId : config.userId;

  const data = await apiRequest(`/${currentUserId}/threads`, 'GET', {
    fields,
    limit,
  }, accountConfig);

  if (data.data) {
    data.data.forEach((post, index) => {
      const preview = post.text ? post.text.substring(0, 40) : '(미디어 전용)';
      console.log(`   [${index + 1}] ${preview}... (ID: ${post.id})`);
    });
  }

  return data;
}

/**
 * 특정 게시물의 답글 목록 조회
 *
 * @param {string} mediaId - 게시물 ID
 * @param {string} [fields] - 조회할 필드 목록
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 답글 목록
 */
async function getReplies(mediaId, fields = 'id,text,timestamp,username', accountConfig = null) {
  console.log(`\n💬 게시물 ${mediaId}의 답글 조회 중...`);

  const data = await apiRequest(`/${mediaId}/replies`, 'GET', { fields }, accountConfig);

  if (data.data) {
    console.log(`   총 ${data.data.length}개의 답글:`);
    data.data.forEach((reply, index) => {
      const preview = reply.text ? reply.text.substring(0, 40) : '(미디어 전용)';
      console.log(`   [${index + 1}] @${reply.username || '?'}: ${preview}`);
    });
  }

  return data;
}

/**
 * 사용자 프로필 정보 조회
 *
 * @param {Object} [accountConfig=null] - 다중 계정 설정
 * @returns {Promise<Object>} 프로필 정보
 */
async function getUserProfile(accountConfig = null) {
  console.log('\n👤 프로필 정보 조회 중...');

  const data = await apiRequest('/me', 'GET', {
    fields: 'id,username,threads_profile_picture_url,threads_biography',
  }, accountConfig);

  console.log(`   사용자명: @${data.username || '?'}`);
  console.log(`   ID: ${data.id}`);

  return data;
}

// ============================================
// 모듈 내보내기
// ============================================

module.exports = {
  // 게시물 작성
  createTextPost,
  createImagePost,
  createVideoPost,
  createCarouselPost,

  // 답글 작성
  createReply,

  // 조회 기능
  getUserProfile,
  getUserThreads,
  getReplies,
  getPublishingLimit,

  // 유틸리티
  checkContainerStatus,
  publishContainer,
};
