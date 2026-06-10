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

  // 다중 계정 목록 파싱
  multiAccounts: (() => {
    try {
      const rawAccounts = process.env.THREADS_MULTI_ACCOUNTS;
      if (!rawAccounts) return [];

      let trimmed = rawAccounts.trim();
      // 앞뒤에 따옴표가 있으면 제거
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || 
          (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        trimmed = trimmed.substring(1, trimmed.length - 1).trim();
      }
      
      if (!trimmed) return [];

      // 1. JSON 배열 형식 시도 (하위 호환성 유지)
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        } catch (jsonErr) {
          // JSON 파싱 실패 시 일반 텍스트 포맷으로 계속 파싱 시도
        }
      }

      // 2. userId:accessToken 포맷 파싱 (예: "123:token1,456:token2" 또는 줄바꿈/세미콜론 구분)
      const accounts = [];
      // 쉼표(,), 세미콜론(;), 줄바꿈(\n, \r) 등으로 각 계정 정보 분할
      const parts = trimmed.split(/[\s,;]+/);
      for (const part of parts) {
        const cleanPart = part.trim();
        if (!cleanPart) continue;
        
        const colonIndex = cleanPart.indexOf(':');
        if (colonIndex !== -1) {
          const userId = cleanPart.substring(0, colonIndex).trim().replace(/['"]/g, '');
          const accessToken = cleanPart.substring(colonIndex + 1).trim().replace(/['"]/g, '');
          if (userId && accessToken) {
            accounts.push({ userId, accessToken });
          }
        }
      }
      return accounts;
    } catch (e) {
      console.warn('⚠️  THREADS_MULTI_ACCOUNTS 환경 변수를 파싱하는 중 오류가 발생했습니다. 올바른 형식인지 확인하세요:', e.message);
    }
    return [];
  })(),

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
 * 특정 계정 설정을 반환하는 헬퍼 함수 (하위 호환성 지원)
 * @param {string} accountName - 조회할 계정명
 * @returns {{ userId: string, accessToken: string }} 계정 설정 정보
 */
function getAccountConfig(accountIdentifier) {
  if (!accountIdentifier) {
    // 계정 식별자가 없으면 기본 계정 설정을 반환
    return {
      userId: config.userId,
      accessToken: config.accessToken,
    };
  }

  const accounts = config.multiAccounts || [];
  // userId 또는 name으로 대조하여 계정 조회
  const account = accounts.find(
    (a) => String(a.userId) === String(accountIdentifier) || a.name === accountIdentifier
  );

  if (!account) {
    throw new Error(`계정 설정 "${accountIdentifier}"을 찾을 수 없습니다. THREADS_MULTI_ACCOUNTS 설정을 확인하세요.`);
  }

  return {
    userId: account.userId,
    accessToken: account.accessToken,
  };
}

/**
 * 설정 유효성 검사
 */
function validateConfig() {
  const warnings = [];
  const hasMultiAccounts = config.multiAccounts && config.multiAccounts.length > 0;

  if (!hasMultiAccounts) {
    if (!config.accessToken) {
      warnings.push('⚠️  THREADS_ACCESS_TOKEN이 설정되지 않았습니다. .env 파일에 토큰을 입력하세요.');
    }
    if (!config.userId) {
      warnings.push('⚠️  THREADS_USER_ID가 설정되지 않았습니다. .env 파일에 사용자 ID를 입력하세요.');
    }
  }

  if (warnings.length > 0) {
    console.log('\n🔧 설정 확인 필요:');
    warnings.forEach((w) => console.log(`   ${w}`));
    console.log('');
  }

  return warnings.length === 0 || hasMultiAccounts;
}

module.exports = { config, validateConfig, getAccountConfig };

