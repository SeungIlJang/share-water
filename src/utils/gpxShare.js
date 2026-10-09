import { Capacitor } from '@capacitor/core';

const NATIVE_UPDATE_REQUIRED = 'NATIVE_GPX_UPDATE_REQUIRED';

const createNativeUpdateError = () => Object.assign(
  new Error('GPX 저장 기능이 포함된 앱 업데이트가 필요합니다.'),
  { code: NATIVE_UPDATE_REQUIRED },
);

const downloadBlob = (filename, content) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/gpx+xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const saveOrShareGpx = async ({ filename, content }) => {
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('Filesystem') || !Capacitor.isPluginAvailable('Share')) {
      throw createNativeUpdateError();
    }
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({
      title: '모두의 음수대 GPX 코스',
      text: '모두의 음수대에서 만든 보행 코스입니다.',
      files: [uri],
      dialogTitle: 'GPX 파일 저장·공유',
    });
    return 'shared';
  }

  const file = new File([content], filename, { type: 'application/gpx+xml' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: '모두의 음수대 GPX 코스', files: [file] });
    return 'shared';
  }
  downloadBlob(filename, content);
  return 'downloaded';
};

export const gpxSaveErrorMessage = (error) => {
  if (error?.code === NATIVE_UPDATE_REQUIRED || /not implemented/i.test(error?.message || '')) {
    return 'GPX 저장을 사용하려면 앱을 최신 버전으로 업데이트해주세요';
  }
  if (/share canceled/i.test(error?.message || '') || error?.name === 'AbortError') {
    return 'GPX 저장을 취소했습니다';
  }
  return 'GPX 파일을 저장하지 못했습니다';
};
