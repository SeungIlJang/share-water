import { Capacitor } from '@capacitor/core';

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
      url: uri,
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
