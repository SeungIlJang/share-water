import test from 'node:test';
import assert from 'node:assert/strict';
import { gpxSaveErrorMessage } from '../src/utils/gpxShare.js';

test('네이티브 플러그인이 없으면 앱 업데이트 안내를 표시한다', () => {
  assert.equal(
    gpxSaveErrorMessage({ code: 'NATIVE_GPX_UPDATE_REQUIRED' }),
    'GPX 저장을 사용하려면 앱을 최신 버전으로 업데이트해주세요',
  );
  assert.equal(
    gpxSaveErrorMessage(new Error('Share plugin is not implemented on android')),
    'GPX 저장을 사용하려면 앱을 최신 버전으로 업데이트해주세요',
  );
});

test('공유 화면 취소와 실제 저장 오류를 구분한다', () => {
  assert.equal(gpxSaveErrorMessage(new Error('Share canceled')), 'GPX 저장을 취소했습니다');
  assert.equal(gpxSaveErrorMessage(new Error('disk full')), 'GPX 파일을 저장하지 못했습니다');
});
