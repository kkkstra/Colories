import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { createLocalId } from '@/lib/security';

export interface PreparedFoodImage {
  uploadDataUri: string;
  thumbnailUri: string;
  width: number;
  height: number;
}

export async function prepareFoodImage(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<PreparedFoodImage> {
  const longest = Math.max(sourceWidth, sourceHeight);
  const context = ImageManipulator.manipulate(sourceUri);
  if (longest > 1600) {
    if (sourceWidth >= sourceHeight) {
      context.resize({ width: 1600, height: null });
    } else {
      context.resize({ width: null, height: 1600 });
    }
  }
  const rendered = await context.renderAsync();
  const uploadImage = await rendered.saveAsync({
    base64: true,
    compress: 0.76,
    format: SaveFormat.JPEG,
  });
  if (!uploadImage.base64) {
    throw new Error('图片编码失败，请重新选择照片。');
  }

  const thumbnailContext = ImageManipulator.manipulate(uploadImage.uri);
  thumbnailContext.resize({ width: 360, height: null });
  const thumbnailRef = await thumbnailContext.renderAsync();
  const thumbnail = await thumbnailRef.saveAsync({
    compress: 0.66,
    format: SaveFormat.JPEG,
  });
  const photosDirectory = new Directory(Paths.document, 'meal-photos');
  photosDirectory.create({ idempotent: true, intermediates: true });
  const persistentThumbnail = new File(photosDirectory, `${createLocalId('meal')}.jpg`);
  await new File(thumbnail.uri).copy(persistentThumbnail);

  deleteTemporaryFile(sourceUri, [persistentThumbnail.uri]);
  deleteTemporaryFile(uploadImage.uri, [sourceUri, persistentThumbnail.uri]);
  deleteTemporaryFile(thumbnail.uri, [sourceUri, uploadImage.uri, persistentThumbnail.uri]);

  return {
    uploadDataUri: `data:image/jpeg;base64,${uploadImage.base64}`,
    thumbnailUri: persistentThumbnail.uri,
    width: uploadImage.width,
    height: uploadImage.height,
  };
}

function deleteTemporaryFile(uri: string, protectedUris: string[]): void {
  if (!uri.startsWith('file://') || protectedUris.includes(uri) || !uri.includes('/cache/')) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Cache cleanup is best effort and should never block saving a meal.
  }
}
