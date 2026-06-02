/**
 * ============================================
 * Threads API 설정 관리
 * ============================================
 * 
 * Meta Threads Graph API v1.0 환경설정
 * 공식 문서: https://developers.facebook.com/docs/threads
 */

require('dotenv').config();

const config = {
  // 인증 정보
  accessToken: process.env.THREADS_ACCESS_TOKEN || '',
  userId: process.env.THREADS_USER_ID || '',

  // API 설정
  baseUrl: process.env.THREADS_API_BASE_URL || 'https://graph.threads.net/v1.0',

  // 미디어 컨테이너 게시 전 대기 시간 (밀리초)
  // Meta 공식 권장사항: 서버가 업로드를 완전히 처리할 수 있도록 평균 30초 대기
  publishWaitMs: parseInt(process.env.PUBLISH_WAIT_MS, 10) || 30000,

  // 미디어 타입 상수
  mediaTypes: {
    TEXT: 'TEXT',
    IMAGE: 'IMAGE',
    VIDEO: 'VIDEO',
    CAROUSEL: 'CAROUSEL',
  },

  // 답글 제어 옵션
  replyControl: {
    EVERYONE: 'everyone',
    ACCOUNTS_YOU_FOLLOW: 'accounts_you_follow',
    MENTIONED_ONLY: 'mentioned_only',
  },

  // API 제한 사항
  limits: {
    maxTextLength: 500,           // 텍스트 게시물 최대 글자 수
    maxPostsPerDay: 250,          // 24시간 내 최대 게시물 수
    maxRepliesPerDay: 1000,       // 24시간 내 최대 답글 수
    maxCarouselItems: 20,         // 슬라이드 최대 미디어 수
    minCarouselItems: 2,          // 슬라이드 최소 미디어 수
    maxLinksPerPost: 5,           // 게시물당 최대 링크 수
    maxTopicTagLength: 50,        // 주제 태그 최대 글자 수
  },
};

/**
 * 설정 유효성 검사
 */
function validateConfig() {
  const warnings = [];

  if (!config.accessToken) {
    warnings.push('⚠️  THREADS_ACCESS_TOKEN이 설정되지 않았습니다. .env 파일에 토큰을 입력하세요.');
  }

  if (!config.userId) {
    warnings.push('⚠️  THREADS_USER_ID가 설정되지 않았습니다. .env 파일에 사용자 ID를 입력하세요.');
  }

  if (warnings.length > 0) {
    console.log('\n🔧 설정 확인 필요:');
    warnings.forEach((w) => console.log(`   ${w}`));
    console.log('');
  }

  return warnings.length === 0;
}

module.exports = { config, validateConfig };
